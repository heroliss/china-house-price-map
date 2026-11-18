#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");
const { normalizeCity, normalizeArea } = require("../src/china_map_shared");

const ROOT = path.resolve(__dirname, "..");
const CHINA_DATA_FILE = path.join(ROOT, "data", "china_house_prices.json");
const OUT_FILE = path.join(ROOT, "data", "china_street_plates.json");

const FANG_CITY_LIST_URL = "https://m.fang.com/city/hotcity.jsp?city=hz&burl=/fangjia";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

// 74 core Tier-1 / New-Tier-1 / Capital / GBA / Yangtze-Delta / Coastal cities for street & business-circle price harvesting
const TARGET_CITIES = new Set([
  "北京", "上海", "广州", "深圳", "杭州", "南京", "苏州", "成都", "重庆", "武汉",
  "天津", "西安", "长沙", "郑州", "青岛", "宁波", "佛山", "东莞", "无锡", "合肥",
  "福州", "厦门", "济南", "大连", "沈阳", "昆明", "哈尔滨", "长春", "南宁", "石家庄",
  "南昌", "贵阳", "太原", "珠海", "中山", "惠州", "海口", "三亚", "温州", "常州",
  "南通", "烟台", "嘉兴", "绍兴", "金华", "台州", "湖州", "扬州", "镇江", "徐州",
  "盐城", "泰州", "淮安", "芜湖", "洛阳", "宜昌", "襄阳", "株洲", "绵阳", "遵义",
  "桂林", "柳州", "兰州", "乌鲁木齐", "呼和浩特", "银川", "西宁", "唐山", "保定", "潍坊",
  "临沂", "威海", "泉州", "漳州", "江门", "肇庆", "汕头", "湛江",
]);
const FORCE_REFRESH = process.argv.includes("--force");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(value) {
  const parsed = Number(cleanHtml(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed >= 800 && parsed <= 450000 ? Math.round(parsed) : null;
}

function normalizeChange(raw, cls = "") {
  const text = cleanHtml(raw);
  if (!text || text.includes("--")) return "--%";
  const down = /[▼↓]/.test(text) || /\b(green|down|jt-dn)\b/i.test(cls);
  const num = Number(text.replace(/[▲▼↑↓%]/g, "").replace(/[^\d.+-]/g, ""));
  if (!Number.isFinite(num)) return "--%";
  const val = text.startsWith("-") ? -Math.abs(num) : (down && !text.startsWith("+") ? -Math.abs(num) : num);
  return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
}

async function fetchTextPolite(url, encoding = "utf8") {
  await sleep(90 + Math.floor(Math.random() * 140));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": MOBILE_UA,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 403 || res.status === 429 || res.status === 456 || res.status === 503) {
      const err = new Error(`BLOCKED_${res.status}`);
      err.blocked = true;
      throw err;
    }
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const text = encoding === "gb18030" ? new TextDecoder("gb18030").decode(buf) : buf.toString("utf8");
    if (/验证码|访问过于频繁|安全验证|captcha/i.test(text) && text.length < 8000) {
      const err = new Error("CAPTCHA_DETECTED");
      err.blocked = true;
      throw err;
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function mapPool(items, concurrency, worker) {
  const out = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      out[cur] = await worker(items[cur], cur);
    }
  });
  await Promise.all(runners);
  return out;
}

function loadPreviousCache() {
  if (!fs.existsSync(OUT_FILE)) return { platesByDistrict: {}, officialStreets: {} };
  try {
    return JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
  } catch (_) {
    return { platesByDistrict: {}, officialStreets: {} };
  }
}

function loadOfficialLevel4Streets() {
  const level4Csv = process.argv[2] || "C:\\Users\\herol\\.gemini\\antigravity\\brain\\65af7ad6-4969-42e1-ba8f-a74bed94c01e\\scratch\\areacity\\ok_data_level4.csv";
  if (!fs.existsSync(level4Csv)) return null;
  const lines = fs.readFileSync(level4Csv, "utf8").split(/\r?\n/);
  const byId = new Map();
  const streetsByDistKey = {};

  for (const line of lines) {
    if (!line || line.startsWith("\uFEFFid") || line.startsWith("id,")) continue;
    const m = line.match(/^(\d+),(\d+),(\d+),"([^"]*)","[^"]*","[^"]*","\d*","([^"]*)"/);
    if (!m) continue;
    const [, id, pid, deep, shortName, fullName] = m;
    byId.set(id, { id, pid, deep, shortName, fullName });
  }

  for (const node of byId.values()) {
    if (node.deep !== "3") continue;
    const dist = byId.get(node.pid);
    if (!dist) continue;
    const city = byId.get(dist.pid);
    const cityName = city ? city.fullName : dist.fullName;
    const key = `${normalizeCity(cityName)}|${normalizeArea(dist.fullName)}`;
    if (!streetsByDistKey[key]) streetsByDistKey[key] = [];
    if (streetsByDistKey[key].length < 28) {
      streetsByDistKey[key].push(node.fullName.replace(/(街道办事处|办事处)$/, "街道"));
    }
  }
  return streetsByDistKey;
}

function parseFangDistrictLinks(html, code, cityName) {
  const links = [];
  const seen = new Set();
  // Match district links like https://m.fang.com/fangjia/sz_list_87/
  const re = new RegExp(`href=["'](https?:\\/\\/m\\.fang\\.com\\/fangjia\\/${code}_list_(\\d+)\\/)["'][^>]*>([\\s\\S]*?)<\\/a>`, "gi");
  let m;
  while ((m = re.exec(html))) {
    const url = m[1];
    const text = cleanHtml(m[3]);
    const nameMatch = text.match(/^(?:\d+)?([^\d\s]+?)(?:\s*([\d,]+)\s*元|$)/);
    if (!nameMatch) continue;
    const distName = nameMatch[1].replace(/房价$/, "").trim();
    if (!distName || distName.includes("周边") || distName.includes("房价") || distName === cityName || seen.has(distName)) continue;
    // Skip neighboring cities listed on metro pages (e.g. Dongguan/Huizhou on Shenzhen page)
    if (distName.length >= 2 && TARGET_CITIES.has(distName) && distName !== cityName) continue;
    seen.add(distName);
    links.push({
      url,
      du: `${code}_list_${m[2]}`,
      distName,
      fangDistPrice: nameMatch[2] ? parsePrice(nameMatch[2]) : null,
    });
  }
  return links;
}

function parsePlatesFromDistrictPage(html) {
  const plates = [];
  const seen = new Set();
  const itemRe = /<li[^>]*>\s*<a href=['"]https?:\/\/m\.fang\.com\/fangjia\/([^'"]+_list_\d+_\d+)\/['"][^>]*>[\s\S]*?<h3>([^<]+)<\/h3>[\s\S]*?<div class="price"><span>([\d,]+)<\/span>[\s\S]*?<span class="([^"]*)">([^<]*)<\/span>/gi;
  let m;
  while ((m = itemRe.exec(html))) {
    const slug = m[1].trim();
    const name = cleanHtml(m[2]);
    const rawPrice = parsePrice(m[3]);
    if (!name || !rawPrice || seen.has(name) || name.includes("周边")) continue;
    seen.add(name);
    plates.push({
      name,
      slug,
      rawPrice,
      mom: normalizeChange(m[5], m[4]),
    });
  }
  return plates;
}

async function main() {
  const prev = loadPreviousCache();
  const chinaData = fs.existsSync(CHINA_DATA_FILE) ? JSON.parse(fs.readFileSync(CHINA_DATA_FILE, "utf8")) : {};

  // Build anchor district & city price lookup for Cross-Source Scale Calibration
  const anchorDistPrice = new Map();
  const anchorCityPrice = new Map();
  for (const row of chinaData.cityData || []) {
    anchorCityPrice.set(normalizeCity(row.city), row.price);
  }
  for (const [k, rec] of Object.entries(chinaData.districtRecords || {})) {
    const [c, a] = k.split("|");
    if (rec?.price && !rec.supplemental) {
      anchorDistPrice.set(`${normalizeCity(c)}|${normalizeArea(a)}`, rec.price);
    }
  }

  const officialStreets = loadOfficialLevel4Streets() || prev.officialStreets || {};
  console.log(`Loaded official street/township directory for ${Object.keys(officialStreets).length} districts/counties.`);

  const platesByDistrict = { ...(prev.platesByDistrict || {}) };
  let circuitBroken = false;
  let consecutiveBlocks = 0;

  let cityCodes = new Map([
    ["北京", "bj"], ["上海", "sh"], ["广州", "gz"], ["深圳", "sz"], ["杭州", "hz"],
    ["南京", "nanjing"], ["苏州", "suzhou"], ["成都", "cd"], ["重庆", "cq"], ["武汉", "wuhan"],
    ["天津", "tj"], ["西安", "xian"], ["长沙", "cs"], ["郑州", "zz"], ["青岛", "qd"],
    ["宁波", "nb"], ["佛山", "fs"], ["东莞", "dg"], ["无锡", "wuxi"], ["合肥", "hf"],
    ["福州", "fz"], ["厦门", "xm"], ["济南", "jn"], ["大连", "dl"], ["沈阳", "sy"],
    ["昆明", "km"], ["哈尔滨", "hrb"], ["长春", "changchun"], ["南宁", "nn"], ["石家庄", "sjz"],
    ["南昌", "nc"], ["贵阳", "gy"], ["太原", "taiyuan"], ["珠海", "zh"], ["中山", "zs"],
    ["惠州", "huizhou"], ["海口", "hn"], ["三亚", "sanya"], ["温州", "wz"], ["常州", "cz"],
    ["南通", "nt"], ["烟台", "yt"], ["嘉兴", "jx"], ["绍兴", "sx"], ["金华", "jh"],
    ["台州", "tz"], ["湖州", "huzhou"], ["扬州", "yz"], ["镇江", "zj"], ["徐州", "xz"],
    ["盐城", "yancheng"], ["泰州", "taizhou"], ["淮安", "huaian"], ["芜湖", "wuhu"], ["洛阳", "ly"],
    ["宜昌", "yc"], ["襄阳", "xiangyang"], ["株洲", "zhuzhou"], ["绵阳", "mianyang"], ["遵义", "zunyi"],
    ["桂林", "gl"], ["柳州", "liuzhou"], ["兰州", "lz"], ["乌鲁木齐", "xj"], ["呼和浩特", "nm"],
    ["银川", "yinchuan"], ["西宁", "xn"], ["唐山", "ts"], ["保定", "bd"], ["潍坊", "wf"],
    ["临沂", "linyi"], ["威海", "weihai"], ["泉州", "qz"], ["漳州", "zhangzhou"], ["江门", "jm"],
    ["肇庆", "zq"], ["汕头", "st"], ["湛江", "zhanjiang"],
  ]);

  try {
    const listHtml = await fetchTextPolite(FANG_CITY_LIST_URL, "gb18030");
    const re = /href="(?:https?:\/\/m\.fang\.com)?\/fangjia\/([^/"]+)\/?"[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = re.exec(listHtml))) {
      const c = cleanHtml(m[2]).replace(/市$/, "");
      if (TARGET_CITIES.has(c) && !cityCodes.has(c)) cityCodes.set(c, m[1]);
    }
  } catch (e) {
    console.warn(`Fang city list fallback to built-in codes: ${e.message}`);
  }

  const cachedCities = new Set(Object.values(platesByDistrict).map(d => d.city));
  const citiesToFetch = FORCE_REFRESH ? [...TARGET_CITIES] : [...TARGET_CITIES].filter(c => !cachedCities.has(c));

  const districtTasks = [];
  await mapPool(citiesToFetch, 5, async cityName => {
    if (circuitBroken) return;
    const code = cityCodes.get(cityName);
    if (!code) return;
    try {
      const html = await fetchTextPolite(`https://m.fang.com/fangjia/${code}/`);
      const title = (html.match(/<title>(.*?)<\/title>/i) || [])[1] || "";
      if (!title.includes(cityName)) return;
      consecutiveBlocks = 0;
      const distLinks = parseFangDistrictLinks(html, code, cityName);
      for (const dl of distLinks.slice(0, 16)) {
        districtTasks.push({ cityName, code, ...dl });
      }
    } catch (e) {
      if (e.blocked && ++consecutiveBlocks >= 4) {
        circuitBroken = true;
        console.warn("Circuit breaker tripped on Fang city pages; preserving cached street plates.");
      }
    }
  });

  console.log(`Discovered ${districtTasks.length} urban districts across ${TARGET_CITIES.size} cities for street/plate harvesting...`);

  let totalPlates = 0;
  await mapPool(districtTasks, 5, async task => {
    if (circuitBroken) return;
    try {
      const html = await fetchTextPolite(task.url);
      consecutiveBlocks = 0;
      const rawPlates = parsePlatesFromDistrictPage(html);
      if (!rawPlates.length) return;

      const normDistKey = `${normalizeCity(task.cityName)}|${normalizeArea(task.distName)}`;
      const anchorP = anchorDistPrice.get(normDistKey);
      const fangDistP = task.fangDistPrice || rawPlates[Math.floor(rawPlates.length / 2)]?.rawPrice;

      // Cross-source scale calibration factor (clamped to [0.78, 1.32], neutral within ±5%)
      let scaleFactor = 1;
      if (anchorP && fangDistP) {
        const rawRatio = anchorP / fangDistP;
        if (Math.abs(rawRatio - 1) > 0.05) {
          scaleFactor = Number(Math.max(0.78, Math.min(1.32, rawRatio)).toFixed(3));
        }
      }

      platesByDistrict[normDistKey] = {
        city: task.cityName,
        code: task.code,
        du: task.du,
        district: task.distName,
        scaleFactor,
        plates: rawPlates.slice(0, 18).map(p => ({
          n: p.name,
          u: p.slug,
          p: Math.round(p.rawPrice * scaleFactor),
          rp: scaleFactor !== 1 ? p.rawPrice : undefined,
          m: p.mom !== "0.00%" && p.mom !== "+0.00%" ? p.mom : undefined,
        })),
      };
      totalPlates += platesByDistrict[normDistKey].plates.length;
    } catch (e) {
      if (e.blocked && ++consecutiveBlocks >= 5) {
        circuitBroken = true;
        console.warn("Circuit breaker tripped on district pages; preserving cached records for remaining districts.");
      }
    }
  });

  const payload = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    districtCountWithPlates: Object.keys(platesByDistrict).length,
    officialStreetDistrictCount: Object.keys(officialStreets).length,
    cityCodes: { ...(prev.cityCodes || {}), ...Object.fromEntries(cityCodes) },
    platesByDistrict,
    officialStreets,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`Saved data/china_street_plates.json: ${Object.keys(platesByDistrict).length} districts with ${totalPlates} calibrated street/plate prices + ${Object.keys(officialStreets).length} official street lists.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

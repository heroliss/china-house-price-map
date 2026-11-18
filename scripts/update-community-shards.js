#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");
const { normalizeCity, normalizeArea } = require("../src/china_map_shared");
const { parsePlateCommunitiesHtml, parseCommunityDetailHtml } = require("../src/xiaoqu_parser");

const ROOT = path.resolve(__dirname, "..");
const CHINA_DATA_FILE = path.join(ROOT, "data", "china_house_prices.json");
const PLATES_FILE = path.join(ROOT, "data", "china_street_plates.json");
const COMM_DIR = path.join(ROOT, "data", "communities");
const FANG_CITY_LIST_URL = "https://m.fang.com/city/hotcity.jsp?city=hz&burl=/fangjia";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

const BUILTIN_CITY_CODES = new Map([
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

const PREWARM_CITIES = new Set([
  "深圳", "广州", "上海", "北京", "杭州", "成都", "南京", "苏州", "武汉", "重庆",
  "东莞", "佛山", "石家庄", "天津", "西安", "郑州", "济南", "长沙", "沈阳",
]);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function cleanHtml(v) { return String(v || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }

async function fetchPolite(url) {
  await sleep(125 + Math.floor(Math.random() * 145));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11000);
  try {
    const res = await fetch(url, { headers: { "user-agent": MOBILE_UA }, redirect: "follow", signal: controller.signal });
    if (res.status === 403 || res.status === 429 || res.status === 456 || res.status === 503) {
      const e = new Error(`BLOCKED_${res.status}`); e.blocked = true; throw e;
    }
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const head = buf.subarray(0, 600).toString("latin1");
    return /charset=['"]?gb/i.test(head) ? new TextDecoder("gb18030").decode(buf) : buf.toString("utf8");
  } finally {
    clearTimeout(timer);
  }
}

async function mapPool(items, concurrency, worker) {
  const out = new Array(items.length);
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (idx < items.length) { const cur = idx++; out[cur] = await worker(items[cur], cur); }
  }));
  return out;
}

async function main() {
  const platesData = JSON.parse(fs.readFileSync(PLATES_FILE, "utf8"));
  const chinaData = fs.existsSync(CHINA_DATA_FILE) ? JSON.parse(fs.readFileSync(CHINA_DATA_FILE, "utf8")) : {};
  const platesByDistrict = platesData.platesByDistrict || {};
  fs.mkdirSync(COMM_DIR, { recursive: true });

  // 1. Build nationwide cityCodes dictionary (330+ Mainland cities)
  const knownAtlasCities = new Map();
  for (const row of chinaData.cityData || []) {
    const short = row.city.replace(/(市|地区|自治州|盟)$/, "");
    knownAtlasCities.set(short, normalizeCity(row.city));
    knownAtlasCities.set(row.city, normalizeCity(row.city));
  }

  const cityCodesObj = { ...(platesData.cityCodes || {}) };
  for (const [cName, code] of BUILTIN_CITY_CODES.entries()) {
    cityCodesObj[cName] = code;
    const norm = knownAtlasCities.get(cName);
    if (norm) cityCodesObj[norm.replace(/市$/, "")] = code;
  }

  try {
    const famHtml = await fetchPolite("https://www.fang.com/SoufunFamily.htm");
    const famSkip = new Set(["www", "m", "esf", "newhouse", "zu", "home", "bbs", "news", "fdc", "land", "commercial", "world", "us", "jp", "au"]);
    const famRe = /href=["'](?:https?:)?\/\/([a-z0-9]+)\.fang\.com[^"']*["'][^>]*>([^<]+)<\/a>/gi;
    let fm;
    while ((fm = famRe.exec(famHtml))) {
      const cd = fm[1].toLowerCase().trim(), nm = cleanHtml(fm[2]).replace(/\s+/g, "").replace(/市$/, "");
      if (cd && nm && !famSkip.has(cd) && nm.length <= 8 && !cityCodesObj[nm]) cityCodesObj[nm] = cd;
    }
    const cityListHtml = await fetchPolite(FANG_CITY_LIST_URL);
    const re = /href="(?:https?:\/\/m\.fang\.com)?\/fangjia\/([a-z0-9_]+)\/?"[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = re.exec(cityListHtml))) {
      const code = m[1].trim(), rawName = cleanHtml(m[2]).replace(/市$/, "");
      if (!code || !rawName || code.includes("list")) continue;
      if (!cityCodesObj[rawName]) cityCodesObj[rawName] = code;
    }
    console.log(`Indexed ${Object.keys(cityCodesObj).length} nationwide Fang city codes.`);
  } catch (e) {
    console.warn(`Nationwide city list fetch warning: ${e.message}`);
  }
  platesData.cityCodes = cityCodesObj;

  // 2. Discover district slugs (`du`) across ALL 78 cities in platesByDistrict
  const allIndexedCities = [...new Set(Object.values(platesByDistrict).map(d => d.city))];
  let circuitBroken = false, blocks = 0;
  const distPageQueue = [];
  let distSlugsAttached = 0;

  // 2. Discover district slugs (`du`) for any cities still missing `du`, or enqueue districts still missing `pl.u`
  const citiesMissingDu = new Set();
  for (const [nk, entry] of Object.entries(platesByDistrict)) {
    const code = entry.code || BUILTIN_CITY_CODES.get(entry.city) || cityCodesObj[entry.city];
    if (code) entry.code = code;
    if (!entry.du) {
      citiesMissingDu.add(entry.city);
    } else {
      const missingPlateSlugs = Array.isArray(entry.plates) && entry.plates.length > 0 && !entry.plates.some(p => p.u);
      const needShard = PREWARM_CITIES.has(entry.city) && !fs.existsSync(path.join(COMM_DIR, `${entry.code}.json`));
      if (missingPlateSlugs || needShard) {
        distPageQueue.push({ nk, entry, cityName: entry.city, code: entry.code, dSlug: entry.du, dUrl: `https://m.fang.com/fangjia/${entry.du}/`, needPlateSlugs: missingPlateSlugs });
      }
    }
  }

  console.log(`Scanning district slugs for ${citiesMissingDu.size} cities missing du...`);
  await mapPool([...citiesMissingDu], 3, async cityName => {
    if (circuitBroken) return;
    const code = BUILTIN_CITY_CODES.get(cityName) || cityCodesObj[cityName];
    if (!code) return;
    try {
      const html = await fetchPolite(`https://m.fang.com/fangjia/${code}/`);
      blocks = 0;
      const re = new RegExp(`href=["'](https?:\\/\\/m\\.fang\\.com\\/fangjia\\/(${code}_list_\\d+)\\/)["'][^>]*>([\\s\\S]*?)<\\/a>`, "gi");
      let m;
      const seen = new Set();
      while ((m = re.exec(html))) {
        const dUrl = m[1], dSlug = m[2];
        const text = cleanHtml(m[3]);
        const nm = text.match(/^(?:\d+)?([^\d\s]+?)(?:\s*[\d,]+\s*元|$)/);
        if (!nm) continue;
        const dName = nm[1].replace(/房价$/, "").trim();
        if (!dName || dName.includes("周边") || dName === cityName || seen.has(dName)) continue;
        seen.add(dName);

        const nk = `${normalizeCity(cityName)}|${normalizeArea(dName)}`;
        const entry = platesByDistrict[nk];
        if (!entry) continue;
        entry.code = code;
        entry.du = dSlug;
        distSlugsAttached += 1;

        const missingPlateSlugs = Array.isArray(entry.plates) && entry.plates.length > 0 && !entry.plates.some(p => p.u);
        if (missingPlateSlugs || PREWARM_CITIES.has(cityName)) {
          distPageQueue.push({ nk, entry, cityName, code, dSlug, dUrl, needPlateSlugs: missingPlateSlugs });
        }
      }
    } catch (e) {
      if (e.blocked && ++blocks >= 4) circuitBroken = true;
    }
  });

  console.log(`Attached district slugs (du) to ${distSlugsAttached} districts; fetching ${distPageQueue.length} district pages for missing plate slugs...`);

  // 3. Attach missing street-plate slugs (`u`) across remaining cities (including 石家庄, 济南, 沈阳, etc.)
  let plateSlugsAttached = 0;
  const hotPlatePrewarmQueue = [];

  await mapPool(distPageQueue, 3, async task => {
    if (circuitBroken) return;
    const { entry, cityName, code, dSlug, dUrl, needPlateSlugs } = task;
    // Load existing shard if already generated so we don't re-fetch unnecessarily
    const existingShardFile = path.join(COMM_DIR, `${code}.json`);
    const needShard = PREWARM_CITIES.has(cityName) && !fs.existsSync(existingShardFile);

    if (!needPlateSlugs && !needShard) return;

    try {
      const html = await fetchPolite(dUrl);
      blocks = 0;
      const slugByPlateName = new Map();
      const itemRe = /<li[^>]*>\s*<a href=['"]https?:\/\/m\.fang\.com\/fangjia\/([^'"]+_list_\d+_\d+)\/['"][^>]*>[\s\S]*?<h3>([^<]+)<\/h3>/gi;
      let m;
      while ((m = itemRe.exec(html))) {
        slugByPlateName.set(cleanHtml(m[2]), m[1].trim());
      }
      (entry.plates || []).forEach((pl, idx) => {
        const slug = pl.u || slugByPlateName.get(pl.n);
        if (slug) {
          if (!pl.u) plateSlugsAttached += 1;
          pl.u = slug;
          if (needShard && idx < 2 && hotPlatePrewarmQueue.filter(q => q.code === code).length < 6) {
            hotPlatePrewarmQueue.push({ code, cityName, slug });
          }
        }
      });
      if (needShard && hotPlatePrewarmQueue.filter(q => q.code === code).length < 6) {
        hotPlatePrewarmQueue.push({ code, cityName, slug: dSlug });
      }
    } catch (e) {
      if (e.blocked && ++blocks >= 5) circuitBroken = true;
    }
  });

  fs.writeFileSync(PLATES_FILE, `${JSON.stringify(platesData)}\n`, "utf8");
  console.log(`Newly attached ${plateSlugsAttached} plate slugs into data/china_street_plates.json.`);

  // 4. Pre-warm new city shards (e.g. sjz, tj, xian, zz, jn, cs, sy) including city-level _list_pinggu
  const newPrewarmCities = [...PREWARM_CITIES].filter(c => {
    const code = BUILTIN_CITY_CODES.get(c) || cityCodesObj[c];
    return code && !fs.existsSync(path.join(COMM_DIR, `${code}.json`));
  });
  for (const cName of newPrewarmCities) {
    const code = BUILTIN_CITY_CODES.get(cName) || cityCodesObj[cName];
    hotPlatePrewarmQueue.push({ code, cityName: cName, slug: `${code}_list_pinggu` });
  }

  const shardsByCity = new Map();
  await mapPool(hotPlatePrewarmQueue, 3, async item => {
    if (circuitBroken) return;
    try {
      const html = await fetchPolite(`https://m.fang.com/fangjia/${item.slug}/`);
      blocks = 0;
      const rawItems = parsePlateCommunitiesHtml(html, 1);
      if (!rawItems.length) return;
      if (!shardsByCity.has(item.code)) {
        shardsByCity.set(item.code, { city: item.cityName, code: item.code, updatedAt: new Date().toISOString(), plates: {}, details: {} });
      }
      shardsByCity.get(item.code).plates[item.slug] = rawItems.slice(0, 16);
    } catch (e) {
      if (e.blocked && ++blocks >= 5) circuitBroken = true;
    }
  });

  // Pre-warm top 2 community specs/coords for Shijiazhuang (sjz) so SJZ pins also appear instantaneously!
  const detailPrewarm = [];
  const sjzShard = shardsByCity.get("sjz");
  if (sjzShard) {
    for (const items of Object.values(sjzShard.plates).slice(0, 3)) {
      for (const it of items.slice(0, 2)) detailPrewarm.push({ code: "sjz", id: it.id });
    }
  }
  await mapPool(detailPrewarm, 4, async ({ code, id }) => {
    if (circuitBroken) return;
    try {
      const html = await fetchPolite(`https://m.fang.com/xiaoqu/${code}/${id}.html`);
      const det = parseCommunityDetailHtml(html, code, id, 1);
      if (det.name) shardsByCity.get(code).details[id] = det;
    } catch (_) {}
  });

  let writtenShards = 0;
  for (const [code, payload] of shardsByCity.entries()) {
    fs.writeFileSync(path.join(COMM_DIR, `${code}.json`), `${JSON.stringify(payload)}\n`, "utf8");
    writtenShards += 1;
  }
  console.log(`Wrote ${writtenShards} additional pre-warmed community shards (including sjz.json).`);
}

main().catch(err => { console.error(err); process.exit(1); });

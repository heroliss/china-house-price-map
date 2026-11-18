#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { normalizeProvince, normalizeCity, normalizeArea, comparableRecord } = require("../src/china_map_shared");

const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "china_house_prices.json");
const TRENDS_FILE = path.join(ROOT, "data", "china_city_trends.json");
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Core 68 cities across China (Municipalities, Provincial Capitals, GBA, Yangtze Delta, Jingjinji, Chengyu, Coastal Tier-2)
const CORE_CITIES = new Set([
  "北京", "上海", "天津", "重庆",
  "广州", "深圳", "珠海", "佛山", "东莞", "中山", "惠州", "江门", "肇庆", "汕头", "湛江",
  "南京", "苏州", "无锡", "常州", "南通", "徐州", "扬州", "盐城", "泰州", "镇江", "淮安", "连云港",
  "杭州", "宁波", "温州", "嘉兴", "绍兴", "金华", "台州", "湖州",
  "合肥", "芜湖", "福州", "厦门", "泉州", "漳州", "南昌", "赣州",
  "济南", "青岛", "烟台", "潍坊", "威海", "临沂", "淄博",
  "郑州", "洛阳", "武汉", "宜昌", "襄阳", "长沙", "株洲",
  "成都", "绵阳", "贵阳", "遵义", "昆明", "南宁", "桂林", "柳州", "海口", "三亚",
  "石家庄", "唐山", "保定", "秦皇岛", "太原", "呼和浩特", "沈阳", "大连", "长春", "哈尔滨",
  "西安", "兰州", "西宁", "银川", "乌鲁木齐",
]);

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
  return Number.isFinite(parsed) && parsed >= 600 && parsed <= 450000 ? Math.round(parsed) : null;
}

function parseFloatMetric(value, decimals = 2) {
  const parsed = Number(cleanHtml(value).replace(/[^\d.+-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 && parsed < 200 ? Number(parsed.toFixed(decimals)) : null;
}

function normalizeChange(raw, cls = "") {
  const text = cleanHtml(raw);
  if (!text || text.includes("--")) return "";
  const down = /[▼↓]/.test(text) || /\b(green|down|price-down|text-success)\b/i.test(cls);
  const num = Number(text.replace(/[▲▼↑↓%]/g, "").replace(/[^\d.+-]/g, ""));
  if (!Number.isFinite(num)) return "";
  const val = text.startsWith("-") ? -Math.abs(num) : (down && !text.startsWith("+") ? -Math.abs(num) : num);
  return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
}

async function fetchPolite(url) {
  await sleep(75 + Math.floor(Math.random() * 110));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": DESKTOP_UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      signal: controller.signal,
    });
    if (res.status === 403 || res.status === 429 || res.status === 456 || res.status === 503) {
      const err = new Error(`BLOCKED_${res.status}`);
      err.blocked = true;
      throw err;
    }
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const html = await res.text();
    if (/验证码|访问过于频繁|安全验证|captcha/i.test(html) && html.length < 8000) {
      const err = new Error("CAPTCHA_DETECTED");
      err.blocked = true;
      throw err;
    }
    return html;
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

function parseDistrictDetail(html) {
  const out = {
    resalePrice: null,
    yoy: "",
    mom: "",
    newPrice: null,
    newYoy: "",
    newMom: "",
    peakPrice: null,
    peakDate: "",
    troughPrice: null,
    troughDate: "",
    rentYield: null,
    priceToIncome: null,
    history: [],
  };

  const gridStart = html.indexOf("pro-quote-grid");
  if (gridStart >= 0) {
    const gridEnd = html.indexOf("content-card", gridStart);
    const gridHtml = html.slice(gridStart, gridEnd > gridStart ? gridEnd : gridStart + 6500);
    const parts = gridHtml.split(/<div class="pro-quote-item">/i).slice(1);
    for (const part of parts) {
      const label = cleanHtml((part.match(/<div class="pro-quote-label">([\s\S]*?)<\/div>/i) || [])[1]);
      if (!label) continue;
      if (label.includes("二手房均价")) {
        const val = parsePrice((part.match(/<span class="pro-quote-value[^"]*">([\s\S]*?)<\/span>/i) || [])[1]);
        const yoyM = part.match(/同比\s*<span([^>]*)>([\s\S]*?)<\/span>/i);
        const momM = part.match(/环比\s*<span([^>]*)>([\s\S]*?)<\/span>/i);
        if (val) {
          out.resalePrice = val;
          if (yoyM) out.yoy = normalizeChange(yoyM[2], yoyM[1]);
          if (momM) out.mom = normalizeChange(momM[2], momM[1]);
        }
      } else if (label.includes("新房均价")) {
        const val = parsePrice((part.match(/<span class="pro-quote-value[^"]*">([\s\S]*?)<\/span>/i) || [])[1]);
        const yoyM = part.match(/同比\s*<span([^>]*)>([\s\S]*?)<\/span>/i);
        const momM = part.match(/环比\s*<span([^>]*)>([\s\S]*?)<\/span>/i);
        if (val) {
          out.newPrice = val;
          if (yoyM) out.newYoy = normalizeChange(yoyM[2], yoyM[1]);
          if (momM) out.newMom = normalizeChange(momM[2], momM[1]);
        }
      } else if (label.includes("近十年房价极值")) {
        const extremes = [...part.matchAll(/<div class="pro-quote-extreme[^"]*">[\s\S]*?<span[^>]*>([\d,]+)<\/span>[\s\S]*?<span class="pro-quote-extreme-date">([^<]+)<\/span>/gi)];
        if (extremes[0]) { out.peakPrice = parsePrice(extremes[0][1]); out.peakDate = cleanHtml(extremes[0][2]); }
        if (extremes[1]) { out.troughPrice = parsePrice(extremes[1][1]); out.troughDate = cleanHtml(extremes[1][2]); }
      } else if (label === "租售比") {
        out.rentYield = parseFloatMetric((part.match(/<span class="pro-quote-value[^"]*">([\s\S]*?)<\/span>/i) || [])[1], 2);
      } else if (label === "房价收入比") {
        out.priceToIncome = parseFloatMetric((part.match(/<span class="pro-quote-value[^"]*">([\s\S]*?)<\/span>/i) || [])[1], 1);
      }
    }
  }

  const histRe = /<tr[^>]*>\s*<td[^>]*>\s*(20\d{2}-\d{2})\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let hm;
  while ((hm = histRe.exec(html))) {
    const rP = parsePrice(hm[2]);
    const nP = parsePrice(hm[3]);
    if (rP || nP) out.history.push([hm[1], rP || null, nP || null]);
  }
  if (out.history.length > 1) {
    out.history.sort((a, b) => a[0].localeCompare(b[0]));
    if (out.history.length > 12) out.history = out.history.slice(-12);
  }
  return out;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const trendsData = fs.existsSync(TRENDS_FILE) ? JSON.parse(fs.readFileSync(TRENDS_FILE, "utf8")) : { trends: {} };
  const trends = trendsData.trends || {};

  // Step 1: Align city-level Gotohui newPrice to Creprice city resale scale when paired Gotohui resale exists in trends
  let alignedCityNewCount = 0;
  for (const [key, rec] of Object.entries(data.cityRecords || {})) {
    if (!rec?.price || !rec?.newPrice || rec.newPriceEstimated || rec.cityNewAligned) continue;
    const tObj = rec.trendKey ? trends[rec.trendKey] : null;
    const ghResale = tObj?.series ? [...tObj.series].reverse().find(s => s[1])?.[1] : null;
    const ghNew = tObj?.series ? [...tObj.series].reverse().find(s => s[2])?.[2] : null;
    if (ghResale && String(rec.source || "").includes("禧泰") && String(rec.newSource || "").includes("聚汇")) {
      const scaleK = rec.price / ghResale;
      if (scaleK >= 0.72 && scaleK <= 1.38 && Math.abs(scaleK - 1) > 0.055) {
        const rawNew = rec.rawNewPrice || ghNew || rec.newPrice;
        rec.rawNewPrice = rawNew;
        rec.newPrice = Math.round(rawNew * Math.max(0.80, Math.min(1.28, scaleK)));
        rec.cityNewAligned = true;
        alignedCityNewCount += 1;
      }
    }
  }
  // Sync aligned city newPrice onto cityData array too
  for (const row of data.cityData || []) {
    const rec = data.cityRecords?.[`${row.province}|${row.city}`] || data.cityRecords?.[row.city];
    if (rec?.newPrice) row.newPrice = rec.newPrice;
  }
  console.log(`Aligned within-source new-house scale on ${Math.round(alignedCityNewCount / 2)} cities.`);

  // Step 2: Discover Gotohui city URLs for CORE_CITIES
  const targetCityEntries = [];
  const seenCityNorm = new Set();
  for (const row of data.cityData || []) {
    const normC = normalizeCity(row.city);
    if (!CORE_CITIES.has(normC) || seenCityNorm.has(normC)) continue;
    const rec = data.cityRecords?.[`${row.province}|${row.city}`] || data.cityRecords?.[row.city];
    if (rec?.url && rec.url.includes("gotohui.com/fjdata-")) {
      seenCityNorm.add(normC);
      targetCityEntries.push({ province: row.province, city: row.city, normC, url: rec.url });
    }
  }
  console.log(`Discovering subordinate district pages across ${targetCityEntries.length} core cities...`);

  const distTasks = [];
  let circuitBroken = false;
  let consecutiveBlocks = 0;

  await mapPool(targetCityEntries, 5, async entry => {
    if (circuitBroken) return;
    try {
      const html = await fetchPolite(entry.url);
      consecutiveBlocks = 0;
      const re = /href="(https:\/\/fangjia\.gotohui\.com\/fjdata-\d+)"[^>]*class="housing-name"[^>]*title="([^"]+)"/gi;
      let m;
      const seenD = new Set();
      while ((m = re.exec(html))) {
        const dUrl = m[1];
        const dName = cleanHtml(m[2]);
        if (!dName || dName === "市区" || seenD.has(dUrl)) continue;
        seenD.add(dUrl);
        distTasks.push({ ...entry, distName: dName, distUrl: dUrl });
      }
    } catch (e) {
      if (e.blocked && ++consecutiveBlocks >= 4) circuitBroken = true;
    }
  });

  console.log(`Harvesting real district fundamentals (newPrice, YoY, rentYield, PTI, 10yr peak, 12m trend) for ${distTasks.length} districts...`);

  // Index existing districtRecords by normalized key for fast enrichment
  const distKeyLookup = new Map();
  for (const k of Object.keys(data.districtRecords || {})) {
    const [c, a] = k.split("|");
    const nk = `${normalizeCity(c)}|${normalizeArea(a)}`;
    if (!distKeyLookup.has(nk)) distKeyLookup.set(nk, []);
    distKeyLookup.get(nk).push(k);
  }

  let enrichedDists = 0;
  let distTrendsAdded = 0;

  await mapPool(distTasks, 6, async task => {
    if (circuitBroken) return;
    try {
      const html = await fetchPolite(task.distUrl);
      consecutiveBlocks = 0;
      const det = parseDistrictDetail(html);
      if (!det.resalePrice && !det.newPrice) return;

      const nk = `${task.normC}|${normalizeArea(task.distName)}`;
      const matchingKeys = distKeyLookup.get(nk) || [`${task.city.replace(/市$/, "")}|${task.distName}`];

      for (const fullKey of matchingKeys) {
        const existing = data.districtRecords[fullKey];
        const basePrice = existing?.price || det.resalePrice;
        if (!basePrice) continue;

        // Within-source scale factor between anchor district resale price and Gotohui district resale price
        let scaleK = 1;
        if (existing?.price && det.resalePrice && String(existing.source || "").includes("禧泰")) {
          const rawK = existing.price / det.resalePrice;
          if (rawK >= 0.68 && rawK <= 1.45 && Math.abs(rawK - 1) > 0.05) {
            scaleK = Number(Math.max(0.76, Math.min(1.34, rawK)).toFixed(3));
          }
        }

        const calNewPrice = det.newPrice ? Math.round(det.newPrice * scaleK) : (existing?.newPrice || null);
        const calPeak = det.peakPrice ? Math.round(det.peakPrice * scaleK) : existing?.peakPrice;
        const calTrough = det.troughPrice ? Math.round(det.troughPrice * scaleK) : existing?.troughPrice;
        // True within-source drawdown %
        const ghRef = det.resalePrice || basePrice;
        const drawdownPct = det.peakPrice && ghRef && det.peakPrice >= ghRef
          ? Number((((ghRef - det.peakPrice) / det.peakPrice) * 100).toFixed(1))
          : existing?.drawdownPct;

        const distTrendKey = det.history.length >= 3 ? `dist:${nk}` : (existing?.trendKey || "");
        if (det.history.length >= 3) {
          trends[distTrendKey] = {
            city: task.city,
            district: task.distName,
            province: task.province,
            series: det.history,
            peak: det.peakPrice ? [det.peakPrice, det.peakDate] : undefined,
            trough: det.troughPrice ? [det.troughPrice, det.troughDate] : undefined,
          };
          distTrendsAdded += 1;
        }

        const updated = {
          ...(existing || {
            price: basePrice,
            resalePrice: basePrice,
            mom: det.mom || "--%",
            province: task.province,
            source: "聚汇数据",
            quality: "区县二手房均价",
            dataLevel: "district",
            supplemental: false,
          }),
          yoy: det.yoy || existing?.yoy || "",
          resaleYoy: det.yoy || existing?.resaleYoy || "",
          newPrice: calNewPrice,
          rawNewPrice: det.newPrice && scaleK !== 1 ? det.newPrice : undefined,
          newPriceEstimated: !det.newPrice && Boolean(existing?.newPriceEstimated),
          newYoy: det.newYoy || existing?.newYoy || "",
          newMom: det.newMom || existing?.newMom || "",
          newSource: det.newPrice ? "聚汇数据（区县实测）" : (existing?.newSource || ""),
          newQuality: det.newPrice ? (scaleK !== 1 ? `区县在售新盘均价（同区标尺校准 ×${scaleK}）` : "区县在售新盘均价") : (existing?.newQuality || ""),
          rentYield: det.rentYield || existing?.rentYield || null,
          priceToIncome: det.priceToIncome || existing?.priceToIncome || null,
          peakPrice: calPeak || undefined,
          peakDate: det.peakDate || existing?.peakDate || undefined,
          troughPrice: calTrough || undefined,
          troughDate: det.troughDate || existing?.troughDate || undefined,
          drawdownPct: drawdownPct ?? undefined,
          trendKey: distTrendKey || existing?.trendKey || "",
          realDistrictFundamentals: true,
        };

        data.districtRecords[fullKey] = updated;
        if (!data.districtData[fullKey]) data.districtData[fullKey] = [updated.price, updated.mom || "--%"];
        enrichedDists += 1;
      }
    } catch (e) {
      if (e.blocked && ++consecutiveBlocks >= 5) {
        circuitBroken = true;
        console.warn("Circuit breaker tripped during Gotohui district enrichment; preserving cached records.");
      }
    }
  });

  trendsData.updatedAt = new Date().toISOString();
  trendsData.trends = trends;
  data.metadata.realFundamentalDistricts = enrichedDists;
  data.metadata.districtSources = {
    ...(data.metadata.districtSources || {}),
    realFundamentalDistricts: enrichedDists,
    cityTrendSeries: Object.keys(trends).length,
  };

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.writeFileSync(TRENDS_FILE, `${JSON.stringify(trendsData)}\n`, "utf8");
  console.log(`District fundamentals enrichment complete: ${enrichedDists} districts upgraded with real newPrice/YoY/yield/PTI/peak, +${distTrendsAdded} district 12-month trend series.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

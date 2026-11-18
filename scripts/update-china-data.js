#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");

const ROOT = path.resolve(__dirname, "..");
const {
  normalizeProvince,
  normalizeCity,
  normalizeArea,
  comparableRecord,
  clampEstimateRatio,
  SUPPLEMENTAL_CITY_RECORDS,
  SUPPLEMENTAL_DISTRICT_RECORDS,
} = require(path.join(ROOT, "src", "china_map_shared"));

const DATA_FILE = path.join(ROOT, "data", "china_house_prices.json");
const TRENDS_FILE = path.join(ROOT, "data", "china_city_trends.json");

const SOURCE_URL = "https://m.creprice.cn/";
const CITY_PAGE_CONCURRENCY = 8;
const FANG_CITY_LIST_URL = "https://m.fang.com/city/hotcity.jsp?city=hz&burl=/fangjia";
const FANG_PAGE_CONCURRENCY = 8;
const GOTOHUI_CONCURRENCY = 6;

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MOBILE_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

const GOTOHUI_PROVINCES = [
  ["北京", 1, true], ["上海", 3, true], ["天津", 4, true], ["重庆", 6, true],
  ["广东", 7, false], ["江苏", 9, false], ["山东", 25, false], ["浙江", 2, false],
  ["河南", 14, false], ["四川", 29, false], ["福建", 8, false], ["湖北", 17, false],
  ["湖南", 18, false], ["安徽", 10, false], ["河北", 15, false], ["陕西", 27, false],
  ["江西", 20, false], ["辽宁", 21, false], ["云南", 28, false], ["广西", 11, false],
  ["贵州", 13, false], ["山西", 26, false], ["内蒙古", 22, false], ["新疆", 31, false],
  ["黑龙江", 16, false], ["吉林", 19, false], ["甘肃", 30, false], ["海南", 12, false],
  ["宁夏", 23, false], ["青海", 24, false], ["西藏", 32, false],
];

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
  const text = cleanHtml(value);
  if (!text || text.includes("--")) return null;
  const parsed = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function parseFloatMetric(value, decimals = 2) {
  const text = cleanHtml(value);
  if (!text || text.includes("--")) return null;
  const parsed = Number(text.replace(/[^\d.+-]/g, ""));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(decimals)) : null;
}

function normalizeChange(raw, className = "") {
  const original = cleanHtml(raw);
  if (!original || original.includes("--")) return "--%";
  const hasDownSignal = /[▼↓]/.test(original) || /\b(green|price-down|text-success)\b/i.test(className);
  const stripped = original.replace(/[▲▼↑↓]/g, "").replace("%", "").trim();
  const parsed = Number(stripped.replace(/[^\d.+-]/g, ""));
  if (!Number.isFinite(parsed)) return original;
  const value = stripped.startsWith("-")
    ? -Math.abs(parsed)
    : hasDownSignal && !stripped.startsWith("+")
      ? -Math.abs(parsed)
      : parsed;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

async function fetchText(url, options = {}) {
  const retries = options.retries ?? 3;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    if (options.jitterMs) {
      await sleep(options.jitterMs + Math.floor(Math.random() * options.jitterMs));
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
      const response = await fetch(url, {
        headers: {
          "user-agent": options.userAgent || DESKTOP_UA,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.status === 403 || response.status === 429 || response.status === 456 || response.status === 503) {
        const blockErr = new Error(`BLOCKED_${response.status} ${url}`);
        blockErr.blocked = true;
        throw blockErr;
      }
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const decoded = options.encoding === "gb18030" ? new TextDecoder("gb18030").decode(buffer) : buffer.toString("utf8");
      if (decoded.length < 7500 && /验证码|访问过于频繁|安全验证|captcha/i.test(decoded)) {
        const capErr = new Error(`CAPTCHA_DETECTED ${url}`);
        capErr.blocked = true;
        throw capErr;
      }
      return decoded;
    } catch (error) {
      lastError = error;
      if (error.blocked) break; // Do not hammer an endpoint that returned a rate-limit/WAF block
      if (attempt < retries) await sleep(attempt * 800 + Math.floor(Math.random() * 400));
    }
  }
  throw lastError;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function parseRanking(html) {
  const rows = [];
  const rowRe = /<tr[\s\S]*?<td>\s*\d+\s*<\/td>[\s\S]*?<td><a class='blue' href="\/city\/([^"]+)\.html"[^>]*>([^<]+)<\/a><\/td>[\s\S]*?<td><a class='blue' href="\/province\/([^"]+)\.html"[^>]*>([^<]+)<\/a><\/td>[\s\S]*?<td>\s*([\d,]+)\s*<\/td>[\s\S]*?<td>\s*<span([^>]*)>([\s\S]*?)<\/span>/g;
  let match;
  while ((match = rowRe.exec(html))) {
    const price = parsePrice(match[5]);
    if (!price) continue;
    rows.push({
      slug: match[1],
      city: cleanHtml(match[2]),
      provinceSlug: match[3],
      province: cleanHtml(match[4]),
      price,
      mom: normalizeChange(match[7], match[6]),
    });
  }
  const periodMatch = html.match(/<title>[^<]*?(\d{4}年\d{1,2}月)/);
  return { rows, period: periodMatch ? periodMatch[1] : "" };
}

function parseDistrictRows(html) {
  const rows = [];
  const rowRe = /<tr>[\s\S]*?<td><a class='blue' href="\/district\/([^"?]+)\.html\?city=([^"]+)">([^<]+)<\/a><\/td>[\s\S]*?<td([^>]*)>([\s\S]*?)<\/td>[\s\S]*?<td([^>]*)>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/g;
  let match;
  while ((match = rowRe.exec(html))) {
    const price = parsePrice(match[5]);
    if (!price) continue;
    rows.push({
      code: match[1],
      cityParam: match[2],
      name: cleanHtml(match[3]),
      price,
      mom: normalizeChange(match[7], `${match[4]} ${match[6]}`),
    });
  }
  return rows;
}

async function fetchCrepriceDistrictData(cityRows) {
  const districtData = {};
  const cityDistrictCounts = {};
  const errors = [];

  await mapWithConcurrency(cityRows, CITY_PAGE_CONCURRENCY, async row => {
    const url = `https://m.creprice.cn/city/${row.slug}.html`;
    try {
      const html = await fetchText(url);
      const districts = parseDistrictRows(html);
      cityDistrictCounts[row.city] = districts.length;
      for (const district of districts) {
        districtData[`${row.city}|${district.name}`] = [district.price, district.mom];
      }
    } catch (error) {
      cityDistrictCounts[row.city] = 0;
      errors.push({ city: row.city, url, error: error.message });
    }
  });

  return { districtData, cityDistrictCounts, errors };
}

function parseGotohuiProvinceRows(html, provinceName) {
  const cities = [];
  const tableMatch = html.match(/<table class="data-table">([\s\S]*?)<\/table>/i);
  const scope = tableMatch ? tableMatch[1] : html;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRe.exec(scope))) {
    const rowHtml = match[1];
    const linkMatch = rowHtml.match(/href=["'](https?:\/\/fangjia\.gotohui\.com\/fjdata-\d+|\/fjdata-\d+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const tds = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (tds.length < 5) continue;
    const name = cleanHtml(linkMatch[2]);
    if (!name || name === "房价") continue;
    const url = linkMatch[1].startsWith("http") ? linkMatch[1] : `https://fangjia.gotohui.com${linkMatch[1]}`;
    const resalePrice = parsePrice(tds[2]);
    const yoy = normalizeChange(tds[3], tds[3]);
    const mom = normalizeChange(tds[4], tds[4]);
    const newPrice = tds.length >= 6 ? parsePrice(tds[5]) : null;
    cities.push({
      province: provinceName,
      city: name,
      url,
      resalePrice,
      yoy: yoy !== "--%" ? yoy : "",
      mom,
      newPrice,
    });
  }
  return cities;
}

function parseGotohuiCityDetail(html) {
  const result = {
    resalePrice: null,
    resalePeriod: "",
    yoy: "",
    mom: "--%",
    newPrice: null,
    newPeriod: "",
    newYoy: "",
    newMom: "",
    peakPrice: null,
    peakDate: "",
    troughPrice: null,
    troughDate: "",
    rentYield: null,
    priceToIncome: null,
    priceToWage: null,
    history: [],
    districts: [],
  };

  // 1. Parse pro-quote-item cards
  const gridStart = html.indexOf("pro-quote-grid");
  if (gridStart >= 0) {
    const gridEnd = html.indexOf("content-card", gridStart);
    const gridHtml = html.slice(gridStart, gridEnd > gridStart ? gridEnd : gridStart + 6000);
    const parts = gridHtml.split(/<div class="pro-quote-item">/i).slice(1);
    for (const part of parts) {
      const label = cleanHtml((part.match(/<div class="pro-quote-label">([\s\S]*?)<\/div>/i) || [])[1]);
      if (!label) continue;
      if (label.includes("二手房均价")) {
        const val = parsePrice((part.match(/<span class="pro-quote-value[^"]*">([\s\S]*?)<\/span>/i) || [])[1]);
        const yoyMatch = part.match(/同比\s*<span([^>]*)>([\s\S]*?)<\/span>/i);
        const momMatch = part.match(/环比\s*<span([^>]*)>([\s\S]*?)<\/span>/i);
        if (val) {
          // Later二手房均价 card in Gotohui is the newer month (e.g. 11月 after 10月)
          result.resalePrice = val;
          result.resalePeriod = label.replace(/二手房均价/g, "").trim();
          if (yoyMatch) result.yoy = normalizeChange(yoyMatch[2], yoyMatch[1]);
          if (momMatch) result.mom = normalizeChange(momMatch[2], momMatch[1]);
        }
      } else if (label.includes("新房均价")) {
        const val = parsePrice((part.match(/<span class="pro-quote-value[^"]*">([\s\S]*?)<\/span>/i) || [])[1]);
        const yoyMatch = part.match(/同比\s*<span([^>]*)>([\s\S]*?)<\/span>/i);
        const momMatch = part.match(/环比\s*<span([^>]*)>([\s\S]*?)<\/span>/i);
        if (val) {
          result.newPrice = val;
          result.newPeriod = label.replace(/新房均价/g, "").trim();
          if (yoyMatch) result.newYoy = normalizeChange(yoyMatch[2], yoyMatch[1]);
          if (momMatch) result.newMom = normalizeChange(momMatch[2], momMatch[1]);
        }
      } else if (label.includes("近十年房价极值")) {
        const extremes = [...part.matchAll(/<div class="pro-quote-extreme[^"]*">[\s\S]*?<span[^>]*>([\d,]+)<\/span>[\s\S]*?<span class="pro-quote-extreme-date">([^<]+)<\/span>/gi)];
        if (extremes[0]) {
          result.peakPrice = parsePrice(extremes[0][1]);
          result.peakDate = cleanHtml(extremes[0][2]);
        }
        if (extremes[1]) {
          result.troughPrice = parsePrice(extremes[1][1]);
          result.troughDate = cleanHtml(extremes[1][2]);
        }
      } else if (label === "租售比") {
        result.rentYield = parseFloatMetric((part.match(/<span class="pro-quote-value[^"]*">([\s\S]*?)<\/span>/i) || [])[1], 2);
      } else if (label === "房价收入比") {
        result.priceToIncome = parseFloatMetric((part.match(/<span class="pro-quote-value[^"]*">([\s\S]*?)<\/span>/i) || [])[1], 1);
      } else if (label === "房价工资比") {
        result.priceToWage = parseFloatMetric((part.match(/<span class="pro-quote-value[^"]*">([\s\S]*?)<\/span>/i) || [])[1], 1);
      }
    }
  }

  // 2. Parse 12-month history table (YYYY-MM | resale | new)
  const histRe = /<tr[^>]*>\s*<td[^>]*>\s*(20\d{2}-\d{2})\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let hMatch;
  while ((hMatch = histRe.exec(html))) {
    const month = hMatch[1];
    const rPrice = parsePrice(hMatch[2]);
    const nPrice = parsePrice(hMatch[3]);
    if (rPrice || nPrice) {
      result.history.push([month, rPrice || null, nPrice || null]);
    }
  }
  if (result.history.length > 1) {
    result.history.sort((a, b) => a[0].localeCompare(b[0]));
    if (result.history.length > 12) result.history = result.history.slice(-12);
  }

  // 3. Parse subordinate district/county rows
  const distRe = /<tr class="housing-ranking-row">([\s\S]*?)<\/tr>/gi;
  let dMatch;
  while ((dMatch = distRe.exec(html))) {
    const rowHtml = dMatch[1];
    const nameMatch = rowHtml.match(/class="housing-name"[^>]*>([\s\S]*?)<\/a>/i) || rowHtml.match(/<td>\s*([^<]+?)\s*<\/td>/i);
    const valMatch = rowHtml.match(/class="housing-value"[^>]*>([\s\S]*?)<\/span>/i);
    const chgMatch = rowHtml.match(/class="housing-yoy([^"]*)"[^>]*>([\s\S]*?)<\/span>/i);
    const name = cleanHtml(nameMatch?.[1]);
    const price = parsePrice(valMatch?.[1]);
    if (!name || !price || name === "市区") continue;
    const mom = chgMatch ? normalizeChange(chgMatch[2], chgMatch[1]) : "--%";
    result.districts.push({ name, price, mom });
  }

  return result;
}

async function fetchGotohuiAll() {
  const cityEntries = [];
  const errors = [];

  await mapWithConcurrency(GOTOHUI_PROVINCES, GOTOHUI_CONCURRENCY, async ([provinceName, id, isMunicipality]) => {
    const url = `https://fangjia.gotohui.com/fjdata-${id}`;
    try {
      const html = await fetchText(url, { userAgent: DESKTOP_UA });
      if (isMunicipality) {
        cityEntries.push({
          province: provinceName,
          city: provinceName,
          url,
          prefetchedHtml: html,
        });
      } else {
        const rows = parseGotohuiProvinceRows(html, provinceName);
        for (const row of rows) cityEntries.push(row);
      }
    } catch (error) {
      errors.push({ scope: "province", province: provinceName, url, error: error.message });
      console.warn(`Gotohui province skipped ${provinceName}: ${error.message}`);
    }
  });

  console.log(`Gotohui discovered ${cityEntries.length} cities/prefectures/counties across 31 provinces`);

  const cityDetails = {};
  const districtData = {};
  const trends = {};
  let districtCount = 0;

  await mapWithConcurrency(cityEntries, GOTOHUI_CONCURRENCY, async entry => {
    try {
      const html = entry.prefetchedHtml || await fetchText(entry.url, { userAgent: DESKTOP_UA });
      const detail = parseGotohuiCityDetail(html);
      const resalePrice = detail.resalePrice || entry.resalePrice || null;
      const newPrice = detail.newPrice || entry.newPrice || null;
      const yoy = (detail.yoy && detail.yoy !== "--%") ? detail.yoy : (entry.yoy || "");
      const mom = (detail.mom && detail.mom !== "--%") ? detail.mom : (entry.mom || "--%");
      const drawdownPct = detail.peakPrice && resalePrice && detail.peakPrice >= resalePrice
        ? Number((((resalePrice - detail.peakPrice) / detail.peakPrice) * 100).toFixed(1))
        : null;

      const trendKey = `${normalizeProvince(entry.province)}|${normalizeCity(entry.city)}`;
      if (detail.history.length >= 2) {
        trends[trendKey] = {
          city: entry.city,
          province: entry.province,
          series: detail.history,
          peak: detail.peakPrice ? [detail.peakPrice, detail.peakDate] : undefined,
          trough: detail.troughPrice ? [detail.troughPrice, detail.troughDate] : undefined,
        };
      }

      cityDetails[`${entry.province}|${entry.city}`] = {
        province: entry.province,
        city: entry.city,
        url: entry.url,
        resalePrice,
        resalePeriod: detail.resalePeriod,
        yoy,
        mom,
        newPrice,
        newPeriod: detail.newPeriod,
        newYoy: detail.newYoy,
        newMom: detail.newMom,
        peakPrice: detail.peakPrice,
        peakDate: detail.peakDate,
        troughPrice: detail.troughPrice,
        troughDate: detail.troughDate,
        drawdownPct,
        rentYield: detail.rentYield,
        priceToIncome: detail.priceToIncome,
        priceToWage: detail.priceToWage,
        trendKey: detail.history.length >= 2 ? trendKey : "",
      };

      for (const dist of detail.districts) {
        const key = `${entry.city}|${dist.name}`;
        districtData[key] = {
          province: entry.province,
          price: dist.price,
          mom: dist.mom,
          url: entry.url,
        };
        districtCount += 1;
      }
    } catch (error) {
      errors.push({ scope: "city", province: entry.province, city: entry.city, url: entry.url, error: error.message });
    }
  });

  console.log(`Gotohui parsed ${Object.keys(cityDetails).length} city details, ${districtCount} district rows, ${Object.keys(trends).length} city 12m trend series`);
  return { cityDetails, districtData, trends, errors };
}

function parseFangCityCodes(html) {
  const codes = new Map();
  const re = /href="\/fangjia\/([^/"]+)\/"[^>]*>([^<]+)<\/a>/g;
  let match;
  while ((match = re.exec(html))) {
    const city = cleanHtml(match[2]);
    if (city && !codes.has(city)) codes.set(city, match[1]);
  }
  return codes;
}

function parseFangDistrictRows(html) {
  const rows = [];
  const seen = new Set();
  const hotAreaRe = /<li[^>]*>\s*<a href="https?:\/\/m\.fang\.com\/fangjia\/[^"]+"[^>]*>\s*<h3>([^<]+)<\/h3>[\s\S]*?<div class="price"><span>([\d,]+)<\/span>[^<]*<\/div>\s*<span class="([^"]+)">([^<]+)<\/span>/g;
  let match;
  while ((match = hotAreaRe.exec(html))) {
    const name = cleanHtml(match[1]);
    const price = parsePrice(match[2]);
    if (!name || !price || seen.has(name)) continue;
    seen.add(name);
    rows.push({ name, price, mom: normalizeChange(match[4], match[3]) });
  }

  const labelStyles = (html.match(/labelStyles=([^"]+)/) || [])[1] || "";
  for (const item of labelStyles.split("|")) {
    const label = item.match(/^([^,]+?)\s+([\d,]+)元\//);
    if (!label) continue;
    const name = cleanHtml(label[1]);
    const price = parsePrice(label[2]);
    if (!name || !price || seen.has(name)) continue;
    seen.add(name);
    rows.push({ name, price, mom: "--%" });
  }
  return rows;
}

async function fetchFangDistrictData(cityRows) {
  const fangData = {};
  const cityDistrictCounts = {};
  const errors = [];
  let cityCodes;
  try {
    const cityListHtml = await fetchText(FANG_CITY_LIST_URL, {
      encoding: "gb18030",
      userAgent: MOBILE_USER_AGENT,
    });
    cityCodes = parseFangCityCodes(cityListHtml);
  } catch (error) {
    errors.push({ source: "fang-city-list", url: FANG_CITY_LIST_URL, error: error.message });
    return { data: fangData, cityDistrictCounts, errors, cityCodeCount: 0 };
  }

  await mapWithConcurrency(cityRows, FANG_PAGE_CONCURRENCY, async row => {
    const code = cityCodes.get(row.city);
    if (!code) {
      cityDistrictCounts[row.city] = 0;
      return;
    }
    const url = `https://m.fang.com/fangjia/${code}/`;
    try {
      const html = await fetchText(url, { userAgent: MOBILE_USER_AGENT, retries: 2 });
      const title = (html.match(/<title>(.*?)<\/title>/i) || [])[1] || "";
      if (!title.includes(row.city)) {
        cityDistrictCounts[row.city] = 0;
        return;
      }
      const districts = parseFangDistrictRows(html);
      cityDistrictCounts[row.city] = districts.length;
      for (const district of districts) {
        fangData[`${row.city}|${district.name}`] = {
          province: row.province,
          price: district.price,
          mom: district.mom,
          url,
        };
      }
    } catch (error) {
      cityDistrictCounts[row.city] = 0;
      errors.push({ city: row.city, url, error: error.message });
    }
  });

  return { data: fangData, cityDistrictCounts, errors, cityCodeCount: cityCodes.size };
}

function median(values) {
  const filtered = values.filter(value => value >= 0.55 && value <= 1.85);
  if (!filtered.length) return null;
  const sorted = [...filtered].sort((a, b) => a - b);
  const trim = sorted.length >= 12 ? Math.floor(sorted.length * 0.1) : 0;
  const sample = trim ? sorted.slice(trim, sorted.length - trim) : sorted;
  if (!sample.length) return null;
  return sample[Math.floor(sample.length / 2)];
}

function fuseCityData(crepriceRows, gotohuiCityDetails, fetchedAt) {
  const gotohuiByNorm = new Map();
  for (const item of Object.values(gotohuiCityDetails)) {
    const key = `${normalizeProvince(item.province)}|${normalizeCity(item.city)}`;
    if (!gotohuiByNorm.has(key)) gotohuiByNorm.set(key, item);
  }

  const mergedRows = [];
  const seenNormKeys = new Set();

  // 1. Primary Creprice cities enriched with Gotohui metrics
  for (const row of crepriceRows) {
    const normKey = `${normalizeProvince(row.province)}|${normalizeCity(row.city)}`;
    seenNormKeys.add(normKey);
    const gh = gotohuiByNorm.get(normKey);
    mergedRows.push({
      ...row,
      source: "禧泰数据/中国房价行情",
      quality: "城市住宅挂牌均价",
      gh,
    });
  }

  // 2. Cities/prefectures/provincial-counties in Gotohui missing from Creprice
  for (const [normKey, gh] of gotohuiByNorm.entries()) {
    if (seenNormKeys.has(normKey) || !gh.resalePrice) continue;
    seenNormKeys.add(normKey);
    mergedRows.push({
      slug: "",
      city: gh.city,
      provinceSlug: "",
      province: gh.province,
      price: gh.resalePrice,
      mom: gh.mom || "--%",
      yoy: gh.yoy || "",
      source: "聚汇数据",
      quality: `城市二手房均价（${gh.resalePeriod || "公开最新"}）`,
      supplemental: false,
      gh,
    });
  }

  // 3. Supplemental HK / Macau / Taiwan / Frontier benchmarks
  for (const sup of SUPPLEMENTAL_CITY_RECORDS) {
    const normKey = `${normalizeProvince(sup.province)}|${normalizeCity(sup.city)}`;
    if (seenNormKeys.has(normKey)) continue;
    seenNormKeys.add(normKey);
    mergedRows.push({
      slug: "",
      city: sup.city,
      provinceSlug: "",
      province: sup.province,
      price: sup.price,
      mom: sup.mom || "--%",
      yoy: sup.yoy || "",
      source: sup.source,
      quality: sup.quality,
      supplemental: true,
      sup,
    });
  }

  // Compute province & national new-to-resale ratios from real paired samples
  const ratiosByProvince = new Map();
  const nationalRatios = [];
  for (const item of mergedRows) {
    const gh = item.gh;
    const baseResale = gh?.resalePrice || item.price;
    const realNew = gh?.newPrice || item.sup?.newPrice || null;
    if (realNew && baseResale) {
      const r = clampEstimateRatio(realNew / baseResale);
      nationalRatios.push(r);
      const pKey = normalizeProvince(item.province);
      if (!ratiosByProvince.has(pKey)) ratiosByProvince.set(pKey, []);
      ratiosByProvince.get(pKey).push(r);
    }
  }

  const provinceRatios = new Map([...ratiosByProvince]
    .map(([prov, vals]) => [prov, { ratio: median(vals), count: vals.filter(v => v >= 0.55 && v <= 1.85).length }])
    .filter(([, s]) => s.ratio && s.count >= 2));
  const nationalCount = nationalRatios.filter(v => v >= 0.55 && v <= 1.85).length;
  const nationalMedian = nationalCount >= 10 ? median(nationalRatios) : 1.08;

  const cityRecords = {};
  const cityMetaByNorm = new Map();
  let realNewCount = 0;

  for (const item of mergedRows) {
    const gh = item.gh;
    const sup = item.sup;
    const realNew = gh?.newPrice || sup?.newPrice || null;
    if (realNew) realNewCount += 1;
    const pKey = normalizeProvince(item.province);
    const cKey = normalizeCity(item.city);
    const provSummary = provinceRatios.get(pKey);

    let ratioInfo;
    if (realNew && item.price) {
      ratioInfo = { ratio: clampEstimateRatio(realNew / item.price), basis: "按同城真实新房/二手均价配对计算", hasEvidence: true, count: 1 };
    } else if (provSummary?.ratio) {
      ratioInfo = { ratio: provSummary.ratio, basis: `按同省 ${provSummary.count} 个新房/二手配对样本中位数估算`, hasEvidence: true, count: provSummary.count };
    } else {
      ratioInfo = { ratio: nationalMedian, basis: `按全国 ${nationalCount} 个新房/二手配对样本中位数估算`, hasEvidence: nationalCount >= 10, count: nationalCount };
    }

    // Scale peak/trough proportionally if primary resale is Creprice so peak/trough match the displayed resale series seamlessly
    let peakPrice = gh?.peakPrice || sup?.peakPrice || null;
    let troughPrice = gh?.troughPrice || sup?.troughPrice || null;
    const drawdownPct = gh?.drawdownPct ?? (peakPrice && item.price && peakPrice >= item.price ? Number((((item.price - peakPrice) / peakPrice) * 100).toFixed(1)) : null);
    if (gh?.peakPrice && gh?.resalePrice && item.source.includes("禧泰") && Math.abs(item.price - gh.resalePrice) / gh.resalePrice > 0.04) {
      const scale = item.price / gh.resalePrice;
      peakPrice = Math.round(gh.peakPrice * scale);
      if (gh.troughPrice) troughPrice = Math.round(gh.troughPrice * scale);
    }

    const record = comparableRecord({
      price: item.price,
      mom: item.mom,
      yoy: gh?.yoy || item.yoy || sup?.yoy || "",
      source: item.source,
      quality: item.quality,
      dataLevel: "city",
      province: item.province,
      supplemental: Boolean(item.supplemental),
      resalePrice: item.price,
      resaleMom: item.mom,
      resaleYoy: gh?.yoy || item.yoy || sup?.yoy || "",
      resaleSource: item.source,
      resaleQuality: item.quality,
      newPrice: realNew,
      newMom: gh?.newMom || "",
      newYoy: gh?.newYoy || "",
      newSource: realNew ? (gh?.newPrice ? "聚汇数据" : sup?.source || "") : "",
      newQuality: realNew ? (gh?.newPrice ? `城市新房均价（${gh.newPeriod || "公开最新"}）` : sup?.quality || "") : "",
      rentYield: gh?.rentYield || sup?.rentYield || null,
      priceToIncome: gh?.priceToIncome || sup?.priceToIncome || null,
      priceToWage: gh?.priceToWage || null,
      peakPrice,
      peakDate: gh?.peakDate || sup?.peakDate || "",
      troughPrice,
      troughDate: gh?.troughDate || sup?.troughDate || "",
      drawdownPct,
      trendKey: gh?.trendKey || "",
      hasEstimateRatio: ratioInfo.hasEvidence,
      estimateSampleCount: ratioInfo.count,
      url: gh?.url || "",
      fetchedAt,
    }, ratioInfo.ratio, ratioInfo.basis);

    const storeKey = cityRecords[item.city] ? `${item.province}|${item.city}` : item.city;
    cityRecords[storeKey] = record;
    cityRecords[`${item.province}|${item.city}`] = record;
    cityMetaByNorm.set(`${pKey}|${cKey}`, { record, ratioInfo });
    if (!cityMetaByNorm.has(cKey)) cityMetaByNorm.set(cKey, { record, ratioInfo });
  }

  const metaForCity = (city, province = "") => {
    const pKey = normalizeProvince(province);
    const cKey = normalizeCity(city);
    if (pKey && cityMetaByNorm.has(`${pKey}|${cKey}`)) return cityMetaByNorm.get(`${pKey}|${cKey}`);
    if (cityMetaByNorm.has(cKey)) return cityMetaByNorm.get(cKey);
    const provSummary = pKey ? provinceRatios.get(pKey) : null;
    if (provSummary?.ratio) {
      return { record: null, ratioInfo: { ratio: provSummary.ratio, basis: `按同省 ${provSummary.count} 个样本估算`, hasEvidence: true, count: provSummary.count } };
    }
    return { record: null, ratioInfo: { ratio: nationalMedian, basis: `按全国 ${nationalCount} 个样本估算`, hasEvidence: nationalCount >= 10, count: nationalCount } };
  };

  mergedRows.sort((a, b) => b.price - a.price);
  const cleanCityData = mergedRows.map(({ gh, sup, ...rest }) => rest);

  return {
    cityData: cleanCityData,
    cityRecords,
    metaForCity,
    realNewCount,
    nationalRatio: Number(nationalMedian.toFixed(3)),
    nationalRatioSampleCount: nationalCount,
  };
}

function computeSourceCalibration(crepriceDist, gotohuiDist, fangDist, metaForCity) {
  const ghPairsByCity = new Map();
  const fangPairsByCity = new Map();
  const crepriceByNorm = new Map();

  for (const [key, val] of Object.entries(crepriceDist || {})) {
    const [c, a] = key.split("|");
    if (c && a && val[0]) crepriceByNorm.set(`${normalizeCity(c)}|${normalizeArea(a)}`, { cityKey: normalizeCity(c), price: val[0] });
  }
  for (const [key, val] of Object.entries(gotohuiDist || {})) {
    const [c, a] = key.split("|");
    const cp = crepriceByNorm.get(`${normalizeCity(c)}|${normalizeArea(a)}`);
    if (cp && val?.price) {
      if (!ghPairsByCity.has(cp.cityKey)) ghPairsByCity.set(cp.cityKey, []);
      ghPairsByCity.get(cp.cityKey).push(cp.price / val.price);
    }
  }
  for (const [key, val] of Object.entries(fangDist || {})) {
    const [c, a] = key.split("|");
    const cp = crepriceByNorm.get(`${normalizeCity(c)}|${normalizeArea(a)}`);
    if (cp && val?.price) {
      if (!fangPairsByCity.has(cp.cityKey)) fangPairsByCity.set(cp.cityKey, []);
      fangPairsByCity.get(cp.cityKey).push(cp.price / val.price);
    }
  }

  return (city, bucket) => {
    if (bucket !== "gotohui" && bucket !== "fang") return 1;
    const cKey = normalizeCity(city);
    const pairs = bucket === "gotohui" ? ghPairsByCity.get(cKey) : fangPairsByCity.get(cKey);
    if (pairs && pairs.length >= 2) {
      const m = median(pairs);
      if (m && Math.abs(m - 1) > 0.05) return Number(Math.max(0.80, Math.min(1.28, m)).toFixed(3));
    }
    return 1;
  };
}

function mergeAllDistrictRecords(crepriceDist, gotohuiDist, fangDist, fetchedAt, metaForCity, prevDistrictRecords = {}) {
  const districtData = {};
  const districtRecords = {};
  const seenNormalized = new Set();
  const sourceCounts = { creprice: 0, gotohui: 0, fang: 0, supplemental: 0, cachedFallback: 0 };
  const scaleFor = computeSourceCalibration(crepriceDist, gotohuiDist, fangDist, metaForCity);

  const addDistrict = (key, raw, bucket) => {
    const [city, area] = key.split("|");
    if (!city || !area || !raw.price || raw.price < 600 || raw.price > 450000) return;
    const normKey = `${normalizeCity(city)}|${normalizeArea(area)}`;
    if (districtRecords[key] || (bucket !== "creprice" && seenNormalized.has(normKey))) return;
    seenNormalized.add(normKey);

    const cityMeta = metaForCity(city, raw.province || "");
    const parent = cityMeta.record;
    const ratio = cityMeta.ratioInfo;

    const calFactor = raw.calibrationFactor || scaleFor(city, bucket);
    const rawSourcePrice = raw.rawSourcePrice || raw.price;
    const calibratedPrice = calFactor !== 1 && !raw.calibrationApplied ? Math.round(rawSourcePrice * calFactor) : raw.price;

    // Derive estimated district rentYield or priceToIncome proportionally when parent city has real fundamentals
    let rentYield = raw.rentYield || null;
    let priceToIncome = raw.priceToIncome || null;
    if (!rentYield && parent?.rentYield && parent?.price) {
      const rel = Math.max(0.45, Math.min(2.4, calibratedPrice / parent.price));
      rentYield = Number((parent.rentYield * Math.pow(rel, -0.35)).toFixed(2));
    }
    if (!priceToIncome && parent?.priceToIncome && parent?.price) {
      const rel = Math.max(0.35, Math.min(3.0, calibratedPrice / parent.price));
      priceToIncome = Number((parent.priceToIncome * Math.pow(rel, 0.85)).toFixed(1));
    }

    const qualityLabel = calFactor !== 1
      ? `${raw.quality}（同城配对标尺校准 ×${calFactor}，原值 ${rawSourcePrice}）`
      : raw.quality;

    const record = comparableRecord({
      price: calibratedPrice,
      rawSourcePrice: calFactor !== 1 ? rawSourcePrice : undefined,
      calibrationFactor: calFactor !== 1 ? calFactor : undefined,
      calibrationApplied: calFactor !== 1 || undefined,
      mom: raw.mom || "--%",
      yoy: raw.yoy || parent?.yoy || "",
      province: raw.province || parent?.province || "",
      source: raw.source,
      quality: qualityLabel,
      dataLevel: raw.dataLevel,
      supplemental: Boolean(raw.supplemental),
      url: raw.url || "",
      fetchedAt: raw.fetchedAt || fetchedAt,
      resalePrice: calibratedPrice,
      resaleMom: raw.mom || "--%",
      resaleYoy: raw.yoy || parent?.yoy || "",
      resaleSource: raw.source,
      resaleQuality: qualityLabel,
      newPrice: raw.newPrice || null,
      newSource: raw.newPrice ? raw.source : "",
      newQuality: raw.newPrice ? raw.quality : "",
      rentYield,
      priceToIncome,
      trendKey: parent?.trendKey || "",
      hasEstimateRatio: ratio.hasEvidence,
      estimateSampleCount: ratio.count,
    }, ratio.ratio, ratio.basis);

    districtData[key] = [record.price, record.mom];
    districtRecords[key] = record;
    sourceCounts[bucket] = (sourceCounts[bucket] || 0) + 1;
  };

  for (const [key, value] of Object.entries(crepriceDist || {})) {
    addDistrict(key, {
      price: value[0],
      mom: value[1],
      source: "禧泰数据/中国房价行情",
      quality: "区县住宅挂牌均价",
      dataLevel: "district",
      supplemental: false,
    }, "creprice");
  }

  for (const [key, value] of Object.entries(gotohuiDist || {})) {
    addDistrict(key, {
      province: value.province,
      price: value.price,
      mom: value.mom,
      url: value.url,
      source: "聚汇数据",
      quality: "区县二手房均价",
      dataLevel: "district",
      supplemental: false,
    }, "gotohui");
  }

  for (const [key, value] of Object.entries(fangDist || {})) {
    addDistrict(key, {
      province: value.province,
      price: value.price,
      mom: value.mom,
      url: value.url,
      source: "房天下查房价",
      quality: "区县二手房参考均价（补充口径）",
      dataLevel: "district-supplement",
      supplemental: true,
    }, "fang");
  }

  for (const [key, value] of Object.entries(SUPPLEMENTAL_DISTRICT_RECORDS)) {
    addDistrict(key, {
      ...value,
      dataLevel: "district-supplement",
      supplemental: true,
    }, "supplemental");
  }

  // Last-Known-Good Snapshot Fallback: preserve any district from previous snapshot if upstream source temporarily failed
  for (const [key, prevRec] of Object.entries(prevDistrictRecords || {})) {
    if (prevRec?.price) {
      addDistrict(key, {
        ...prevRec,
        calibrationApplied: true,
      }, "cachedFallback");
    }
  }

  return { districtData, districtRecords, sourceCounts };
}

function loadExistingSnapshot() {
  try {
    const prevData = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) : null;
    const prevTrends = fs.existsSync(TRENDS_FILE) ? JSON.parse(fs.readFileSync(TRENDS_FILE, "utf8")) : null;
    return { prevData, prevTrends };
  } catch (_) {
    return { prevData: null, prevTrends: null };
  }
}

async function main() {
  const { prevData, prevTrends } = loadExistingSnapshot();

  console.log("1/4 Fetching Creprice national city ranking & districts (with Last-Known-Good fallback)...");
  let crepriceRows = [];
  let crepricePeriod = "";
  let crepriceDistricts = { districtData: {}, cityDistrictCounts: {}, errors: [] };
  try {
    const homeHtml = await fetchText(SOURCE_URL, { jitterMs: 80 });
    const parsed = parseRanking(homeHtml);
    if (parsed.rows.length < 180) throw new Error(`Only parsed ${parsed.rows.length} city rows from ${SOURCE_URL}`);
    crepriceRows = parsed.rows;
    crepricePeriod = parsed.period;
    crepriceDistricts = await fetchCrepriceDistrictData(crepriceRows);
  } catch (error) {
    console.warn(`Creprice primary fetch degraded (${error.message}); falling back to cached city baseline.`);
    crepriceRows = (prevData?.cityData || []).filter(r => String(r.source || "").includes("禧泰"));
  }

  console.log("2/4 Fetching Gotohui 31 provinces, 350+ cities, new-house prices, yields, affordability & 2500+ counties...");
  let gotohui = { cityDetails: {}, districtData: {}, trends: {}, errors: [] };
  try {
    gotohui = await fetchGotohuiAll();
  } catch (error) {
    console.warn(`Gotohui fetch degraded (${error.message}); preserving cached trends & metrics.`);
  }

  console.log("3/4 Fetching Fang.com supplemental district prices...");
  let fangDistricts = { data: {}, cityDistrictCounts: {}, errors: [], cityCodeCount: 0 };
  try {
    fangDistricts = await fetchFangDistrictData(crepriceRows);
  } catch (error) {
    console.warn(`Fang fetch degraded (${error.message}); preserving cached fallback districts.`);
  }

  console.log("4/4 Fusing & scale-calibrating multi-source datasets...");
  const fetchedAt = new Date().toISOString();
  const fusedCities = fuseCityData(crepriceRows, gotohui.cityDetails, fetchedAt);

  // Merge any cached cities from previous snapshot if all live sources missed them
  if (prevData?.cityData?.length) {
    const currentCityKeys = new Set(fusedCities.cityData.map(r => `${normalizeProvince(r.province)}|${normalizeCity(r.city)}`));
    for (const oldRow of prevData.cityData) {
      const k = `${normalizeProvince(oldRow.province)}|${normalizeCity(oldRow.city)}`;
      if (!currentCityKeys.has(k) && oldRow.price) {
        fusedCities.cityData.push(oldRow);
        const oldRec = prevData.cityRecords?.[`${oldRow.province}|${oldRow.city}`] || prevData.cityRecords?.[oldRow.city];
        if (oldRec) {
          fusedCities.cityRecords[`${oldRow.province}|${oldRow.city}`] = oldRec;
          if (!fusedCities.cityRecords[oldRow.city]) fusedCities.cityRecords[oldRow.city] = oldRec;
        }
      }
    }
  }

  const mergedDistricts = mergeAllDistrictRecords(
    crepriceDistricts.districtData,
    gotohui.districtData,
    fangDistricts.data,
    fetchedAt,
    fusedCities.metaForCity,
    prevData?.districtRecords,
  );

  // Merge previous trends with newly fetched trends + curated HK/Macau/Taiwan trends
  const trendsPayload = {
    updatedAt: fetchedAt,
    trends: {
      ...(prevTrends?.trends || {}),
      ...gotohui.trends,
      "香港|香港": {
        city: "香港", province: "香港",
        series: [
          ["2025-12", 121400, 151000], ["2026-01", 120800, 150200], ["2026-02", 121900, 151500],
          ["2026-03", 122600, 152000], ["2026-04", 121500, 150800], ["2026-05", 120400, 149500],
          ["2026-06", 119600, 148800], ["2026-07", 118900, 148000], ["2026-08", 118200, 147400],
          ["2026-09", 117800, 146800], ["2026-10", 117300, 146500], ["2026-11", 116800, 146000],
        ],
        peak: [162500, "2021-08"], trough: [108200, "2016-03"],
      },
      "澳门|澳门": {
        city: "澳门", province: "澳门",
        series: [
          ["2025-12", 60500, 72800], ["2026-01", 60100, 72200], ["2026-02", 59800, 71800],
          ["2026-03", 59500, 71500], ["2026-04", 59000, 70900], ["2026-05", 58600, 70400],
          ["2026-06", 58200, 69800], ["2026-07", 57800, 69400], ["2026-08", 57400, 69000],
          ["2026-09", 57100, 68800], ["2026-10", 56900, 68600], ["2026-11", 56800, 68500],
        ],
        peak: [88600, "2018-06"], trough: [54200, "2016-02"],
      },
      "台湾|台湾": {
        city: "台湾省", province: "台湾",
        series: [
          ["2025-12", 28900, 34200], ["2026-01", 29100, 34500], ["2026-02", 29300, 34800],
          ["2026-03", 29600, 35100], ["2026-04", 29900, 35500], ["2026-05", 30300, 35900],
          ["2026-06", 30600, 36200], ["2026-07", 30400, 36000], ["2026-08", 30200, 35900],
          ["2026-09", 30000, 35800], ["2026-10", 29900, 35700], ["2026-11", 29800, 35600],
        ],
        peak: [30600, "2026-06"], trough: [18400, "2016-09"],
      },
    },
  };

  const payload = {
    schemaVersion: 2,
    fetchedAt,
    updatedAt: fetchedAt,
    metadata: {
      source: "禧泰数据/中国房价行情 + 聚汇数据 + 房天下 + 港澳台官方统计",
      sourceUrl: SOURCE_URL,
      mainlandPeriod: crepricePeriod ? `${crepricePeriod}–2026年11月最新` : "2026年最新公开",
      updateCadence: "weekly",
      coverage: `${fusedCities.cityData.length}个城市/州盟`,
      districtCoverage: `${Object.keys(mergedDistricts.districtRecords).length}个区县/镇街`,
      districtSources: {
        creprice: mergedDistricts.sourceCounts.creprice,
        gotohui: mergedDistricts.sourceCounts.gotohui,
        fang: mergedDistricts.sourceCounts.fang,
        supplemental: mergedDistricts.sourceCounts.supplemental,
        realNewHouseCities: fusedCities.realNewCount,
        cityTrendSeries: Object.keys(trendsPayload.trends).length,
      },
      defaultPriceType: "resale",
      estimateRule: "默认展示二手/挂牌均价；融合聚汇数据真实新房均价、同比、租售比、房价收入比及近12个月走势，港澳台按差估署/统计局/实价登录折算人民币/㎡",
      newToResaleRatio: fusedCities.nationalRatio,
      newToResaleRatioSampleCount: fusedCities.nationalRatioSampleCount,
    },
    cityStats: fusedCities.cityData.map(row => [
      row.city,
      row.price,
      row.mom,
      row.province,
    ]),
    cityData: fusedCities.cityData,
    cityRecords: fusedCities.cityRecords,
    districtData: mergedDistricts.districtData,
    districtRecords: mergedDistricts.districtRecords,
    cityDistrictCounts: crepriceDistricts.cityDistrictCounts,
    fangCityCodeCount: fangDistricts.cityCodeCount,
    districtFetchErrors: crepriceDistricts.errors,
    gotohuiFetchErrors: gotohui.errors,
    fangDistrictFetchErrors: fangDistricts.errors,
  };

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(TRENDS_FILE, `${JSON.stringify(trendsPayload)}\n`, "utf8");
  console.log(`Done! Cities: ${fusedCities.cityData.length} (real new-house: ${fusedCities.realNewCount}), Districts: ${Object.keys(mergedDistricts.districtRecords).length}, Trends: ${Object.keys(trendsPayload.trends).length}`);

  // Refresh real district fundamentals & street/plate sub-layer with graceful fallback
  const { spawnSync } = require("child_process");
  spawnSync(process.execPath, [path.join(__dirname, "update-district-fundamentals.js")], { cwd: ROOT, stdio: "inherit" });
  spawnSync(process.execPath, [path.join(__dirname, "update-street-plates.js")], { cwd: ROOT, stdio: "inherit" });
  spawnSync(process.execPath, [path.join(__dirname, "update-community-shards.js")], { cwd: ROOT, stdio: "inherit" });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

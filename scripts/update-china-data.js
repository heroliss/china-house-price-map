#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "china_house_prices.json");
const SOURCE_URL = "https://m.creprice.cn/";
const CITY_PAGE_CONCURRENCY = 8;

function cleanHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(value) {
  const parsed = Number(cleanHtml(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function normalizeChange(raw) {
  const text = cleanHtml(raw);
  if (!text || text.includes("--")) return "--%";
  const parsed = Number(text.replace("%", "").replace(/[^\d.+-]/g, ""));
  if (!Number.isFinite(parsed)) return text;
  return `${parsed >= 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; china-house-price-map/1.0)" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer()).toString("utf8");
}

function parseRanking(html) {
  const rows = [];
  const rowRe = /<tr[\s\S]*?<td>\s*\d+\s*<\/td>[\s\S]*?<td><a class='blue' href="\/city\/([^"]+)\.html"[^>]*>([^<]+)<\/a><\/td>[\s\S]*?<td><a class='blue' href="\/province\/([^"]+)\.html"[^>]*>([^<]+)<\/a><\/td>[\s\S]*?<td>\s*([\d,]+)\s*<\/td>[\s\S]*?<td>\s*<span[^>]*>([\s\S]*?)<\/span>/g;
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
      mom: normalizeChange(match[6]),
    });
  }
  return rows;
}

function parseDistrictRows(html) {
  const rows = [];
  const rowRe = /<tr>[\s\S]*?<td><a class='blue' href="\/district\/([^"?]+)\.html\?city=([^"]+)">([^<]+)<\/a><\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/g;
  let match;
  while ((match = rowRe.exec(html))) {
    const price = parsePrice(match[4]);
    if (!price) continue;
    rows.push({
      code: match[1],
      cityParam: match[2],
      name: cleanHtml(match[3]),
      price,
      mom: normalizeChange(match[5]),
    });
  }
  return rows;
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

async function fetchDistrictData(cityRows) {
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
      console.log(`Parsed ${row.city}: ${districts.length} district rows`);
    } catch (error) {
      cityDistrictCounts[row.city] = 0;
      errors.push({ city: row.city, url, error: error.message });
      console.warn(`District rows skipped for ${row.city}: ${error.message}`);
    }
  });

  return { districtData, cityDistrictCounts, errors };
}

async function main() {
  const html = await fetchText(SOURCE_URL);
  const rows = parseRanking(html);
  if (rows.length < 250) throw new Error(`Only parsed ${rows.length} city rows from ${SOURCE_URL}`);
  const districts = await fetchDistrictData(rows);

  const fetchedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 1,
    fetchedAt,
    updatedAt: fetchedAt,
    metadata: {
      source: "禧泰数据/中国房价行情",
      sourceUrl: SOURCE_URL,
      mainlandPeriod: "全国城市排行页公开最新",
      updateCadence: "weekly",
      coverage: `${rows.length}个城市`,
      districtCoverage: `${Object.keys(districts.districtData).length}个区县`,
    },
    cityStats: rows.map(row => [row.city, row.price, row.mom, row.province]),
    cityData: rows,
    districtData: districts.districtData,
    cityDistrictCounts: districts.cityDistrictCounts,
    districtFetchErrors: districts.errors,
  };

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Parsed ${rows.length} national city rows`);
  console.log(`Wrote ${path.relative(ROOT, DATA_FILE)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

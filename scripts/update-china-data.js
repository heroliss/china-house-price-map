#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "china_house_prices.json");
const SOURCE_URL = "https://m.creprice.cn/";

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

async function main() {
  const html = await fetchText(SOURCE_URL);
  const rows = parseRanking(html);
  if (rows.length < 250) throw new Error(`Only parsed ${rows.length} city rows from ${SOURCE_URL}`);

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
    },
    cityStats: rows.map(row => [row.city, row.price, row.mom, row.province]),
    cityData: rows,
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

#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { PROVINCES } = require("../src/china_map_shared");

const ROOT = path.resolve(__dirname, "..");
const PROVINCE_DIR = path.join(ROOT, "data", "geo", "china");
const CITY_DIR = path.join(ROOT, "data", "geo", "city");
const MUNICIPALITIES = new Set(["110000", "120000", "310000", "500000", "710000", "810000", "820000"]);
const FORCE = process.argv.includes("--force");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; house-price-map/1.0)" },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await sleep(attempt * 800);
    }
  }
  throw lastError;
}

function collectCityCodes() {
  const items = [];
  for (const [provinceName, provinceCode] of PROVINCES) {
    if (MUNICIPALITIES.has(provinceCode)) continue;
    const file = path.join(PROVINCE_DIR, `datav_${provinceCode}_full.json`);
    if (!fs.existsSync(file)) continue;
    const geo = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const feature of geo.features || []) {
      const props = feature.properties || {};
      if (!props.adcode || !props.name) continue;
      items.push({ provinceName, cityName: props.name, cityCode: String(props.adcode) });
    }
  }
  return items;
}

async function main() {
  fs.mkdirSync(CITY_DIR, { recursive: true });
  const cities = collectCityCodes();
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const city of cities) {
    const target = path.join(CITY_DIR, `datav_${city.cityCode}_full.json`);
    if (!FORCE && fs.existsSync(target)) {
      skipped += 1;
      continue;
    }

    const url = `https://geo.datav.aliyun.com/areas_v3/bound/${city.cityCode}_full.json`;
    try {
      const geo = await fetchJson(url);
      if (!Array.isArray(geo.features)) throw new Error("invalid geojson");
      fs.writeFileSync(target, `${JSON.stringify(geo)}\n`, "utf8");
      downloaded += 1;
      console.log(`Downloaded ${city.provinceName} ${city.cityName} (${city.cityCode})`);
      await sleep(80);
    } catch (error) {
      failed += 1;
      console.warn(`Skipped ${city.provinceName} ${city.cityName} (${city.cityCode}): ${error.message}`);
    }
  }

  console.log(`City boundary cache: ${downloaded} downloaded, ${skipped} cached, ${failed} unavailable.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

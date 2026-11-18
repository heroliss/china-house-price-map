#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { PROVINCES, transformGeometryToGcj02 } = require("../src/china_map_shared");

const ROOT = path.resolve(__dirname, "..");
const PROVINCE_DIR = path.join(ROOT, "data", "geo", "china");
const CITY_DIR = path.join(ROOT, "data", "geo", "city");
const MUNICIPALITIES = new Set(["110000", "120000", "310000", "500000", "710000", "810000", "820000"]);
const FORCE = process.argv.includes("--force");

const TAIWAN_COUNTY_MAP = {
  "台北市": "台北市",
  "臺北市": "台北市",
  "新北市": "新北市",
  "桃園縣": "桃园市",
  "桃園市": "桃园市",
  "台中市": "台中市",
  "臺中市": "台中市",
  "台南市": "台南市",
  "臺南市": "台南市",
  "高雄市": "高雄市",
  "基隆市": "基隆市",
  "新竹市": "新竹市",
  "新竹縣": "新竹县",
  "苗栗縣": "苗栗县",
  "彰化縣": "彰化县",
  "南投縣": "南投县",
  "雲林縣": "云林县",
  "嘉義市": "嘉义市",
  "嘉義縣": "嘉义县",
  "屏東縣": "屏东县",
  "宜蘭縣": "宜兰县",
  "花蓮縣": "花莲县",
  "台東縣": "台东县",
  "臺東縣": "台东县",
  "澎湖縣": "澎湖县",
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; house-price-map/2.0)" },
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

async function ensureTaiwanCountyGeo() {
  const target = path.join(PROVINCE_DIR, "datav_710000_full.json");
  if (!FORCE && fs.existsSync(target)) {
    console.log("Taiwan county GeoJSON already cached.");
    return;
  }
  try {
    const raw = await fetchJson("https://raw.githubusercontent.com/g0v/twgeojson/master/json/twCounty2010.geo.json");
    const features = [];
    for (const feature of raw.features || []) {
      const origName = feature.properties?.COUNTYNAME || feature.properties?.name || "";
      // Skip Kinmen & Lienchiang as DataV already includes them in Fujian (Quanzhou 350500 / Fuzhou 350100)
      if (origName === "金門縣" || origName === "連江縣") continue;
      const simplifiedName = TAIWAN_COUNTY_MAP[origName];
      if (!simplifiedName) continue;
      features.push({
        type: "Feature",
        properties: {
          adcode: feature.properties?.COUNTYSN || simplifiedName,
          name: simplifiedName,
          level: "district",
        },
        geometry: transformGeometryToGcj02(feature.geometry),
      });
    }
    if (features.length >= 18) {
      fs.writeFileSync(target, `${JSON.stringify({ type: "FeatureCollection", features })}\n`, "utf8");
      console.log(`Generated Taiwan county GeoJSON (${features.length} counties/cities) -> data/geo/china/datav_710000_full.json`);
    }
  } catch (error) {
    console.warn(`Could not refresh Taiwan county GeoJSON: ${error.message}`);
  }
}

async function main() {
  fs.mkdirSync(CITY_DIR, { recursive: true });
  await ensureTaiwanCountyGeo();

  const cities = collectCityCodes();
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const city of cities) {
    // Skip county-level direct-administered cities & town-administered cities (Dongguan/Zhongshan/Danzhou/Jiayuguan)
    // so watertight AreaCity / OSM geometries are never overwritten by generalized DataV files
    if (city.cityCode.slice(2, 4) === "90" || ["441900", "442000", "460400", "620200"].includes(city.cityCode)) {
      skipped += 1;
      continue;
    }
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

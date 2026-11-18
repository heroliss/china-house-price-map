#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  createInteractiveMap,
  formatBeijingTime,
  buildProjection,
  bestLabelPoint,
  cleanName,
  colorFor,
  pathBounds,
  mergeBounds,
} = require("./src/simple_map_core");
const { buildTopologicalLayerPaths } = require("./src/topo_simplify");
const {
  PROVINCES,
  MUNICIPALITIES,
  SUPPLEMENTAL_DISTRICT_RECORDS,
  wgs84ToGcj02,
  createPriceLookup,
  loadChinaFeatures,
  loadChinaOutlines,
  normalizeProvince,
  normalizeCity,
  normalizeArea,
  comparableRecord,
  clampEstimateRatio,
} = require("./src/china_map_shared");

const ROOT = path.resolve(__dirname);
const DATA_FILE = path.join(ROOT, "data", "china_house_prices.json");
const STREET_PLATES_FILE = path.join(ROOT, "data", "china_street_plates.json");
const GBA_DATA_FILE = path.join(ROOT, "data", "gba_house_prices.json");
const JJJ_DATA_FILE = path.join(ROOT, "data", "jjj_house_prices.json");
const LAYER_DIR = path.join(ROOT, "data", "layers");
const CITY_GEO_DIR = path.join(ROOT, "data", "geo", "city");
const OUT_HTML = path.join(ROOT, "china.html");
const OUT_INDEX = path.join(ROOT, "index.html");

const MAP_BOX = { x: 56, y: 112, w: 1220, h: 1100 };
const COLORS = ["#2c5e8a", "#3f87b5", "#6bc0c4", "#bfe3b4", "#f5cf86", "#eb8a4c", "#c8413a", "#781530"];
const BREAKS = [0, 5500, 8000, 12000, 18000, 30000, 55000, 90000, 200000];

const DETAIL_TOLERANCE_BY_PROVINCE = {
  "110000": 0.025,
  "120000": 0.025,
  "310000": 0.02,
  "440000": 0.025,
  "500000": 0.035,
  "710000": 0.025,
  "810000": 0.008,
  "820000": 0.002,
};

const townAliases = {
  "东莞|南城街道": "南城区",
  "东莞|东城街道": "东城区",
  "东莞|万江街道": "万江区",
  "东莞|莞城街道": "莞城区",
  "中山|东区街道": "东区",
  "中山|西区街道": "西区",
  "中山|南区街道": "南区",
  "中山|石岐街道": "石岐区",
  "中山|南朗街道": "南朗镇",
  "中山|翠亨新区": "南朗镇",
  "中山|民众街道": "民众镇",
  "中山|中山港街道": "火炬开发区",
};

const PROVINCE_LABEL_CENTERS = {
  北京: [116.4, 40.15], 天津: [117.35, 39.25], 河北: [115.2, 38.35], 山西: [112.3, 37.6],
  内蒙古: [111.8, 43.2], 辽宁: [122.7, 41.3], 吉林: [126.1, 43.6], 黑龙江: [127.8, 47.2],
  上海: [121.48, 31.22], 江苏: [119.45, 32.95], 浙江: [120.15, 29.15], 安徽: [117.25, 31.85],
  福建: [118.0, 26.05], 江西: [115.7, 27.6], 山东: [118.1, 36.35], 河南: [113.6, 33.9],
  湖北: [112.3, 31.0], 湖南: [111.7, 27.6], 广东: [113.35, 23.85], 广西: [108.8, 23.8],
  海南: [109.75, 19.2], 重庆: [107.75, 30.05], 四川: [102.9, 30.6], 贵州: [106.85, 26.8],
  云南: [101.5, 24.9], 西藏: [88.4, 31.2], 陕西: [108.9, 35.2], 甘肃: [103.8, 36.5],
  青海: [96.2, 35.7], 宁夏: [106.15, 37.3], 新疆: [85.6, 41.5], 台湾: [120.95, 23.75],
  香港: [114.65, 22.05], 澳门: [113.05, 21.82],
};

const VIEW_PRESETS = [
  { id: "national", label: "全国总览", shortLabel: "全国", center: [105.2, 35.4], scale: 1.26 },
  { id: "gba", label: "粤港澳大湾区", shortLabel: "大湾区", center: [113.72, 22.68], scale: 15.2 },
  { id: "yangtze-delta", label: "长三角城市群", shortLabel: "长三角", center: [119.95, 31.15], scale: 6.8 },
  { id: "jingjinji", label: "京津冀城市群", shortLabel: "京津冀", center: [116.55, 39.45], scale: 7.2 },
  { id: "chengyu", label: "成渝双城经济圈", shortLabel: "成渝", center: [105.45, 30.3], scale: 7.4 },
  { id: "middle-yangtze", label: "长江中游城市群", shortLabel: "长江中游", center: [113.55, 28.8], scale: 6.2 },
  { id: "west-coast", label: "海峡两岸", shortLabel: "闽台海峡", center: [119.6, 24.5], scale: 7.4 },
  { id: "shandong-peninsula", label: "山东半岛", shortLabel: "山东半岛", center: [119.1, 36.5], scale: 6.8 },
  { id: "hk-macau", label: "港澳细览", shortLabel: "港澳18区", center: [113.88, 22.26], scale: 34.0 },
];

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Missing ${path.relative(ROOT, DATA_FILE)}. Run scripts/update-china-data.js first.`);
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function readOptionalJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

function regionBounds(regions) {
  if (!regions.length) return null;
  return regions.reduce((acc, r) => ({
    minX: Math.min(acc.minX, r.cx),
    minY: Math.min(acc.minY, r.cy),
    maxX: Math.max(acc.maxX, r.cx),
    maxY: Math.max(acc.maxY, r.cy),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function addPresentField(target, key, value) {
  if (value !== undefined && value !== null && value !== "" && value !== false) target[key] = value;
}

function regionMetadata(record, defaultDataLevel = "") {
  const metadata = {};
  addPresentField(metadata, "mom", record?.mom);
  addPresentField(metadata, "yoy", record?.yoy);
  addPresentField(metadata, "newMom", record?.newMom);
  addPresentField(metadata, "newYoy", record?.newYoy);
  addPresentField(metadata, "source", record?.source);
  addPresentField(metadata, "quality", record?.quality);
  addPresentField(metadata, "dataLevel", record?.dataLevel || defaultDataLevel);
  addPresentField(metadata, "priceType", record?.priceType);
  addPresentField(metadata, "newPrice", record?.newPrice);
  addPresentField(metadata, "resalePrice", record?.resalePrice);
  addPresentField(metadata, "newPriceEstimated", Boolean(record?.newPriceEstimated));
  addPresentField(metadata, "resalePriceEstimated", Boolean(record?.resalePriceEstimated));
  if (record?.newPriceEstimated || record?.resalePriceEstimated || String(record?.priceType || "").includes("estimated")) {
    addPresentField(metadata, "estimateRatio", record?.estimateRatio);
    addPresentField(metadata, "estimateBasis", record?.estimateBasis);
  }
  addPresentField(metadata, "rentYield", record?.rentYield);
  addPresentField(metadata, "priceToIncome", record?.priceToIncome);
  addPresentField(metadata, "priceToWage", record?.priceToWage);
  addPresentField(metadata, "peakPrice", record?.peakPrice);
  addPresentField(metadata, "peakDate", record?.peakDate);
  addPresentField(metadata, "troughPrice", record?.troughPrice);
  addPresentField(metadata, "troughDate", record?.troughDate);
  addPresentField(metadata, "drawdownPct", record?.drawdownPct);
  addPresentField(metadata, "trendKey", record?.trendKey);
  addPresentField(metadata, "newSource", record?.newSource);
  addPresentField(metadata, "newQuality", record?.newQuality);
  addPresentField(metadata, "resaleSource", record?.resaleSource);
  addPresentField(metadata, "resaleQuality", record?.resaleQuality);
  addPresentField(metadata, "rawSourcePrice", record?.rawSourcePrice);
  addPresentField(metadata, "rawNewPrice", record?.rawNewPrice);
  addPresentField(metadata, "calibrationFactor", record?.calibrationFactor);
  addPresentField(metadata, "realDistFund", Boolean(record?.realDistrictFundamentals));
  addPresentField(metadata, "inherited", Boolean(record?.inheritedCityAverage));
  addPresentField(metadata, "supplemental", Boolean(record?.supplemental));
  return metadata;
}

function createLayerPayload(id, features, outlines, projection, getRecord, tolerance = 0.045) {
  const { featurePaths, outlinePaths } = buildTopologicalLayerPaths(features, outlines, projection.project, tolerance);
  const regions = features.map((feature, index) => {
    const province = feature.properties.province || feature.properties.city;
    const city = feature.properties.city;
    const name = feature.properties.name;
    const isSeal = Boolean(feature.properties.underlaySeal);
    const record = getRecord(city, name, feature);
    const price = record?.price || null;
    const [cx, cy, labelBox] = bestLabelPoint(feature, projection.project);
    const label = cleanName(feature.properties.shortTown || name);
    const d = featurePaths[index];
    const reg = {
      id: `${id}-${index}`,
      province,
      city,
      name,
      sk: isSeal ? undefined : `${normalizeCity(city)}|${normalizeArea(name)}`,
      label,
      price,
      ...regionMetadata(record),
      d,
      bounds: pathBounds(d),
      fill: colorFor(price, BREAKS, COLORS),
      cx,
      cy,
      span: Number(Math.max(1.8, Math.min(labelBox.w, labelBox.h)).toFixed(1)),
      labelMinScale: Number(Math.max(3.6, Math.min(18, ((label.length + 4) * 6.2) / Math.max(6, Math.min(labelBox.w, labelBox.h * 2)))).toFixed(2)),
    };
    if (isSeal) reg.underlaySeal = true;
    return reg;
  });
  const layerBounds = mergeBounds(regions) || regionBounds(regions);
  // Strip per-region bounds from JSON after computing layer bounds to save ~15% layer payload size
  const compactRegions = regions.map(({ bounds, ...rest }) => rest);
  return {
    id,
    bounds: layerBounds,
    regions: compactRegions,
    outlines: outlines.map((_, index) => ({
      id: `${id}-b${index}`,
      d: outlinePaths[index],
    })).filter(o => o.d),
  };
}

function writeDetailLayer(filename, payload) {
  fs.mkdirSync(LAYER_DIR, { recursive: true });
  fs.writeFileSync(path.join(LAYER_DIR, filename), `${JSON.stringify(payload)}\n`, "utf8");
}

function townDisplayName(city, osmName) {
  return townAliases[`${city}|${osmName}`] || osmName;
}

function pointKey(pt) {
  return `${pt[0].toFixed(6)},${pt[1].toFixed(6)}`;
}

function stitchRings(segments) {
  const unused = segments
    .filter(seg => seg.length > 1)
    .map(seg => seg.map(pt => [pt[0], pt[1]]));
  const rings = [];
  while (unused.length) {
    const ring = unused.shift();
    let guard = 0;
    while (unused.length && guard++ < 600) {
      const end = pointKey(ring[ring.length - 1]);
      if (end === pointKey(ring[0])) break;
      const index = unused.findIndex(seg => pointKey(seg[0]) === end || pointKey(seg[seg.length - 1]) === end);
      if (index === -1) break;
      const next = unused.splice(index, 1)[0];
      if (pointKey(next[next.length - 1]) === end) next.reverse();
      ring.push(...next.slice(1));
    }
    if (ring.length > 2) {
      if (pointKey(ring[0]) !== pointKey(ring[ring.length - 1])) ring.push(ring[0]);
      rings.push(ring);
    }
  }
  return rings;
}

function readOsmTownBoundaries(city, file) {
  const sourcePath = path.join(ROOT, file);
  if (!fs.existsSync(sourcePath)) return [];
  const osm = readGeo(sourcePath);
  return osm.elements
    .filter(el => el.type === "relation" && el.tags?.boundary === "administrative" && (
      el.tags?.admin_level === "8" || (city === "东莞" && el.tags?.admin_level === "9")
    ))
    .map(el => {
      // Transform OSM WGS-84 coordinates into GCJ-02 so towns align seamlessly with ok_geo & AMap tiles
      const segments = el.members
        .filter(member => member.type === "way" && member.role === "outer" && Array.isArray(member.geometry))
        .map(member => member.geometry.map(point => wgs84ToGcj02([point.lon, point.lat])));
      const rings = stitchRings(segments);
      if (!rings.length) return null;
      const name = townDisplayName(city, el.tags.name);
      const labelNode = el.members.find(member => member.role === "label" && Number.isFinite(member.lon) && Number.isFinite(member.lat));
      return {
        type: "Feature",
        properties: {
          adcode: el.id,
          city,
          name,
          sourceName: el.tags.name,
          level: "town",
          centroid: labelNode ? wgs84ToGcj02([labelNode.lon, labelNode.lat]) : undefined,
        },
        geometry: { type: "MultiPolygon", coordinates: rings.map(ring => [ring]) },
      };
    })
    .filter(Boolean);
}

function withPlace(feature, province, city, name, extra = {}) {
  return {
    ...feature,
    properties: {
      ...(feature.properties || {}),
      province,
      city,
      name,
      ...extra,
    },
  };
}

function readGeo(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function cityGeoPath(code, suffix = "_full") {
  const preferred = path.join(CITY_GEO_DIR, `datav_${code}${suffix}.json`);
  if (fs.existsSync(preferred)) return preferred;
  const legacy = path.join(ROOT, "data", "geo", `datav_${code}${suffix}.json`);
  return fs.existsSync(legacy) ? legacy : null;
}

function buildSupplementalLookup(table, source, quality) {
  const exact = new Map();
  const normalized = new Map();
  for (const [key, value] of Object.entries(table || {})) {
    const [city, area] = key.split("|");
    if (!city || !area) continue;
    const isObj = !Array.isArray(value) && typeof value === "object";
    const price = isObj ? value.price : value[0];
    const mom = isObj ? (value.mom || "--%") : value[1];
    if (!price) continue;
    const record = comparableRecord({
      ...(isObj ? value : {}),
      price,
      mom,
      source: (isObj && value.source) || source,
      quality: (isObj && value.quality) || quality,
      resalePrice: price,
      resaleMom: mom,
      resaleSource: (isObj && value.source) || source,
      resaleQuality: (isObj && value.quality) || quality,
      dataLevel: isObj && value.source && !value.source.includes("禧泰") ? "district-supplement" : "district",
      supplemental: Boolean(isObj && value.source && !value.source.includes("禧泰")),
    });
    exact.set(`${city}|${area}`, record);
    const normalizedKey = `${normalizeCity(city)}|${normalizeArea(area)}`;
    if (!normalized.has(normalizedKey)) normalized.set(normalizedKey, record);
  }
  return (city, name) => exact.get(`${city}|${name}`)
    || exact.get(`${city.replace(/市$/, "")}|${name}`)
    || exact.get(`${city}|${name}市`)
    || normalized.get(`${normalizeCity(city)}|${normalizeArea(name)}`)
    || null;
}

function buildEstimateRatioLookup(chinaData) {
  const byCity = new Map();
  const byProvince = new Map();
  const national = [];
  const cityRowsByName = new Map((chinaData.cityData || []).map(row => [normalizeCity(row.city), row]));
  for (const [key, raw] of Object.entries(chinaData.cityRecords || {})) {
    const cityName = key.includes("|") ? key.split("|").pop() : key;
    const cityKey = normalizeCity(cityName);
    const record = comparableRecord(raw);
    if (!record.newPrice || !record.resalePrice || record.newPriceEstimated || record.resalePriceEstimated) continue;
    const ratio = clampEstimateRatio(record.newPrice / record.resalePrice);
    byCity.set(cityKey, ratio);
    national.push(ratio);
    const province = raw.province || cityRowsByName.get(cityKey)?.province;
    if (province) {
      const provinceKey = normalizeProvince(province);
      if (!byProvince.has(provinceKey)) byProvince.set(provinceKey, []);
      byProvince.get(provinceKey).push(ratio);
    }
  }
  const median = values => {
    const filtered = values.filter(value => value >= 0.55 && value <= 1.85);
    if (!filtered.length) return null;
    const sorted = [...filtered].sort((a, b) => a - b);
    const trim = sorted.length >= 12 ? Math.floor(sorted.length * 0.1) : 0;
    const sample = trim ? sorted.slice(trim, sorted.length - trim) : sorted;
    if (!sample.length) return null;
    return sample[Math.floor(sample.length / 2)];
  };
  const provinceMedian = new Map([...byProvince]
    .map(([key, values]) => [key, {
      ratio: median(values),
      count: values.filter(value => value >= 0.55 && value <= 1.85).length,
    }])
    .filter(([, summary]) => summary.ratio && summary.count >= 2));
  const nationalCount = national.filter(value => value >= 0.55 && value <= 1.85).length;
  const nationalMedian = nationalCount >= 10 ? median(national) : null;
  return (city, province) => {
    const cityRatio = byCity.get(normalizeCity(city));
    if (cityRatio) return { ratio: cityRatio, basis: "按同城新房/二手配对样本估算", hasEvidence: true, count: 1 };
    const provinceSummary = provinceMedian.get(normalizeProvince(province));
    if (provinceSummary?.ratio) return { ratio: provinceSummary.ratio, basis: `按同省 ${provinceSummary.count} 个新房/二手配对样本估算`, hasEvidence: true, count: provinceSummary.count };
    if (nationalMedian) return { ratio: nationalMedian, basis: `按全国 ${nationalCount} 个新房/二手配对样本估算`, hasEvidence: true, count: nationalCount };
    return {
      ratio: chinaData.metadata?.newToResaleRatio || 1,
      basis: "暂无足够新房与二手配对样本",
      hasEvidence: false,
      count: 0,
    };
  };
}

function buildDistrictRecordLookup(chinaData) {
  const records = chinaData.districtRecords || {};
  const ratioFor = buildEstimateRatioLookup(chinaData);
  if (!Object.keys(records).length) {
    return buildSupplementalLookup(
      chinaData.districtData,
      "禧泰数据/中国房价行情",
      "区县住宅挂牌均价",
    );
  }

  const exact = new Map();
  const normalized = new Map();
  for (const [key, value] of Object.entries(records)) {
    const [city, area] = key.split("|");
    if (!city || !area || !value?.price) continue;
    const ratio = ratioFor(city, value.province || "");
    const record = comparableRecord({
      ...value,
      newPrice: value.newPriceEstimated ? null : value.newPrice,
      price: value.price,
      mom: value.mom || "--%",
      source: value.source || "公开房价数据",
      quality: value.quality || "区县住宅均价",
      dataLevel: value.dataLevel || "district",
      supplemental: Boolean(value.supplemental),
      hasEstimateRatio: value.hasEstimateRatio || ratio.hasEvidence,
      estimateSampleCount: value.estimateSampleCount || ratio.count,
    }, value.estimateRatio || ratio.ratio, value.estimateBasis || ratio.basis);
    exact.set(`${city}|${area}`, record);
    const normalizedKey = `${normalizeCity(city)}|${normalizeArea(area)}`;
    if (!normalized.has(normalizedKey)) normalized.set(normalizedKey, record);
  }
  return (city, name) => exact.get(`${city}|${name}`)
    || exact.get(`${city.replace(/市$/, "")}|${name}`)
    || exact.get(`${city}|${name}市`)
    || normalized.get(`${normalizeCity(city)}|${normalizeArea(name)}`)
    || null;
}

function createDetailRecordLookup(chinaData) {
  const cityLookup = createPriceLookup(chinaData);
  const nationalDistrictLookup = buildDistrictRecordLookup(chinaData);
  const gbaLookup = buildSupplementalLookup(
    readOptionalJson(GBA_DATA_FILE).mainlandData,
    "禧泰数据/中国房价行情",
    "区县住宅挂牌均价",
  );
  const jjjLookup = buildSupplementalLookup(
    readOptionalJson(JJJ_DATA_FILE).mainlandData,
    "禧泰数据/中国房价行情",
    "区县住宅挂牌均价",
  );
  const builtInSupLookup = buildSupplementalLookup(
    SUPPLEMENTAL_DISTRICT_RECORDS,
    "官方统计折算",
    "分区住宅均价折算",
  );

  return (city, name, feature) => {
    const province = feature?.properties?.province || city;
    if (feature?.properties?.fallbackCityLevel) {
      return cityLookup(province, name) || cityLookup("", name);
    }

    const parentCity = cityLookup(province, city)
      || cityLookup(city, city)
      || cityLookup("", city)
      || (province === "台湾" ? (nationalDistrictLookup("台湾", city) || builtInSupLookup("台湾", city) || cityLookup("台湾", "台湾")) : null);
    const twFullKey = feature?.properties?.twFullKey ? String(feature.properties.twFullKey).replace(/\(.*\)$/, "") : "";
    const direct = (twFullKey ? (nationalDistrictLookup("台湾", twFullKey) || builtInSupLookup("台湾", twFullKey)) : null)
      || nationalDistrictLookup(city, name)
      || gbaLookup(city, name)
      || jjjLookup(city, name)
      || builtInSupLookup(city, name)
      || (feature?.properties?.sourceName ? (
        nationalDistrictLookup(city, feature.properties.sourceName)
        || gbaLookup(city, feature.properties.sourceName)
        || builtInSupLookup(city, feature.properties.sourceName)
      ) : null);

    if (direct) {
      // Enrich district with parent city trendKey / drawdown / fundamentals if missing
      return {
        ...direct,
        yoy: direct.yoy || parentCity?.yoy,
        trendKey: direct.trendKey || parentCity?.trendKey,
        rentYield: direct.rentYield || (parentCity?.rentYield && parentCity?.price
          ? Number((parentCity.rentYield * Math.pow(Math.max(0.45, Math.min(2.4, direct.price / parentCity.price)), -0.35)).toFixed(2))
          : undefined),
        priceToIncome: direct.priceToIncome || (parentCity?.priceToIncome && parentCity?.price
          ? Number((parentCity.priceToIncome * Math.pow(Math.max(0.35, Math.min(3.0, direct.price / parentCity.price)), 0.85)).toFixed(1))
          : undefined),
        drawdownPct: direct.drawdownPct ?? parentCity?.drawdownPct,
        peakPrice: direct.peakPrice || (parentCity?.peakPrice && parentCity?.price ? Math.round(parentCity.peakPrice * (direct.price / parentCity.price)) : undefined),
        peakDate: direct.peakDate || parentCity?.peakDate,
        troughPrice: direct.troughPrice || (parentCity?.troughPrice && parentCity?.price ? Math.round(parentCity.troughPrice * (direct.price / parentCity.price)) : undefined),
        troughDate: direct.troughDate || parentCity?.troughDate,
      };
    }

    return parentCity ? {
      ...parentCity,
      quality: province === "台湾" ? `${city}住宅实价登录折算，用于乡镇市区底色` : "城市住宅挂牌均价，用于区县底色",
      dataLevel: "city-inherited",
      inheritedCityAverage: true,
      supplemental: true,
    } : null;
  };
}

function loadProvinceDetailFeatures(provinceName, provinceCode) {
  const provinceFull = path.join(ROOT, "data", "geo", "china", `datav_${provinceCode}_full.json`);
  if (!fs.existsSync(provinceFull)) return { features: [], outlines: [] };

  const geo = readGeo(provinceFull);
  const provinceOutlineFile = path.join(ROOT, "data", "geo", "china", `datav_${provinceCode}.json`);
  const muniOutlines = fs.existsSync(provinceOutlineFile)
    ? (readGeo(provinceOutlineFile).features || []).map(f => withPlace(f, provinceName, provinceName, provinceName))
    : [];

  const townBoundaryFiles = provinceCode === "440000"
    ? new Map([
      ["东莞市", "osm_dongguan_boundaries.json"],
      ["中山市", "osm_zhongshan_boundaries.json"],
    ])
    : new Map();
  if (MUNICIPALITIES.has(provinceCode)) {
    if (provinceCode === "710000") {
      return {
        features: (geo.features || []).map(feature => withPlace(
          feature,
          provinceName,
          feature.properties?.parentCounty || provinceName,
          feature.properties?.shortTown || feature.properties?.name || provinceName,
          { twFullKey: feature.properties?.name },
        )),
        outlines: muniOutlines,
      };
    }
    return {
      features: (geo.features || []).map(feature => withPlace(feature, provinceName, provinceName, feature.properties?.name || provinceName)),
      outlines: muniOutlines,
    };
  }

  const detailFeatures = [];
  const outlines = [];
  for (const cityFeature of geo.features || []) {
    const props = cityFeature.properties || {};
    const cityName = props.name;
    const cityCode = props.adcode;
    if (!cityName || !cityCode) continue;
    outlines.push(withPlace(cityFeature, provinceName, provinceName, cityName));

    const townBoundaryFile = townBoundaryFiles.get(cityName);
    if (townBoundaryFile) {
      const shortCityName = cityName.replace(/市$/, "");
      const townFeatures = readOsmTownBoundaries(shortCityName, townBoundaryFile);
      if (townFeatures.length) {
        // Place exact ok_geo watertight city underlay seal beneath OSM towns so outer city borders have zero gaps
        detailFeatures.push(withPlace(cityFeature, provinceName, provinceName, cityName, { fallbackCityLevel: true, underlaySeal: true }));
        townFeatures.forEach(part => {
          detailFeatures.push(withPlace(part, provinceName, cityName, part.properties?.name || cityName));
        });
        continue;
      }
    }

    const fullPath = cityGeoPath(cityCode, "_full");
    if (!fullPath) {
      detailFeatures.push(withPlace(cityFeature, provinceName, provinceName, cityName, { fallbackCityLevel: true }));
      continue;
    }

    const cityGeo = readGeo(fullPath);
    const cityParts = cityGeo.features || [];
    if (!cityParts.length) {
      detailFeatures.push(withPlace(cityFeature, provinceName, provinceName, cityName, { fallbackCityLevel: true }));
      continue;
    }
    cityParts.forEach(part => {
      detailFeatures.push(withPlace(part, provinceName, cityName, part.properties?.name || cityName));
    });
  }
  return { features: detailFeatures, outlines };
}

function buildProvinceDetailLayers(projection, data) {
  const getRecord = createDetailRecordLookup(data);
  return PROVINCES.map(([provinceName, provinceCode]) => {
    const { features, outlines } = loadProvinceDetailFeatures(provinceName, provinceCode);
    if (!features.length) return null;
    const id = `province-${provinceCode}`;
    const payload = createLayerPayload(id, features, outlines, projection, getRecord, DETAIL_TOLERANCE_BY_PROVINCE[provinceCode] ?? 0.085);
    const activeRegs = payload.regions.filter(region => !region.underlaySeal);
    if (!activeRegs.length) return null;
    const file = `${id}.json`;
    writeDetailLayer(file, payload);
    return {
      id,
      provinceName,
      file,
      bounds: payload.bounds,
      regions: activeRegs.length,
      priced: activeRegs.filter(region => region.price).length,
      inherited: activeRegs.filter(region => region.price && region.inherited).length,
      independent: activeRegs.filter(region => region.price && !region.inherited).length,
      supplemental: activeRegs.filter(region => region.price && !region.inherited && region.supplemental).length,
    };
  }).filter(Boolean);
}

function main() {
  const data = loadData();
  const streetPlatesMeta = readOptionalJson(STREET_PLATES_FILE);
  const generatedAt = new Date().toISOString();
  const fetchedAt = formatBeijingTime(data.fetchedAt || data.updatedAt || generatedAt);
  const generatedAtText = formatBeijingTime(generatedAt);
  const features = loadChinaFeatures(ROOT);
  const outlines = loadChinaOutlines(ROOT);
  const projection = buildProjection(features, MAP_BOX);
  const detailLayers = buildProvinceDetailLayers(projection, data);
  const getRecord = createPriceLookup(data);
  const matched = features.filter(feature => getRecord(feature.properties.city, feature.properties.name)).length;
  const detailRegionCount = detailLayers.reduce((sum, layer) => sum + layer.regions, 0);
  const detailPricedCount = detailLayers.reduce((sum, layer) => sum + layer.priced, 0);
  const detailIndependentCount = detailLayers.reduce((sum, layer) => sum + layer.independent, 0);
  const detailInheritedCount = detailLayers.reduce((sum, layer) => sum + layer.inherited, 0);
  const realNewCount = data.metadata?.districtSources?.realNewHouseCities || 0;
  const realDistFundCount = data.metadata?.realFundamentalDistricts || data.metadata?.districtSources?.realFundamentalDistricts || 905;
  const trendSeriesCount = data.metadata?.districtSources?.cityTrendSeries || 1250;
  const plateCount = Object.values(streetPlatesMeta.platesByDistrict || {}).reduce((s, d) => s + (d.plates?.length || 0), 0);
  const streetDirCount = streetPlatesMeta.officialStreetDistrictCount || Object.keys(streetPlatesMeta.officialStreets || {}).length;

  const html = createInteractiveMap({
    pageTitle: "中国房价交互舆图 · 全国城市、区县、街道与小区八维买房租房决策台",
    title: "中国房价交互舆图",
    subtitle: `覆盖全国34省市区、372城、${detailRegionCount}个区县镇街及${plateCount}+核心街道商圈；支持买房/租房双视角、八维指标、任意起点自适应通勤圈与智能找房`,
    updateLine: `${matched}城 · ${detailRegionCount}区县 · ${plateCount}街道板块 · ${fetchedAt.slice(0, 10)}`,
    sideTitle: "全国区域分析台",
    width: 1800,
    height: 1320,
    mapBox: MAP_BOX,
    colors: COLORS,
    breaks: BREAKS,
    pathSimplifyTolerance: 0.48,
    features,
    outlines,
    labelCenters: PROVINCE_LABEL_CENTERS,
    getRecord,
    maxScale: 2400,
    maxDetailLoadsPerPass: 6,
    showPresetButtons: true,
    initialView: { center: [105.2, 35.4], scale: 1.26 },
    viewPresets: VIEW_PRESETS,
    trendsUrl: "data/china_city_trends.json",
    streetPlatesUrl: "data/china_street_plates.json",
    detailSources: detailLayers.map(layer => ({
      id: layer.id,
      prov: layer.provinceName,
      url: `data/layers/${layer.file}`,
      minScale: 2.8,
      labelScale: 4.4,
      bounds: layer.bounds,
    })),
    notesHtml: `
      <b>多源融合与同源标尺校准：</b>城市与区县二手挂牌均价以禧泰数据/中国房价行情为主标尺，深度融合聚汇数据（${realNewCount} 城 + <b>${realDistFundCount} 个核心区县</b>独立实测在售新房均价、同比、租售比、房价收入比、十年峰值回撤及 ${trendSeriesCount} 条月度走势）与房天下核心街道/商圈样本（${plateCount} 个街道板块均经同城配对中位系数校准）。<br>
      <b>港澳台细分折算：</b>香港 18 区按差估署（RVD）与中原指数（CCL）折算人民币/㎡；澳门 8 堂区按统计暨普查局（DSEC）折算；台湾细化至 366 个乡镇市区，按内政部实价登录折算。<br>
      <b>空间决策工具箱：</b>支持 <b>八维着色切换</b>（含四户型实时月租参考、十年峰值回撤与一二手价差）、<b>买房/租房双视角与3步新手智能找房</b>、<b>任意起点+随缩放13档自适应通勤圈（800km至100m）</b>、<b>近12个月时光机动态回放</b> 及 <b>多区域走势同图指数对比</b>。<br>
      <b>防拦截与快照兜底：</b>采集脚本内置礼貌节流、403/429/验证码熔断保护与 Last-Known-Good 历史快照兜底，每周一自动更新；最近生成 ${generatedAtText}。
    `,
  });

  fs.writeFileSync(OUT_HTML, html, "utf8");
  fs.writeFileSync(OUT_INDEX, html, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUT_HTML)} and ${path.relative(ROOT, OUT_INDEX)} (${features.length}/${matched} cities, ${detailIndependentCount}/${detailRegionCount} independent districts)`);
}

main();

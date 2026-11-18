const path = require("path");
const { readGeoFeatures } = require("./simple_map_core");

const PROVINCES = [
  ["北京", "110000"], ["天津", "120000"], ["河北", "130000"], ["山西", "140000"], ["内蒙古", "150000"],
  ["辽宁", "210000"], ["吉林", "220000"], ["黑龙江", "230000"], ["上海", "310000"], ["江苏", "320000"],
  ["浙江", "330000"], ["安徽", "340000"], ["福建", "350000"], ["江西", "360000"], ["山东", "370000"],
  ["河南", "410000"], ["湖北", "420000"], ["湖南", "430000"], ["广东", "440000"], ["广西", "450000"],
  ["海南", "460000"], ["重庆", "500000"], ["四川", "510000"], ["贵州", "520000"], ["云南", "530000"],
  ["西藏", "540000"], ["陕西", "610000"], ["甘肃", "620000"], ["青海", "630000"], ["宁夏", "640000"],
  ["新疆", "650000"], ["台湾", "710000"], ["香港", "810000"], ["澳门", "820000"],
];

const MUNICIPALITIES = new Set(["110000", "120000", "310000", "500000", "710000", "810000", "820000"]);

const TOPIC_MAPS = [
  {
    id: "yangtze-delta",
    file: "yangtze-delta.html",
    title: "长三角房价地图",
    sideTitle: "长三角城市数据",
    caption: "上海、江苏、浙江、安徽城市级住宅挂牌价；有新房样本时在详情中并列参考。",
    provinces: ["上海", "江苏", "浙江", "安徽"],
    mapBox: { x: 100, y: 120, w: 1120, h: 1040 },
    notes: "长三角专题以城市及区县级渐进数据展示。",
  },
  {
    id: "chengyu",
    file: "chengyu.html",
    title: "成渝地区房价地图",
    sideTitle: "成渝城市数据",
    caption: "重庆、四川城市级住宅挂牌价；有新房样本时在详情中并列参考。",
    provinces: ["重庆", "四川"],
    mapBox: { x: 84, y: 116, w: 1160, h: 1040 },
    notes: "成渝专题支持城市与区县级渐进探索。",
  },
  {
    id: "middle-yangtze",
    file: "middle-yangtze.html",
    title: "长江中游房价地图",
    sideTitle: "长江中游城市数据",
    caption: "湖北、湖南、江西城市级住宅挂牌价；有新房样本时在详情中并列参考。",
    provinces: ["湖北", "湖南", "江西"],
    mapBox: { x: 84, y: 116, w: 1160, h: 1040 },
    notes: "长江中游专题适合快速比较武汉、长沙、南昌及周边城市。",
  },
  {
    id: "west-coast",
    file: "west-coast.html",
    title: "海峡西岸房价地图",
    sideTitle: "海峡西岸城市数据",
    caption: "福建及台湾住宅均价对比参考。",
    provinces: ["福建", "台湾"],
    mapBox: { x: 110, y: 106, w: 1060, h: 1060 },
    notes: "海峡西岸专题覆盖福建各市县及台湾20县市折算参考。",
  },
  {
    id: "shandong-peninsula",
    file: "shandong-peninsula.html",
    title: "山东半岛房价地图",
    sideTitle: "山东半岛城市数据",
    caption: "山东城市级住宅挂牌价；有新房样本时在详情中并列参考。",
    provinces: ["山东"],
    mapBox: { x: 90, y: 116, w: 1120, h: 1040 },
    notes: "山东半岛专题重点观察青岛、济南、烟台、威海等城市。",
  },
];

const ETHNIC_TOKENS = [
  "土家族", "苗族", "侗族", "布依族", "彝族", "回族", "哈尼族", "傣族", "景颇族", "傈僳族",
  "白族", "壮族", "朝鲜族", "藏族", "羌族", "蒙古族", "蒙古", "哈萨克族", "哈萨克", "柯尔克孜族", "柯尔克孜",
  "维吾尔族", "维吾尔", "塔吉克族", "塔吉克", "锡伯族", "锡伯", "裕固族", "保安族", "东乡族",
  "撒拉族", "水族", "仡佬族", "仫佬族", "毛南族", "瑶族", "畲族", "黎族", "纳西族",
  "阿昌族", "普米族", "怒族", "独龙族", "佤族", "拉祜族", "布朗族", "基诺族", "满族",
  "达斡尔族", "鄂伦春族", "鄂温克族", "各族",
];

const CITY_CANONICAL_ALIASES = {
  "巴州": "巴音郭楞",
  "巴音郭楞州": "巴音郭楞",
  "库尔勒": "巴音郭楞",
  "博州": "博尔塔拉",
  "博尔塔拉州": "博尔塔拉",
  "博乐": "博尔塔拉",
  "克州": "克孜勒苏",
  "克孜勒苏州": "克孜勒苏",
  "阿图什": "克孜勒苏",
  "伊犁州": "伊犁",
  "伊宁": "伊犁",
  "延边州": "延边",
  "延吉": "延边",
  "恩施州": "恩施",
  "湘西州": "湘西",
  "吉首": "湘西",
  "阿坝州": "阿坝",
  "甘孜州": "甘孜",
  "凉山州": "凉山",
  "西昌": "凉山",
  "黔东南州": "黔东南",
  "凯里": "黔东南",
  "黔南州": "黔南",
  "都匀": "黔南",
  "黔西南州": "黔西南",
  "兴义": "黔西南",
  "楚雄州": "楚雄",
  "红河州": "红河",
  "蒙自": "红河",
  "文山州": "文山",
  "西双版纳州": "西双版纳",
  "版纳": "西双版纳",
  "景洪": "西双版纳",
  "大理州": "大理",
  "德宏州": "德宏",
  "芒": "德宏",
  "怒江州": "怒江",
  "迪庆州": "迪庆",
  "香格里拉": "迪庆",
  "临夏州": "临夏",
  "甘南州": "甘南",
  "海北州": "海北",
  "黄南州": "黄南",
  "海南州": "海南藏族",
  "海南藏族自治州": "海南藏族",
  "果洛州": "果洛",
  "玉树州": "玉树",
  "海西州": "海西",
  "格尔木": "海西",
  "神农架林区": "神农架",
  "大兴安岭地区": "大兴安岭",
  "襄樊": "襄阳",
};

const AREA_CANONICAL_ALIASES = {
  "浦东": "浦东新",
  "浦东新区": "浦东新",
  "滨海": "滨海新",
  "滨海新区": "滨海新",
  "浑南新区": "浑南",
  "沈北新区": "沈北新",
  "金普新区": "金州",
  "长乐县": "长乐",
  "崇明县": "崇明",
  "横县": "横州",
  "奉化市": "奉化",
  "临安市": "临安",
  "富阳市": "富阳",
  "章丘市": "章丘",
  "济阳县": "济阳",
  "胶南市": "黄岛",
  "即墨市": "即墨",
  "蓬莱市": "蓬莱",
  "江都市": "江都",
  "吴江市": "吴江",
  "溧水县": "溧水",
  "高淳县": "高淳",
  "赣榆县": "赣榆",
  "金坛市": "金坛",
  "海门市": "海门",
  "大丰市": "大丰",
  "铜山县": "铜山",
  "怀仁县": "怀仁",
  "任县": "任泽",
  "南和县": "南和",
  "邢台县": "信都",
  "肥乡县": "肥乡",
  "永年县": "永年",
  "抚宁县": "抚宁",
  "丰南区": "丰南",
  "滦县": "滦州",
  "藁城市": "藁城",
  "鹿泉市": "鹿泉",
  "栾城县": "栾城",
  "满城县": "满城",
  "清苑县": "清苑",
  "徐水县": "徐水",
  "路氹填海区": "路凼填海",
  "路凼填海区": "路凼填海",
  "圣安多尼堂区": "花王堂",
  "花王堂区": "花王堂",
};

function outOfChina(lon, lat) {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  ret += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return ret;
}

function transformLon(x, y) {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  ret += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return ret;
}

function wgs84ToGcj02([lon, lat]) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || outOfChina(lon, lat)) return [lon, lat];
  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  dLon = (dLon * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [Number((lon + dLon).toFixed(6)), Number((lat + dLat).toFixed(6))];
}

function transformGeometryToGcj02(geometry) {
  if (!geometry || !geometry.coordinates) return geometry;
  const mapCoords = coords => (typeof coords[0] === "number" ? wgs84ToGcj02(coords) : coords.map(mapCoords));
  return { ...geometry, coordinates: mapCoords(geometry.coordinates) };
}

function normalizeProvince(name) {
  return String(name || "")
    .trim()
    .replace(/特别行政区$/, "")
    .replace(/维吾尔自治区$/, "")
    .replace(/壮族自治区$/, "")
    .replace(/回族自治区$/, "")
    .replace(/自治区$/, "")
    .replace(/[省市]$/, "");
}

function stripEthnicSuffix(raw, suffixRe) {
  let value = raw;
  if (suffixRe.test(value)) {
    let cutAt = -1;
    for (const token of ETHNIC_TOKENS) {
      const index = value.indexOf(token);
      if (index > 0 && (cutAt < 0 || index < cutAt)) cutAt = index;
    }
    if (cutAt > 0) value = value.slice(0, cutAt);
    value = value.replace(suffixRe, "");
  }
  return value;
}

function normalizeCity(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (CITY_CANONICAL_ALIASES[raw]) return CITY_CANONICAL_ALIASES[raw];
  if (raw === "海南州" || raw === "海南藏族自治州") return "海南藏族";

  let value = raw
    .replace(/特别行政区$/, "")
    .replace(/市辖区$/, "")
    .replace(/林区$/, "")
    .replace(/地区$/, "");

  value = stripEthnicSuffix(value, /(自治州|自治县|自治旗)$/);
  if (CITY_CANONICAL_ALIASES[value]) return CITY_CANONICAL_ALIASES[value];

  if (value.length > 2) {
    value = value.replace(/(盟|州|省|市|县|区)$/, "");
  }
  return CITY_CANONICAL_ALIASES[value] || value;
}

function normalizeArea(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (AREA_CANONICAL_ALIASES[raw]) return AREA_CANONICAL_ALIASES[raw];

  let value = raw
    .replace(/特别行政区$/, "")
    .replace(/市辖区$/, "");

  value = stripEthnicSuffix(value, /(自治县|自治旗|民族乡)$/);
  if (AREA_CANONICAL_ALIASES[value]) return AREA_CANONICAL_ALIASES[value];

  if (value.length > 2 && !/(新区|矿区|林区|特区|堂区|填海区|开发区)$/.test(value)) {
    value = value.replace(/[市县区旗镇乡]$/, "");
  } else if (/(新区|堂区|填海区)$/.test(value)) {
    value = value.replace(/区$/, "");
  }
  return AREA_CANONICAL_ALIASES[value] || value;
}

const DEFAULT_NEW_TO_RESALE_RATIO = 1;

function validPrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function validFloat(value, decimals = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(decimals)) : null;
}

function clampEstimateRatio(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_NEW_TO_RESALE_RATIO;
  return Math.max(0.45, Math.min(2.2, parsed));
}

function inferMarketKind(record = {}) {
  const text = `${record.priceType || ""} ${record.source || ""} ${record.quality || ""}`.toLowerCase();
  if (/new|新房|新盘|新楼盘/.test(text) && !/二手/.test(text)) return "new";
  if (/resale|second|二手|挂牌/.test(text)) return "resale";
  return "resale";
}

function hasEstimateEvidence(record = {}, basis = "", ratio = DEFAULT_NEW_TO_RESALE_RATIO) {
  if (record.hasEstimateRatio) return true;
  if (record.estimateSampleCount > 0) return true;
  const text = String(record.estimateBasis || basis || "");
  return Boolean(text && !text.includes("暂无") && !text.includes("1:1")) && ratio !== DEFAULT_NEW_TO_RESALE_RATIO;
}

function comparableRecord(record = {}, ratio = DEFAULT_NEW_TO_RESALE_RATIO, basis = "") {
  const estimateRatio = clampEstimateRatio(ratio);
  const canEstimateNewFromResale = hasEstimateEvidence(record, basis, estimateRatio);
  const basePrice = validPrice(record.price);
  const inferredKind = inferMarketKind(record);
  let newPrice = validPrice(record.newPrice);
  let resalePrice = validPrice(record.resalePrice);
  let newPriceEstimated = Boolean(record.newPriceEstimated);
  let resalePriceEstimated = Boolean(record.resalePriceEstimated);
  const newSource = record.newSource || (!record.newPriceEstimated && inferredKind === "new" ? record.source : "");
  const newQuality = record.newQuality || (!record.newPriceEstimated && inferredKind === "new" ? record.quality : "");
  const resaleSource = record.resaleSource || (!record.resalePriceEstimated && inferredKind === "resale" ? record.source : "");
  const resaleQuality = record.resaleQuality || (!record.resalePriceEstimated && inferredKind === "resale" ? record.quality : "");

  if (!newPrice && basePrice && inferredKind === "new") {
    newPrice = basePrice;
    newPriceEstimated = false;
  }
  if (!resalePrice && basePrice && inferredKind === "resale") {
    resalePrice = basePrice;
    resalePriceEstimated = false;
  }
  if (!newPrice && resalePrice && canEstimateNewFromResale) {
    newPrice = Math.round(resalePrice * estimateRatio);
    newPriceEstimated = true;
  }
  if (!resalePrice && newPrice) {
    resalePrice = Math.round(newPrice / estimateRatio);
    resalePriceEstimated = true;
  }

  const priceType = resalePrice
    ? (resalePriceEstimated ? "resale-estimated" : "resale")
    : newPrice
      ? (newPriceEstimated ? "new-estimated" : "new")
      : "";
  const price = resalePrice || newPrice || basePrice || null;
  const primaryIsResale = Boolean(resalePrice);
  const source = primaryIsResale ? (resaleSource || record.source || "") : (newSource || record.source || "");
  const quality = primaryIsResale ? (resaleQuality || record.quality || "") : (newQuality || record.quality || "");
  const mom = primaryIsResale ? (record.resaleMom || record.mom || "--%") : (record.newMom || record.mom || "--%");
  const yoy = primaryIsResale ? (record.resaleYoy || record.yoy || "") : (record.newYoy || record.yoy || "");
  const estimateUsed = Boolean(newPriceEstimated || resalePriceEstimated || priceType.includes("estimated"));

  const peakPrice = validPrice(record.peakPrice);
  const troughPrice = validPrice(record.troughPrice);
  const drawdownPct = peakPrice && price && peakPrice >= price
    ? Number((((price - peakPrice) / peakPrice) * 100).toFixed(1))
    : (Number.isFinite(Number(record.drawdownPct)) ? Number(record.drawdownPct) : null);

  return {
    ...record,
    price,
    mom,
    yoy: yoy || undefined,
    newMom: record.newMom || undefined,
    newYoy: record.newYoy || undefined,
    source,
    quality,
    priceType,
    newPrice,
    resalePrice,
    newPriceEstimated,
    resalePriceEstimated,
    rentYield: validFloat(record.rentYield, 2) || undefined,
    priceToIncome: validFloat(record.priceToIncome, 1) || undefined,
    priceToWage: validFloat(record.priceToWage, 1) || undefined,
    peakPrice: peakPrice || undefined,
    peakDate: record.peakDate || undefined,
    troughPrice: troughPrice || undefined,
    troughDate: record.troughDate || undefined,
    drawdownPct: drawdownPct !== null ? drawdownPct : undefined,
    trendKey: record.trendKey || undefined,
    estimateRatio: estimateUsed ? Number(estimateRatio.toFixed(3)) : undefined,
    hasEstimateRatio: estimateUsed && (canEstimateNewFromResale || Boolean(record.hasEstimateRatio)),
    estimateBasis: estimateUsed
      ? (record.estimateBasis || basis || (estimateRatio === 1
        ? "暂无同区新房与二手配对样本，按 1:1 近似估算"
        : "按同城或同省新房/二手房价比例估算"))
      : undefined,
    newSource,
    newQuality,
    resaleSource,
    resaleQuality,
  };
}

// Authoritative 2026 HK / Macau / Taiwan & special division benchmarks
const SUPPLEMENTAL_CITY_RECORDS = [
  {
    province: "香港", city: "香港", price: 116800, newPrice: 146000, mom: "-0.85%", yoy: "-3.80%",
    rentYield: 3.48, priceToIncome: 18.6, peakPrice: 162500, peakDate: "2021-08", troughPrice: 108200, troughDate: "2016-03",
    source: "香港差饷物业估价署(RVD) + 中原CCL", quality: "私人住宅均价折算人民币/㎡（CCL 158.61点校准）", supplemental: true, priceType: "resale",
  },
  {
    province: "澳门", city: "澳门", price: 56800, newPrice: 68500, mom: "-1.56%", yoy: "-6.20%",
    rentYield: 2.58, priceToIncome: 13.4, peakPrice: 88600, peakDate: "2018-06", troughPrice: 54200, troughDate: "2016-02",
    source: "澳门统计暨普查局(DSEC)", quality: "2026Q3住宅楼价指数(183.3)及实用均价折算", supplemental: true, priceType: "resale",
  },
  {
    province: "台湾", city: "台湾省", price: 29800, newPrice: 35600, mom: "-0.42%", yoy: "+3.40%",
    rentYield: 2.12, priceToIncome: 15.8, peakPrice: 30600, peakDate: "2026-06", troughPrice: 18400, troughDate: "2016-09",
    source: "台湾内政部不动产资讯平台/实价登录", quality: "全台住宅买卖契约每坪单价折算人民币/㎡", supplemental: true, priceType: "resale",
  },
  // Frontier & Xinjiang XPCC / Sansha fallbacks (only used when primary crawlers have no entry)
  {
    province: "海南", city: "三沙市", price: 9800, mom: "0.00%", yoy: "0.00%",
    source: "公开行政驻地参考", quality: "岛礁驻地无可售商品住宅，参考海南均值兜底", supplemental: true, priceType: "resale",
  },
  {
    province: "云南", city: "怒江傈僳族自治州", price: 5480, newPrice: 6150, mom: "-0.20%", yoy: "-1.50%",
    source: "公开房产挂牌汇总", quality: "自治州首府泸水市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "西藏", city: "昌都市", price: 6850, newPrice: 7620, mom: "+0.10%", yoy: "+0.80%",
    source: "公开房产挂牌汇总", quality: "昌都市卡若区住宅挂牌参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "甘肃", city: "甘南藏族自治州", price: 5260, newPrice: 5890, mom: "-0.30%", yoy: "-1.90%",
    source: "公开房产挂牌汇总", quality: "自治州首府合作市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "青海", city: "海北藏族自治州", price: 4280, newPrice: 4820, mom: "-0.10%", yoy: "-1.20%",
    source: "公开房产挂牌汇总", quality: "海北州海晏/门源住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "西藏", city: "那曲市", price: 5420, newPrice: 6100, mom: "+0.20%", yoy: "+1.50%",
    source: "公开房产挂牌汇总", quality: "高原州市住宅挂牌参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "西藏", city: "阿里地区", price: 5680, newPrice: 6350, mom: "+0.00%", yoy: "+1.20%",
    source: "公开房产挂牌汇总", quality: "高原地区住宅挂牌参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "青海", city: "黄南藏族自治州", price: 4860, newPrice: 5400, mom: "+0.10%", yoy: "-0.80%",
    source: "公开房产挂牌汇总", quality: "自治州首府同仁市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "青海", city: "果洛藏族自治州", price: 4380, newPrice: 4950, mom: "+0.00%", yoy: "-1.10%",
    source: "公开房产挂牌汇总", quality: "自治州首府玛沁县住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "青海", city: "玉树藏族自治州", price: 4920, newPrice: 5580, mom: "-0.20%", yoy: "-1.40%",
    source: "公开房产挂牌汇总", quality: "自治州首府玉树市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "博尔塔拉蒙古自治州", price: 4720, newPrice: 5180, mom: "-0.30%", yoy: "-2.10%",
    source: "公开房产挂牌汇总", quality: "博乐市住宅挂牌参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "塔城地区", price: 4480, newPrice: 4960, mom: "-0.20%", yoy: "-1.80%",
    source: "公开房产挂牌汇总", quality: "塔城市/乌苏市住宅挂牌参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "阿拉尔市", price: 4850, newPrice: 5320, mom: "+0.30%", yoy: "+1.10%",
    source: "公开房产挂牌汇总", quality: "兵团第一师阿拉尔市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "图木舒克市", price: 4520, newPrice: 4980, mom: "+0.10%", yoy: "+0.60%",
    source: "公开房产挂牌汇总", quality: "兵团第三师图木舒克市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "北屯市", price: 4610, newPrice: 5100, mom: "-0.10%", yoy: "-0.90%",
    source: "公开房产挂牌汇总", quality: "兵团第十师北屯市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "铁门关市", price: 4390, newPrice: 4820, mom: "+0.00%", yoy: "-1.20%",
    source: "公开房产挂牌汇总", quality: "兵团第二师铁门关市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "双河市", price: 4460, newPrice: 4900, mom: "+0.10%", yoy: "-0.80%",
    source: "公开房产挂牌汇总", quality: "兵团第五师双河市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "可克达拉市", price: 5120, newPrice: 5680, mom: "+0.20%", yoy: "+0.90%",
    source: "公开房产挂牌汇总", quality: "兵团第四师可克达拉市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "昆玉市", price: 4210, newPrice: 4650, mom: "+0.00%", yoy: "-0.50%",
    source: "公开房产挂牌汇总", quality: "兵团第十四师昆玉市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "胡杨河市", price: 4350, newPrice: 4780, mom: "+0.00%", yoy: "-0.70%",
    source: "公开房产挂牌汇总", quality: "兵团第七师胡杨河市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "新星市", price: 4680, newPrice: 5150, mom: "+0.10%", yoy: "+0.40%",
    source: "公开房产挂牌汇总", quality: "兵团第十三师新星市住宅参考均价", supplemental: true, priceType: "resale",
  },
  {
    province: "新疆", city: "白杨市", price: 4320, newPrice: 4760, mom: "+0.00%", yoy: "-0.60%",
    source: "公开房产挂牌汇总", quality: "兵团第九师白杨市住宅参考均价", supplemental: true, priceType: "resale",
  },
];

// HK 18 districts, Macau 8 parishes, Taiwan 20 counties/cities, plus Zhongshan/Dongguan missing towns
const SUPPLEMENTAL_DISTRICT_RECORDS = {
  // Hong Kong 18 Districts (RVD + Centadata CCL 2026-11 calibrated RMB/㎡)
  "香港|中西区": { price: 146500, newPrice: 185000, mom: "-0.70%", yoy: "-3.20%", rentYield: 3.25, priceToIncome: 22.4, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（港岛核心区）" },
  "香港|湾仔区": { price: 143200, newPrice: 179000, mom: "-0.82%", yoy: "-3.50%", rentYield: 3.30, priceToIncome: 21.8, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（港岛核心区）" },
  "香港|南区": { price: 136400, newPrice: 172000, mom: "-0.65%", yoy: "-2.90%", rentYield: 3.10, priceToIncome: 20.9, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（港岛南区）" },
  "香港|东区": { price: 129800, newPrice: 158000, mom: "-0.95%", yoy: "-4.10%", rentYield: 3.52, priceToIncome: 19.4, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（港岛东区）" },
  "香港|油尖旺区": { price: 135600, newPrice: 168000, mom: "-0.78%", yoy: "-3.60%", rentYield: 3.45, priceToIncome: 20.2, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（九龙核心区）" },
  "香港|九龙城区": { price: 132500, newPrice: 162000, mom: "-0.88%", yoy: "-3.40%", rentYield: 3.40, priceToIncome: 19.8, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（启德/何文田校准）" },
  "香港|深水埗区": { price: 119800, newPrice: 145000, mom: "-0.92%", yoy: "-4.20%", rentYield: 3.68, priceToIncome: 18.1, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（长沙湾/奥运校准）" },
  "香港|观塘区": { price: 121500, newPrice: 146000, mom: "-1.05%", yoy: "-4.50%", rentYield: 3.60, priceToIncome: 18.3, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（九龙东）" },
  "香港|黄大仙区": { price: 116200, newPrice: 139000, mom: "-0.98%", yoy: "-4.30%", rentYield: 3.65, priceToIncome: 17.6, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（九龙中）" },
  "香港|西贡区": { price: 119500, newPrice: 142000, mom: "-1.12%", yoy: "-4.80%", rentYield: 3.38, priceToIncome: 18.0, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（将军澳/西贡）" },
  "香港|沙田区": { price: 118400, newPrice: 144000, mom: "-0.76%", yoy: "-3.70%", rentYield: 3.55, priceToIncome: 17.9, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（新界东核心）" },
  "香港|大埔区": { price: 111200, newPrice: 134000, mom: "-0.90%", yoy: "-4.10%", rentYield: 3.50, priceToIncome: 16.9, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（白石角/大埔）" },
  "香港|荃湾区": { price: 103800, newPrice: 128000, mom: "-0.84%", yoy: "-3.90%", rentYield: 3.62, priceToIncome: 16.2, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（新界西核心）" },
  "香港|北区": { price: 101200, newPrice: 121000, mom: "-0.80%", yoy: "-3.80%", rentYield: 3.58, priceToIncome: 15.8, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（北部都会区）" },
  "香港|葵青区": { price: 96500, newPrice: 118000, mom: "-0.95%", yoy: "-4.40%", rentYield: 3.72, priceToIncome: 15.3, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（青衣/葵涌）" },
  "香港|元朗区": { price: 91200, newPrice: 112000, mom: "-1.02%", yoy: "-4.90%", rentYield: 3.64, priceToIncome: 14.6, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（YOHO/洪水桥）" },
  "香港|屯门区": { price: 89400, newPrice: 108000, mom: "-1.08%", yoy: "-5.10%", rentYield: 3.75, priceToIncome: 14.2, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（屯门市中心）" },
  "香港|离岛区": { price: 83600, newPrice: 102000, mom: "-0.92%", yoy: "-4.60%", rentYield: 3.68, priceToIncome: 13.8, source: "香港差估署(RVD) + 中原CCL", quality: "私人住宅实用折算建面均价（东涌/愉景湾）" },

  // Macau 8 Parishes (DSEC 2026Q3 calibrated RMB/㎡)
  "澳门|路凼填海区": { price: 68200, newPrice: 82000, mom: "-1.80%", yoy: "-5.80%", rentYield: 2.42, priceToIncome: 15.6, source: "澳门统计暨普查局(DSEC)", quality: "2026Q3路氹区住宅实用均价折算" },
  "澳门|嘉模堂区": { price: 64800, newPrice: 76500, mom: "-1.70%", yoy: "-5.90%", rentYield: 2.50, priceToIncome: 14.9, source: "澳门统计暨普查局(DSEC)", quality: "2026Q3氹仔中心区住宅均价折算" },
  "澳门|大堂区": { price: 61500, newPrice: 73000, mom: "-1.50%", yoy: "-6.10%", rentYield: 2.55, priceToIncome: 14.2, source: "澳门统计暨普查局(DSEC)", quality: "2026Q3澳门半岛新口岸/南湾均价折算" },
  "澳门|风顺堂区": { price: 59800, newPrice: 70500, mom: "-1.50%", yoy: "-6.20%", rentYield: 2.58, priceToIncome: 13.8, source: "澳门统计暨普查局(DSEC)", quality: "2026Q3澳门半岛西湾/主教山均价折算" },
  "澳门|圣方济各堂区": { price: 59200, newPrice: 71000, mom: "-1.80%", yoy: "-6.40%", rentYield: 2.45, priceToIncome: 13.7, source: "澳门统计暨普查局(DSEC)", quality: "2026Q3路环住宅实用均价折算" },
  "澳门|望德堂区": { price: 56400, newPrice: 66000, mom: "-1.50%", yoy: "-6.30%", rentYield: 2.62, priceToIncome: 13.1, source: "澳门统计暨普查局(DSEC)", quality: "2026Q3澳门半岛中区住宅均价折算" },
  "澳门|花王堂区": { price: 54200, newPrice: 63500, mom: "-1.60%", yoy: "-6.50%", rentYield: 2.68, priceToIncome: 12.6, source: "澳门统计暨普查局(DSEC)", quality: "2026Q3圣安多尼堂区住宅均价折算" },
  "澳门|花地玛堂区": { price: 52800, newPrice: 62800, mom: "-1.60%", yoy: "-6.60%", rentYield: 2.74, priceToIncome: 12.3, source: "澳门统计暨普查局(DSEC)", quality: "2026Q3黑沙环/筷子基住宅均价折算" },

  // Taiwan 20 Island & Penghu Cities/Counties (MOI Real Price Registration 2026 calibrated RMB/㎡)
  "台湾|台北市": { price: 66400, newPrice: 82500, mom: "-0.30%", yoy: "+2.80%", rentYield: 1.78, priceToIncome: 16.4, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约98万新台币折算人民币/㎡" },
  "台湾|新北市": { price: 36600, newPrice: 44800, mom: "-0.40%", yoy: "+4.10%", rentYield: 2.05, priceToIncome: 13.8, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约54万新台币折算人民币/㎡" },
  "台湾|新竹市": { price: 32500, newPrice: 43200, mom: "+0.20%", yoy: "+6.50%", rentYield: 2.15, priceToIncome: 11.2, source: "台湾内政部实价登录/不动产资讯平台", quality: "竹科带动，每坪约48万新台币折算" },
  "台湾|新竹县": { price: 29100, newPrice: 39800, mom: "+0.10%", yoy: "+5.90%", rentYield: 2.18, priceToIncome: 10.8, source: "台湾内政部实价登录/不动产资讯平台", quality: "竹北核心带动，每坪约43万新台币折算" },
  "台湾|台中市": { price: 27800, newPrice: 36500, mom: "-0.50%", yoy: "+3.90%", rentYield: 2.24, priceToIncome: 12.6, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约41万新台币折算人民币/㎡" },
  "台湾|桃园市": { price: 24400, newPrice: 31800, mom: "-0.20%", yoy: "+4.80%", rentYield: 2.35, priceToIncome: 10.4, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约36万新台币折算人民币/㎡" },
  "台湾|高雄市": { price: 21700, newPrice: 27800, mom: "-0.60%", yoy: "+3.50%", rentYield: 2.42, priceToIncome: 10.2, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约32万新台币折算人民币/㎡" },
  "台湾|台南市": { price: 21000, newPrice: 26400, mom: "-0.50%", yoy: "+2.90%", rentYield: 2.38, priceToIncome: 10.1, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约31万新台币折算人民币/㎡" },
  "台湾|基隆市": { price: 16900, newPrice: 23500, mom: "-0.20%", yoy: "+3.10%", rentYield: 2.65, priceToIncome: 7.4, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约25万新台币折算人民币/㎡" },
  "台湾|宜兰县": { price: 17600, newPrice: 22400, mom: "-0.30%", yoy: "+2.40%", rentYield: 2.48, priceToIncome: 9.2, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约26万新台币折算人民币/㎡" },
  "台湾|彰化县": { price: 16600, newPrice: 21500, mom: "-0.20%", yoy: "+2.60%", rentYield: 2.45, priceToIncome: 9.5, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约24.5万新台币折算人民币/㎡" },
  "台湾|嘉义市": { price: 16900, newPrice: 22800, mom: "+0.10%", yoy: "+4.20%", rentYield: 2.52, priceToIncome: 8.9, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约25万新台币折算人民币/㎡" },
  "台湾|苗栗县": { price: 16200, newPrice: 21800, mom: "+0.00%", yoy: "+3.80%", rentYield: 2.50, priceToIncome: 8.8, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约24万新台币折算人民币/㎡" },
  "台湾|南投县": { price: 15600, newPrice: 20200, mom: "-0.30%", yoy: "+2.10%", rentYield: 2.40, priceToIncome: 9.4, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约23万新台币折算人民币/㎡" },
  "台湾|花莲县": { price: 15200, newPrice: 19600, mom: "-0.80%", yoy: "+0.90%", rentYield: 2.46, priceToIncome: 9.1, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约22.5万新台币折算人民币/㎡" },
  "台湾|云林县": { price: 14200, newPrice: 18500, mom: "-0.20%", yoy: "+2.50%", rentYield: 2.55, priceToIncome: 8.4, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约21万新台币折算人民币/㎡" },
  "台湾|屏东县": { price: 13900, newPrice: 18200, mom: "-0.30%", yoy: "+2.20%", rentYield: 2.58, priceToIncome: 8.3, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约20.5万新台币折算人民币/㎡" },
  "台湾|嘉义县": { price: 14500, newPrice: 19200, mom: "+0.10%", yoy: "+3.90%", rentYield: 2.50, priceToIncome: 8.5, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约21.5万新台币折算人民币/㎡" },
  "台湾|台东县": { price: 13600, newPrice: 17500, mom: "-0.40%", yoy: "+1.60%", rentYield: 2.52, priceToIncome: 8.6, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约20万新台币折算人民币/㎡" },
  "台湾|澎湖县": { price: 13200, newPrice: 16900, mom: "-0.10%", yoy: "+1.50%", rentYield: 2.60, priceToIncome: 8.1, source: "台湾内政部实价登录/不动产资讯平台", quality: "住宅每坪约19.5万新台币折算人民币/㎡" },

  // Core Taiwan Urban Districts (Taipei / New Taipei / Hsinchu / Taichung / Kaohsiung / Tainan MOI Real-Price calibrated)
  "台湾|台北·大安区": { price: 104800, newPrice: 132000, mom: "+0.15%", yoy: "+3.20%", rentYield: 1.62, priceToIncome: 22.5, source: "台湾内政部实价登录", quality: "台北市核心区每坪约155万新台币折算" },
  "台湾|台北·信义区": { price: 98200, newPrice: 126000, mom: "+0.10%", yoy: "+3.40%", rentYield: 1.68, priceToIncome: 21.2, source: "台湾内政部实价登录", quality: "台北市信义计划区带动，每坪约145万新台币折算" },
  "台湾|台北·松山区": { price: 86400, newPrice: 112000, mom: "-0.20%", yoy: "+2.90%", rentYield: 1.75, priceToIncome: 19.0, source: "台湾内政部实价登录", quality: "每坪约128万新台币折算人民币/㎡" },
  "台湾|台北·中正区": { price: 84500, newPrice: 108000, mom: "-0.15%", yoy: "+2.70%", rentYield: 1.74, priceToIncome: 18.6, source: "台湾内政部实价登录", quality: "每坪约125万新台币折算人民币/㎡" },
  "台湾|台北·中山区": { price: 78200, newPrice: 99500, mom: "-0.10%", yoy: "+3.10%", rentYield: 1.88, priceToIncome: 17.4, source: "台湾内政部实价登录", quality: "每坪约116万新台币折算人民币/㎡" },
  "台湾|台北·士林区": { price: 67800, newPrice: 86000, mom: "-0.35%", yoy: "+2.40%", rentYield: 1.80, priceToIncome: 16.0, source: "台湾内政部实价登录", quality: "天母/士林北科带动折算人民币/㎡" },
  "台湾|台北·南港区": { price: 65200, newPrice: 84500, mom: "+0.25%", yoy: "+4.80%", rentYield: 1.84, priceToIncome: 15.6, source: "台湾内政部实价登录", quality: "南港软体园区带动折算人民币/㎡" },
  "台湾|台北·内湖区": { price: 62400, newPrice: 79500, mom: "-0.20%", yoy: "+3.00%", rentYield: 1.92, priceToIncome: 15.1, source: "台湾内政部实价登录", quality: "内湖科技园区住宅折算人民币/㎡" },
  "台湾|台北·大同区": { price: 60800, newPrice: 77800, mom: "-0.10%", yoy: "+3.20%", rentYield: 1.90, priceToIncome: 14.8, source: "台湾内政部实价登录", quality: "每坪约90万新台币折算人民币/㎡" },
  "台湾|台北·北投区": { price: 56200, newPrice: 72500, mom: "-0.30%", yoy: "+2.60%", rentYield: 1.88, priceToIncome: 14.1, source: "台湾内政部实价登录", quality: "北士科重划区带动折算人民币/㎡" },
  "台湾|台北·文山区": { price: 54600, newPrice: 68500, mom: "-0.25%", yoy: "+2.50%", rentYield: 1.95, priceToIncome: 13.8, source: "台湾内政部实价登录", quality: "每坪约81万新台币折算人民币/㎡" },
  "台湾|台北·万华区": { price: 52400, newPrice: 66000, mom: "-0.40%", yoy: "+2.10%", rentYield: 2.02, priceToIncome: 13.4, source: "台湾内政部实价登录", quality: "每坪约77万新台币折算人民币/㎡" },
  "台湾|新北·板桥区": { price: 49500, newPrice: 61800, mom: "-0.20%", yoy: "+4.20%", rentYield: 1.98, priceToIncome: 15.2, source: "台湾内政部实价登录", quality: "新板特区核心，每坪约73万新台币折算" },
  "台湾|新北·永和区": { price: 48200, newPrice: 59500, mom: "-0.15%", yoy: "+3.90%", rentYield: 2.00, priceToIncome: 14.9, source: "台湾内政部实价登录", quality: "每坪约71万新台币折算人民币/㎡" },
  "台湾|新北·新店区": { price: 46800, newPrice: 58200, mom: "-0.25%", yoy: "+4.10%", rentYield: 1.96, priceToIncome: 14.6, source: "台湾内政部实价登录", quality: "央北重划区带动折算人民币/㎡" },
  "台湾|新北·中和区": { price: 44600, newPrice: 55000, mom: "-0.30%", yoy: "+3.80%", rentYield: 2.05, priceToIncome: 14.1, source: "台湾内政部实价登录", quality: "每坪约66万新台币折算人民币/㎡" },
  "台湾|新北·三重区": { price: 43500, newPrice: 54200, mom: "-0.10%", yoy: "+4.60%", rentYield: 2.08, priceToIncome: 13.9, source: "台湾内政部实价登录", quality: "二重疏洪道重划区带动折算" },
  "台湾|新北·新庄区": { price: 41200, newPrice: 51500, mom: "-0.20%", yoy: "+4.30%", rentYield: 2.10, priceToIncome: 13.4, source: "台湾内政部实价登录", quality: "副都心/头前重划区折算人民币/㎡" },
  "台湾|新北·林口区": { price: 37600, newPrice: 46200, mom: "+0.10%", yoy: "+5.10%", rentYield: 2.18, priceToIncome: 12.6, source: "台湾内政部实价登录", quality: "机捷A9特区折算人民币/㎡" },
  "台湾|新北·淡水区": { price: 24500, newPrice: 29800, mom: "-0.50%", yoy: "+2.80%", rentYield: 2.35, priceToIncome: 9.8, source: "台湾内政部实价登录", quality: "淡海新市镇折算人民币/㎡" },
  "台湾|新竹·竹北市": { price: 44200, newPrice: 56500, mom: "+0.30%", yoy: "+7.20%", rentYield: 2.06, priceToIncome: 12.8, source: "台湾内政部实价登录", quality: "高铁特区/竹科外溢，每坪约65万新台币折算" },
  "台湾|新竹·东区": { price: 36800, newPrice: 48500, mom: "+0.20%", yoy: "+6.80%", rentYield: 2.12, priceToIncome: 11.6, source: "台湾内政部实价登录", quality: "关埔重划区/新竹科学园区折算" },
  "台湾|台中·西屯区": { price: 38600, newPrice: 51200, mom: "-0.30%", yoy: "+4.50%", rentYield: 2.14, priceToIncome: 14.4, source: "台湾内政部实价登录", quality: "台中七期/水湳经贸园区带动折算" },
  "台湾|台中·南屯区": { price: 35400, newPrice: 46500, mom: "-0.25%", yoy: "+4.20%", rentYield: 2.18, priceToIncome: 13.6, source: "台湾内政部实价登录", quality: "单元二/八期重划区折算人民币/㎡" },
  "台湾|台中·北屯区": { price: 32800, newPrice: 42800, mom: "-0.40%", yoy: "+4.00%", rentYield: 2.22, priceToIncome: 12.9, source: "台湾内政部实价登录", quality: "十四期/机捷特区折算人民币/㎡" },
  "台湾|高雄·鼓山区": { price: 28600, newPrice: 36800, mom: "-0.40%", yoy: "+4.40%", rentYield: 2.28, priceToIncome: 11.8, source: "台湾内政部实价登录", quality: "农十六/美术馆特区折算人民币/㎡" },
  "台湾|高雄·左营区": { price: 26800, newPrice: 34500, mom: "-0.30%", yoy: "+4.80%", rentYield: 2.34, priceToIncome: 11.2, source: "台湾内政部实价登录", quality: "高铁特区/台积电楠梓外溢折算" },
  "台湾|高雄·楠梓区": { price: 23400, newPrice: 29800, mom: "+0.10%", yoy: "+6.20%", rentYield: 2.40, priceToIncome: 10.4, source: "台湾内政部实价登录", quality: "楠梓科技产业园区带动折算" },
  "台湾|台南·东区": { price: 26200, newPrice: 33500, mom: "-0.35%", yoy: "+3.60%", rentYield: 2.28, priceToIncome: 11.4, source: "台湾内政部实价登录", quality: "平实重划区带动折算人民币/㎡" },
  "台湾|台南·善化区": { price: 23600, newPrice: 29500, mom: "+0.05%", yoy: "+4.50%", rentYield: 2.38, priceToIncome: 10.2, source: "台湾内政部实价登录", quality: "南部科学园区核心住宅折算" },

  // Zhongshan & Dongguan town-level & high-tech zone supplemental records
  "东莞|松山湖园区": { price: 38600, newPrice: 46500, mom: "+1.35%", yoy: "-2.10%", source: "公开挂牌与新盘汇总", quality: "松山湖高新区住宅挂牌均价" },
  "东莞|东莞生态园": { price: 17200, newPrice: 20500, mom: "-0.45%", yoy: "-3.80%", source: "公开挂牌汇总", quality: "生态园片区住宅参考均价" },
  "重庆|两江新区": { price: 12860, newPrice: 16400, mom: "-0.35%", yoy: "-3.90%", source: "公开挂牌汇总（2026新区口径）", quality: "原江北/渝北合并两江新区住宅均价" },
  "中山|小榄镇": { price: 7900, mom: "-0.89%", source: "房天下查房价", quality: "镇街二手房参考均价" },
  "中山|古镇镇": { price: 7819, mom: "-0.86%", source: "房天下查房价", quality: "镇街二手房参考均价" },
  "中山|南头镇": { price: 7121, mom: "-0.75%", source: "房天下查房价", quality: "镇街二手房参考均价" },
  "中山|黄圃镇": { price: 6087, mom: "-0.67%", source: "房天下查房价", quality: "镇街二手房参考均价" },
  "中山|民众镇": { price: 6284, mom: "+0.16%", source: "房天下查房价", quality: "镇街二手房参考均价" },
  "中山|民众街道": { price: 6284, mom: "+0.16%", source: "房天下查房价", quality: "镇街二手房参考均价" },
  "中山|阜沙镇": { price: 6017, mom: "-0.74%", source: "房天下查房价", quality: "镇街二手房参考均价" },
  "中山|大涌镇": { price: 5637, mom: "-0.67%", source: "房天下查房价", quality: "镇街二手房参考均价" },
  "中山|神湾镇": { price: 5869, mom: "+0.63%", source: "房天下查房价", quality: "镇街二手房参考均价" },
  "中山|五桂山街道": { price: 11720, mom: "-0.98%", source: "房天下查房价", quality: "镇街二手房参考均价" },
};

function specsForProvinces(provinceNames = PROVINCES.map(([name]) => name)) {
  const wanted = new Set(provinceNames.map(normalizeProvince));
  return PROVINCES.filter(([name]) => wanted.has(normalizeProvince(name))).map(([name, code]) => ({
    city: name,
    file: `data/geo/china/datav_${code}${MUNICIPALITIES.has(code) ? "" : "_full"}.json`,
  }));
}

function outlineSpecsForProvinces(provinceNames = PROVINCES.map(([name]) => name)) {
  const wanted = new Set(provinceNames.map(normalizeProvince));
  return PROVINCES.filter(([name]) => wanted.has(normalizeProvince(name))).map(([name, code]) => ({
    city: name,
    file: `data/geo/china/datav_${code}.json`,
  }));
}

function loadChinaFeatures(root, provinceNames) {
  return readGeoFeatures(root, specsForProvinces(provinceNames));
}

function loadChinaOutlines(root, provinceNames) {
  return readGeoFeatures(root, outlineSpecsForProvinces(provinceNames));
}

function createPriceLookup(data) {
  const byProvinceAndCity = new Map();
  const byCity = new Map();
  const duplicateCities = new Set();
  const cityRecords = data.cityRecords || {};

  const registerRecord = (province, city, record) => {
    const provinceKey = normalizeProvince(province);
    const cityKey = normalizeCity(city);
    if (!cityKey) return;
    byProvinceAndCity.set(`${provinceKey}|${cityKey}`, record);
    if (byCity.has(cityKey) && byCity.get(cityKey) !== record) duplicateCities.add(cityKey);
    else byCity.set(cityKey, record);
  };

  for (const row of data.cityData || []) {
    const stored = cityRecords[`${row.province}|${row.city}`] || cityRecords[row.city];
    const record = comparableRecord(stored || {
      price: row.price,
      mom: row.mom,
      yoy: row.yoy,
      source: row.source || "禧泰数据/中国房价行情",
      quality: row.quality || "城市住宅挂牌均价",
      resalePrice: row.price,
      resaleMom: row.mom,
      resaleYoy: row.yoy,
      resaleSource: row.source || "禧泰数据/中国房价行情",
      resaleQuality: row.quality || "城市住宅挂牌均价",
      newPrice: row.newPrice || null,
      dataLevel: "city",
      slug: row.slug,
    }, stored?.estimateRatio || data.metadata?.newToResaleRatio || DEFAULT_NEW_TO_RESALE_RATIO);
    if (row.slug) record.slug = row.slug;
    registerRecord(row.province, row.city, record);
  }

  for (const [key, raw] of Object.entries(cityRecords)) {
    const province = raw.province || (key.includes("|") ? key.split("|")[0] : "");
    const city = key.includes("|") ? key.split("|").pop() : key;
    const provinceKey = normalizeProvince(province);
    const cityKey = normalizeCity(city);
    if (provinceKey && cityKey && !byProvinceAndCity.has(`${provinceKey}|${cityKey}`)) {
      registerRecord(province, city, comparableRecord(raw, raw.estimateRatio || data.metadata?.newToResaleRatio || DEFAULT_NEW_TO_RESALE_RATIO));
    }
  }

  for (const item of SUPPLEMENTAL_CITY_RECORDS) {
    const provinceKey = normalizeProvince(item.province);
    const cityKey = normalizeCity(item.city);
    if (!byProvinceAndCity.has(`${provinceKey}|${cityKey}`)) {
      const record = comparableRecord({ ...item, dataLevel: "city" });
      registerRecord(item.province, item.city, record);
    }
  }

  return (province, city) => {
    const provinceKey = normalizeProvince(province);
    const cityKey = normalizeCity(city);
    return byProvinceAndCity.get(`${provinceKey}|${cityKey}`)
      || (!duplicateCities.has(cityKey) ? byCity.get(cityKey) : null)
      || null;
  };
}

function topicLinksHtml() {
  return TOPIC_MAPS.map(topic => `<a href="${topic.file}">${topic.title.replace("房价地图", "")}</a>`).join(" · ");
}

module.exports = {
  PROVINCES,
  MUNICIPALITIES,
  TOPIC_MAPS,
  SUPPLEMENTAL_CITY_RECORDS,
  SUPPLEMENTAL_DISTRICT_RECORDS,
  wgs84ToGcj02,
  transformGeometryToGcj02,
  normalizeProvince,
  normalizeCity,
  normalizeArea,
  comparableRecord,
  clampEstimateRatio,
  loadChinaFeatures,
  loadChinaOutlines,
  createPriceLookup,
  topicLinksHtml,
};

#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { transformGeometryToGcj02 } = require("../src/china_map_shared");

const ROOT = path.resolve(__dirname, "..");
const CHINA_GEO_DIR = path.join(ROOT, "data", "geo", "china");
const CITY_GEO_DIR = path.join(ROOT, "data", "geo", "city");

const TW_COUNTY_SIMP = {
  "臺北市": "台北市", "台北市": "台北市",
  "新北市": "新北市",
  "桃園縣": "桃园市", "桃園市": "桃园市",
  "臺中市": "台中市", "台中市": "台中市",
  "臺南市": "台南市", "台南市": "台南市",
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
  "臺東縣": "台东县", "台東縣": "台东县",
  "澎湖縣": "澎湖县",
};

const TRAD_CHAR_MAP = {
  "臺": "台", "區": "区", "縣": "县", "鄉": "乡", "鎮": "镇", "東": "东", "門": "门", "島": "岛", "嶼": "屿",
  "灣": "湾", "裡": "里", "裏": "里", "萬": "万", "華": "华", "義": "义", "內": "内", "南": "南", "頭": "头",
  "橋": "桥", "莊": "庄", "蘆": "芦", "鶯": "莺", "峽": "峡", "貢": "贡", "雙": "双", "烏": "乌", "來": "来",
  "樹": "树", "林": "林", "鶯": "莺", "瑞": "瑞", "芳": "芳", "貢": "贡", "寮": "寮", "萬": "万", "金": "金",
  "門": "门", "馬": "马", "連": "连", "江": "江", "龜": "龟", "觀": "观", "龍": "龙", "潭": "潭", "楊": "杨",
  "新": "新", "屋": "屋", "復": "复", "興": "兴", "關": "关", "西": "西", "芎": "芎", "寶": "宝", "峨": "峨",
  "銅": "铜", "鑼": "锣", "頭": "头", "份": "份", "後": "后", "龍": "龙", "通": "通", "霄": "霄", "苑": "苑",
  "卓": "卓", "蘭": "兰", "豐": "丰", "原": "原", "勢": "势", "清": "清", "棲": "栖", "梧": "梧", "神": "神",
  "岡": "冈", "霧": "雾", "峰": "峰", "鳥": "鸟", "肚": "肚", "線": "线", "伸": "伸", "福": "福", "鹽": "盐",
  "員": "员", "靖": "靖", "社": "社", "二": "二", "田": "田", "埤": "埤", "芳": "芳", "城": "城", "竹": "竹",
  "塘": "塘", "溪": "溪", "州": "州", "國": "国", "姓": "姓", "魚": "鱼", "愛": "爱", "名": "名", "間": "间",
  "集": "集", "鹿": "鹿", "谷": "谷", "中": "中", "寮": "寮", "崙": "仑", "背": "背", "麥": "麦", "褒": "褒",
  "忠": "忠", "四": "四", "湖": "湖", "口": "口", "長": "长", "濱": "滨", "成": "成", "功": "功", "池": "池",
  "關": "关", "山": "山", "卑": "卑", "麻": "麻", "太": "太", "達": "达", "仁": "仁", "綠": "绿", "蘭": "兰",
  "鳳": "凤", "壽": "寿", "豐": "丰", "光": "光", "瑞": "瑞", "穗": "穗", "富": "富", "秀": "秀", "萬": "万",
  "榮": "荣", "卓": "卓", "玉": "玉", "里": "里", "冬": "冬", "蘇": "苏", "澳": "澳", "礁": "礁", "壯": "壮",
  "圍": "围", "員": "员", "三": "三", "星": "星", "大": "大", "同": "同", "南": "南", "樸": "朴", "太": "太",
  "布": "布", "袋": "袋", "民": "民", "雄": "雄", "水": "水", "上": "上", "中": "中", "埔": "埔", "番": "番",
  "路": "路", "梅": "梅", "阿": "阿", "山": "山", "鹽": "盐", "營": "营", "柳": "柳", "白": "白", "河": "河",
  "麻": "麻", "豆": "豆", "下": "下", "六": "六", "甲": "甲", "官": "官", "將": "将", "軍": "军", "學": "学",
  "北": "北", "新": "新", "善": "善", "化": "化", "安": "安", "定": "定", "山": "山", "玉": "玉", "楠": "楠",
  "左": "左", "鎮": "镇", "仁": "仁", "德": "德", "歸": "归", "關": "关", "廟": "庙", "龍": "龙", "崎": "崎",
  "永": "永", "康": "康", "鼓": "鼓", "旗": "旗", "津": "津", "前": "前", "鎮": "镇", "小": "小", "港": "港",
  "楠": "楠", "梓": "梓", "鳥": "鸟", "松": "松", "橋": "桥", "燕": "燕", "巢": "巢", "田": "田", "阿": "阿",
  "蓮": "莲", "路": "路", "湖": "湖", "茄": "茄", "萣": "萣", "彌": "弥", "陀": "陀", "梓": "梓", "旗": "旗",
  "美": "美", "濃": "浓", "六": "六", "龜": "龟", "杉": "杉", "甲": "甲", "仙": "仙", "桃": "桃", "源": "源",
  "那": "那", "瑪": "玛", "夏": "夏", "茂": "茂", "潮": "潮", "萬": "万", "丹": "丹", "九": "九", "如": "如",
  "里": "里", "鹽": "盐", "高": "高", "樹": "树", "萬": "万", "巒": "峦", "竹": "竹", "內": "内", "麟": "麟",
  "洛": "洛", "新": "新", "園": "园", "崁": "崁", "頂": "顶", "林": "林", "邊": "边", "佳": "佳", "枋": "枋",
  "琉": "琉", "球": "球", "車": "车", "恆": "恒", "春": "春", "滿": "满", "霧": "雾", "瑪": "玛", "家": "家",
  "泰": "泰", "武": "武", "來": "来", "春": "春", "日": "日", "獅": "狮", "牡": "牡", "馬": "马", "公": "公",
  "西": "西", "嶼": "屿", "望": "望", "七": "七", "白": "白", "沙": "沙", "燒": "烧", "鶯": "莺",
};

function toSimp(str) {
  return String(str || "").replace(/./g, ch => TRAD_CHAR_MAP[ch] || ch);
}

function parsePolygonString(polyStr) {
  if (!polyStr || polyStr === "EMPTY") return null;
  const parts = polyStr.split(";").filter(Boolean);
  const coords = [];
  for (const part of parts) {
    const ring = [];
    for (const pair of part.split(",")) {
      const [lonS, latS] = pair.trim().split(/\s+/);
      const lon = Number(lonS);
      const lat = Number(latS);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        ring.push([lon, lat]);
      }
    }
    if (ring.length >= 3) {
      const first = ring[0], last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
      coords.push([ring]);
    }
  }
  if (!coords.length) return null;
  return coords.length === 1
    ? { type: "Polygon", coordinates: coords[0] }
    : { type: "MultiPolygon", coordinates: coords };
}

function padAdcode(id) {
  const s = String(id);
  return s.length < 6 ? s.padEnd(6, "0") : s;
}

async function main() {
  const okGeoPath = process.argv[2] || "C:\\Users\\herol\\.gemini\\antigravity\\brain\\65af7ad6-4969-42e1-ba8f-a74bed94c01e\\scratch\\areacity\\ok_geo.csv";
  if (!fs.existsSync(okGeoPath)) {
    throw new Error(`ok_geo.csv not found at ${okGeoPath}`);
  }

  fs.mkdirSync(CHINA_GEO_DIR, { recursive: true });
  fs.mkdirSync(CITY_GEO_DIR, { recursive: true });

  const provFeatures = new Map(); // prov2 -> Feature (deep=0)
  const provChildren = new Map(); // prov2 -> Feature[] (deep=1)
  const cityChildren = new Map(); // cityId -> Feature[] (deep=2)
  const muniDistricts = new Map(); // prov2 ("11","12","31","50") -> Feature[] (deep=2)

  const rl = readline.createInterface({ input: fs.createReadStream(okGeoPath, "utf8") });
  for await (const line of rl) {
    if (line.startsWith("\uFEFFid") || line.startsWith("id,")) continue;
    const firstMatch = line.match(/^(\d+),(\d+),(\d+),"([^"]+)","([^"]+)","([^"]*)"/);
    if (!firstMatch) continue;
    const [, id, pid, deep, name, extPath, centerStr] = firstMatch;
    const prov2 = id.slice(0, 2);
    // Keep existing 18-district HK & 8-parish Macau DataV files since ok_geo only has 1 outer polygon for HK/Macau
    if (prov2 === "81" || prov2 === "82") continue;

    const polyStr = line.slice(line.lastIndexOf(',"') + 2, -1);
    const geometry = parsePolygonString(polyStr);
    if (!geometry) continue;

    const [cLon, cLat] = centerStr ? centerStr.split(/\s+/).map(Number) : [NaN, NaN];
    const feature = {
      type: "Feature",
      properties: {
        adcode: Number(padAdcode(id)) || padAdcode(id),
        name,
        center: Number.isFinite(cLon) && Number.isFinite(cLat) ? [cLon, cLat] : undefined,
        level: deep === "0" ? "province" : deep === "1" ? "city" : "district",
      },
      geometry,
    };

    if (deep === "0") {
      provFeatures.set(prov2, feature);
    } else if (deep === "1") {
      if (!provChildren.has(prov2)) provChildren.set(prov2, []);
      provChildren.get(prov2).push({ ...feature, rawId: id });
    } else if (deep === "2") {
      if (["11", "12", "31", "50"].includes(prov2)) {
        if (!muniDistricts.has(prov2)) muniDistricts.set(prov2, []);
        muniDistricts.get(prov2).push(feature);
      } else {
        if (!cityChildren.has(pid)) cityChildren.set(pid, []);
        cityChildren.get(pid).push(feature);
      }
    }
  }

  // Write Mainland + Taiwan outer province & city GeoJSONs with 100% shared vertices
  let writtenProv = 0, writtenCity = 0;
  for (const [prov2, pFeat] of provFeatures.entries()) {
    const prov6 = padAdcode(prov2);
    fs.writeFileSync(
      path.join(CHINA_GEO_DIR, `datav_${prov6}.json`),
      `${JSON.stringify({ type: "FeatureCollection", features: [pFeat] })}\n`,
      "utf8",
    );
    writtenProv += 1;

    if (["11", "12", "31", "50"].includes(prov2)) {
      const dList = muniDistricts.get(prov2) || [];
      fs.writeFileSync(
        path.join(CHINA_GEO_DIR, `datav_${prov6}_full.json`),
        `${JSON.stringify({ type: "FeatureCollection", features: dList })}\n`,
        "utf8",
      );
      continue;
    }

    if (prov2 === "71") continue; // Handled below with Taiwan 350+ townships!

    const cList = provChildren.get(prov2) || [];
    const cleanCities = cList.map(({ rawId, ...rest }) => rest);
    fs.writeFileSync(
      path.join(CHINA_GEO_DIR, `datav_${prov6}_full.json`),
      `${JSON.stringify({ type: "FeatureCollection", features: cleanCities })}\n`,
      "utf8",
    );

    for (const cityItem of cList) {
      const city6 = padAdcode(cityItem.rawId);
      const subDists = cityChildren.get(cityItem.rawId) || [];
      // Skip self-only single district for Dongguan/Zhongshan/Danzhou/Jiayuguan so fallback/OSM logic handles cleanly
      if (subDists.length <= 1 && subDists[0]?.properties?.name === cityItem.properties.name) {
        const existing = path.join(CITY_GEO_DIR, `datav_${city6}_full.json`);
        if (fs.existsSync(existing)) fs.unlinkSync(existing);
        continue;
      }
      if (subDists.length >= 1) {
        fs.writeFileSync(
          path.join(CITY_GEO_DIR, `datav_${city6}_full.json`),
          `${JSON.stringify({ type: "FeatureCollection", features: subDists })}\n`,
          "utf8",
        );
        writtenCity += 1;
      }
    }
  }

  // Upgrade Taiwan: 20 counties at national/city zoom + 350+ townships/districts at detail zoom!
  console.log("Fetching Taiwan 350+ townships GeoJSON (twtown2010.3.json)...");
  const twTownRes = await fetch("https://raw.githubusercontent.com/ronnywang/twgeojson/master/twtown2010.3.json");
  if (twTownRes.ok) {
    const twTownRaw = await twTownRes.json();
    const twTownFeatures = [];
    for (const f of twTownRaw.features || []) {
      const origCounty = f.properties?.county || "";
      if (origCounty === "金門縣" || origCounty === "連江縣") continue; // Already in Fujian ok_geo!
      const countyName = TW_COUNTY_SIMP[origCounty] || toSimp(origCounty);
      const townName = toSimp(f.properties?.town || "");
      if (!countyName || !townName || !f.geometry) continue;
      twTownFeatures.push({
        type: "Feature",
        properties: {
          adcode: f.properties?.town_id || `${countyName}-${townName}`,
          parentCounty: countyName,
          name: `${countyName.replace(/[市县]$/, "")}·${townName}`,
          shortTown: townName,
          level: "district",
        },
        geometry: transformGeometryToGcj02(f.geometry),
      });
    }
    if (twTownFeatures.length > 300) {
      fs.writeFileSync(
        path.join(CHINA_GEO_DIR, "datav_710000_full.json"),
        `${JSON.stringify({ type: "FeatureCollection", features: twTownFeatures })}\n`,
        "utf8",
      );
      console.log(`Wrote Taiwan 350+ townships/districts: ${twTownFeatures.length} features`);
    }
  }

  console.log(`Watertight Geo rebuild complete: ${writtenProv} provinces, ${writtenCity} multi-district prefecture cities.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

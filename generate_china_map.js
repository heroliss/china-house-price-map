#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { createInteractiveMap, formatBeijingTime } = require("./src/simple_map_core");
const {
  TOPIC_MAPS,
  createPriceLookup,
  loadChinaFeatures,
  loadChinaOutlines,
  topicLinksHtml,
} = require("./src/china_map_shared");

const ROOT = path.resolve(__dirname);
const DATA_FILE = path.join(ROOT, "data", "china_house_prices.json");
const OUT_HTML = path.join(ROOT, "china.html");
const OUT_INDEX = path.join(ROOT, "index.html");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Missing ${path.relative(ROOT, DATA_FILE)}. Run scripts/update-china-data.js first.`);
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function main() {
  const data = loadData();
  const generatedAt = new Date().toISOString();
  const fetchedAt = formatBeijingTime(data.fetchedAt || data.updatedAt || generatedAt);
  const generatedAtText = formatBeijingTime(generatedAt);
  const features = loadChinaFeatures(ROOT);
  const outlines = loadChinaOutlines(ROOT);
  const getRecord = createPriceLookup(data);
  const matched = features.filter(feature => getRecord(feature.properties.city, feature.properties.name)).length;
  const topicLinks = topicLinksHtml();
  const html = createInteractiveMap({
    pageTitle: "全国房价交互地图",
    title: "全国房价地图",
    subtitle: "城市级总览；拖拽移动，滚轮或双指缩放，点击城市查看详细数据",
    updateLine: `数据：${data.metadata?.coverage || "全国城市"}；最近抓取：${fetchedAt}`,
    sideTitle: "全国城市数据",
    caption: "全国城市住宅挂牌均价总览；区县级数据放到重点经济圈专题逐步补充。",
    width: 1800,
    height: 1320,
    mapBox: { x: 56, y: 112, w: 1220, h: 1100 },
    pathSimplifyTolerance: 0.7,
    features,
    outlines,
    getRecord,
    navLinks: [
      { href: "index.html", label: "全国", active: true },
      { href: "gba.html", label: "大湾区" },
      { href: "jingjinji.html", label: "京津冀" },
    ],
    notesHtml: `
      <b>更新：</b>GitHub Actions 每周一 04:00（北京时间）尝试拉取全国城市排行；页面生成 ${generatedAtText}。<br>
      <b>覆盖：</b>当前地图区域 ${features.length} 个，已匹配房价 ${matched} 个；未匹配区域会保持浅灰。<br>
      <b>口径：</b>主数据为禧泰数据/中国房价行情城市住宅挂牌均价；香港、澳门使用补充估算并以不同口径标注。<br>
      <b>经济圈专题：</b>${topicLinks}。已有大湾区、京津冀为更细专题，其他经济圈先采用城市级专题页，后续可逐步补区县级数据。
    `,
  });
  fs.writeFileSync(OUT_HTML, html, "utf8");
  fs.writeFileSync(OUT_INDEX, html, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUT_HTML)} and ${path.relative(ROOT, OUT_INDEX)} (${features.length} regions, ${matched} priced)`);
}

main();

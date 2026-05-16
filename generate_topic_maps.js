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

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Missing ${path.relative(ROOT, DATA_FILE)}. Run scripts/update-china-data.js first.`);
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function buildTopic(data, topic) {
  const generatedAt = new Date().toISOString();
  const fetchedAt = formatBeijingTime(data.fetchedAt || data.updatedAt || generatedAt);
  const features = loadChinaFeatures(ROOT, topic.provinces);
  const outlines = loadChinaOutlines(ROOT, topic.provinces);
  const getRecord = createPriceLookup(data);
  const matched = features.filter(feature => getRecord(feature.properties.city, feature.properties.name)).length;
  const html = createInteractiveMap({
    pageTitle: topic.title.replace("地图", "交互地图"),
    title: topic.title,
    subtitle: "城市级专题；拖拽移动，滚轮或双指缩放，点击城市查看详细数据",
    updateLine: `数据：${data.metadata?.coverage || "全国城市"}；最近抓取：${fetchedAt}`,
    sideTitle: topic.sideTitle,
    caption: topic.caption,
    width: 1800,
    height: 1320,
    mapBox: topic.mapBox,
    pathSimplifyTolerance: 0.35,
    features,
    outlines,
    getRecord,
    navLinks: [
      { href: "index.html", label: "全国" },
      { href: "gba.html", label: "大湾区" },
      { href: "jingjinji.html", label: "京津冀" },
    ],
    notesHtml: `
      <b>专题：</b>${topic.notes}<br>
      <b>覆盖：</b>当前地图区域 ${features.length} 个，已匹配房价 ${matched} 个；未匹配区域保持浅灰。<br>
      <b>切换：</b>${topicLinksHtml()}。
    `,
  });
  const outFile = path.join(ROOT, topic.file);
  fs.writeFileSync(outFile, html, "utf8");
  console.log(`Wrote ${topic.file} (${features.length} regions, ${matched} priced)`);
}

function main() {
  const data = loadData();
  for (const topic of TOPIC_MAPS) buildTopic(data, topic);
}

main();

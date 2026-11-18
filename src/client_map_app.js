const METRIC_CONFIGS = {
  resale: {
    title: "二手住宅挂牌均价（万/㎡）",
    short: "二手挂牌",
    unit: "元/㎡",
    breaks: [0, 5500, 8000, 12000, 18000, 30000, 55000, 90000, 250000],
    colors: ["#2c5e8a", "#3f87b5", "#6bc0c4", "#bfe3b4", "#f5cf86", "#eb8a4c", "#c8413a", "#781530"],
    labels: ["<0.55万", "0.55-0.8", "0.8-1.2", "1.2-1.8", "1.8-3.0", "3.0-5.5", "5.5-9.0", "9.0万+"],
    getValue: r => r.resalePrice || r.price || null,
    fmtMap: v => fmtWan(v),
    fmtRow: v => fmt(v) + " 元/㎡",
  },
  newPrice: {
    title: "新建商品住宅均价（万/㎡）",
    short: "新房均价",
    unit: "元/㎡",
    breaks: [0, 5500, 8000, 12000, 18000, 30000, 55000, 90000, 250000],
    colors: ["#2c5e8a", "#3f87b5", "#6bc0c4", "#bfe3b4", "#f5cf86", "#eb8a4c", "#c8413a", "#781530"],
    labels: ["<0.55万", "0.55-0.8", "0.8-1.2", "1.2-1.8", "1.8-3.0", "3.0-5.5", "5.5-9.0", "9.0万+"],
    getValue: r => r.newPrice || null,
    fmtMap: v => fmtWan(v),
    fmtRow: v => fmt(v) + " 元/㎡",
  },
  yoy: {
    title: "住宅价格同比涨跌幅（%，红涨绿跌）",
    short: "同比涨跌",
    unit: "%",
    breaks: [-100, -14, -9, -4, -0.5, 0.5, 3.5, 8, 500],
    colors: ["#0b6b53", "#1c9675", "#68c2a6", "#bce4d6", "#dfe6ea", "#f8c3b6", "#e77962", "#c4382c"],
    labels: ["<-14%", "-14~-9%", "-9~-4%", "-4~-0.5%", "持平", "+0.5~3.5%", "+3.5~8%", ">+8%"],
    getValue: r => pctNum(r.yoy ?? r.mom),
    fmtMap: v => (v >= 0 ? "+" : "") + v.toFixed(1) + "%",
    fmtRow: v => (v >= 0 ? "+" : "") + v.toFixed(1) + "%",
  },
  rentYield: {
    title: "住宅年租金回报率 / 租售比（%）",
    short: "租金回报率",
    unit: "%",
    breaks: [0, 1.4, 1.75, 2.1, 2.45, 2.85, 3.3, 4.0, 25],
    colors: ["#b54838", "#dc8256", "#efc47b", "#dbe6a7", "#8ecfa8", "#48af8e", "#1d866c", "#0d5b48"],
    labels: ["<1.4%", "1.4-1.75", "1.75-2.1", "2.1-2.45", "2.45-2.85", "2.85-3.3", "3.3-4.0", "4.0%+"],
    getValue: r => (Number.isFinite(r.rentYield) ? r.rentYield : null),
    fmtMap: v => v.toFixed(2) + "%",
    fmtRow: v => v.toFixed(2) + "%",
  },
  priceToIncome: {
    title: "房价收入比（三口之家买90㎡所需年数）",
    short: "房价收入比",
    unit: "年",
    breaks: [0, 4.5, 6.0, 7.5, 9.5, 12.0, 15.0, 20.0, 80],
    colors: ["#1f7a68", "#48a68f", "#8ad1b8", "#d7ebc2", "#f5d087", "#eb8d4e", "#c9443b", "#781530"],
    labels: ["<4.5年", "4.5-6", "6-7.5", "7.5-9.5", "9.5-12", "12-15", "15-20", "20年+"],
    getValue: r => (Number.isFinite(r.priceToIncome) ? r.priceToIncome : null),
    fmtMap: v => v.toFixed(1) + "年",
    fmtRow: v => v.toFixed(1) + " 年",
  },
  drawdown: {
    title: "距近十年房价峰值回撤幅度（%，深绿超跌·红抗跌）",
    short: "峰值回撤",
    unit: "%",
    breaks: [-100, -40, -32, -25, -18, -12, -6, -1.5, 100],
    colors: ["#0b5e52", "#178573", "#4cb59f", "#9ad9c7", "#dce8e5", "#f5cf86", "#eb8a4c", "#c8413a"],
    labels: ["<-40%", "-40~-32%", "-32~-25%", "-25~-18%", "-18~-12%", "-12~-6%", "-6~-1.5%", "近峰值"],
    getValue: r => (Number.isFinite(r.drawdownPct) ? r.drawdownPct : (r.peakPrice && r.price && r.peakPrice >= r.price ? Number((((r.price - r.peakPrice) / r.peakPrice) * 100).toFixed(1)) : null)),
    fmtMap: v => (v > 0 ? "+" : "") + v.toFixed(1) + "%",
    fmtRow: v => (v > 0 ? "+" : "") + v.toFixed(1) + "%",
  },
  spread: {
    title: "一二手价差率（(新房-二手)/二手，蓝倒挂·橙溢价）",
    short: "一二手价差",
    unit: "%",
    breaks: [-100, -16, -8, -2, 3, 12, 22, 35, 300],
    colors: ["#1d5f8a", "#3a89b8", "#7ec4cf", "#d9e6eb", "#f4dca6", "#ee9f5c", "#d65a47", "#8a1c33"],
    labels: ["<-16%倒挂", "-16~-8%", "-8~-2%", "基本持平", "+3~12%", "+12~22%", "+22~35%", ">+35%溢价"],
    getValue: r => (r.newPrice && r.price ? Number((((r.newPrice - r.price) / r.price) * 100).toFixed(1)) : null),
    fmtMap: v => (v >= 0 ? "+" : "") + v.toFixed(1) + "%",
    fmtRow: v => (v >= 0 ? "+" : "") + v.toFixed(1) + "%",
  },
};

const TIMELINE_CUM_CFG = {
  title: "近12个月区间累计涨跌幅（%，红涨绿跌）",
  short: "区间涨跌",
  unit: "%",
  breaks: [-100, -12, -7, -3, -0.5, 0.5, 3, 7, 200],
  colors: ["#0b6b53", "#1c9675", "#68c2a6", "#bce4d6", "#dfe6ea", "#f8c3b6", "#e77962", "#c4382c"],
  labels: ["<-12%", "-12~-7%", "-7~-3%", "-3~-0.5%", "持平", "+0.5~3%", "+3~7%", ">+7%"],
  fmtMap: v => (v >= 0 ? "+" : "") + v.toFixed(1) + "%",
  fmtRow: v => (v >= 0 ? "+" : "") + v.toFixed(1) + "%",
};

let places = [...regions];
let placeById = new Map(places.map(p => [p.id, p]));
const svg = document.getElementById("map"), viewport = document.getElementById("viewport"), mapShell = document.querySelector(".mapShell");
const tileBuffers = [document.getElementById("tileLayerA"), document.getElementById("tileLayerB")];
const detailLayer = document.getElementById("detailLayer"), detailBoundaries = document.getElementById("detailBoundaries"), commuteRingLayer = document.getElementById("commuteRingLayer"), dynamicLabels = document.getElementById("dynamicLabels"), streetPlateLayer = document.getElementById("streetPlateLayer");
const overlayOpacityInput = document.getElementById("overlayOpacity"), overlayOpacityValue = document.getElementById("overlayOpacityValue");
const labelScaleInput = document.getElementById("labelScale"), labelScaleValue = document.getElementById("labelScaleValue");
const toggleLabelsButton = document.getElementById("toggleLabels"), toggleFineModeButton = document.getElementById("toggleFineMode"), toggleTilesButton = document.getElementById("toggleTiles"), toggleTimelineButton = document.getElementById("toggleTimeline"), toggleRadiusButton = document.getElementById("toggleRadius"), resetButton = document.getElementById("reset");
const hoverHighlight = document.getElementById("hoverHighlight"), selectedHighlight = document.getElementById("selectedHighlight"), selectedPulse = document.getElementById("selectedPulse");
const tooltip = document.getElementById("tooltip"), selected = document.getElementById("selected"), rows = document.getElementById("rows"), search = document.getElementById("search"), searchClear = document.getElementById("searchClear"), provFilter = document.getElementById("provFilter"), cityLabels = document.getElementById("cityLabels");
const legendTitleEl = document.getElementById("legendTitle"), legendDistBarEl = document.getElementById("legendDistBar"), swatchesEl = document.getElementById("swatches"), legendLabelsEl = document.getElementById("legendLabels"), clearBinFilterBtn = document.getElementById("clearBinFilter");
const scaleBadge = document.getElementById("scaleBadge"), toastEl = document.getElementById("toast");
const compareDock = document.getElementById("compareDock"), compareSheet = document.getElementById("compareSheet"), compareCountEl = document.getElementById("compareCount");
const timelineDock = document.getElementById("timelineDock"), tlPlayBtn = document.getElementById("tlPlayBtn"), tlPlayIcon = document.getElementById("tlPlayIcon"), tlMonthLabel = document.getElementById("tlMonthLabel"), tlSlider = document.getElementById("tlSlider"), tlModeBtn = document.getElementById("tlModeBtn");
const radiusPopover = document.getElementById("radiusPopover"), radiusAnchorInfo = document.getElementById("radiusAnchorInfo"), radiusRingStats = document.getElementById("radiusRingStats"), radiusArbitrage = document.getElementById("radiusArbitrage");
const kpiScopeTitleEl = document.getElementById("kpiScopeTitle"), toggleKpiViewportBtn = document.getElementById("toggleKpiViewport"), favScopeBtn = document.getElementById("favScopeBtn");

const basePathsByProv = new Map();
regions.forEach(r => {
  r.el = document.getElementById(r.id);
  if (r.el && r.province) {
    if (!basePathsByProv.has(r.province)) basePathsByProv.set(r.province, []);
    basePathsByProv.get(r.province).push(r.el);
  }
});
let regionEls = regions.map(r => r.el).filter(Boolean);
let labelItems = Array.from(document.querySelectorAll(".cityLabel, .detailLabel")).map(el => {
  const id = el.dataset.id || "";
  const place = id ? placeById.get(id) : null;
  const isCity = el.classList.contains("cityLabel");
  return {
    el,
    place,
    isCity,
    x: Number(el.getAttribute("x")),
    y: Number(el.getAttribute("y")),
    minScale: isCity ? 0 : Number(el.dataset.minScale || 1.8),
    priority: isCity ? 1e9 : (place?.price || 0) * (place?.inherited ? 0.35 : 1),
  };
});

const collator = new Intl.Collator("zh-Hans-CN");
const labelScaleBase = 1.38;
let state = { scale: 1, x: 0, y: 0 };
let metricMode = "resale", activeBin = -1, budgetActive = false, budgetMaxUnitPrice = Infinity;
let smartActive = false, smartProfile = "", kpiViewportLinked = true;
let timelineActive = false, tlMonths = [], tlIndex = 11, tlMode = "price", tlTimer = 0;
let commuteActive = false, commuteAnchor = null;
let favKeys = new Set();
try {
  const savedFavs = JSON.parse(localStorage.getItem("atlas-favs") || "[]");
  if (Array.isArray(savedFavs)) favKeys = new Set(savedFavs);
} catch (_) {}
let scopeMode = "all", sortMode = "metricDesc", activeId = null, labelsVisible = true, fineModeEnabled = true, tilesVisible = false;
let compareIds = [], compareOpen = false, calcArea = 90, calcDown = 0.15, calcRate = 3.0;
let trendsCache = null, trendsLoading = null, streetPlatesCache = null, streetPlatesLoading = null, plateSearchIndex = [], scsFocused = false;
let selectedPlateInfo = null;
let overlayOpacity = Number(overlayOpacityInput.value) / 100, labelScale = (Number(labelScaleInput.value) / 100) * labelScaleBase;
let dragging = false, last = null, activePointers = new Map(), pinch = null, tapCandidate = null;
let lastTileKey = "", pendingTileKey = "", tileLoadToken = 0, activeTileBuffer = 0;
let renderFrame = 0, renderForceLabels = false, renderImmediateTiles = false, renderDeferHeavy = false;
let tileUpdateTimer = 0, labelSettleTimer = 0, viewportSettleTimer = 0, searchDebounce = 0, tooltipPlaceId = "", viewMetricCache = null, moveAnimationToken = 0;
let detailDatasetEls = [], rowEls = [], underlaySealItems = [], coveredProvinces = new Set();
const loadedDetailSources = new Set(), loadingDetailSources = new Set();

function fmt(v) { return Number(v).toLocaleString("zh-CN"); }
function fmtWan(v) { const w = Number(v) / 10000; const d = w < 1 ? 2 : 1; return Number(w.toFixed(d)).toLocaleString("zh-CN", { maximumFractionDigits: d }) + "万"; }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])); }
function pctNum(raw) {
  if (raw === undefined || raw === null || raw === "" || String(raw).includes("--") || String(raw).includes("估算")) return null;
  const n = Number(String(raw).replace("%", "").replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function isInherited(r) { return !!(r && (r.inherited || r.dataLevel === "city-inherited" || String(r.quality || "").includes("用于区县底色"))); }
function isSupplement(r) { return !!(r && (r.dataLevel === "district-supplement" || (r.supplemental && !isInherited(r)))); }
function levelText(r) {
  if (!r?.price) return "待补充";
  if (isInherited(r)) return "沿用市均";
  if (isSupplement(r)) return "补充折算";
  if (r.dataLevel === "district" || String(r.quality || "").includes("区县")) return "区县实测";
  return "城市实测";
}
function levelClass(r) {
  if (isInherited(r)) return "levelBadge inherited";
  if (isSupplement(r)) return "levelBadge supplement";
  if (r.dataLevel === "district" || String(r.quality || "").includes("区县")) return "levelBadge district";
  return "levelBadge";
}

function favKeyOf(r) { return r ? `${r.city}|${r.name}` : ""; }
function isFav(r) { return !!(r && favKeys.has(favKeyOf(r))); }
function syncFavBadge() {
  if (favScopeBtn) favScopeBtn.textContent = favKeys.size ? `已收藏 (${favKeys.size})` : "已收藏";
}
function toggleFav(r) {
  if (!r) return;
  const k = favKeyOf(r);
  if (favKeys.has(k)) { favKeys.delete(k); showToast("已取消收藏"); }
  else { favKeys.add(k); showToast("已加入区域收藏夹"); }
  try { localStorage.setItem("atlas-favs", JSON.stringify([...favKeys])); } catch (_) {}
  syncFavBadge();
  if (activeId === r.id) renderDossier(r);
  if (scopeMode === "fav") renderRows(search.value);
}

function computeSmartScore(r, profile = smartProfile) {
  if (!r || !r.price || isInherited(r)) return null;
  const pti = Number.isFinite(r.priceToIncome) ? r.priceToIncome : 11;
  const yld = Number.isFinite(r.rentYield) ? r.rentYield : 2.1;
  const dd = Number.isFinite(r.drawdownPct) ? r.drawdownPct : -18;
  const yoyN = pctNum(r.yoy ?? r.mom) ?? -2;

  const sAfford = Math.max(0, Math.min(100, ((22 - pti) / 17.5) * 100));
  const sPrice = Math.max(0, Math.min(100, ((45000 - r.price) / 40000) * 100));
  const sYield = Math.max(0, Math.min(100, ((yld - 1.1) / 3.2) * 100));
  const sDeep = Math.max(0, Math.min(100, ((-dd - 5) / 38) * 100));
  const sStab = Math.max(0, Math.min(100, ((yoyN + 14) / 20) * 100));

  let raw = 50;
  if (profile === "afford") raw = sAfford * 0.55 + sPrice * 0.25 + sYield * 0.20;
  else if (profile === "yield") raw = sYield * 0.62 + sStab * 0.20 + sAfford * 0.18;
  else if (profile === "value") raw = sDeep * 0.52 + sYield * 0.30 + sAfford * 0.18;
  return Math.round(Math.max(10, Math.min(99, raw)));
}

function activeColorConfig() {
  if (timelineActive && tlMode === "cumChg") return TIMELINE_CUM_CFG;
  if (timelineActive) return metricMode === "newPrice" ? METRIC_CONFIGS.newPrice : METRIC_CONFIGS.resale;
  return METRIC_CONFIGS[metricMode];
}

function timelineValueForPlace(r) {
  if (!trendsCache || !tlMonths.length || !r?.trendKey) {
    return tlMode === "cumChg" ? null : (metricMode === "newPrice" ? r.newPrice : r.price);
  }
  const tObj = trendsCache[r.trendKey];
  if (!tObj?.series?.length) return tlMode === "cumChg" ? null : r.price;
  const targetM = tlMonths[tlIndex] || tlMonths[tlMonths.length - 1];
  const col = metricMode === "newPrice" ? 2 : 1;
  const firstRow = tObj.series.find(s => s[col]) || tObj.series.find(s => s[1]);
  const lastRow = [...tObj.series].reverse().find(s => s[col]) || [...tObj.series].reverse().find(s => s[1]);
  let curRow = tObj.series.find(s => s[0] === targetM);
  if (!curRow) {
    curRow = tObj.series.reduce((best, s) => (!best || Math.abs(s[0].localeCompare(targetM)) < Math.abs(best[0].localeCompare(targetM)) ? s : best), null);
  }
  const baseVal = col === 2 ? (r.newPrice || r.price) : r.price;
  const lastVal = lastRow?.[col] || lastRow?.[1];
  const curVal = curRow?.[col] || curRow?.[1];
  const firstVal = firstRow?.[col] || firstRow?.[1];
  if (!curVal) return null;
  if (tlMode === "cumChg") {
    if (!firstVal) return null;
    return Number((((curVal - firstVal) / firstVal) * 100).toFixed(1));
  }
  const sf = baseVal && lastVal ? baseVal / lastVal : 1;
  return Math.round(curVal * sf);
}

function effectiveMetricValue(r) {
  if (timelineActive) return timelineValueForPlace(r);
  return METRIC_CONFIGS[metricMode].getValue(r);
}

function binIndexFor(val, cfg) {
  if (val === null || val === undefined || !Number.isFinite(val)) return -1;
  const b = cfg.breaks;
  for (let i = 0; i < b.length - 1; i += 1) {
    if (val >= b[i] && val < b[i + 1]) return i;
  }
  return cfg.colors.length - 1;
}

function fillForPlace(r) {
  const cfg = activeColorConfig();
  const val = effectiveMetricValue(r);
  const idx = binIndexFor(val, cfg);
  if (idx < 0) return document.documentElement.dataset.theme === "dark" ? "#1a2d3d" : "#dce5ea";
  return cfg.colors[idx];
}

function mapLabelForPlace(r) {
  const cfg = activeColorConfig();
  const val = effectiveMetricValue(r);
  if (val === null || val === undefined || !Number.isFinite(val)) return r.label;
  return r.label + " " + cfg.fmtMap(val) + (!timelineActive && isInherited(r) && metricMode === "resale" ? " 市均" : "");
}

function placeMatchesStreetQuery(r, queryLower) {
  if (!queryLower || !streetPlatesCache || !r.sk) return false;
  const dp = streetPlatesCache.platesByDistrict?.[r.sk];
  if (dp?.plates?.some(p => p.n.toLowerCase().includes(queryLower))) return true;
  const os = streetPlatesCache.officialStreets?.[r.sk];
  if (os?.some(s => s.toLowerCase().includes(queryLower))) return true;
  return false;
}

function placeMatchesActiveFilters(r, queryLower, provVal) {
  if (provVal && (r.province || r.city) !== provVal && r.city !== provVal) return false;
  if (scopeMode === "city" && r.dataLevel !== "city") return false;
  if (scopeMode === "district" && (r.dataLevel === "city" || isInherited(r))) return false;
  if (scopeMode === "fav" && !isFav(r)) return false;
  if (queryLower && !`${r.province || ""}${r.city}${r.name}`.toLowerCase().includes(queryLower) && !placeMatchesStreetQuery(r, queryLower)) return false;
  if (budgetActive) {
    const unitPrice = metricMode === "newPrice" ? (r.newPrice || r.price) : r.price;
    if (!unitPrice || unitPrice > budgetMaxUnitPrice) return false;
  }
  if (smartActive && smartProfile) {
    const sc = computeSmartScore(r, smartProfile);
    if (sc === null || sc < 66) return false;
  }
  if (activeBin >= 0) {
    const cfg = activeColorConfig();
    if (binIndexFor(effectiveMetricValue(r), cfg) !== activeBin) return false;
  }
  return true;
}

function updateLegendDistBar(sampleList) {
  if (!legendDistBarEl) return;
  const cfg = activeColorConfig();
  const counts = new Array(cfg.colors.length).fill(0);
  const list = sampleList && sampleList.length ? sampleList : places.filter(r => r.dataLevel === "city");
  let total = 0;
  for (let i = 0; i < list.length; i += 1) {
    const b = binIndexFor(effectiveMetricValue(list[i]), cfg);
    if (b >= 0) { counts[b] += 1; total += 1; }
  }
  if (!total) { legendDistBarEl.innerHTML = ""; return; }
  legendDistBarEl.innerHTML = counts.map((c, i) => {
    if (!c) return "";
    const pct = ((c / total) * 100).toFixed(1);
    return '<span class="legendDistSeg" style="width:' + pct + '%;background:' + cfg.colors[i] + '" title="' + cfg.labels[i] + "：" + c + " 个 (" + pct + '%)"></span>';
  }).join("");
}

function refreshLegendUI() {
  const cfg = activeColorConfig();
  const tlSuffix = timelineActive && tlMonths[tlIndex] ? ` · ${tlMonths[tlIndex]}` : "";
  legendTitleEl.textContent = cfg.title + tlSuffix;
  swatchesEl.innerHTML = cfg.colors.map((c, i) =>
    '<button type="button" class="swatchBtn' + (activeBin === i ? " active" : (activeBin >= 0 ? " muted" : "")) + '" data-bin="' + i + '" style="background:' + c + '" title="点击筛选 ' + cfg.labels[i] + '"></button>'
  ).join("");
  legendLabelsEl.innerHTML = cfg.labels.map(l => "<span>" + escapeHtml(l) + "</span>").join("");
  clearBinFilterBtn.style.display = activeBin >= 0 ? "inline" : "none";
  swatchesEl.querySelectorAll(".swatchBtn").forEach(btn => {
    btn.onclick = () => {
      const b = Number(btn.dataset.bin);
      activeBin = activeBin === b ? -1 : b;
      refreshLegendUI();
      recolorAndFilterAll();
    };
  });
  updateLegendDistBar();
}

function recolorAndFilterAll() {
  places.forEach(r => {
    if (r.el) r.el.setAttribute("fill", fillForPlace(r));
  });
  underlaySealItems.forEach(u => {
    if (u.el) u.el.setAttribute("fill", fillForPlace(u.place));
  });
  labelItems.forEach(item => {
    if (!item.isCity && item.place) {
      item.el.textContent = mapLabelForPlace(item.place);
    }
  });
  renderRows(search.value);
  scheduleTransform({ forceLabels: true });
}

function populateProvinceSelect() {
  const provs = [...new Set(regions.map(r => r.province || r.city).filter(Boolean))];
  provFilter.innerHTML = '<option value="">全部省份 (' + provs.length + ")</option>" + provs.map(p => '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + "</option>").join("");
}

function medianNum(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function updateKPIs(filteredList) {
  const hasExplicitFilter = Boolean(search.value.trim() || provFilter.value || budgetActive || smartActive || activeBin >= 0 || scopeMode !== "all");
  let sample = [];
  let scopeLabel = "全国城市基准 (372城)";

  if (hasExplicitFilter && filteredList?.length) {
    sample = filteredList;
    scopeLabel = "当前筛选结果统计";
  } else if (kpiViewportLinked && state.scale >= 2.4) {
    const vb = visibleContentBounds();
    const wantDetail = fineModeEnabled && state.scale >= 2.8 && coveredProvinces.size > 0;
    sample = places.filter(r => {
      if (!r.price) return false;
      if (wantDetail && r.dataLevel === "city" && coveredProvinces.has(r.province)) return false;
      if (!wantDetail && r.dataLevel !== "city") return false;
      return r.cx >= vb.minX && r.cx <= vb.maxX && r.cy >= vb.minY && r.cy <= vb.maxY;
    });
    if (sample.length >= 2) scopeLabel = `当前视野实时统计 (${state.scale.toFixed(1)}x)`;
  }

  if (!sample.length) {
    sample = places.filter(r => r.dataLevel === "city" && r.price);
    scopeLabel = `全国城市基准 (${sample.length}城)`;
  }

  if (kpiScopeTitleEl) kpiScopeTitleEl.textContent = scopeLabel;
  if (toggleKpiViewportBtn) toggleKpiViewportBtn.textContent = kpiViewportLinked ? "视野联动: 开" : "锁定全国";

  const prices = sample.map(r => (timelineActive && tlMode === "price" ? effectiveMetricValue(r) : (metricMode === "newPrice" ? r.newPrice : r.price))).filter(Boolean);
  const yields = sample.map(r => r.rentYield).filter(Number.isFinite);
  const ptis = sample.map(r => r.priceToIncome).filter(Number.isFinite);
  const medP = medianNum(prices);
  const medY = medianNum(yields);
  const medI = medianNum(ptis);
  document.getElementById("kpiMedian").textContent = medP ? fmt(medP) + " 元" : "--";
  document.getElementById("kpiYield").textContent = medY ? medY.toFixed(2) + "%" : "--";
  document.getElementById("kpiPti").textContent = medI ? medI.toFixed(1) + " 年" : "--";
  document.getElementById("kpiCount").textContent = fmt(sample.length) + " 个";
  updateLegendDistBar(sample);
}

async function ensureTrendsLoaded() {
  if (trendsCache) return trendsCache;
  if (trendsLoading) return trendsLoading;
  trendsLoading = fetch(trendsUrl)
    .then(res => (res.ok ? res.json() : { trends: {} }))
    .then(json => { trendsCache = json.trends || {}; return trendsCache; })
    .catch(() => { trendsCache = {}; return trendsCache; });
  return trendsLoading;
}

function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function colorForResaleVal(v) {
  const cfg = METRIC_CONFIGS.resale;
  const idx = binIndexFor(v, cfg);
  return idx >= 0 ? cfg.colors[idx] : "#6bc0c4";
}

async function ensureStreetPlatesLoaded() {
  if (streetPlatesCache) return streetPlatesCache;
  if (streetPlatesLoading) return streetPlatesLoading;
  streetPlatesLoading = fetch(streetPlatesUrl)
    .then(res => (res.ok ? res.json() : { platesByDistrict: {}, officialStreets: {} }))
    .then(json => {
      streetPlatesCache = json || { platesByDistrict: {}, officialStreets: {} };
      const idx = [];
      for (const [sk, d] of Object.entries(streetPlatesCache.platesByDistrict || {})) {
        (d.plates || []).forEach((pl, pIdx) => {
          idx.push({
            sk,
            city: d.city,
            district: d.district,
            code: d.code,
            scaleFactor: d.scaleFactor || 1,
            pIdx,
            n: pl.n,
            u: pl.u,
            p: pl.p,
            rp: pl.rp,
            m: pl.m,
            searchKey: `${d.city}${d.district}${pl.n}`.toLowerCase(),
          });
        });
      }
      plateSearchIndex = idx;
      return streetPlatesCache;
    })
    .catch(() => {
      streetPlatesCache = { platesByDistrict: {}, officialStreets: {} };
      return streetPlatesCache;
    });
  return streetPlatesLoading;
}

function mountDistrictPlatesUI(r) {
  ensureStreetPlatesLoaded().then(cache => {
    if (activeId !== r.id) return;
    const mount = document.getElementById("plateMount");
    if (!mount) return;

    if (r.dataLevel === "city") {
      const shortCity = r.city.replace(/市$/, "");
      const cityPlates = [];
      for (const [sk, d] of Object.entries(cache.platesByDistrict || {})) {
        if (d.city === shortCity || r.name.includes(d.city)) {
          (d.plates || []).forEach((pl, pIdx) => {
            cityPlates.push({ sk, city: d.city, district: d.district, pIdx, ...pl });
          });
        }
      }
      cityPlates.sort((a, b) => b.p - a.p);
      const top = cityPlates.slice(0, 10);
      if (typeof renderBuyingAdviceUI === "function") renderBuyingAdviceUI(r);
      if (!top.length) {
        mount.innerHTML = '<div id="xqMount"></div>';
        if (typeof mountPlateCommunitiesUI === "function") mountPlateCommunitiesUI(r, null);
        return;
      }
      mount.innerHTML =
        '<div class="plateBox">' +
        '<div class="plateHead"><span>全市热门街道 / 商圈板块 Top ' + top.length + '</span><small>点击下钻至区县与街道</small></div>' +
        '<div class="plateGrid">' +
        top.map((pl, i) =>
          '<button type="button" class="plateChip" data-hit-idx="' + i + '">' +
          '<span class="plateChipName">' + escapeHtml(pl.district.replace(/[区县市]$/, "") + "·" + pl.n) + '</span>' +
          '<span class="plateChipVal">' + fmtWan(pl.p) + '</span></button>'
        ).join("") +
        '</div><div id="xqMount"></div></div>';
      mount.querySelectorAll(".plateChip").forEach(btn => {
        btn.onclick = () => flyToPlateHit(top[Number(btn.dataset.hitIdx)]);
      });
      if (typeof mountPlateCommunitiesUI === "function") mountPlateCommunitiesUI(r, null);
      return;
    }

    const sk = r.sk || "";
    const dp = sk ? cache.platesByDistrict?.[sk] : null;
    const offStreets = sk ? cache.officialStreets?.[sk] : null;
    let html = "";

    if (dp?.plates?.length) {
      const calNote = dp.scaleFactor && dp.scaleFactor !== 1 ? `同城标尺校准 ×${dp.scaleFactor}` : "商圈/街道挂牌参考";
      let bannerHtml = "";
      if (selectedPlateInfo && selectedPlateInfo.distId === r.id) {
        const sp = selectedPlateInfo;
        const diffPct = r.price ? (((sp.p - r.price) / r.price) * 100) : null;
        const diffTxt = diffPct !== null ? (diffPct >= 0 ? `较全区均价 +${diffPct.toFixed(1)}%` : `较全区均价 ${diffPct.toFixed(1)}%`) : "";
        const totWan = ((sp.p * calcArea) / 10000).toFixed(1);
        const mp = Math.round(calcMonthlyPayment(sp.p * calcArea * (1 - calcDown), calcRate, 30));
        bannerHtml =
          '<div class="plateSelectedBanner">' +
          '<strong>' + escapeHtml(sp.n) + ' 街道/板块：' + fmt(sp.p) + ' 元/㎡</strong>' +
          (sp.m ? ' <span style="color:var(--ink-secondary)">(' + escapeHtml(sp.m) + ')</span>' : '') +
          '<br><span>' + [diffTxt, `${calcArea}㎡约 ${totWan}万 · 月供 ¥${fmt(mp)}`, sp.rp ? `原采集值 ${fmt(sp.rp)} 元/㎡` : ""].filter(Boolean).join(" · ") + '</span>' +
          '</div>';
      }
      html +=
        '<div class="plateBox">' +
        '<div class="plateHead"><span>核心街道 / 商圈板块房价 (' + dp.plates.length + ')</span><small>' + escapeHtml(calNote) + '</small></div>' +
        bannerHtml +
        '<div class="plateGrid">' +
        dp.plates.map((pl, idx) =>
          '<button type="button" class="plateChip' + (selectedPlateInfo && selectedPlateInfo.distId === r.id && selectedPlateInfo.n === pl.n ? " active" : "") + '" data-pidx="' + idx + '">' +
          '<span class="plateChipName">' + escapeHtml(pl.n) + '</span>' +
          '<span class="plateChipVal">' + fmtWan(pl.p) + '</span></button>'
        ).join("") +
        '</div><div id="xqMount"></div></div>';
    } else {
      html += '<div id="xqMount"></div>';
    }

    if (offStreets?.length) {
      html +=
        '<details class="calcBox"' + (!dp?.plates?.length ? " open" : "") + '>' +
        '<summary><span>下辖行政街道 / 乡镇名录（共 ' + offStreets.length + ' 个）</span><span>展开 ▾</span></summary>' +
        '<div class="streetDirList">' + offStreets.map(s => '<span class="streetTag">' + escapeHtml(s) + '</span>').join("") + '</div>' +
        '</details>';
    }

    mount.innerHTML = html;
    mount.querySelectorAll(".plateChip[data-pidx]").forEach(btn => {
      btn.onclick = () => selectStreetPlate(r.id, Number(btn.dataset.pidx), false);
    });
    if (typeof mountPlateCommunitiesUI === "function") mountPlateCommunitiesUI(r, dp);
  });
}

function renderTrendSvg(trendObj, place) {
  if (!trendObj || !Array.isArray(trendObj.series) || trendObj.series.length < 2) return "";
  const series = trendObj.series;
  // Scale series slightly if displaying a district so curve reflects the city trajectory proportionally
  const lastResale = [...series].reverse().find(s => s[1])?.[1];
  const scaleFactor = place.dataLevel !== "city" && place.price && lastResale ? place.price / lastResale : 1;
  const ptsR = [], ptsN = [];
  const vals = [];
  series.forEach((row, idx) => {
    const r = row[1] ? Math.round(row[1] * scaleFactor) : null;
    const n = row[2] ? Math.round(row[2] * scaleFactor) : null;
    if (r) { ptsR.push({ idx, month: row[0], v: r }); vals.push(r); }
    if (n) { ptsN.push({ idx, month: row[0], v: n }); vals.push(n); }
  });
  if (vals.length < 2) return "";
  const minV = Math.min(...vals) * 0.96;
  const maxV = Math.max(...vals) * 1.04;
  const spanV = Math.max(100, maxV - minV);
  const W = 356, H = 88, padL = 6, padR = 6, padT = 10, padB = 18;
  const xFor = i => padL + (i / (series.length - 1)) * (W - padL - padR);
  const yFor = v => padT + (1 - (v - minV) / spanV) * (H - padT - padB);
  const poly = arr => arr.map((p, i) => (i ? "L" : "M") + xFor(p.idx).toFixed(1) + " " + yFor(p.v).toFixed(1)).join("");
  const rPath = ptsR.length >= 2 ? poly(ptsR) : "";
  const nPath = ptsN.length >= 2 ? poly(ptsN) : "";
  const areaPath = ptsR.length >= 2 ? `${rPath}L${xFor(ptsR[ptsR.length - 1].idx).toFixed(1)} ${H - padB}L${xFor(ptsR[0].idx).toFixed(1)} ${H - padB}Z` : "";
  const firstM = series[0][0].slice(2), midM = series[Math.floor(series.length / 2)][0].slice(2), lastM = series[series.length - 1][0].slice(2);
  const rawMax = Math.max(...vals), rawMin = Math.min(...vals);
  const isDirectDistTrend = String(place.trendKey || "").startsWith("dist:");
  const titleNote = isDirectDistTrend ? "本区近12个月实测走势" : (scaleFactor !== 1 ? "所属城市近12月走势折算" : "近12个月均价走势");
  return '<div class="trendBox">' +
    '<div class="trendHead"><strong style="font-size:12px">' + titleNote + ' <span style="font-weight:600;color:var(--ink-muted)">(' + fmtWan(rawMin) + '~' + fmtWan(rawMax) + ')</span></strong>' +
    '<div class="trendLegend"><span><i class="legendLine" style="background:#0c6e8c"></i>二手</span>' + (nPath ? '<span><i class="legendLine" style="background:#eb8a4c"></i>新房</span>' : '') + '</div></div>' +
    '<svg class="trendSvg" viewBox="0 0 ' + W + " " + H + '">' +
    '<defs><linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0c6e8c" stop-opacity="0.22"/><stop offset="100%" stop-color="#0c6e8c" stop-opacity="0.0"/></linearGradient></defs>' +
    '<line x1="' + padL + '" y1="' + padT + '" x2="' + (W - padR) + '" y2="' + padT + '" stroke="var(--line)" stroke-dasharray="2 2"/>' +
    '<line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '" stroke="var(--line)"/>' +
    (areaPath ? '<path d="' + areaPath + '" fill="url(#trendGrad)"/>' : '') +
    (nPath ? '<path d="' + nPath + '" fill="none" stroke="#eb8a4c" stroke-width="1.8" stroke-dasharray="3.5 2.5"/>' : '') +
    (rPath ? '<path d="' + rPath + '" fill="none" stroke="#0c6e8c" stroke-width="2.2"/>' : '') +
    ptsR.map(p => '<circle cx="' + xFor(p.idx).toFixed(1) + '" cy="' + yFor(p.v).toFixed(1) + '" r="2.6" fill="#0c6e8c"><title>' + p.month + " 二手：" + fmt(p.v) + ' 元/㎡</title></circle>').join("") +
    '<text x="' + padL + '" y="' + (H - 3) + '" font-size="11" fill="var(--ink-muted)">' + firstM + '</text>' +
    '<text x="' + (W / 2) + '" y="' + (H - 3) + '" font-size="11" text-anchor="middle" fill="var(--ink-muted)">' + midM + '</text>' +
    '<text x="' + (W - padR) + '" y="' + (H - 3) + '" font-size="11" text-anchor="end" fill="var(--ink-muted)">' + lastM + '</text>' +
    '</svg></div>';
}

function calcMonthlyPayment(principal, annualRatePct, years = 30) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (!r) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function renderEmptyDossier() {
  const hotNames = ["深圳", "上海", "北京", "广州", "杭州", "成都", "香港", "台北市"];
  const hotChips = hotNames.map(n => {
    const found = places.find(p => p.name.includes(n) || p.city.includes(n));
    return found ? '<button type="button" class="quickChip" data-pick="' + found.id + '">' + escapeHtml(n.replace(/市$/, "")) + "</button>" : "";
  }).join("");
  selected.innerHTML =
    '<div class="dossierCrumb">全国城市与区县房产分析台</div>' +
    '<div class="dossierTitle">点击地图区域或搜索列表</div>' +
    '<div class="sourceFoot">查看二手挂牌价、真实新房均价、同比/环比、年租金回报率、房价收入比、十年极值回撤及近12个月价格曲线，或将最多 4 个区域加入同屏对比。</div>' +
    '<div class="quickPick">' + hotChips + "</div>";
  selected.querySelectorAll(".quickChip").forEach(btn => {
    btn.onclick = () => locateRegion(btn.dataset.pick);
  });
}

function renderDossier(r) {
  if (!r) { renderEmptyDossier(); return; }
  const inCmp = compareIds.includes(r.id);
  const favOn = isFav(r);
  const momN = pctNum(r.mom);
  const yoyN = pctNum(r.yoy);
  const momCls = momN > 0 ? "pill up" : momN < 0 ? "pill down" : "pill neutral";
  const yoyCls = yoyN > 0 ? "pill up" : yoyN < 0 ? "pill down" : "pill neutral";
  const spreadPct = r.newPrice && r.price ? (((r.newPrice - r.price) / r.price) * 100) : null;
  const spreadTxt = spreadPct !== null
    ? (spreadPct < -1 ? `一二手倒挂 ${spreadPct.toFixed(1)}%` : `新房溢价 +${spreadPct.toFixed(1)}%`)
    : "";

  const totalWan = r.price ? ((r.price * calcArea) / 10000) : 0;
  const downWan = totalWan * calcDown;
  const loanYuan = Math.max(0, r.price * calcArea * (1 - calcDown));
  const monthlyPay = r.price ? Math.round(calcMonthlyPayment(loanYuan, calcRate, 30)) : 0;
  const estMonthlyRent = r.price && r.rentYield ? Math.round((r.price * calcArea * (r.rentYield / 100)) / 12) : null;

  let rangeHtml = "";
  if (r.peakPrice && r.troughPrice && r.peakPrice > r.troughPrice && r.price) {
    const pos = Math.max(2, Math.min(98, ((r.price - r.troughPrice) / (r.peakPrice - r.troughPrice)) * 100));
    const dd = r.drawdownPct ?? Number((((r.price - r.peakPrice) / r.peakPrice) * 100).toFixed(1));
    rangeHtml =
      '<div class="rangeBox">' +
      '<div class="rangeTop"><span>十年房价水位尺</span><strong class="down">距峰值 ' + (dd <= 0 ? dd : "+" + dd) + '%</strong></div>' +
      '<div class="rangeTrack"><span class="rangePin" style="left:' + pos.toFixed(1) + '%"></span></div>' +
      '<div class="rangeEnds"><span>低点 ' + fmt(r.troughPrice) + (r.troughDate ? " (" + r.troughDate + ")" : "") + '</span><span>峰值 ' + fmt(r.peakPrice) + (r.peakDate ? " (" + r.peakDate + ")" : "") + "</span></div>" +
      "</div>";
  }

  const crumb = [r.province, r.city !== r.province ? r.city : "", r.name !== r.city ? r.name : ""].filter(Boolean).join(" · ");
  const titleLabel = r.city === r.name ? r.name : `${r.city} ${r.name}`;

  selected.innerHTML =
    '<div class="dossierHead">' +
      '<div><div class="dossierCrumb">' + escapeHtml(crumb || r.city) + '</div>' +
      '<div class="dossierTitle">' + escapeHtml(titleLabel) + ' <span class="' + levelClass(r) + '">' + levelText(r) + "</span></div></div>" +
      '<div class="dossierActions">' +
        '<button type="button" class="miniBtn' + (favOn ? " active" : "") + '" id="dossierFavBtn" title="收藏或取消收藏该区域">' + (favOn ? "已收藏" : "收藏") + "</button>" +
        '<button type="button" class="miniBtn' + (inCmp ? " active" : "") + '" id="dossierCmpBtn">' + (inCmp ? "已加对比" : "＋对比") + "</button>" +
        '<button type="button" class="miniBtn" id="dossierShareBtn" title="复制该区域定位分享链接">分享</button>' +
      "</div>" +
    "</div>" +
    (r.price ? (
      '<div class="priceHeroRow">' +
        '<div class="priceHero">' + fmt(r.price) + '<small>元/㎡</small></div>' +
        '<div class="deltaGroup">' +
          '<span class="' + momCls + '">环比 ' + escapeHtml(r.mom || "--%") + '</span>' +
          (r.yoy ? '<span class="' + yoyCls + '">同比 ' + escapeHtml(r.yoy) + '</span>' : '') +
          (spreadTxt ? '<span class="pill neutral">' + spreadTxt + '</span>' : '') +
        "</div>" +
      "</div>" +
      '<div class="metricGrid4">' +
        '<div class="mCell"><span>二手挂牌均价</span><b>' + fmt(r.resalePrice || r.price) + ' 元/㎡</b><em>约 ' + fmtWan(r.resalePrice || r.price) + '/㎡</em></div>' +
        '<div class="mCell"><span>新房' + (r.newPriceEstimated ? "估算" : "参考") + '均价</span><b>' + (r.newPrice ? fmt(r.newPrice) + " 元/㎡" : "暂无") + '</b><em>' + (r.newYoy ? "同比 " + escapeHtml(r.newYoy) : (r.newPriceEstimated ? "配对比例估算" : "在售新盘口径")) + '</em></div>' +
        '<div class="mCell"><span>年租金回报率</span><b>' + (r.rentYield ? r.rentYield.toFixed(2) + "%" : "暂无") + '</b><em>' + (estMonthlyRent ? calcArea + "㎡月租约 ¥" + fmt(estMonthlyRent) : "住宅租售比") + '</em></div>' +
        '<div class="mCell"><span>房价收入比 (90㎡)</span><b>' + (r.priceToIncome ? r.priceToIncome.toFixed(1) + " 年" : "暂无") + '</b><em>' + (r.priceToWage ? "双职工工资比 " + r.priceToWage.toFixed(1) + " 年" : "家庭可支配收入口径") + '</em></div>' +
      "</div>" +
      rangeHtml +
      '<div id="plateMount"></div>' +
      '<div id="adviceMount"></div>' +
      '<div id="trendMount"></div>' +
      '<details class="calcBox">' +
        '<summary><span>购房首付 · 月供 · 租买比测算（' + calcArea + '㎡ 总价约 ' + totalWan.toFixed(1) + '万）</span><span>展开 ▾</span></summary>' +
        '<div class="calcControls">' +
          '<label>面积<select id="calcAreaSel">' + [60, 75, 90, 110, 130, 160].map(a => '<option value="' + a + '"' + (a === calcArea ? " selected" : "") + '>' + a + " ㎡</option>").join("") + '</select></label>' +
          '<label>首付比例<select id="calcDownSel">' + [[0.15, "15% 首套最低"], [0.2, "20% 常规"], [0.3, "30% 改善"], [0.5, "50% 高首付"]].map(([v, t]) => '<option value="' + v + '"' + (v === calcDown ? " selected" : "") + '>' + t + "</option>").join("") + '</select></label>' +
          '<label>年化利率<select id="calcRateSel">' + [[2.6, "2.6% 公积金"], [3.0, "3.0% 商贷LPR"], [3.2, "3.2% 商贷"], [3.5, "3.5% 二套"]].map(([v, t]) => '<option value="' + v + '"' + (v === calcRate ? " selected" : "") + '>' + t + "</option>").join("") + '</select></label>' +
        "</div>" +
        '<div class="calcResult">' +
          '<div class="calcVal"><span>预估首付</span><b>' + downWan.toFixed(1) + ' 万</b></div>' +
          '<div class="calcVal"><span>30年等额本息</span><b>¥' + fmt(monthlyPay) + '/月</b></div>' +
          '<div class="calcVal"><span>月供/月租比</span><b>' + (estMonthlyRent ? (monthlyPay / estMonthlyRent).toFixed(2) + "x" : "--") + '</b></div>' +
        "</div>" +
      "</details>" +
      '<div class="sourceFoot">口径：' + escapeHtml([r.quality, r.source, r.estimateBasis].filter(Boolean).join(" · ")) + "</div>"
    ) : '<div class="sourceFoot">该区域暂无独立公开商品住宅均价样本。</div>');

  document.getElementById("dossierFavBtn").onclick = () => toggleFav(r);
  document.getElementById("dossierCmpBtn").onclick = () => toggleCompare(r.id);
  document.getElementById("dossierShareBtn").onclick = () => copyShareLink(r);

  const areaSel = document.getElementById("calcAreaSel");
  if (areaSel) {
    areaSel.onchange = e => { calcArea = Number(e.target.value); renderDossier(r); };
    document.getElementById("calcDownSel").onchange = e => { calcDown = Number(e.target.value); renderDossier(r); };
    document.getElementById("calcRateSel").onchange = e => { calcRate = Number(e.target.value); renderDossier(r); };
  }

  mountDistrictPlatesUI(r);
  if (typeof renderBuyingAdviceUI === "function") renderBuyingAdviceUI(r);

  if (r.trendKey) {
    ensureTrendsLoaded().then(trends => {
      if (activeId !== r.id) return;
      const mount = document.getElementById("trendMount");
      if (mount && trends[r.trendKey]) mount.innerHTML = renderTrendSvg(trends[r.trendKey], r);
    });
  }
}

function toggleCompare(id) {
  const idx = compareIds.indexOf(id);
  if (idx >= 0) {
    compareIds.splice(idx, 1);
  } else {
    if (compareIds.length >= 4) {
      showToast("对比篮最多同时对比 4 个区域");
      return;
    }
    compareIds.push(id);
    showToast("已加入对比篮");
  }
  updateCompareUI();
  if (activeId === id) renderDossier(placeById.get(id));
  renderRows(search.value);
}

function renderCompareOverlaySvg(items, trends) {
  if (!trends || items.length < 2) return "";
  const palette = ["#0c6e8c", "#d97706", "#0c7b5e", "#7c3aed"];
  const seriesList = items.map((r, idx) => {
    const t = r.trendKey ? trends[r.trendKey] : null;
    if (!t?.series?.length) return null;
    const base = t.series.find(s => s[1])?.[1];
    if (!base) return null;
    const pts = t.series.map((s, i) => (s[1] ? { i, m: s[0], idxVal: Number(((s[1] / base) * 100).toFixed(1)) } : null)).filter(Boolean);
    return pts.length >= 2 ? { r, color: palette[idx % palette.length], pts, months: t.series.map(s => s[0]) } : null;
  }).filter(Boolean);
  if (seriesList.length < 2) return "";

  const allVals = seriesList.flatMap(s => s.pts.map(p => p.idxVal));
  const minV = Math.min(94, Math.min(...allVals) - 1.5);
  const maxV = Math.max(106, Math.max(...allVals) + 1.5);
  const span = Math.max(4, maxV - minV);
  const W = 760, H = 104, padL = 34, padR = 14, padT = 10, padB = 18;
  const maxLen = Math.max(...seriesList.map(s => s.months.length));
  const xFor = i => padL + (i / Math.max(1, maxLen - 1)) * (W - padL - padR);
  const yFor = v => padT + (1 - (v - minV) / span) * (H - padT - padB);
  const y100 = yFor(100);
  const refMonths = seriesList[0].months;

  return '<div class="trendBox" style="margin-bottom:10px">' +
    '<div class="trendHead"><strong style="font-size:12px">近12个月走势同图对比（首月基准 = 100）</strong>' +
    '<div class="trendLegend">' + seriesList.map(s => '<span><i class="legendLine" style="background:' + s.color + '"></i>' + escapeHtml(s.r.city === s.r.name ? s.r.name : s.r.city.replace(/市$/, "") + s.r.name) + ' (' + s.pts[s.pts.length - 1].idxVal + ')</span>').join("") + '</div></div>' +
    '<svg class="trendSvg" style="height:104px" viewBox="0 0 ' + W + " " + H + '">' +
    '<line x1="' + padL + '" y1="' + y100.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y100.toFixed(1) + '" stroke="var(--line-strong)" stroke-dasharray="3 3"/>' +
    '<text x="' + (padL - 4) + '" y="' + (y100 + 3).toFixed(1) + '" font-size="11" text-anchor="end" fill="var(--ink-muted)">100</text>' +
    seriesList.map(s => '<path d="' + s.pts.map((p, k) => (k ? "L" : "M") + xFor(p.i).toFixed(1) + " " + yFor(p.idxVal).toFixed(1)).join("") + '" fill="none" stroke="' + s.color + '" stroke-width="2.2"/>').join("") +
    '<text x="' + padL + '" y="' + (H - 3) + '" font-size="11" fill="var(--ink-muted)">' + refMonths[0].slice(2) + '</text>' +
    '<text x="' + ((W + padL) / 2) + '" y="' + (H - 3) + '" font-size="11" text-anchor="middle" fill="var(--ink-muted)">' + refMonths[Math.floor(refMonths.length / 2)].slice(2) + '</text>' +
    '<text x="' + (W - padR) + '" y="' + (H - 3) + '" font-size="11" text-anchor="end" fill="var(--ink-muted)">' + refMonths[refMonths.length - 1].slice(2) + '</text>' +
    '</svg></div>';
}

function updateCompareUI() {
  compareDock.classList.toggle("hasItems", compareIds.length > 0);
  compareCountEl.textContent = `对比篮 (${compareIds.length}/4)`;
  if (!compareIds.length) { compareOpen = false; compareSheet.classList.remove("open"); return; }
  if (!compareOpen) { compareSheet.classList.remove("open"); return; }
  compareSheet.classList.add("open");
  const items = compareIds.map(id => placeById.get(id)).filter(Boolean);
  const overlayChart = trendsCache ? renderCompareOverlaySvg(items, trendsCache) : '<div id="cmpTrendMount"></div>';
  compareSheet.innerHTML =
    overlayChart +
    '<table class="cmpTable">' +
      '<thead><tr><th>对比维度</th>' + items.map(r => '<td class="cmpHeadCell">' + escapeHtml(r.city === r.name ? r.name : r.city + " " + r.name) + ' <button type="button" class="linkBtn cmpRm" data-id="' + r.id + '">移除</button></td>').join("") + '</tr></thead>' +
      '<tbody>' +
        '<tr><th>二手挂牌均价</th>' + items.map(r => "<td><b>" + (r.price ? fmt(r.price) + " 元/㎡" : "--") + "</b></td>").join("") + "</tr>" +
        '<tr><th>新房参考均价</th>' + items.map(r => "<td>" + (r.newPrice ? fmt(r.newPrice) + " 元/㎡" + (r.newPriceEstimated ? " (估)" : "") : "--") + "</td>").join("") + "</tr>" +
        '<tr><th>环比 / 同比</th>' + items.map(r => "<td>" + escapeHtml(r.mom || "--") + (r.yoy ? " / " + escapeHtml(r.yoy) : "") + "</td>").join("") + "</tr>" +
        '<tr><th>距十年峰值</th>' + items.map(r => "<td>" + (r.drawdownPct !== undefined ? r.drawdownPct + "%" : "--") + "</td>").join("") + "</tr>" +
        '<tr><th>年租金回报率</th>' + items.map(r => "<td>" + (r.rentYield ? r.rentYield.toFixed(2) + "%" : "--") + "</td>").join("") + "</tr>" +
        '<tr><th>房价收入比</th>' + items.map(r => "<td>" + (r.priceToIncome ? r.priceToIncome.toFixed(1) + " 年" : "--") + "</td>").join("") + "</tr>" +
        '<tr><th>90㎡总价 / 月供</th>' + items.map(r => {
          if (!r.price) return "<td>--</td>";
          const tot = ((r.price * 90) / 10000).toFixed(1);
          const mp = Math.round(calcMonthlyPayment(r.price * 90 * 0.85, 3.0, 30));
          return `<td>${tot}万 / ¥${fmt(mp)}</td>`;
        }).join("") + "</tr>" +
      "</tbody></table>";
  compareSheet.querySelectorAll(".cmpRm").forEach(b => { b.onclick = () => toggleCompare(b.dataset.id); });
  if (!trendsCache && items.length >= 2) {
    ensureTrendsLoaded().then(tr => {
      const m = document.getElementById("cmpTrendMount");
      if (m && compareOpen) m.outerHTML = renderCompareOverlaySvg(items, tr);
    });
  }
}

function copyShareLink(r) {
  const url = new URL(location.href);
  url.searchParams.set("region", `${r.city}|${r.name}`);
  url.searchParams.set("metric", metricMode);
  const [lon, lat] = svgToLonLat(r.cx, r.cy);
  url.searchParams.set("lng", lon.toFixed(3));
  url.searchParams.set("lat", lat.toFixed(3));
  url.searchParams.set("z", Math.max(state.scale, 3.5).toFixed(2));
  history.replaceState(null, "", url.toString());
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url.toString()).then(() => showToast("已复制当前区域分享链接"));
  } else {
    showToast("地址栏已更新为分享链接");
  }
}

function applyOverlayOpacity() {
  document.documentElement.style.setProperty("--overlay-opacity", overlayOpacity.toFixed(2));
  overlayOpacityValue.textContent = Math.round(overlayOpacity * 100) + "%";
}
function applyLabelScale() {
  document.documentElement.style.setProperty("--label-scale", labelScale.toFixed(2));
  labelScaleValue.textContent = Math.round((labelScale / labelScaleBase) * 100) + "%";
}

function viewMetrics() {
  if (viewMetricCache) return viewMetricCache;
  const rect = svg.getBoundingClientRect(), box = svg.viewBox.baseVal;
  const scale = Math.min(rect.width / box.width, rect.height / box.height) || 1;
  const drawnW = box.width * scale, drawnH = box.height * scale;
  return (viewMetricCache = { box, scale, offsetX: rect.left + (rect.width - drawnW) / 2, offsetY: rect.top + (rect.height - drawnH) / 2 });
}
function clientToSvg(clientX, clientY) { const m = viewMetrics(); return { x: m.box.x + (clientX - m.offsetX) / m.scale, y: m.box.y + (clientY - m.offsetY) / m.scale }; }
function clientDeltaToSvg(dx, dy) { const m = viewMetrics(); return { x: dx / m.scale, y: dy / m.scale }; }
function svgToContent(point) { return { x: (point.x - state.x) / state.scale, y: (point.y - state.y) / state.scale }; }
function svgVisibleBox() { const box = svg.viewBox.baseVal; return { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height }; }
function svgCenterPoint() { const box = svg.viewBox.baseVal; return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; }
function invalidateViewMetrics() { viewMetricCache = null; }

function clampValue(v, min, max) { return Math.max(min, Math.min(max, v)); }
function clampPan() {
  const view = svgVisibleBox(), viewW = view.maxX - view.minX, viewH = view.maxY - view.minY;
  const padX = Math.min(90, viewW * 0.16), padY = Math.min(90, viewH * 0.16);
  const mapW = (mapBounds.maxX - mapBounds.minX) * state.scale, mapH = (mapBounds.maxY - mapBounds.minY) * state.scale;
  const centerX = (view.minX + view.maxX - (mapBounds.minX + mapBounds.maxX) * state.scale) / 2;
  const centerY = (view.minY + view.maxY - (mapBounds.minY + mapBounds.maxY) * state.scale) / 2;
  state.x = mapW <= viewW - padX * 2 ? centerX : clampValue(state.x, view.maxX - padX - mapBounds.maxX * state.scale, view.minX + padX - mapBounds.minX * state.scale);
  state.y = mapH <= viewH - padY * 2 ? centerY : clampValue(state.y, view.maxY - padY - mapBounds.maxY * state.scale, view.minY + padY - mapBounds.minY * state.scale);
}

function mercatorToLat(y) { return ((Math.atan(Math.exp((y * Math.PI) / 180)) * 2 - Math.PI / 2) * 180) / Math.PI; }
function svgToLonLat(x, y) {
  const lon = (x - projection.ox) / projection.scale + projection.minX;
  const mercY = projection.minY + (projection.oy - y) / projection.scale;
  return [lon, mercatorToLat(mercY)];
}
function projectLonLat(lon, lat) {
  const rad = (lat * Math.PI) / 180;
  const mercY = (Math.log(Math.tan(Math.PI / 4 + rad / 2)) * 180) / Math.PI;
  return { x: projection.ox + (lon - projection.minX) * projection.scale, y: projection.oy - (mercY - projection.minY) * projection.scale };
}
function lonToTileX(lon, z) { return Math.floor(((lon + 180) / 360) * Math.pow(2, z)); }
function latToTileY(lat, z) { const rad = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z)); }
function tileXToLon(x, z) { return (x / Math.pow(2, z)) * 360 - 180; }
function tileYToLat(y, z) { const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z); return (Math.atan(Math.sinh(n)) * 180) / Math.PI; }
function tileUrl(x, y, z) { const sub = ((x + y) % 4) + 1; return "https://webrd0" + sub + ".is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=" + x + "&y=" + y + "&z=" + z; }

function clearTiles() {
  tileLoadToken += 1; lastTileKey = ""; pendingTileKey = "";
  tileBuffers.forEach((b, i) => { b.innerHTML = ""; b.classList.toggle("active", i === activeTileBuffer); });
}
function swapTileBuffer(nextIndex, tileKey, markup) {
  const next = tileBuffers[nextIndex], prev = tileBuffers[activeTileBuffer];
  next.innerHTML = markup; next.classList.add("active"); prev.classList.remove("active");
  activeTileBuffer = nextIndex; lastTileKey = tileKey; pendingTileKey = "";
  setTimeout(() => { if (tileBuffers[activeTileBuffer] !== prev) prev.innerHTML = ""; }, 180);
}
function preloadTileUrls(urls, token, onReady) {
  if (!urls.length) { onReady(); return; }
  let done = false, loaded = 0;
  const finish = () => { if (done || token !== tileLoadToken) return; loaded += 1; if (loaded >= urls.length) { done = true; onReady(); } };
  urls.forEach(url => { const image = new Image(); image.decoding = "async"; image.onload = finish; image.onerror = finish; image.src = url; });
  setTimeout(() => { if (done || token !== tileLoadToken) return; done = true; onReady(); }, 1800);
}

function visibleContentBounds() {
  const view = svgVisibleBox();
  const corners = [{ x: view.minX, y: view.minY }, { x: view.maxX, y: view.minY }, { x: view.maxX, y: view.maxY }, { x: view.minX, y: view.maxY }].map(svgToContent);
  return { minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)), minY: Math.min(...corners.map(p => p.y)), maxY: Math.max(...corners.map(p => p.y)) };
}
function intersects(a, b) { return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY; }

function updateTiles() {
  if (!tilesVisible) { if (lastTileKey || pendingTileKey) clearTiles(); return; }
  const b = visibleContentBounds(), nw = svgToLonLat(b.minX, b.minY), se = svgToLonLat(b.maxX, b.maxY);
  const west = Math.max(-180, Math.min(nw[0], se[0])), east = Math.min(180, Math.max(nw[0], se[0]));
  const north = Math.max(-85, Math.min(85, Math.max(nw[1], se[1]))), south = Math.max(-85, Math.min(85, Math.min(nw[1], se[1])));
  let z = Math.max(4, Math.min(18, Math.round(4.6 + Math.log2(state.scale))));
  let x0 = lonToTileX(west, z), x1 = lonToTileX(east, z), y0 = latToTileY(north, z), y1 = latToTileY(south, z);
  while ((x1 - x0 + 1) * (y1 - y0 + 1) > 72 && z > 4) { z -= 1; x0 = lonToTileX(west, z); x1 = lonToTileX(east, z); y0 = latToTileY(north, z); y1 = latToTileY(south, z); }
  const n = Math.pow(2, z), xStart = Math.max(0, x0 - 1), xEnd = Math.min(n - 1, x1 + 1), yStart = Math.max(0, y0 - 1), yEnd = Math.min(n - 1, y1 + 1);
  const tileKey = [z, xStart, xEnd, yStart, yEnd].join(":");
  if (tileKey === lastTileKey || tileKey === pendingTileKey) return;
  pendingTileKey = tileKey;
  const token = ++tileLoadToken, tiles = [], urls = [];
  for (let x = xStart; x <= xEnd; x++) {
    for (let y = yStart; y <= yEnd; y++) {
      const p1 = projectLonLat(tileXToLon(x, z), tileYToLat(y, z)), p2 = projectLonLat(tileXToLon(x + 1, z), tileYToLat(y + 1, z)), url = tileUrl(x, y, z);
      urls.push(url);
      tiles.push('<image class="tileImage" href="' + url + '" x="' + p1.x.toFixed(2) + '" y="' + p1.y.toFixed(2) + '" width="' + (p2.x - p1.x + 0.45).toFixed(2) + '" height="' + (p2.y - p1.y + 0.45).toFixed(2) + '" preserveAspectRatio="none"></image>');
    }
  }
  const markup = tiles.join(""), nextIndex = activeTileBuffer ? 0 : 1;
  preloadTileUrls(urls, token, () => {
    if (token !== tileLoadToken || pendingTileKey !== tileKey || !tilesVisible) return;
    requestAnimationFrame(() => swapTileBuffer(nextIndex, tileKey, markup));
  });
}
function requestTileUpdate(immediate = false) {
  if (tileUpdateTimer) { clearTimeout(tileUpdateTimer); tileUpdateTimer = 0; }
  if (!tilesVisible || immediate) { updateTiles(); return; }
  tileUpdateTimer = setTimeout(() => { tileUpdateTimer = 0; updateTiles(); }, 90);
}

function renderStreetPlateCapsules(vb, inverse, placedBoxes) {
  if (!streetPlateLayer) return;
  if (!labelsVisible || !fineModeEnabled || state.scale < 9.0) {
    if (streetPlateLayer.innerHTML) streetPlateLayer.innerHTML = "";
    return;
  }
  if (!streetPlatesCache) {
    ensureStreetPlatesLoaded().then(() => scheduleTransform({ forceLabels: true }));
    return;
  }

  const maxPerDist = state.scale >= 22 ? 6 : state.scale >= 14 ? 4 : 2;
  const visibleDists = [];
  for (let i = 0; i < places.length; i += 1) {
    const r = places[i];
    if (!r.sk || r.dataLevel === "city") continue;
    if (r.cx < vb.minX || r.cx > vb.maxX || r.cy < vb.minY || r.cy > vb.maxY) continue;
    if (!r.el || r.el.closest(".hidden")) continue;
    const dp = streetPlatesCache.platesByDistrict?.[r.sk];
    if (dp?.plates?.length) visibleDists.push({ r, dp });
  }
  if (!visibleDists.length) {
    if (streetPlateLayer.innerHTML) streetPlateLayer.innerHTML = "";
    return;
  }

  // Prioritize active district first, then higher-priced urban districts
  visibleDists.sort((a, b) => (a.r.id === activeId ? -1 : b.r.id === activeId ? 1 : (b.r.price || 0) - (a.r.price || 0)));

  const capScale = inverse * Math.max(0.88, Math.min(1.25, labelScale / labelScaleBase));
  const nodesHtml = [];

  for (let dIdx = 0; dIdx < visibleDists.length; dIdx += 1) {
    const { r, dp } = visibleDists[dIdx];
    const limit = r.id === activeId ? Math.min(8, dp.plates.length) : Math.min(maxPerDist, dp.plates.length);
    const seed = (strHash(r.sk) % 12) * 0.26;
    const span = r.span || 3.2;

    for (let k = 0; k < limit; k += 1) {
      const pl = dp.plates[k];
      const theta = seed + (k + 1) * 2.39996;
      const rad = Math.min(span * (0.20 + 0.09 * Math.sqrt(k + 1)), Math.max(0.14, (25 + k * 13) / state.scale));
      const px = r.cx + Math.cos(theta) * rad;
      const py = r.cy + Math.sin(theta) * rad * 0.78;
      if (px < vb.minX || px > vb.maxX || py < vb.minY || py > vb.maxY) continue;

      const sx = state.x + px * state.scale;
      const sy = state.y + py * state.scale;
      const txt = `${pl.n} ${fmtWan(pl.p)}`;
      const capW = Math.round(txt.length * 8.4 + 18);
      const halfW = (capW * (capScale * state.scale)) / 2 + 2;
      const halfH = (19 * (capScale * state.scale)) / 2 + 2;
      const box = { minX: sx - halfW, maxX: sx + halfW, minY: sy - halfH, maxY: sy + halfH };

      const isSelectedPlate = Boolean(selectedPlateInfo && selectedPlateInfo.distId === r.id && selectedPlateInfo.n === pl.n);
      let collided = false;
      for (let j = 0; j < placedBoxes.length; j += 1) {
        const b = placedBoxes[j];
        if (box.minX < b.maxX && box.maxX > b.minX && box.minY < b.maxY && box.maxY > b.minY) {
          collided = true;
          break;
        }
      }
      if (collided && !isSelectedPlate) continue;
      placedBoxes.push(box);

      const dotColor = colorForResaleVal(pl.p);
      nodesHtml.push(
        '<g class="plateNode' + (isSelectedPlate ? " active" : "") + '" data-dist-id="' + r.id + '" data-plate-idx="' + k + '" transform="translate(' + px.toFixed(2) + " " + py.toFixed(2) + ") scale(" + capScale.toFixed(5) + ')">' +
        '<rect class="plateBg" x="' + (-capW / 2).toFixed(1) + '" y="-9.5" width="' + capW + '" height="19" rx="5"></rect>' +
        '<circle cx="' + (-capW / 2 + 7.5).toFixed(1) + '" cy="0" r="3.2" fill="' + dotColor + '"></circle>' +
        '<text class="plateTxt" x="' + (-capW / 2 + 13.5).toFixed(1) + '" y="3.8">' + escapeHtml(txt) + "</text></g>"
      );
    }
  }
  streetPlateLayer.innerHTML = nodesHtml.join("");
}

// Fast viewport-culled & collision-decluttered label layout
function updateVisibleLabels() {
  toggleLabelsButton.classList.toggle("active", labelsVisible);
  if (toggleFineModeButton) toggleFineModeButton.classList.toggle("active", fineModeEnabled);
  if (!labelsVisible) {
    cityLabels.style.display = "none";
    labelItems.forEach(item => { if (!item.isCity) item.el.style.display = "none"; });
    if (streetPlateLayer) streetPlateLayer.innerHTML = "";
    return;
  }
  cityLabels.style.display = state.scale < 2.6 ? "" : "none";
  const vb = visibleContentBounds();
  const inverse = 1 / state.scale;
  const candidates = [];

  for (let i = 0; i < labelItems.length; i += 1) {
    const item = labelItems[i];
    if (item.isCity) {
      if (state.scale < 2.6) {
        item.el.setAttribute("transform", `translate(${item.x} ${item.y}) scale(${inverse}) translate(${-item.x} ${-item.y})`);
      }
      continue;
    }
    // Hide base city label once detail district layer is visible over that province
    if (!item.isDetail && fineModeEnabled && coveredProvinces.has(item.place?.province) && state.scale >= 4.4) {
      item.el.style.display = "none";
      continue;
    }
    if (state.scale < item.minScale || item.x < vb.minX || item.x > vb.maxX || item.y < vb.minY || item.y > vb.maxY) {
      if (item.el.style.display !== "none") item.el.style.display = "none";
      continue;
    }
    if (item.el.closest(".hidden")) continue;
    candidates.push(item);
  }

  candidates.sort((a, b) => b.priority - a.priority);
  const placedBoxes = [];
  const fontPx = 8.4 * labelScale;

  for (let i = 0; i < candidates.length; i += 1) {
    const item = candidates[i];
    const sx = state.x + item.x * state.scale;
    const sy = state.y + item.y * state.scale;
    const textLen = (item.el.textContent || "").length;
    const halfW = (textLen * fontPx * 0.42) + 4;
    const halfH = fontPx * 0.68 + 2;
    const box = { minX: sx - halfW, maxX: sx + halfW, minY: sy - halfH, maxY: sy + halfH };
    let collided = false;
    for (let j = 0; j < placedBoxes.length; j += 1) {
      const b = placedBoxes[j];
      if (box.minX < b.maxX && box.maxX > b.minX && box.minY < b.maxY && box.maxY > b.minY) {
        collided = true;
        break;
      }
    }
    if (collided && item.place?.id !== activeId) {
      item.el.style.display = "none";
    } else {
      placedBoxes.push(box);
      item.el.setAttribute("transform", `translate(${item.x} ${item.y}) scale(${inverse}) translate(${-item.x} ${-item.y})`);
      item.el.style.display = "block";
    }
  }

  renderStreetPlateCapsules(vb, inverse, placedBoxes);
}

function updateScaleBadge() {
  if (loadingDetailSources.size > 0) {
    scaleBadge.textContent = `正在加载区县细节 (${loadingDetailSources.size})...`;
  } else if (fineModeEnabled && state.scale >= 20 && typeof activePlateCommunities !== "undefined" && activePlateCommunities.length) {
    scaleBadge.textContent = `小区级细化 (${state.scale.toFixed(1)}x) · 当前板块 ${activePlateCommunities.length} 个代表小区`;
  } else if (fineModeEnabled && state.scale >= 9.0) {
    scaleBadge.textContent = `区县 + 街道板块视图 (${state.scale.toFixed(1)}x) · 已载入 ${loadedDetailSources.size} 省`;
  } else if (fineModeEnabled && state.scale >= 2.8) {
    scaleBadge.textContent = `区县级细化 (${state.scale.toFixed(1)}x) · 已载入 ${loadedDetailSources.size} 省`;
  } else {
    scaleBadge.textContent = `城市级视图 (${state.scale.toFixed(1)}x) · 放大至 2.8x 自动展开区县`;
  }
}

function haversineKm(lon1, lat1, lon2, lat2) {
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderCommuteOverlay(hoverSvgPt = null) {
  if (!commuteRingLayer) return;
  if (!commuteActive || !commuteAnchor) {
    if (commuteRingLayer.innerHTML) commuteRingLayer.innerHTML = "";
    return;
  }
  const { lon, lat, x, y } = commuteAnchor;
  const inv = 1 / state.scale;
  const pEast = projectLonLat(lon + 1 / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))), lat);
  const pNorth = projectLonLat(lon, lat + 1 / 111.12);
  const ux = Math.abs(pEast.x - x), uy = Math.abs(pNorth.y - y);

  let html = [50, 30, 15].map(km => {
    const rx = (ux * km).toFixed(2), ry = (uy * km).toFixed(2), ly = (y - uy * km).toFixed(2);
    return '<ellipse class="commuteRing" cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" rx="' + rx + '" ry="' + ry + '"></ellipse>' +
      '<text class="commuteRingLabel" x="' + x.toFixed(2) + '" y="' + ly + '" text-anchor="middle" transform="translate(' + x.toFixed(2) + " " + ly + ") scale(" + inv.toFixed(5) + ") translate(" + (-x).toFixed(2) + " " + (-Number(ly)).toFixed(2) + ')">' + km + "km</text>";
  }).join("");
  html += '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + (5.5 * inv).toFixed(3) + '" fill="var(--brand)" stroke="#fff" stroke-width="' + (1.8 * inv).toFixed(3) + '"></circle>';

  if (hoverSvgPt) {
    const [hLon, hLat] = svgToLonLat(hoverSvgPt.x, hoverSvgPt.y);
    const distKm = haversineKm(lon, lat, hLon, hLat);
    if (distKm >= 0.8 && distKm <= 280) {
      const mx = (x + hoverSvgPt.x) / 2, my = (y + hoverSvgPt.y) / 2, txt = `${distKm.toFixed(1)} km`;
      const bw = Math.round(txt.length * 7.2 + 14);
      html += '<line class="rulerLine" x1="' + x.toFixed(2) + '" y1="' + y.toFixed(2) + '" x2="' + hoverSvgPt.x.toFixed(2) + '" y2="' + hoverSvgPt.y.toFixed(2) + '"></line>' +
        '<g transform="translate(' + mx.toFixed(2) + " " + my.toFixed(2) + ") scale(" + inv.toFixed(5) + ')"><rect x="' + (-bw / 2).toFixed(1) + '" y="-9.5" width="' + bw + '" height="19" rx="9.5" fill="var(--ink)" opacity="0.9"></rect><text class="rulerBadge" x="0" y="4" text-anchor="middle">' + txt + "</text></g>";
    }
  }
  commuteRingLayer.innerHTML = html;
}

function applyTransform(options = {}) {
  clampPan();
  viewport.setAttribute("transform", "translate(" + state.x + " " + state.y + ") scale(" + state.scale + ")");
  if (options.deferHeavy) return;
  updateDetailVisibility();
  if (!options.skipLoadDetails) maybeLoadDetails();
  updateVisibleLabels();
  if (typeof renderCommunityPins === "function") renderCommunityPins();
  renderCommuteOverlay();
  updateScaleBadge();
  if (kpiViewportLinked) updateKPIs();
  if (tilesVisible || lastTileKey) requestTileUpdate(!!options.immediateTiles);
}

function scheduleTransform(options = {}) {
  renderForceLabels = renderForceLabels || !!options.forceLabels;
  renderImmediateTiles = renderImmediateTiles || !!options.immediateTiles;
  renderDeferHeavy = renderDeferHeavy || !!options.deferHeavy;
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0;
    const forceLabels = renderForceLabels, immediateTiles = renderImmediateTiles, deferHeavy = renderDeferHeavy && !renderForceLabels && !renderImmediateTiles;
    renderForceLabels = false; renderImmediateTiles = false; renderDeferHeavy = false;
    applyTransform({ forceLabels, immediateTiles, deferHeavy });
  });
}
function queueLabelSettle() { if (labelSettleTimer) clearTimeout(labelSettleTimer); labelSettleTimer = setTimeout(() => { labelSettleTimer = 0; scheduleTransform({ forceLabels: true }); }, 110); }
function setMoving(active) { mapShell.classList.toggle("isMoving", !!active); }
function finishViewportMove() { if (viewportSettleTimer) { clearTimeout(viewportSettleTimer); viewportSettleTimer = 0; } setMoving(false); scheduleTransform({ forceLabels: true, immediateTiles: true }); }
function queueViewportSettle(delay = 130) { setMoving(true); if (viewportSettleTimer) clearTimeout(viewportSettleTimer); viewportSettleTimer = setTimeout(() => { viewportSettleTimer = 0; finishViewportMove(); }, delay); }

function zoom(factor, clientX, clientY) {
  const rect = svg.getBoundingClientRect(), anchor = clientToSvg(clientX ?? (rect.left + rect.width / 2), clientY ?? (rect.top + rect.height / 2));
  const content = svgToContent(anchor), nextScale = Math.max(minScale, Math.min(maxScale, state.scale * factor));
  state.x = anchor.x - content.x * nextScale;
  state.y = anchor.y - content.y * nextScale;
  state.scale = nextScale;
  scheduleTransform({ deferHeavy: true });
  queueLabelSettle();
  queueViewportSettle();
}
function cancelMoveAnimation() { moveAnimationToken += 1; }
function animateToState(target, duration = 560) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduced) {
    state.scale = target.scale; state.x = target.x; state.y = target.y;
    finishViewportMove();
    return;
  }
  const token = ++moveAnimationToken, start = { scale: state.scale, x: state.x, y: state.y }, startTime = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  setMoving(true);
  function step(now) {
    if (token !== moveAnimationToken) return;
    const p = Math.min(1, (now - startTime) / duration), e = ease(p);
    state.scale = start.scale + (target.scale - start.scale) * e;
    state.x = start.x + (target.x - start.x) * e;
    state.y = start.y + (target.y - start.y) * e;
    scheduleTransform({ deferHeavy: p < 1 });
    if (p < 1) requestAnimationFrame(step);
    else { state.scale = target.scale; state.x = target.x; state.y = target.y; finishViewportMove(); }
  }
  requestAnimationFrame(step);
}
function animateFocusContentPoint(x, y, scale) {
  const center = svgCenterPoint(), targetScale = Math.max(minScale, Math.min(maxScale, scale));
  animateToState({ scale: targetScale, x: center.x - x * targetScale, y: center.y - y * targetScale });
}
function focusLonLat(lon, lat, scale, animate = true) {
  const p = projectLonLat(lon, lat);
  const center = svgCenterPoint(), targetScale = Math.max(minScale, Math.min(maxScale, scale));
  const target = { scale: targetScale, x: center.x - p.x * targetScale, y: center.y - p.y * targetScale };
  if (animate) animateToState(target);
  else { state = target; applyTransform({ forceLabels: true, immediateTiles: true }); }
}

function pathDataOf(r) { return r ? (r.d || r.el?.getAttribute("d") || "") : ""; }
function setHighlightPath(el, r) { const d = pathDataOf(r); if (d) el.setAttribute("d", d); else el.removeAttribute("d"); }
function setHoverHighlight(r) { if (!r || r.id === activeId) { setHighlightPath(hoverHighlight, null); return; } setHighlightPath(hoverHighlight, r); }
function setSelectedHighlight(r) { setHighlightPath(selectedHighlight, r); setHighlightPath(selectedPulse, r); }

function bindRegionElement(el) {
  const r = placeById.get(el.id);
  if (!r) return;
  el.addEventListener("mousemove", event => { setHoverHighlight(r); showTip(event, r); });
  el.addEventListener("mouseleave", () => { setHoverHighlight(null); hideTip(); });
}

function setDatasetBounds(el, source) {
  el.dataset.minScale = String(source.minScale || 2.8);
  if (source.prov) el.dataset.prov = source.prov;
  if (source.bounds) {
    el.dataset.minX = source.bounds.minX; el.dataset.minY = source.bounds.minY;
    el.dataset.maxX = source.bounds.maxX; el.dataset.maxY = source.bounds.maxY;
  }
}

function addDetailDataset(source, payload) {
  if (document.getElementById("detail-" + source.id)) return;
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.id = "detail-" + source.id;
  group.classList.add("detailDataset");
  group.dataset.isProvinceLayer = "1";
  setDatasetBounds(group, source);
  group.innerHTML = "<g>" + payload.regions.map(r =>
    '<path id="' + r.id + '" class="region detailRegion' + (r.underlaySeal ? " underlaySeal" : (isInherited(r) ? " inheritedRegion" : "")) + '" fill-rule="evenodd" d="' + r.d + '" fill="' + fillForPlace(r) + '"></path>'
  ).join("") + "</g>";
  detailLayer.appendChild(group);

  const boundary = document.createElementNS("http://www.w3.org/2000/svg", "g");
  boundary.id = "detail-boundary-" + source.id;
  boundary.classList.add("detailDataset");
  setDatasetBounds(boundary, source);
  boundary.innerHTML = payload.outlines.map(r => '<path class="cityBoundary" d="' + r.d + '"></path>').join("");
  detailBoundaries.appendChild(boundary);

  const labels = document.createElementNS("http://www.w3.org/2000/svg", "g");
  labels.id = "detail-label-" + source.id;
  labels.classList.add("detailDataset");
  setDatasetBounds(labels, source);
  labels.innerHTML = payload.regions.filter(r => r.price && !r.underlaySeal).map(r =>
    '<text class="detailLabel" data-id="' + r.id + '" x="' + r.cx + '" y="' + r.cy + '" data-min-scale="' + Math.max(r.labelMinScale, source.labelScale || 4.4) + '" text-anchor="middle">' + escapeHtml(mapLabelForPlace(r)) + "</text>"
  ).join("");
  dynamicLabels.appendChild(labels);

  detailDatasetEls.push(group, boundary, labels);
  payload.regions.forEach(r => {
    r.el = document.getElementById(r.id);
    delete r.d; // Free path string memory once mounted in DOM
    if (r.underlaySeal) {
      underlaySealItems.push({ el: r.el, place: r });
      return;
    }
    places.push(r);
    placeById.set(r.id, r);
    if (r.el) {
      bindRegionElement(r.el);
      regionEls.push(r.el);
    }
  });

  Array.from(labels.querySelectorAll(".detailLabel")).forEach(el => {
    const place = placeById.get(el.dataset.id);
    labelItems.push({
      el,
      place,
      isCity: false,
      isDetail: true,
      x: Number(el.getAttribute("x")),
      y: Number(el.getAttribute("y")),
      minScale: Number(el.dataset.minScale || 4.4),
      priority: (place?.price || 0) * (isInherited(place) ? 0.4 : 1.2),
    });
  });

  if (mapShell.classList.contains("isMoving")) {
    group.classList.add("hidden"); boundary.classList.add("hidden"); labels.classList.add("hidden");
    renderRows(search.value);
    return;
  }
  updateDetailVisibility();
  renderRows(search.value);
  applyTransform({ forceLabels: true, skipLoadDetails: true });
}

async function loadDetailSource(source) {
  if (loadedDetailSources.has(source.id) || loadingDetailSources.has(source.id)) return;
  loadingDetailSources.add(source.id);
  updateScaleBadge();
  try {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(response.status);
    const payload = await response.json();
    loadedDetailSources.add(source.id);
    addDetailDataset(source, payload);
  } catch (error) {
    console.warn("detail layer failed", source.id, error);
  } finally {
    loadingDetailSources.delete(source.id);
    updateScaleBadge();
  }
}

function expandedBounds(bounds, ratio = 0.35) {
  const w = bounds.maxX - bounds.minX, h = bounds.maxY - bounds.minY;
  return { minX: bounds.minX - w * ratio, minY: bounds.minY - h * ratio, maxX: bounds.maxX + w * ratio, maxY: bounds.maxY + h * ratio };
}
function datasetVisible(el, bounds) {
  if (!fineModeEnabled) return false;
  if (state.scale < Number(el.dataset.minScale || 2.8)) return false;
  if (!el.dataset.minX) return true;
  const sourceBounds = { minX: Number(el.dataset.minX), minY: Number(el.dataset.minY), maxX: Number(el.dataset.maxX), maxY: Number(el.dataset.maxY) };
  return intersects(expandedBounds(bounds, 0.25), sourceBounds);
}
function updateDetailVisibility() {
  const bounds = visibleContentBounds();
  const nextCovered = new Set();
  detailDatasetEls.forEach(el => {
    const vis = datasetVisible(el, bounds);
    el.classList.toggle("hidden", !vis);
    if (vis && el.dataset.isProvinceLayer && el.dataset.prov) nextCovered.add(el.dataset.prov);
  });
  // Hide coarse base-layer polygons for provinces covered by active detail layers so zero border doubling occurs
  for (const [prov, pathEls] of basePathsByProv.entries()) {
    const shouldHide = nextCovered.has(prov);
    if (shouldHide !== coveredProvinces.has(prov)) {
      for (let i = 0; i < pathEls.length; i += 1) pathEls[i].classList.toggle("coveredByDetail", shouldHide);
    }
  }
  coveredProvinces = nextCovered;
}
function sourceDistance(source, bounds) {
  if (!source.bounds) return 0;
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  const sx = (source.bounds.minX + source.bounds.maxX) / 2, sy = (source.bounds.minY + source.bounds.maxY) / 2;
  return Math.hypot(cx - sx, cy - sy);
}
function maybeLoadDetails() {
  if (!fineModeEnabled || !detailSources.length) return;
  const bounds = visibleContentBounds();
  detailSources
    .filter(source => !loadedDetailSources.has(source.id) && !loadingDetailSources.has(source.id) && state.scale >= source.minScale && (!source.bounds || intersects(expandedBounds(bounds, 0.14), source.bounds)))
    .sort((a, b) => sourceDistance(a, bounds) - sourceDistance(b, bounds))
    .slice(0, maxDetailLoadsPerPass)
    .forEach(loadDetailSource);
}

function applyPreset(id, animate = true) {
  const preset = viewPresets.find(item => item.id === id);
  if (!preset) return;
  document.querySelectorAll(".presetButton").forEach(button => button.classList.toggle("active", button.dataset.preset === id));
  focusLonLat(preset.center[0], preset.center[1], preset.scale || 4.5, animate);
}

function updateCommutePanel() {
  if (!commuteActive || !commuteAnchor || !radiusAnchorInfo) return;
  const { lon, lat, name, price, prov } = commuteAnchor;
  if (prov) {
    const src = detailSources.find(s => s.prov === prov);
    if (src && !loadedDetailSources.has(src.id) && !loadingDetailSources.has(src.id)) {
      loadDetailSource(src).then(() => updateCommutePanel());
    }
  }
  const preferDistricts = loadedDetailSources.size > 0;
  const ring15 = [], ring30 = [], ring50 = [], arbitrage = [];
  for (let i = 0; i < places.length; i += 1) {
    const r = places[i];
    if (!r.price || (preferDistricts && r.dataLevel === "city" && coveredProvinces.has(r.province))) continue;
    const [rLon, rLat] = svgToLonLat(r.cx, r.cy);
    const dKm = haversineKm(lon, lat, rLon, rLat);
    if (dKm <= 15) ring15.push(r.price);
    else if (dKm <= 30) ring30.push(r.price);
    else if (dKm <= 50) ring50.push(r.price);
    if (price && dKm >= 4 && dKm <= 48 && r.price < price * 0.78 && !isInherited(r)) {
      arbitrage.push({ r, dKm, savePct: Math.round((1 - r.price / price) * 100) });
    }
  }
  radiusAnchorInfo.innerHTML = `圆心：<b>${escapeHtml(name)}</b>（${price ? fmt(price) + " 元/㎡" : "--"}）· 点击任意区域切换圆心，移鼠测距。`;
  const m15 = medianNum(ring15), m30 = medianNum(ring30), m50 = medianNum(ring50);
  radiusRingStats.innerHTML =
    '<div class="ringStatCell"><span>0-15km 核心圈</span><b>' + (m15 ? fmtWan(m15) : "--") + '</b></div>' +
    '<div class="ringStatCell"><span>15-30km 通勤圈</span><b>' + (m30 ? fmtWan(m30) : "--") + '</b></div>' +
    '<div class="ringStatCell"><span>30-50km 外溢圈</span><b>' + (m50 ? fmtWan(m50) : "--") + '</b></div>';

  arbitrage.sort((a, b) => b.savePct - a.savePct || a.dKm - b.dKm);
  const topArb = arbitrage.slice(0, 5);
  radiusArbitrage.innerHTML = topArb.length
    ? '<div style="font-size:11.5px;font-weight:800;color:var(--ink-secondary);margin-top:2px">50km内跨区价格洼地推荐：</div>' +
      topArb.map(item =>
        '<div class="arbItem" data-id="' + item.r.id + '"><span><b>' + escapeHtml(item.r.city === item.r.name ? item.r.name : item.r.city.replace(/市$/, "") + "·" + item.r.name) + '</b> <small style="color:var(--ink-muted)">' + item.dKm.toFixed(1) + 'km</small></span><span><b style="color:var(--down)">省' + item.savePct + '%</b> · ' + fmtWan(item.r.price) + '</span></div>'
      ).join("")
    : '<div style="font-size:11.5px;color:var(--ink-muted)">点击高价核心区（如南山/天河/黄浦）可自动发现周边低价通勤洼地。</div>';
  radiusArbitrage.querySelectorAll(".arbItem").forEach(el => { el.onclick = () => locateRegion(el.dataset.id); });
}

function setCommuteAnchorFromRegion(r) {
  if (!r) return;
  const [lon, lat] = svgToLonLat(r.cx, r.cy);
  commuteAnchor = { id: r.id, lon, lat, x: r.cx, y: r.cy, prov: r.province, name: r.city === r.name ? r.name : `${r.city.replace(/市$/, "")} ${r.name}`, price: r.price };
  renderCommuteOverlay();
  updateCommutePanel();
}

function selectRegion(id, center = false, preservePlate = false) {
  if (!preservePlate && selectedPlateInfo && selectedPlateInfo.distId !== id) {
    selectedPlateInfo = null;
  }
  activeId = id;
  hideTip();
  rowEls.forEach(el => el.classList.toggle("active", el.dataset.id === id));
  const r = placeById.get(id);
  if (!r) { renderEmptyDossier(); return; }
  setSelectedHighlight(r);
  setHoverHighlight(null);
  renderDossier(r);
  if (commuteActive) setCommuteAnchorFromRegion(r);
  if (center) {
    const targetScale = r.dataLevel === "city" ? Math.max(state.scale, 4.6) : Math.max(state.scale, 15.5);
    animateFocusContentPoint(r.cx, r.cy, targetScale);
  } else {
    updateVisibleLabels();
  }
}

function selectStreetPlate(distId, plateIdx, fly = false) {
  const r = placeById.get(distId);
  if (!r || !streetPlatesCache) return;
  const dp = streetPlatesCache.platesByDistrict?.[r.sk];
  const pl = dp?.plates?.[plateIdx];
  if (!pl) return;
  fineModeEnabled = true;
  selectedPlateInfo = { distId, pIdx: plateIdx, n: pl.n, u: pl.u, code: dp.code, p: pl.p, rp: pl.rp, m: pl.m, scaleFactor: dp.scaleFactor || 1 };
  selectRegion(distId, false, true);
  if (fly) {
    animateFocusContentPoint(r.cx, r.cy, Math.max(state.scale, 16.5));
  }
}

async function flyToPlateHit(hit) {
  if (!hit) return;
  fineModeEnabled = true;
  let dist = places.find(p => p.sk === hit.sk);
  if (!dist) {
    const baseCity = regions.find(c => c.city.includes(hit.city) || c.name.includes(hit.city));
    const src = baseCity ? detailSources.find(s => s.prov === baseCity.province) : null;
    if (src) {
      await loadDetailSource(src);
      dist = places.find(p => p.sk === hit.sk);
    }
  }
  if (dist) {
    selectStreetPlate(dist.id, hit.pIdx, true);
  }
}

function locateRegion(id) {
  const r = placeById.get(id);
  if (!r) return;
  selectRegion(id, true);
}

function showTip(event, r) {
  const pad = 14;
  const x = Math.min(window.innerWidth - 280, event.clientX + pad);
  const y = Math.min(window.innerHeight - 130, event.clientY + pad);
  tooltip.style.display = "block";
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
  if (tooltipPlaceId !== r.id) {
    tooltipPlaceId = r.id;
    const cfg = activeColorConfig();
    const mVal = effectiveMetricValue(r);
    const title = r.city === r.name ? r.name : `${r.city} ${r.name}`;
    tooltip.innerHTML =
      "<strong>" + escapeHtml(title) + "</strong>" +
      (r.price ? (
        '<div class="tipMain">' + cfg.short + "：" + (mVal !== null ? cfg.fmtRow(mVal) : "暂无") + "</div>" +
        "<span>二手 " + fmt(r.price) + " 元/㎡" + (r.newPrice ? " · 新房 " + fmt(r.newPrice) + " 元/㎡" : "") + "</span>" +
        "<span>环比 " + escapeHtml(r.mom || "--") + (r.yoy ? " · 同比 " + escapeHtml(r.yoy) : "") + (r.rentYield ? " · 租售比 " + r.rentYield.toFixed(2) + "%" : "") + "</span>" +
        '<span style="color:#94b0c2;font-size:11px">' + levelText(r) + " · " + escapeHtml(r.source || "") + "</span>"
      ) : "<span>暂无公开均价样本</span>");
  }
}
function hideTip() { tooltip.style.display = "none"; tooltipPlaceId = ""; }

function sortPlaces(list) {
  if (smartActive && smartProfile) {
    return list.sort((a, b) => (computeSmartScore(b, smartProfile) ?? -1) - (computeSmartScore(a, smartProfile) ?? -1));
  }
  return list.sort((a, b) => {
    if (sortMode === "metricAsc") return (effectiveMetricValue(a) ?? 1e12) - (effectiveMetricValue(b) ?? 1e12);
    if (sortMode === "chgDesc") return (pctNum(b.yoy ?? b.mom) ?? -999) - (pctNum(a.yoy ?? a.mom) ?? -999);
    if (sortMode === "chgAsc") return (pctNum(a.yoy ?? a.mom) ?? 999) - (pctNum(b.yoy ?? b.mom) ?? 999);
    if (sortMode === "yieldDesc") return (b.rentYield ?? -1) - (a.rentYield ?? -1);
    if (sortMode === "ptiAsc") return (a.priceToIncome ?? 999) - (b.priceToIncome ?? 999);
    return (effectiveMetricValue(b) ?? -1e12) - (effectiveMetricValue(a) ?? -1e12);
  });
}

function currentFilteredList(filterText = "") {
  const q = filterText.trim().toLowerCase();
  const prov = provFilter.value;
  const hasMapDimFilter = Boolean(q || prov || budgetActive || smartActive || activeBin >= 0 || scopeMode === "fav");

  places.forEach(r => {
    if (!r.el) return;
    if (!hasMapDimFilter) { r.el.classList.remove("dimmed"); return; }
    const ok = placeMatchesActiveFilters(r, q, prov);
    r.el.classList.toggle("dimmed", !ok);
  });

  return sortPlaces(
    places.filter(r => effectiveMetricValue(r) !== null && placeMatchesActiveFilters(r, q, prov))
  );
}

function renderRows(filterText = "") {
  searchClear.style.display = filterText ? "block" : "none";
  const q = filterText.trim().toLowerCase();
  if (q.length >= 2 && !streetPlatesCache && !streetPlatesLoading) {
    ensureStreetPlatesLoaded().then(() => { if (search.value.trim()) renderRows(search.value); });
  }

  // Auto-load matching province detail layer(s) when searching a city/district/street so sub-city results appear even from 1.26x national view
  if (q.length >= 2) {
    const provsToLoad = new Set();
    regions.forEach(r => {
      if (`${r.province || ""}${r.city}${r.name}`.toLowerCase().includes(q) && r.province) provsToLoad.add(r.province);
    });
    if (plateSearchIndex.length && provsToLoad.size < 3) {
      for (let i = 0; i < plateSearchIndex.length && provsToLoad.size < 3; i += 1) {
        if (plateSearchIndex[i].searchKey.includes(q)) {
          const bc = regions.find(c => c.city.includes(plateSearchIndex[i].city) || c.name.includes(plateSearchIndex[i].city));
          if (bc?.province) provsToLoad.add(bc.province);
        }
      }
    }
    if (provsToLoad.size <= 3) {
      provsToLoad.forEach(prov => {
        const src = detailSources.find(s => s.prov === prov);
        if (src && !loadedDetailSources.has(src.id) && !loadingDetailSources.has(src.id)) loadDetailSource(src);
      });
    }
  }

  const cfg = activeColorConfig();
  const matched = currentFilteredList(filterText);
  updateKPIs(matched);
  const limit = q || provFilter.value ? 600 : 280;
  const visibleRows = matched.slice(0, limit);

  let plateHits = [];
  if (q.length >= 2 && plateSearchIndex.length) {
    plateHits = plateSearchIndex
      .filter(item => item.searchKey.includes(q))
      .sort((a, b) => b.p - a.p)
      .slice(0, 8);
  }

  document.getElementById("listSummary").textContent = `匹配 ${fmt(matched.length)} 个区域` + (plateHits.length ? ` + ${plateHits.length} 个街道板块` : (smartActive ? "（按智能评分排序）" : `（当前按${cfg.short}）`));

  const plateRowsHtml = plateHits.map((hit, idx) =>
    '<div class="row plateHitRow" data-plate-hit="' + idx + '">' +
    '<span class="rankNum">街</span>' +
    '<span class="rowName"><small>' + escapeHtml(hit.city + "·" + hit.district.replace(/[区县市]$/, "")) + '</small>' + escapeHtml(hit.n) + "</span>" +
    '<span class="levelBadge supplement">街道</span>' +
    '<span class="price">' + fmtWan(hit.p) + "</span>" +
    '<span class="rowDelta">' + escapeHtml(hit.m || "--%") + "</span>" +
    '<span class="rowBtns"><button type="button" class="iconAct" data-plate-hit="' + idx + '">定位</button></span></div>'
  ).join("");

  rows.innerHTML = plateRowsHtml + visibleRows.map((r, idx) => {
    const val = effectiveMetricValue(r);
    const chgRaw = smartActive && smartProfile ? (`${computeSmartScore(r, smartProfile)}分`) : (metricMode === "yoy" ? (r.mom || "--%") : (r.yoy || r.mom || "--%"));
    const chgN = smartActive ? 1 : pctNum(chgRaw);
    const chgCls = smartActive ? "rowDelta down" : (chgN > 0 ? "rowDelta up" : chgN < 0 ? "rowDelta down" : "rowDelta");
    const inCmp = compareIds.includes(r.id);
    const displayName = r.city === r.name ? escapeHtml(r.name) : `<small>${escapeHtml(r.city.replace(/市$/, ""))}</small>${escapeHtml(r.name)}`;
    return '<div class="row' + (r.id === activeId ? " active" : "") + '" data-id="' + r.id + '">' +
      '<span class="rankNum">' + (idx + 1) + "</span>" +
      '<span class="rowName">' + displayName + "</span>" +
      '<span class="' + levelClass(r) + '">' + levelText(r).slice(0, 2) + "</span>" +
      '<span class="price">' + (val !== null ? cfg.fmtMap(val) : "--") + "</span>" +
      '<span class="' + chgCls + '">' + escapeHtml(chgRaw) + "</span>" +
      '<span class="rowBtns">' +
        '<button type="button" class="iconAct cmpBtn' + (inCmp ? " inCompare" : "") + '" data-id="' + r.id + '" title="加入或移出对比">PK</button>' +
        '<button type="button" class="iconAct locBtn" data-id="' + r.id + '" title="地图飞往该区域">定位</button>' +
      "</span></div>";
  }).join("");

  rows.querySelectorAll(".plateHitRow").forEach(el => {
    el.onclick = () => flyToPlateHit(plateHits[Number(el.dataset.plateHit)]);
  });

  rowEls = Array.from(rows.querySelectorAll(".row[data-id]"));
  rowEls.forEach(row => {
    row.onclick = e => {
      if (e.target.closest(".iconAct")) return;
      selectRegion(row.dataset.id, false);
    };
    row.querySelector(".locBtn").onclick = e => { e.stopPropagation(); locateRegion(row.dataset.id); };
    row.querySelector(".cmpBtn").onclick = e => { e.stopPropagation(); toggleCompare(row.dataset.id); };
  });
}

function exportCsv() {
  const list = currentFilteredList(search.value);
  const header = ["省份", "城市", "区域", "层级口径", "二手挂牌均价(元/㎡)", "新房参考均价(元/㎡)", "环比", "同比", "年租金回报率(%)", "房价收入比(年)", "距十年峰值(%)", "数据来源"];
  const lines = [header.join(",")];
  list.forEach(r => {
    lines.push([
      r.province || r.city, r.city, r.name, levelText(r),
      r.price || "", r.newPrice || "", r.mom || "", r.yoy || "",
      r.rentYield ?? "", r.priceToIncome ?? "", r.drawdownPct ?? "",
      `"${String(r.source || "").replace(/"/g, '""')}"`
    ].join(","));
  });
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `china-house-prices-${metricMode}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`已导出 ${list.length} 条区域数据 CSV`);
}

function exportMapPng() {
  try {
    const rect = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true);
    clone.querySelectorAll("image.tileImage").forEach(el => el.remove()); // Avoid cross-origin taint if tiles active
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.textContent = Array.from(document.querySelectorAll("style")).map(s => s.textContent).join("\n");
    clone.insertBefore(styleEl, clone.firstChild);
    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const vb = svg.viewBox.baseVal;
    bgRect.setAttribute("x", vb.x); bgRect.setAttribute("y", vb.y); bgRect.setAttribute("width", vb.width); bgRect.setAttribute("height", vb.height);
    bgRect.setAttribute("fill", getComputedStyle(document.documentElement).getPropertyValue("--bg-ocean").trim() || "#e6eff5");
    clone.insertBefore(bgRect, clone.firstChild.nextSibling);
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    const ctx = canvas.getContext("2d");
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.download = `china-house-map-${metricMode}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      showToast("已导出高清地图 PNG");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  } catch (e) {
    showToast("导出失败：" + e.message);
  }
}

// Pointer & Zoom Gestures
function pointerDistance(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
function pointerMidpoint(a, b) { return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }; }
function beginPinch() {
  const points = [...activePointers.values()];
  if (points.length < 2) { pinch = null; return; }
  tapCandidate = null;
  const center = pointerMidpoint(points[0], points[1]), anchor = clientToSvg(center.clientX, center.clientY);
  pinch = { distance: Math.max(1, pointerDistance(points[0], points[1])), scale: state.scale, content: svgToContent(anchor) };
}
function endPointer(event) {
  const candidate = tapCandidate && tapCandidate.pointerId === event.pointerId ? tapCandidate : null;
  const isTap = !!(candidate && (candidate.id || candidate.plateDistId || candidate.xqId) && activePointers.size === 1 && !candidate.moved && Math.hypot(event.clientX - candidate.clientX, event.clientY - candidate.clientY) <= 7);
  if (activePointers.has(event.pointerId)) {
    activePointers.delete(event.pointerId);
    try { svg.releasePointerCapture(event.pointerId); } catch (_) {}
  }
  if (activePointers.size === 1) {
    const [remaining] = activePointers.values();
    last = { clientX: remaining.clientX, clientY: remaining.clientY };
    dragging = true; pinch = null;
  } else {
    dragging = false; pinch = null; svg.classList.remove("dragging"); finishViewportMove();
  }
  if (candidate) {
    tapCandidate = null;
    if (isTap) {
      if (candidate.xqId && typeof onTapCommunityPin === "function") onTapCommunityPin(candidate.xqId);
      else if (candidate.plateDistId) selectStreetPlate(candidate.plateDistId, candidate.plateIdx, false);
      else if (candidate.id) selectRegion(candidate.id, false);
    }
  }
}

regionEls.forEach(bindRegionElement);
if (streetPlateLayer) {
  streetPlateLayer.addEventListener("mousemove", event => {
    const node = event.target.closest ? event.target.closest(".plateNode") : null;
    if (!node || !streetPlatesCache) return;
    const r = placeById.get(node.dataset.distId);
    const dp = r?.sk ? streetPlatesCache.platesByDistrict?.[r.sk] : null;
    const pl = dp?.plates?.[Number(node.dataset.plateIdx)];
    if (!r || !pl) return;
    const pad = 14;
    tooltip.style.display = "block";
    tooltip.style.left = Math.min(window.innerWidth - 280, event.clientX + pad) + "px";
    tooltip.style.top = Math.min(window.innerHeight - 130, event.clientY + pad) + "px";
    const tipKey = `plate:${r.id}:${pl.n}`;
    if (tooltipPlaceId !== tipKey) {
      tooltipPlaceId = tipKey;
      tooltip.innerHTML =
        "<strong>" + escapeHtml(`${r.city.replace(/市$/, "")} ${r.name} · ${pl.n}`) + "</strong>" +
        '<div class="tipMain">街道/板块均价：' + fmt(pl.p) + " 元/㎡</div>" +
        "<span>所属区均价：" + (r.price ? fmt(r.price) + " 元/㎡" : "--") + (pl.m ? " · 环比 " + escapeHtml(pl.m) : "") + "</span>" +
        '<span style="color:#94b0c2;font-size:11px">' + (pl.rp ? `同城标尺校准后（原值 ${fmt(pl.rp)} 元/㎡）` : "街道/商圈参考口径") + " · 点击查看详情</span>";
    }
  });
  streetPlateLayer.addEventListener("mouseleave", hideTip);
}
svg.addEventListener("mousemove", event => {
  if (commuteActive && commuteAnchor && !dragging) {
    renderCommuteOverlay(svgToContent(clientToSvg(event.clientX, event.clientY)));
  }
});
svg.addEventListener("mouseleave", () => { if (commuteActive) renderCommuteOverlay(null); });
svg.addEventListener("wheel", event => { event.preventDefault(); cancelMoveAnimation(); invalidateViewMetrics(); zoom(event.deltaY < 0 ? 1.18 : 0.85, event.clientX, event.clientY); }, { passive: false });
svg.addEventListener("dblclick", event => { event.preventDefault(); cancelMoveAnimation(); invalidateViewMetrics(); zoom(1.65, event.clientX, event.clientY); });
svg.addEventListener("pointerdown", event => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault(); cancelMoveAnimation(); invalidateViewMetrics(); setMoving(true); hideTip();
  if (svg.setPointerCapture) svg.setPointerCapture(event.pointerId);
  const xqPin = event.target.closest ? event.target.closest(".xqPinNode") : null;
  const plateNode = !xqPin && event.target.closest ? event.target.closest(".plateNode") : null;
  const target = !xqPin && !plateNode && event.target.closest ? event.target.closest(".region") : null;
  tapCandidate = xqPin
    ? { xqId: xqPin.dataset.xqid, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, moved: false }
    : plateNode
      ? { plateDistId: plateNode.dataset.distId, plateIdx: Number(plateNode.dataset.plateIdx), pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, moved: false }
      : target
        ? { id: target.id, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, moved: false }
        : null;
  activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  if (activePointers.size >= 2) { dragging = false; beginPinch(); }
  else { dragging = true; last = { clientX: event.clientX, clientY: event.clientY }; }
  svg.classList.add("dragging");
});
window.addEventListener("pointermove", event => {
  if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  if (tapCandidate && tapCandidate.pointerId === event.pointerId && Math.hypot(event.clientX - tapCandidate.clientX, event.clientY - tapCandidate.clientY) > 7) tapCandidate.moved = true;
  if (activePointers.size >= 2) {
    event.preventDefault(); tapCandidate = null;
    const points = [...activePointers.values()], center = pointerMidpoint(points[0], points[1]), anchor = clientToSvg(center.clientX, center.clientY);
    if (!pinch) beginPinch();
    const nextScale = Math.max(minScale, Math.min(maxScale, (pinch.scale * pointerDistance(points[0], points[1])) / pinch.distance));
    state.x = anchor.x - pinch.content.x * nextScale; state.y = anchor.y - pinch.content.y * nextScale; state.scale = nextScale;
    scheduleTransform({ deferHeavy: true }); queueLabelSettle(); queueViewportSettle();
    return;
  }
  if (!dragging) return;
  event.preventDefault();
  const delta = clientDeltaToSvg(event.clientX - last.clientX, event.clientY - last.clientY);
  state.x += delta.x; state.y += delta.y;
  last = { clientX: event.clientX, clientY: event.clientY };
  scheduleTransform({ deferHeavy: true }); queueViewportSettle();
});
window.addEventListener("pointerup", endPointer);
window.addEventListener("pointercancel", endPointer);
window.addEventListener("scroll", invalidateViewMetrics, { passive: true });
window.addEventListener("resize", () => { invalidateViewMetrics(); scheduleTransform({ forceLabels: true, immediateTiles: true }); });

// UI Control Bindings
document.getElementById("zoomIn").onclick = () => { cancelMoveAnimation(); zoom(1.28); };
document.getElementById("zoomOut").onclick = () => { cancelMoveAnimation(); zoom(0.78); };
resetButton.onclick = () => {
  cancelMoveAnimation();
  scsFocused = false;
  document.querySelectorAll(".presetButton").forEach(b => b.classList.toggle("active", b.dataset.preset === "national"));
  focusLonLat(initialCenter[0], initialCenter[1], initialScale, true);
};
toggleLabelsButton.onclick = () => { labelsVisible = !labelsVisible; updateVisibleLabels(); };
if (toggleFineModeButton) {
  toggleFineModeButton.onclick = () => {
    fineModeEnabled = !fineModeEnabled;
    toggleFineModeButton.classList.toggle("active", fineModeEnabled);
    showToast(fineModeEnabled ? "已开启区县及街道板块细化下钻" : "已切换为纯城市汇总边界视图");
    applyTransform({ forceLabels: true });
  };
}
toggleTilesButton.onclick = () => {
  tilesVisible = !tilesVisible;
  toggleTilesButton.classList.toggle("active", tilesVisible);
  mapShell.classList.toggle("mapTilesOn", tilesVisible);
  requestTileUpdate(true);
};

const displayPopover = document.getElementById("displayPopover"), budgetPopover = document.getElementById("budgetPopover");
function closeAllPopovers(except = null) {
  [
    [displayPopover, document.getElementById("toggleDisplay")],
    [budgetPopover, document.getElementById("toggleBudget")],
    [radiusPopover, toggleRadiusButton],
  ].forEach(([panel, btn]) => {
    if (!panel || panel === except) return;
    panel.classList.remove("open");
    if (btn && panel === displayPopover) btn.classList.remove("active");
  });
}

document.getElementById("toggleDisplay").onclick = () => {
  closeAllPopovers(displayPopover);
  displayPopover.classList.toggle("open");
  document.getElementById("toggleDisplay").classList.toggle("active", displayPopover.classList.contains("open"));
};

const budgetTotalInput = document.getElementById("budgetTotal"), budgetAreaInput = document.getElementById("budgetArea");
const tabModeBudget = document.getElementById("tabModeBudget"), tabModeSmart = document.getElementById("tabModeSmart");
const budgetPane = document.getElementById("budgetPane"), smartPane = document.getElementById("smartPane");

function syncBudgetFilter() {
  if (smartActive && smartProfile) {
    const names = { afford: "刚需低负担友好", yield: "高租售比现金流", value: "超跌筑底性价比" };
    const matched = places.filter(r => (computeSmartScore(r, smartProfile) ?? 0) >= 66).length;
    document.getElementById("budgetSummary").innerHTML =
      `当前模型：<b>${names[smartProfile]}</b>（综合评分 ≥66 高亮），全国共匹配 <b>${fmt(matched)}</b> 个优选区域。`;
    renderRows(search.value);
    return;
  }
  const tot = Number(budgetTotalInput.value), area = Number(budgetAreaInput.value);
  document.getElementById("budgetTotalVal").textContent = tot + "万";
  document.getElementById("budgetAreaVal").textContent = area + "㎡";
  budgetMaxUnitPrice = Math.round((tot * 10000) / area);
  const matched = places.filter(r => r.price && r.price <= budgetMaxUnitPrice).length;
  document.getElementById("budgetSummary").innerHTML =
    `折合最高单价 <b>${fmt(budgetMaxUnitPrice)} 元/㎡</b>，全国当前共 <b>${fmt(matched)}</b> 个区域在预算内。`;
  if (budgetActive) renderRows(search.value);
}

if (tabModeBudget && tabModeSmart) {
  tabModeBudget.onclick = () => {
    smartActive = false; budgetActive = true;
    tabModeBudget.classList.add("active"); tabModeSmart.classList.remove("active");
    budgetPane.style.display = "flex"; smartPane.style.display = "none";
    document.getElementById("toggleBudget").classList.add("active");
    syncBudgetFilter();
  };
  tabModeSmart.onclick = () => {
    budgetActive = false; smartActive = true;
    if (!smartProfile) smartProfile = "afford";
    tabModeSmart.classList.add("active"); tabModeBudget.classList.remove("active");
    budgetPane.style.display = "none"; smartPane.style.display = "flex";
    document.querySelectorAll(".profileBtn").forEach(b => b.classList.toggle("active", b.dataset.profile === smartProfile));
    document.getElementById("toggleBudget").classList.add("active");
    syncBudgetFilter();
  };
  document.querySelectorAll(".profileBtn").forEach(btn => {
    btn.onclick = () => {
      smartProfile = btn.dataset.profile;
      smartActive = true; budgetActive = false;
      document.querySelectorAll(".profileBtn").forEach(b => b.classList.toggle("active", b === btn));
      document.getElementById("toggleBudget").classList.add("active");
      syncBudgetFilter();
    };
  });
}

document.getElementById("toggleBudget").onclick = () => {
  closeAllPopovers(budgetPopover);
  const open = budgetPopover.classList.toggle("open");
  if (open && !budgetActive && !smartActive) {
    if (smartPane && smartPane.style.display !== "none") { smartActive = true; if (!smartProfile) smartProfile = "afford"; }
    else budgetActive = true;
  }
  document.getElementById("toggleBudget").classList.toggle("active", budgetActive || smartActive);
  syncBudgetFilter();
  renderRows(search.value);
};
document.getElementById("clearBudget").onclick = () => {
  budgetActive = false; smartActive = false;
  budgetPopover.classList.remove("open");
  document.getElementById("toggleBudget").classList.remove("active");
  renderRows(search.value);
};
budgetTotalInput.oninput = () => { budgetActive = true; smartActive = false; document.getElementById("toggleBudget").classList.add("active"); syncBudgetFilter(); };
budgetAreaInput.oninput = () => { budgetActive = true; smartActive = false; document.getElementById("toggleBudget").classList.add("active"); syncBudgetFilter(); };

// Commute Radius Ring Controls
if (toggleRadiusButton && radiusPopover) {
  toggleRadiusButton.onclick = () => {
    closeAllPopovers(radiusPopover);
    commuteActive = !commuteActive;
    toggleRadiusButton.classList.toggle("active", commuteActive);
    radiusPopover.classList.toggle("open", commuteActive);
    if (commuteActive) {
      const seed = (activeId && placeById.get(activeId)) || places.find(p => p.name === "南山区" || p.name.includes("深圳"));
      if (seed) setCommuteAnchorFromRegion(seed);
      showToast("已开启都市通勤圈测距 · 点击任意区域切换圆心");
    } else {
      renderCommuteOverlay(null);
    }
  };
  document.getElementById("closeRadius").onclick = () => {
    commuteActive = false;
    toggleRadiusButton.classList.remove("active");
    radiusPopover.classList.remove("open");
    renderCommuteOverlay(null);
  };
}

// 12-Month Timeline Time-Machine Controls
function stopTimelinePlay() {
  if (tlTimer) { clearInterval(tlTimer); tlTimer = 0; }
  if (tlPlayIcon) tlPlayIcon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"/>';
}
function syncTimelineUI() {
  if (!tlMonths.length) return;
  tlSlider.max = String(tlMonths.length - 1);
  tlSlider.value = String(tlIndex);
  tlMonthLabel.textContent = tlMonths[tlIndex] || "--";
  tlModeBtn.textContent = tlMode === "cumChg" ? "累计涨跌%" : "当月均价";
  tlModeBtn.classList.toggle("active", tlMode === "cumChg");
  refreshLegendUI();
  recolorAndFilterAll();
}
if (toggleTimelineButton && timelineDock) {
  toggleTimelineButton.onclick = async () => {
    timelineActive = !timelineActive;
    toggleTimelineButton.classList.toggle("active", timelineActive);
    timelineDock.classList.toggle("open", timelineActive);
    if (!timelineActive) {
      stopTimelinePlay();
      refreshLegendUI();
      recolorAndFilterAll();
      return;
    }
    const tr = await ensureTrendsLoaded();
    const sampleSeries = tr["上海|上海"]?.series || tr["北京|北京"]?.series || Object.values(tr)[0]?.series || [];
    tlMonths = sampleSeries.map(s => s[0]);
    tlIndex = Math.max(0, tlMonths.length - 1);
    syncTimelineUI();
    showToast("已开启近12个月房价时光机 · 可拖动或自动播放");
  };
  tlSlider.oninput = () => {
    stopTimelinePlay();
    tlIndex = Number(tlSlider.value);
    syncTimelineUI();
  };
  tlModeBtn.onclick = () => {
    tlMode = tlMode === "price" ? "cumChg" : "price";
    activeBin = -1;
    syncTimelineUI();
  };
  tlPlayBtn.onclick = () => {
    if (tlTimer) { stopTimelinePlay(); return; }
    if (!tlMonths.length) return;
    if (tlIndex >= tlMonths.length - 1) tlIndex = 0;
    tlPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    syncTimelineUI();
    tlTimer = setInterval(() => {
      if (tlIndex < tlMonths.length - 1) {
        tlIndex += 1;
        syncTimelineUI();
      } else {
        stopTimelinePlay();
      }
    }, 640);
  };
  document.getElementById("tlCloseBtn").onclick = () => {
    if (timelineActive) toggleTimelineButton.click();
  };
}

if (toggleKpiViewportBtn) {
  toggleKpiViewportBtn.onclick = () => {
    kpiViewportLinked = !kpiViewportLinked;
    updateKPIs();
    showToast(kpiViewportLinked ? "统计栏已开启随地图视野实时联动" : "统计栏已锁定全国城市基准");
  };
}

clearBinFilterBtn.onclick = () => { activeBin = -1; refreshLegendUI(); recolorAndFilterAll(); };
document.getElementById("scsInset").onclick = () => {
  scsFocused = !scsFocused;
  if (scsFocused) focusLonLat(112.5, 15.2, 2.2, true);
  else focusLonLat(initialCenter[0], initialCenter[1], initialScale, true);
};

// Metric Switcher
document.querySelectorAll(".metricTab").forEach(tab => {
  tab.onclick = () => {
    metricMode = tab.dataset.metric;
    activeBin = -1;
    document.querySelectorAll(".metricTab").forEach(t => {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    refreshLegendUI();
    recolorAndFilterAll();
  };
});

document.querySelectorAll(".presetButton").forEach(btn => btn.addEventListener("click", () => applyPreset(btn.dataset.preset)));
overlayOpacityInput.addEventListener("input", () => { overlayOpacity = Number(overlayOpacityInput.value) / 100; applyOverlayOpacity(); });
labelScaleInput.addEventListener("input", () => { labelScale = (Number(labelScaleInput.value) / 100) * labelScaleBase; applyLabelScale(); updateVisibleLabels(); });

// Theme Toggle
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("atlas-theme", theme); } catch (_) {}
  document.getElementById("themeIcon").innerHTML = theme === "dark"
    ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'
    : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  recolorAndFilterAll();
}
document.getElementById("toggleTheme").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
document.getElementById("toggleSidebar").onclick = () => {
  document.body.classList.toggle("sidebarCollapsed");
  setTimeout(() => { invalidateViewMetrics(); scheduleTransform({ forceLabels: true, immediateTiles: true }); }, 260);
};
document.getElementById("exportCsv").onclick = exportCsv;
document.getElementById("exportPng").onclick = exportMapPng;

// Sidebar Search, Scope, Sort & Compare
search.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => renderRows(search.value), 70);
});
searchClear.onclick = () => { search.value = ""; renderRows(""); search.focus(); };
provFilter.onchange = () => renderRows(search.value);
document.querySelectorAll(".scopePill").forEach(btn => {
  btn.onclick = () => {
    scopeMode = btn.dataset.scope;
    document.querySelectorAll(".scopePill").forEach(b => b.classList.toggle("active", b === btn));
    renderRows(search.value);
  };
});
document.querySelectorAll(".sortBar button").forEach(btn => {
  btn.onclick = () => {
    sortMode = btn.dataset.sort;
    document.querySelectorAll(".sortBar button").forEach(b => b.classList.toggle("active", b === btn));
    renderRows(search.value);
  };
});
document.getElementById("toggleCompareSheet").onclick = () => { compareOpen = !compareOpen; updateCompareUI(); };
document.getElementById("clearCompare").onclick = () => { compareIds = []; updateCompareUI(); if (activeId) renderDossier(placeById.get(activeId)); renderRows(search.value); };

// Keyboard Shortcuts
window.addEventListener("keydown", e => {
  if (e.target.matches("input, select, textarea")) {
    if (e.key === "Escape") { e.target.blur(); }
    return;
  }
  if (e.key === "/") { e.preventDefault(); search.focus(); }
  else if (e.key === "+" || e.key === "=") { cancelMoveAnimation(); zoom(1.25); }
  else if (e.key === "-") { cancelMoveAnimation(); zoom(0.8); }
  else if (e.key === "r" || e.key === "R") { resetButton.click(); }
  else if (e.key === "Escape") {
    closeAllPopovers();
    compareOpen = false; updateCompareUI();
  }
});

// Boot Sequence & URL Deep-Link Hydration
syncFavBadge();
populateProvinceSelect();
try {
  const savedTheme = localStorage.getItem("atlas-theme");
  if (savedTheme === "dark" || (!savedTheme && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches)) {
    document.documentElement.dataset.theme = "dark";
  }
} catch (_) {}
setTheme(document.documentElement.dataset.theme || "light");
applyOverlayOpacity();
applyLabelScale();
refreshLegendUI();
renderEmptyDossier();
focusLonLat(initialCenter[0], initialCenter[1], initialScale, false);
renderRows("");

const params = new URLSearchParams(location.search);
const urlMetric = params.get("metric");
if (urlMetric && METRIC_CONFIGS[urlMetric]) {
  document.querySelector(`.metricTab[data-metric="${urlMetric}"]`)?.click();
}
const urlPreset = params.get("view");
if (urlPreset) {
  setTimeout(() => applyPreset(urlPreset, true), 60);
} else if (params.get("lat") && params.get("lng")) {
  focusLonLat(Number(params.get("lng")), Number(params.get("lat")), Number(params.get("z") || 4.5), false);
}
const urlRegion = params.get("region");
if (urlRegion) {
  const [c, n] = urlRegion.split("|");
  const found = places.find(p => (p.city === c && p.name === n) || p.name === c);
  if (found) setTimeout(() => selectRegion(found.id, !params.get("lat")), 100);
}

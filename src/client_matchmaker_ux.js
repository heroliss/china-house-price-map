// ============================================================================
// Dual-Persona (Buy / Rent) Engine + 3-Step Smart Matchmaker + Breadcrumb UX
// ============================================================================

const RENT_LAYOUTS = {
  room: {
    key: "room",
    label: "合租单间",
    short: "单间",
    desc: "约18㎡主次卧",
    eqSqm: 23,
    breaks: [0, 450, 700, 1000, 1400, 2000, 2800, 4000, 25000],
    labels: ["<450", "450-700", "700-1k", "1k-1.4k", "1.4k-2k", "2k-2.8k", "2.8k-4k", "4k+"],
  },
  one: {
    key: "one",
    label: "独居一居",
    short: "一居",
    desc: "约38㎡整租一室",
    eqSqm: 40,
    breaks: [0, 750, 1100, 1600, 2300, 3300, 4800, 6800, 40000],
    labels: ["<750", "750-1.1k", "1.1k-1.6k", "1.6k-2.3k", "2.3k-3.3k", "3.3k-4.8k", "4.8k-6.8k", "6.8k+"],
  },
  two: {
    key: "two",
    label: "整租两居",
    short: "两居",
    desc: "约65㎡主流两室",
    eqSqm: 65,
    breaks: [0, 1100, 1600, 2300, 3200, 4500, 6800, 10000, 60000],
    labels: ["<1.1k", "1.1k-1.6k", "1.6k-2.3k", "2.3k-3.2k", "3.2k-4.5k", "4.5k-6.8k", "6.8k-1万", "1万+"],
  },
  three: {
    key: "three",
    label: "家庭三居",
    short: "三居",
    desc: "约95㎡舒适三室",
    eqSqm: 95,
    breaks: [0, 1500, 2200, 3200, 4500, 6500, 9500, 14000, 90000],
    labels: ["<1.5k", "1.5k-2.2k", "2.2k-3.2k", "3.2k-4.5k", "4.5k-6.5k", "6.5k-9.5k", "9.5k-1.4万", "1.4万+"],
  },
};

const METRIC_BEGINNER_TIPS = {
  resale: "颜色越暖代表二手房价越高；滚动滚轮放大地图会自动展开区县、街道与代表小区。",
  estRent: "按所选租住户型估算整月房租；深绿代表月租亲民，橙红代表核心高租金片区。",
  newPrice: "当地在售新建商品住宅参考均价；可点右侧「一二手价差」对比买新房还是二手房划算。",
  yoy: "对比去年同期涨跌：绿色代表降价（买方议价空间大），红色代表上涨。",
  rentYield: "年租金 ÷ 房价：深绿（>2.5%）代表收租现金流扎实、房价水分较少。",
  priceToIncome: "当地普通家庭不吃不喝买一套 90㎡ 所需年数：绿色（<8年）代表安家压力最小。",
  drawdown: "距近十年最高点的跌幅：深绿（跌超30%）代表前期高点泡沫已显著消化。",
  spread: "蓝色代表新房比同区二手房更便宜（价格倒挂），橙红代表新盘改善溢价较高。",
};

const CROSS_PROVINCE_METRO_NEIGHBORS = {
  "北京": ["河北", "天津"],
  "天津": ["河北", "北京"],
  "上海": ["江苏", "浙江"],
  "广东": ["香港", "澳门"],
  "江苏": ["上海", "安徽", "浙江"],
  "浙江": ["上海", "江苏"],
  "陕西": ["山西"],
  "重庆": ["四川"],
};

let userIntent = "buy"; // "buy" | "rent"
let rentLayout = "two";
let matchmakerOpen = false;
let mmWorkPlaceId = "";
let mmWorkQuery = "";
let mmCommuteKm = 30;
let mmBuyBudgetWan = 220;
let mmBuyArea = 95;
let mmBuyPref = "commute"; // "commute" | "afford" | "hold" | "value"
let mmRentBudgetYuan = 2600;
let mmRentPref = "commute"; // "commute" | "save" | "comfort"
let mmResults = null;

try {
  const savedIntent = localStorage.getItem("atlas-user-intent");
  if (savedIntent === "rent" || savedIntent === "buy") userIntent = savedIntent;
  const savedLayout = localStorage.getItem("atlas-rent-layout");
  if (savedLayout && RENT_LAYOUTS[savedLayout]) rentLayout = savedLayout;
} catch (_) {}

const cityYieldLookup = new Map();
function ensureCityYieldLookup() {
  if (cityYieldLookup.size > 0 || typeof regions === "undefined") return;
  regions.forEach(r => {
    if (Number.isFinite(r.rentYield)) {
      cityYieldLookup.set(r.city, r.rentYield);
      cityYieldLookup.set((r.city || "").replace(/市$/, ""), r.rentYield);
    }
  });
}

function effectiveRentYield(r) {
  if (!r) return null;
  if (Number.isFinite(r.rentYield) && r.rentYield > 0) return r.rentYield;
  ensureCityYieldLookup();
  const cy = cityYieldLookup.get(r.city) || cityYieldLookup.get((r.city || "").replace(/市$/, ""));
  if (Number.isFinite(cy) && cy > 0) return Number((cy * 1.04).toFixed(2));
  return 2.15;
}

function estMonthlyRentFromUnit(unitPrice, yld, layoutKey = rentLayout) {
  if (!unitPrice || unitPrice <= 0) return null;
  const useYld = Number.isFinite(yld) && yld > 0 ? yld : 2.15;
  const cfg = RENT_LAYOUTS[layoutKey] || RENT_LAYOUTS.two;
  const rentPerSqm = (unitPrice * (useYld / 100)) / 12;
  return Math.max(180, Math.round((rentPerSqm * cfg.eqSqm) / 10) * 10);
}

function estPlaceMonthlyRent(r, layoutKey = rentLayout) {
  if (!r || !r.price) return null;
  return estMonthlyRentFromUnit(r.price, effectiveRentYield(r), layoutKey);
}

function fmtRentShort(yuan) {
  if (!yuan) return "--";
  if (yuan >= 10000) return "¥" + (yuan / 10000).toFixed(2).replace(/\.?0+$/, "") + "万/月";
  return "¥" + fmt(yuan) + "/月";
}

function syncEstRentMetricConfig() {
  if (typeof METRIC_CONFIGS === "undefined" || !METRIC_CONFIGS.estRent) return;
  const cfg = RENT_LAYOUTS[rentLayout] || RENT_LAYOUTS.two;
  METRIC_CONFIGS.estRent.title = `预估月租金 · ${cfg.label}（${cfg.desc}，元/月）`;
  METRIC_CONFIGS.estRent.short = `月租(${cfg.short})`;
  METRIC_CONFIGS.estRent.breaks = cfg.breaks;
  METRIC_CONFIGS.estRent.labels = cfg.labels;
}

function setIntentMode(nextMode, silent = false) {
  if (nextMode !== "buy" && nextMode !== "rent") return;
  userIntent = nextMode;
  try { localStorage.setItem("atlas-user-intent", userIntent); } catch (_) {}

  document.querySelectorAll(".intentBtn[data-intent]").forEach(btn => {
    const on = btn.dataset.intent === userIntent;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  syncEstRentMetricConfig();

  if (userIntent === "rent" && metricMode === "resale") {
    metricMode = "estRent";
  } else if (userIntent === "buy" && metricMode === "estRent") {
    metricMode = "resale";
  }

  document.querySelectorAll(".metricTab").forEach(t => {
    const on = t.dataset.metric === metricMode;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });

  activeBin = -1;
  refreshLegendUI();
  recolorAndFilterAll();
  if (activeId && placeById.get(activeId)) {
    renderDossier(placeById.get(activeId));
  } else {
    renderEmptyDossier();
  }
  if (matchmakerOpen) renderMatchmakerPanel();
  if (!silent) {
    showToast(userIntent === "rent" ? "已切换至「租房安居」视角 · 地图与列表同步显示预估月租" : "已切换至「买房置业」视角 · 显示房价、首付月供与置业诊断");
  }
}

function setRentLayout(nextLayout) {
  if (!RENT_LAYOUTS[nextLayout]) return;
  rentLayout = nextLayout;
  try { localStorage.setItem("atlas-rent-layout", rentLayout); } catch (_) {}
  syncEstRentMetricConfig();
  if (metricMode === "estRent") {
    activeBin = -1;
    refreshLegendUI();
    recolorAndFilterAll();
  } else {
    scheduleTransform({ forceLabels: true });
  }
  if (activeId && placeById.get(activeId)) renderDossier(placeById.get(activeId));
  if (matchmakerOpen && userIntent === "rent") renderMatchmakerPanel();
}

// ============================================================================
// Interactive Spatial Breadcrumb (全国 › 省 › 市 › 区 › 街道)
// ============================================================================

function updateNavBreadcrumb() {
  const el = document.getElementById("navBreadcrumb");
  if (!el) return;
  const r = activeId ? placeById.get(activeId) : null;
  const sp = selectedPlateInfo && r && selectedPlateInfo.distId === r.id ? selectedPlateInfo : null;

  const crumbs = [{ label: "全国总览", action: "country" }];
  if (r) {
    if (r.province && r.province !== r.city) {
      crumbs.push({ label: r.province, action: "prov", prov: r.province });
    }
    if (r.city) {
      crumbs.push({ label: r.city, action: "city", city: r.city, prov: r.province });
    }
    if (r.dataLevel !== "city" && r.name !== r.city) {
      crumbs.push({ label: r.name, action: "dist", id: r.id });
    }
    if (sp) {
      crumbs.push({ label: sp.n, action: "plate" });
    }
    if (selectedCommunityDetail?.name) {
      crumbs.push({ label: selectedCommunityDetail.name.slice(0, 8), action: "xq" });
    }
  } else if (state.scale >= 9.0) {
    crumbs.push({ label: "街道板块级视野", action: "none" });
  } else if (state.scale >= 2.8) {
    crumbs.push({ label: "区县级视野", action: "none" });
  }

  el.innerHTML = crumbs.map((c, idx) => {
    const isLast = idx === crumbs.length - 1;
    if (isLast || c.action === "none") {
      return '<span class="crumbCur">' + escapeHtml(c.label) + "</span>";
    }
    return '<button type="button" class="crumbBtn" data-cidx="' + idx + '">' + escapeHtml(c.label) + '</button><span class="crumbSep">›</span>';
  }).join("");

  el.querySelectorAll(".crumbBtn").forEach(btn => {
    btn.onclick = () => {
      const item = crumbs[Number(btn.dataset.cidx)];
      if (!item) return;
      if (item.action === "country") {
        selectedPlateInfo = null;
        selectedCommunityDetail = null;
        resetButton.click();
      } else if (item.action === "prov") {
        selectedPlateInfo = null;
        selectedCommunityDetail = null;
        const provCity = regions.find(x => x.province === item.prov);
        if (provCity) {
          selectRegion(provCity.id, false);
          animateFocusContentPoint(provCity.cx, provCity.cy, 4.2);
        }
      } else if (item.action === "city") {
        selectedPlateInfo = null;
        selectedCommunityDetail = null;
        const cityReg = regions.find(x => x.city === item.city || x.name === item.city);
        if (cityReg) {
          selectRegion(cityReg.id, false);
          animateFocusContentPoint(cityReg.cx, cityReg.cy, 8.2);
        }
      } else if (item.action === "dist" && item.id) {
        selectedPlateInfo = null;
        selectedCommunityDetail = null;
        selectRegion(item.id, false);
        const distReg = placeById.get(item.id);
        if (distReg) animateFocusContentPoint(distReg.cx, distReg.cy, 15.5);
      } else if (item.action === "plate" && r) {
        selectedCommunityDetail = null;
        renderDossier(r);
      }
    };
  });
}

// ============================================================================
// 5-Dimension Renter & Rent-vs-Buy Diagnostic Engine
// ============================================================================

function generateRentalAdvice(r) {
  if (!r || !r.price) return null;
  const sp = selectedPlateInfo && selectedPlateInfo.distId === r.id ? selectedPlateInfo : null;
  const xq = selectedCommunityDetail;
  const layoutCfg = RENT_LAYOUTS[rentLayout] || RENT_LAYOUTS.two;
  const yld = xq?.estRentYield || effectiveRentYield(r);
  const refUnitPrice = xq?.price || sp?.p || r.price;

  let monthlyRent = estMonthlyRentFromUnit(refUnitPrice, yld, rentLayout);
  if (xq?.rentSamples?.length && rentLayout === "two") {
    monthlyRent = xq.rentSamples[0].monthly;
  }
  if (!monthlyRent) return null;

  const targetName = xq?.name
    ? `${sp?.n || r.name}·${xq.name}`
    : (sp?.n ? `${r.name}·${sp.n}板块` : (r.city === r.name ? r.name : `${r.city}${r.name}`));

  const buyArea = layoutCfg.eqSqm;
  const loanYuan = refUnitPrice * buyArea * (1 - calcDown);
  const monthlyMortgage = Math.round(calcMonthlyPayment(loanYuan, calcRate, 30));
  const mortToRent = monthlyMortgage / Math.max(1, monthlyRent);
  const safeSalary = Math.round((monthlyRent / 0.3) / 100) * 100;
  const firstOutlay = monthlyRent * 4; // 押一付三

  let verdict = "租金温和 · 宜居片区";
  let verdictCls = "levelBadge district";
  if (mortToRent >= 2.6) {
    verdict = `租房极划算 · 月省 ¥${fmt(monthlyMortgage - monthlyRent)}`;
    verdictCls = "levelBadge district";
  } else if (mortToRent <= 1.25) {
    verdict = "月供接近房租 · 长住可考虑买房";
    verdictCls = "levelBadge supplement";
  } else if (monthlyRent <= 1500 && rentLayout === "two") {
    verdict = "低成本安居友好区";
    verdictCls = "levelBadge district";
  }

  const bullets = [];

  // 1. Rent burden & safe salary rule
  bullets.push(
    `<b>房租与月薪安全线：</b>${layoutCfg.label}（${layoutCfg.desc}）预估月租约 <b>¥${fmt(monthlyRent)}/月</b>，押一付三首期需准备约 ¥${fmt(firstOutlay)}；按国际通用的「房租不超过税后收入 30%」舒适线，适合月收入 <b>≥ ¥${fmt(safeSalary)}</b> 的人群。`
  );

  // 2. Rent vs Buy 5-year cashflow decision
  if (mortToRent >= 2.2) {
    const saveYearWan = (((monthlyMortgage - monthlyRent) * 12) / 10000).toFixed(1);
    bullets.push(
      `<b>该租还是该买：</b>买同面积房源 30 年月供约 ¥${fmt(monthlyMortgage)}（是月租的 ${mortToRent.toFixed(1)} 倍）。当前在此租房每年可比买房少支出约 <b>${saveYearWan} 万</b> 现金流，无资产跌价风险，现阶段租住性价比远高于勉强上车。`
    );
  } else if (mortToRent <= 1.3) {
    bullets.push(
      `<b>该租还是该买：</b>同面积 30 年月供约 ¥${fmt(monthlyMortgage)}，仅为月租的 ${mortToRent.toFixed(2)} 倍（每月差额仅 ¥${fmt(Math.abs(monthlyMortgage - monthlyRent))}）。若工作稳定且打算在此居住 5 年以上，攒够首付转租为买更划算。`
    );
  } else {
    bullets.push(
      `<b>该租还是该买：</b>同面积月供约 ¥${fmt(monthlyMortgage)}（月租的 ${mortToRent.toFixed(1)} 倍）。处于工作变动期或首付尚紧时建议安心租住，待定居规划明确后再择机购入次新盘。`
    );
  }

  // 3. On-site rental inspection checklist tailored to community specs
  if (xq && (xq.year || xq.plotRatio || xq.propertyFee)) {
    const checks = [];
    const age = xq.year ? 2026 - xq.year : null;
    if (age !== null && age >= 20) checks.push(`小区楼龄约 ${age} 年，签约前必查空调是否为一级能效（老旧三级空调夏季电费翻倍）、下水管道反味及门窗隔音`);
    else if (age !== null) checks.push(`${xq.year} 年社区，公区较新，看房重点确认宽带光纤入户与快递外卖上楼便利度`);
    if (xq.plotRatio && xq.plotRatio > 4.0) checks.push(`容积率 ${xq.plotRatio} 偏高，务必早高峰实测等电梯时间，并确认水电是否为「民水民电」（避开商水商电高溢价公寓）`);
    else checks.push(`务必核实「民水民电」账单单价，并查验房东房产证与身份证原件（谨防高收低租二房东跑路）`);
    if (xq.propertyFee) checks.push(`物业费参考 ${xq.propertyFee}，签约时明确约定物业费与取暖费由房东还是租客承担`);
    bullets.push(`<b>实地看租避坑：</b>${checks.join("；")}。`);
  } else {
    bullets.push(
      `<b>看租签约必查：</b>① 确认民水民电（电费约0.5-0.6元/度，避开1.2-1.5元/度的商改住）；② 手机实测卧室与卫生间信号及夜间临街噪音；③ 查验房东不动产权证原件，押金条款写明自然老化免责。`
    );
  }

  // 4. 25km cheaper commute rental alternatives
  const alts = findCommuteAlternatives(r, 26).map(a => ({
    ...a,
    altRent: estPlaceMonthlyRent(a.cand, rentLayout),
  })).filter(a => a.altRent && a.altRent < monthlyRent * 0.82);

  return { targetName, monthlyRent, verdict, verdictCls, bullets, alts };
}

// ============================================================================
// 3-Step Beginner Smart Matchmaker Wizard (帮我找房)
// ============================================================================

const POPULAR_WORK_SPOTS = [
  { label: "深圳·南山", city: "深圳", area: "南山区" },
  { label: "北京·海淀", city: "北京", area: "海淀区" },
  { label: "上海·浦东", city: "上海", area: "浦东新区" },
  { label: "广州·天河", city: "广州", area: "天河区" },
  { label: "杭州·滨江", city: "杭州", area: "滨江区" },
  { label: "成都·高新", city: "成都", area: "成都" },
  { label: "石家庄·裕华", city: "石家庄", area: "裕华区" },
  { label: "全国不限(找宜居城)", city: "", area: "" },
];

async function resolveWorkAnchorAndLoadNeighbors(queryText) {
  const q = String(queryText || "").trim();
  if (!q || q.includes("全国不限")) return null;

  // First match against already-loaded places or base city regions
  let baseCity = regions.find(c => q.includes(c.city.replace(/市$/, "")) || q.includes(c.name.replace(/市$/, "")));
  if (baseCity) {
    const provsToLoad = [baseCity.province, ...(CROSS_PROVINCE_METRO_NEIGHBORS[baseCity.province] || [])];
    for (const pv of provsToLoad) {
      const src = detailSources.find(s => s.prov === pv);
      if (src && !loadedDetailSources.has(src.id)) {
        await loadDetailSource(src);
      }
    }
  }

  // Try exact district match first, then city match
  const parts = q.split(/[·\s,，-]+/).filter(Boolean);
  let best = null;
  for (const p of places) {
    if (isInherited(p)) continue;
    const full = `${p.city}${p.name}`;
    if (parts.length >= 2 && full.includes(parts[0]) && p.name.includes(parts[1]) && p.dataLevel !== "city") {
      best = p;
      break;
    }
  }
  if (!best) {
    best = places.find(p => p.dataLevel !== "city" && !isInherited(p) && p.name.replace(/[区县市]$/, "") === q.replace(/[区县市]$/, ""))
      || places.find(p => fullNameMatch(p, q))
      || baseCity;
  }
  if (!best) {
    const poiHits = await searchCommutePoiCandidates(q);
    if (poiHits[0]) {
      const pt = projectLonLat(poiHits[0].lon, poiHits[0].lat);
      const nearCity = nearestRegionAtContentPt(pt.x, pt.y);
      if (nearCity?.province) {
        const provsToLoad = [nearCity.province, ...(CROSS_PROVINCE_METRO_NEIGHBORS[nearCity.province] || [])];
        for (const pv of provsToLoad) {
          const src = detailSources.find(s => s.prov === pv);
          if (src && !loadedDetailSources.has(src.id)) await loadDetailSource(src);
        }
      }
      const nearDist = nearestRegionAtContentPt(pt.x, pt.y);
      return {
        id: nearDist?.id || "",
        cx: pt.x,
        cy: pt.y,
        lon: poiHits[0].lon,
        lat: poiHits[0].lat,
        city: nearDist?.city || "",
        name: poiHits[0].name,
        province: nearDist?.province || "",
        price: nearDist?.price || null,
        isExactPoi: true,
      };
    }
  }
  return best || null;
}

function fullNameMatch(p, q) {
  const cleanQ = q.replace(/[省市区县]/g, "");
  if (!cleanQ) return false;
  const full = `${p.province || ""}${p.city || ""}${p.name || ""}`.replace(/[省市区县]/g, "");
  return full.includes(cleanQ);
}

async function runPersonalMatchmaker() {
  const btn = document.getElementById("mmRunBtn");
  if (btn) { btn.disabled = true; btn.textContent = "正在分析全国匹配片区..."; }

  try {
    const anchor = await resolveWorkAnchorAndLoadNeighbors(mmWorkQuery);
    let anchorLon = null, anchorLat = null;
    if (anchor) {
      mmWorkPlaceId = anchor.id;
      [anchorLon, anchorLat] = anchor.isExactPoi ? [anchor.lon, anchor.lat] : svgToLonLat(anchor.cx, anchor.cy);
      commuteActive = true;
      if (toggleRadiusButton) toggleRadiusButton.classList.add("active");
      if (anchor.isExactPoi) {
        setCommuteAnchorFreeContentPt(anchor.cx, anchor.cy, anchor.name, null, true);
      } else {
        setCommuteAnchorFromRegion(anchor);
      }
    } else {
      mmWorkPlaceId = "";
      commuteActive = false;
      if (toggleRadiusButton) toggleRadiusButton.classList.remove("active");
      renderCommuteOverlay(null);
    }

    const candidates = [];
    const preferDistrict = Boolean(anchor && coveredProvinces.size > 0);

    for (let i = 0; i < places.length; i += 1) {
      const p = places[i];
      if (!p.price || isInherited(p)) continue;
      if (preferDistrict && p.dataLevel === "city" && coveredProvinces.has(p.province)) continue;
      if (!preferDistrict && p.dataLevel !== "city") continue;

      let dKm = null;
      if (anchorLon !== null) {
        const [pLon, pLat] = svgToLonLat(p.cx, p.cy);
        dKm = haversineKm(anchorLon, anchorLat, pLon, pLat);
        if (dKm > mmCommuteKm) continue;
      }

      if (userIntent === "buy") {
        const totalWan = (p.price * mmBuyArea) / 10000;
        if (totalWan > mmBuyBudgetWan * 1.12) continue; // Allow up to +12% stretch with note
        const budgetRatio = totalWan / Math.max(1, mmBuyBudgetWan);
        const downWan = totalWan * calcDown;
        const mPay = Math.round(calcMonthlyPayment(p.price * mmBuyArea * (1 - calcDown), calcRate, 30));
        const yld = effectiveRentYield(p) || 2.0;
        const dd = Number.isFinite(p.drawdownPct) ? p.drawdownPct : -15;
        const pti = Number.isFinite(p.priceToIncome) ? p.priceToIncome : 11;

        let score = 70;
        // Budget comfort (sweet spot: 55% - 92% of budget so quality isn't too low nor overstretched)
        const sBudget = budgetRatio <= 1 ? (100 - Math.abs(0.78 - budgetRatio) * 45) : (68 - (budgetRatio - 1) * 180);
        const sCommute = dKm !== null ? Math.max(20, 100 - (dKm / mmCommuteKm) * 72) : Math.max(30, 100 - pti * 4.2);
        const sHold = Math.min(98, yld * 22 + Math.max(0, 35 + dd));
        const sValue = Math.min(98, Math.abs(Math.min(0, dd)) * 1.9 + yld * 14);

        if (mmBuyPref === "commute") score = sCommute * 0.52 + sBudget * 0.30 + sHold * 0.18;
        else if (mmBuyPref === "afford") score = (100 - budgetRatio * 55) * 0.55 + sCommute * 0.25 + sHold * 0.20;
        else if (mmBuyPref === "hold") score = sHold * 0.50 + sCommute * 0.30 + sBudget * 0.20;
        else score = sValue * 0.55 + sBudget * 0.25 + sCommute * 0.20;

        let reason = "";
        if (dKm !== null && dKm <= 8) reason = "就在上班核心圈内，通勤极短";
        else if (budgetRatio <= 0.72) reason = `比预算省 ${Math.round((1 - budgetRatio) * 100)}%，月供压力轻`;
        else if (dd <= -30) reason = `距高点已回调 ${Math.abs(dd).toFixed(0)}%，安全垫较厚`;
        else if (yld >= 2.5) reason = `租售比达 ${yld.toFixed(2)}%，宜居保值`;
        else reason = budgetRatio > 1 ? "略超预算但地段核心，可淘次新小户型" : "预算与通勤距离均衡匹配";

        candidates.push({
          place: p,
          score: Math.max(55, Math.min(98, Math.round(score))),
          dKm,
          costMain: `${mmBuyArea}㎡约 ${totalWan.toFixed(0)}万`,
          costSub: `首付${downWan.toFixed(0)}万 · 月供¥${fmt(mPay)}`,
          reason,
        });
      } else {
        const mRent = estPlaceMonthlyRent(p, rentLayout);
        if (!mRent || mRent > mmRentBudgetYuan * 1.15) continue;
        const rentRatio = mRent / Math.max(1, mmRentBudgetYuan);
        const sCommute = dKm !== null ? Math.max(38, 100 - (dKm / mmCommuteKm) * 52) : 86;
        const sSave = rentRatio <= 1 ? (98 - rentRatio * 22) : Math.max(42, 76 - (rentRatio - 1) * 150);
        const sComfort = Math.min(96, 72 + (effectiveRentYield(p) || 2) * 9);

        let score = 72;
        if (mmRentPref === "commute") score = sCommute * 0.58 + sSave * 0.27 + sComfort * 0.15;
        else if (mmRentPref === "save") score = sSave * 0.58 + sCommute * 0.27 + sComfort * 0.15;
        else score = sComfort * 0.45 + sCommute * 0.35 + sSave * 0.20;

        const anchorRent = anchor ? estPlaceMonthlyRent(anchor, rentLayout) : null;
        let reason = "";
        if (dKm !== null && dKm <= 7) reason = "近距离通勤，每天少挤地铁";
        else if (anchorRent && mRent <= anchorRent * 0.65) reason = `比上班核心区每月省 ¥${fmt(anchorRent - mRent)}`;
        else if (rentRatio <= 0.75) reason = `低于月租预算 ${Math.round((1 - rentRatio) * 100)}%，手头更宽裕`;
        else reason = "租金符合预算，生活配套成熟";

        candidates.push({
          place: p,
          score: Math.max(58, Math.min(98, Math.round(score))),
          dKm,
          costMain: `约 ¥${fmt(mRent)}/月`,
          costSub: `${RENT_LAYOUTS[rentLayout].label} · 押一付三 ¥${fmt(mRent * 4)}`,
          reason,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score || (a.dKm ?? 999) - (b.dKm ?? 999));
    mmResults = {
      anchorName: anchor ? (anchor.city === anchor.name ? anchor.name : `${anchor.city.replace(/市$/, "")}·${anchor.name}`) : "全国范围",
      items: candidates.slice(0, 6),
    };

    // Highlight on map using budget filter if buying, and focus viewport smoothly
    if (anchor) {
      const targetScale = mmCommuteKm <= 16 ? 13.5 : mmCommuteKm <= 32 ? 8.8 : 6.2;
      animateFocusContentPoint(anchor.cx, anchor.cy, targetScale);
    } else if (mmResults.items[0]) {
      const topP = mmResults.items[0].place;
      animateFocusContentPoint(topP.cx, topP.cy, 4.5);
    }

    renderMatchmakerPanel();
    if (mmResults.items.length) {
      showToast(`已为您筛选出 ${mmResults.items.length} 个高契合片区，点击即可查看街道与小区`);
    } else {
      showToast("当前预算或通勤半径内暂无匹配片区，建议适当放宽预算或通勤距离");
    }
  } finally {
    const btnAfter = document.getElementById("mmRunBtn");
    if (btnAfter) { btnAfter.disabled = false; btnAfter.textContent = "为我匹配合适片区"; }
  }
}

function renderMatchmakerPanel() {
  const mount = document.getElementById("matchmakerMount");
  if (!mount) return;
  if (!matchmakerOpen) {
    mount.innerHTML = "";
    return;
  }

  const downPreview = (mmBuyBudgetWan * calcDown).toFixed(0);
  const payPreview = Math.round(calcMonthlyPayment(mmBuyBudgetWan * 10000 * (1 - calcDown), calcRate, 30));
  const salaryPreview = Math.round((mmRentBudgetYuan / 0.3) / 100) * 100;

  const spotsHtml = POPULAR_WORK_SPOTS.map(s => {
    const val = s.city ? `${s.city} ${s.area}`.trim() : "";
    const act = mmWorkQuery === val;
    return '<button type="button" class="mmSpotChip' + (act ? " active" : "") + '" data-q="' + escapeHtml(val) + '">' + escapeHtml(s.label) + "</button>";
  }).join("");

  const step2Html = userIntent === "buy"
    ? '<div class="mmStep">' +
        '<div class="mmStepLabel"><span>2. 购房总预算与户型</span><b class="num">' + mmBuyBudgetWan + ' 万（首付约' + downPreview + '万 · 月供¥' + fmt(payPreview) + '）</b></div>' +
        '<input id="mmBuySlider" class="mmRange" type="range" min="40" max="1200" step="10" value="' + mmBuyBudgetWan + '">' +
        '<div class="mmPillRow">' +
          [[70, "70㎡ 刚需两房"], [95, "95㎡ 主流三房"], [125, "125㎡ 舒适四房"]].map(([a, lbl]) =>
            '<button type="button" class="mmOptBtn' + (mmBuyArea === a ? " active" : "") + '" data-barea="' + a + '">' + lbl + "</button>"
          ).join("") +
        "</div>" +
        '<div class="mmPillRow">' +
          [["commute", "离上班更近"], ["afford", "总价低月供轻"], ["hold", "核心保值抗跌"], ["value", "超跌高性价比"]].map(([k, lbl]) =>
            '<button type="button" class="mmOptBtn' + (mmBuyPref === k ? " active" : "") + '" data-bpref="' + k + '">' + lbl + "</button>"
          ).join("") +
        "</div>" +
      "</div>"
    : '<div class="mmStep">' +
        '<div class="mmStepLabel"><span>2. 每月房租预算与户型</span><b class="num">¥' + fmt(mmRentBudgetYuan) + '/月（建议月薪 ≥¥' + fmt(salaryPreview) + '）</b></div>' +
        '<input id="mmRentSlider" class="mmRange" type="range" min="500" max="15000" step="100" value="' + mmRentBudgetYuan + '">' +
        '<div class="mmPillRow">' +
          Object.values(RENT_LAYOUTS).map(l =>
            '<button type="button" class="mmOptBtn' + (rentLayout === l.key ? " active" : "") + '" data-rlayout="' + l.key + '">' + l.label + "</button>"
          ).join("") +
        "</div>" +
        '<div class="mmPillRow">' +
          [["commute", "通勤省时间"], ["save", "房租更省钱"], ["comfort", "成熟生活圈"]].map(([k, lbl]) =>
            '<button type="button" class="mmOptBtn' + (mmRentPref === k ? " active" : "") + '" data-rpref="' + k + '">' + lbl + "</button>"
          ).join("") +
        "</div>" +
      "</div>";

  let resHtml = "";
  if (mmResults) {
    if (!mmResults.items.length) {
      resHtml = '<div class="mmEmpty">当前条件下暂未筛出合适片区，可尝试调高预算或将通勤圈放宽至 45km。</div>';
    } else {
      resHtml =
        '<div class="mmResHead"><span>围绕「' + escapeHtml(mmResults.anchorName) + '」为您推荐 ' + mmResults.items.length + ' 个合适片区</span><small>点击看街道与小区</small></div>' +
        '<div class="mmResList">' +
        mmResults.items.map(it => {
          const p = it.place;
          const title = p.city === p.name ? p.name : `${p.city.replace(/市$/, "")} · ${p.name}`;
          const distTag = it.dKm !== null ? `距上班点 ${it.dKm.toFixed(0)}km` : (p.province || "");
          return '<div class="mmResCard" data-id="' + p.id + '">' +
            '<div class="mmResTop">' +
              '<div><strong>' + escapeHtml(title) + '</strong> <small>' + escapeHtml(distTag) + '</small></div>' +
              '<span class="mmScoreBadge">' + it.score + '% 契合</span>' +
            '</div>' +
            '<div class="mmResMid"><b class="num">' + escapeHtml(it.costMain) + '</b><span>' + escapeHtml(it.costSub) + '</span></div>' +
            '<div class="mmResFoot"><span>' + escapeHtml(it.reason) + '</span><span class="mmGoTxt">看小区 ›</span></div>' +
          '</div>';
        }).join("") +
        "</div>";
    }
  }

  mount.innerHTML =
    '<div class="mmBox">' +
      '<div class="mmHead">' +
        '<div><strong>3步帮我找合适片区</strong><span class="mmSub">适合新手 · 结合预算与通勤自动匹配到区县与小区</span></div>' +
        '<button type="button" class="linkBtn" id="mmCloseBtn">收起</button>' +
      '</div>' +
      '<div class="mmStep">' +
        '<div class="mmStepLabel"><span>1. 您想在哪里买房/租房？（可填上班区域）</span></div>' +
        '<div class="mmWorkRow">' +
          '<input id="mmWorkInput" class="aiInput" type="text" placeholder="可填任意写字楼/地铁站/区县，如：深圳湾科技园 / 西二旗" value="' + escapeHtml(mmWorkQuery) + '">' +
          '<select id="mmCommuteSel" class="mmSelect" aria-label="最大通勤距离">' +
            [[8, "8km内 骑行近距"], [15, "15km内 近距"], [30, "30km内 主流"], [48, "48km内 跨城"]].map(([km, t]) => '<option value="' + km + '"' + (mmCommuteKm === km ? " selected" : "") + '>' + t + "</option>").join("") +
          "</select>" +
        "</div>" +
        '<div class="mmSpotRow">' + spotsHtml + "</div>" +
      "</div>" +
      step2Html +
      '<button type="button" class="mmSubmitBtn" id="mmRunBtn">为我匹配合适片区</button>' +
      resHtml +
    "</div>";

  document.getElementById("mmCloseBtn").onclick = () => {
    matchmakerOpen = false;
    document.getElementById("openMatchmakerBtn")?.classList.remove("active");
    renderMatchmakerPanel();
  };
  const wInput = document.getElementById("mmWorkInput");
  wInput.oninput = e => { mmWorkQuery = e.target.value; };
  wInput.onkeydown = e => { if (e.key === "Enter") runPersonalMatchmaker(); };
  document.getElementById("mmCommuteSel").onchange = e => { mmCommuteKm = Number(e.target.value); };

  mount.querySelectorAll(".mmSpotChip").forEach(btn => {
    btn.onclick = () => {
      mmWorkQuery = btn.dataset.q;
      renderMatchmakerPanel();
    };
  });

  const buySlider = document.getElementById("mmBuySlider");
  if (buySlider) {
    buySlider.oninput = e => {
      mmBuyBudgetWan = Number(e.target.value);
      const dp = (mmBuyBudgetWan * calcDown).toFixed(0);
      const mp = Math.round(calcMonthlyPayment(mmBuyBudgetWan * 10000 * (1 - calcDown), calcRate, 30));
      buySlider.previousElementSibling.querySelector("b").textContent = `${mmBuyBudgetWan} 万（首付约${dp}万 · 月供¥${fmt(mp)}）`;
    };
  }
  const rentSlider = document.getElementById("mmRentSlider");
  if (rentSlider) {
    rentSlider.oninput = e => {
      mmRentBudgetYuan = Number(e.target.value);
      const sal = Math.round((mmRentBudgetYuan / 0.3) / 100) * 100;
      rentSlider.previousElementSibling.querySelector("b").textContent = `¥${fmt(mmRentBudgetYuan)}/月（建议月薪 ≥¥${fmt(sal)}）`;
    };
  }

  mount.querySelectorAll("[data-barea]").forEach(b => { b.onclick = () => { mmBuyArea = Number(b.dataset.barea); renderMatchmakerPanel(); }; });
  mount.querySelectorAll("[data-bpref]").forEach(b => { b.onclick = () => { mmBuyPref = b.dataset.bpref; renderMatchmakerPanel(); }; });
  mount.querySelectorAll("[data-rlayout]").forEach(b => { b.onclick = () => { setRentLayout(b.dataset.rlayout); }; });
  mount.querySelectorAll("[data-rpref]").forEach(b => { b.onclick = () => { mmRentPref = b.dataset.rpref; renderMatchmakerPanel(); }; });

  document.getElementById("mmRunBtn").onclick = runPersonalMatchmaker;

  mount.querySelectorAll(".mmResCard").forEach(card => {
    card.onclick = () => {
      const id = card.dataset.id;
      locateRegion(id);
    };
  });
}

function toggleMatchmaker(forceState) {
  matchmakerOpen = typeof forceState === "boolean" ? forceState : !matchmakerOpen;
  document.getElementById("openMatchmakerBtn")?.classList.toggle("active", matchmakerOpen);
  renderMatchmakerPanel();
  if (matchmakerOpen) {
    document.querySelector(".sideScroll")?.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// ============================================================================
// Arbitrary-Point + Zoom-Adaptive Multi-Scale Commute Circle Engine
// ============================================================================

const COMMUTE_RING_TIERS = {
  doorway: {
    key: "doorway",
    shortDesc: "100/250/400m",
    rings: [0.4, 0.25, 0.1],
    labels: ["0-100m 楼下圈", "100-250m 步行3分", "250-400m 街口圈"],
    title: "500m内 楼下周边代表小区：",
    minArbKm: 0.05,
    maxArbKm: 0.8,
  },
  walk: {
    key: "walk",
    shortDesc: "200/500/800m",
    rings: [0.8, 0.5, 0.2],
    labels: ["0-200m 楼下圈", "200-500m 步行5分", "500-800m 地铁圈"],
    title: "1km内 家门口低价板块/小区：",
    minArbKm: 0.08,
    maxArbKm: 1.5,
  },
  doorstep: {
    key: "doorstep",
    shortDesc: "500m/1/1.5km",
    rings: [1.5, 1, 0.5],
    labels: ["0-500m 步行圈", "500m-1km 社区圈", "1-1.5km 骑行圈"],
    title: "2km内 社区周边高性价比板块/小区：",
    minArbKm: 0.1,
    maxArbKm: 2.5,
  },
  micro: {
    key: "micro",
    shortDesc: "1/2/3km",
    rings: [3, 2, 1],
    labels: ["0-1km 步行圈", "1-2km 骑行圈", "2-3km 接驳圈"],
    title: "3km内 步行骑行低价板块/小区：",
    minArbKm: 0.15,
    maxArbKm: 4.2,
  },
  near: {
    key: "near",
    shortDesc: "1/3/5km",
    rings: [5, 3, 1],
    labels: ["0-1km 步行圈", "1-3km 骑行圈", "3-5km 3站地铁"],
    title: "5km内 近距高性价比街道/小区：",
    minArbKm: 0.25,
    maxArbKm: 6.5,
  },
  street: {
    key: "street",
    shortDesc: "2/5/10km",
    rings: [10, 5, 2],
    labels: ["0-2km 步行骑行", "2-5km 近距地铁", "5-10km 跨板块"],
    title: "10km内 周边高性价比街道/片区：",
    minArbKm: 0.5,
    maxArbKm: 11.5,
  },
  urban: {
    key: "urban",
    shortDesc: "5/10/20km",
    rings: [20, 10, 5],
    labels: ["0-5km 近距圈", "5-10km 市内圈", "10-20km 跨区圈"],
    title: "20km内 跨板块/跨区价格洼地：",
    minArbKm: 1.5,
    maxArbKm: 22,
  },
  suburb: {
    key: "suburb",
    shortDesc: "10/20/30km",
    rings: [30, 20, 10],
    labels: ["0-10km 城区圈", "10-20km 近郊圈", "20-30km 远郊圈"],
    title: "30km内 都市通勤价格洼地：",
    minArbKm: 2.5,
    maxArbKm: 32,
  },
  metro: {
    key: "metro",
    shortDesc: "15/30/50km",
    rings: [50, 30, 15],
    labels: ["0-15km 核心圈", "15-30km 通勤圈", "30-50km 外溢圈"],
    title: "50km内 跨区/跨城通勤洼地：",
    minArbKm: 3.5,
    maxArbKm: 49,
  },
  region: {
    key: "region",
    shortDesc: "30/60/100km",
    rings: [100, 60, 30],
    labels: ["0-30km 都市圈", "30-60km 城际圈", "60-100km 卫星城"],
    title: "100km内 城市群低价卫星城/区县：",
    minArbKm: 8,
    maxArbKm: 100,
  },
  cluster: {
    key: "cluster",
    shortDesc: "60/120/200km",
    rings: [200, 120, 60],
    labels: ["0-60km 都市圈", "60-120km 城际圈", "120-200km 跨城圈"],
    title: "200km内 城市群低价周边城市：",
    minArbKm: 15,
    maxArbKm: 200,
  },
  macro: {
    key: "macro",
    shortDesc: "120/250/400km",
    rings: [400, 250, 120],
    labels: ["0-120km 都市群", "120-250km 省际圈", "250-400km 区域圈"],
    title: "400km内 区域经济圈低价城市：",
    minArbKm: 30,
    maxArbKm: 400,
  },
  national: {
    key: "national",
    shortDesc: "250/500/800km",
    rings: [800, 500, 250],
    labels: ["0-250km 核心群", "250-500km 邻省圈", "500-800km 高铁圈"],
    title: "800km内 3小时高铁圈低价城市：",
    minArbKm: 60,
    maxArbKm: 800,
  },
};

let commuteRingMode = "auto"; // "auto" | "micro" | "street" | "urban" | "metro"
let commuteFreeClick = true;
let draggingCommutePin = false;
let lastResolvedCommuteTierKey = "";

function syncCommuteTitleBadge(tier) {
  const titleEl = document.getElementById("radiusTitleSpan");
  if (!titleEl || !tier) return;
  titleEl.textContent = commuteRingMode === "auto"
    ? `都市通勤圈 · 自动 (${tier.shortDesc})`
    : `都市通勤圈 · 锁定 (${tier.shortDesc})`;
}

function wgs84ToGcj02Client(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [lon, lat];
  if (lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lon, lat];
  if (lon >= 119.8 && lon <= 122.3 && lat >= 21.7 && lat <= 25.5) return [lon, lat]; // Taiwan uses WGS84
  const a = 6378245.0, ee = 0.00669342162296594323;
  const x = lon - 105.0, y = lat - 35.0;
  let dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  dLat += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  dLat += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  dLat += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  let dLon = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  dLon += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  dLon += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  dLon += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  dLon = (dLon * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [Number((lon + dLon).toFixed(6)), Number((lat + dLat).toFixed(6))];
}

function getActiveCommuteTier() {
  if (commuteRingMode !== "auto" && COMMUTE_RING_TIERS[commuteRingMode]) {
    return COMMUTE_RING_TIERS[commuteRingMode];
  }
  // Compute real screen pixels per kilometer so the outer ring spans ~35%-60% of the map viewport (~290-560px diameter)
  const refLat = commuteAnchor?.lat || 31;
  const refLon = commuteAnchor?.lon || 114;
  const p0 = projectLonLat(refLon, refLat);
  const pN = projectLonLat(refLon, refLat + 1 / 111.12);
  const uy = Math.max(0.01, Math.abs(pN.y - p0.y));
  const vb = svg.viewBox.baseVal;
  const cw = mapShell?.clientWidth || 960;
  const ch = mapShell?.clientHeight || 820;
  const svgToCss = vb && vb.width > 0 ? Math.min(cw / vb.width, ch / vb.height) : 0.55;
  const pxPerKm = uy * state.scale * svgToCss;
  const targetOuterPx = Math.max(165, Math.min(cw, ch) * 0.225);
  const idealOuterKm = targetOuterPx / Math.max(0.04, pxPerKm);

  if (idealOuterKm <= 0.56) return COMMUTE_RING_TIERS.doorway;
  if (idealOuterKm <= 1.10) return COMMUTE_RING_TIERS.walk;
  if (idealOuterKm <= 2.12) return COMMUTE_RING_TIERS.doorstep;
  if (idealOuterKm <= 3.87) return COMMUTE_RING_TIERS.micro;
  if (idealOuterKm <= 7.07) return COMMUTE_RING_TIERS.near;
  if (idealOuterKm <= 14.1) return COMMUTE_RING_TIERS.street;
  if (idealOuterKm <= 24.5) return COMMUTE_RING_TIERS.urban;
  if (idealOuterKm <= 38.7) return COMMUTE_RING_TIERS.suburb;
  if (idealOuterKm <= 70.7) return COMMUTE_RING_TIERS.metro;
  if (idealOuterKm <= 141.4) return COMMUTE_RING_TIERS.region;
  if (idealOuterKm <= 282.8) return COMMUTE_RING_TIERS.cluster;
  if (idealOuterKm <= 565.7) return COMMUTE_RING_TIERS.macro;
  return COMMUTE_RING_TIERS.national;
}

function nearestRegionAtContentPt(x, y) {
  let best = null, bestD2 = Infinity;
  const preferDist = coveredProvinces.size > 0;
  for (let i = 0; i < places.length; i += 1) {
    const r = places[i];
    if (!r.price) continue;
    if (preferDist && r.dataLevel === "city" && coveredProvinces.has(r.province)) continue;
    const d2 = (r.cx - x) ** 2 + (r.cy - y) ** 2;
    if (d2 < bestD2) { bestD2 = d2; best = r; }
  }
  return best;
}

function setCommuteAnchorFreeContentPt(x, y, customLabel = "", hitRegion = null, updatePanelNow = true) {
  const [lon, lat] = svgToLonLat(x, y);
  const nearR = hitRegion || nearestRegionAtContentPt(x, y);
  const regionLabel = nearR ? (nearR.city === nearR.name ? nearR.name : `${nearR.city.replace(/市$/, "")}·${nearR.name}`) : "地图自选点";
  const label = customLabel || `${regionLabel}自选点`;
  commuteAnchor = {
    id: nearR?.id || "",
    lon,
    lat,
    x,
    y,
    prov: nearR?.province || "",
    name: label,
    price: nearR?.price || null,
    rentYield: nearR ? effectiveRentYield(nearR) : 2.1,
    custom: true,
  };
  renderCommuteOverlay();
  if (updatePanelNow) updateCommutePanel();
}

function setCommuteAnchorLonLat(lon, lat, customLabel = "", flyScale = 0) {
  const pt = projectLonLat(lon, lat);
  setCommuteAnchorFreeContentPt(pt.x, pt.y, customLabel, null, true);
  if (flyScale > 0) {
    focusLonLat(lon, lat, Math.max(state.scale, flyScale), true);
  }
}

async function searchCommutePoiCandidates(q) {
  const query = String(q || "").trim();
  if (!query) return [];
  const results = [];

  // 1. Match street/business-circle plates first
  await ensureStreetPlatesLoaded();
  for (const hit of plateSearchIndex) {
    if (`${hit.city}${hit.district}${hit.n}`.includes(query)) {
      const dist = places.find(p => p.sk === hit.sk) || regions.find(c => c.city.includes(hit.city));
      if (dist) {
        const dp = streetPlatesCache.platesByDistrict?.[hit.sk];
        const seed = (strHash(hit.sk) % 12) * 0.26;
        const span = dist.span || 2.2;
        const theta = seed + (hit.pIdx + 1) * 2.39996;
        const rad = Math.min(span * (0.20 + 0.09 * Math.sqrt(hit.pIdx + 1)), 0.8);
        const [lon, lat] = svgToLonLat(dist.cx + Math.cos(theta) * rad, dist.cy + Math.sin(theta) * rad * 0.78);
        results.push({ name: `${hit.city}·${hit.district}·${hit.n}`, sub: `板块均价 ${fmt(hit.p)} 元/㎡`, lon, lat });
        if (results.length >= 3) break;
      }
    }
  }

  // 2. Geocode arbitrary buildings / subway stations / landmarks (WGS84 -> GCJ02)
  try {
    if (HAS_LOCAL_API) {
      const r = await fetch(`/api/poi?q=${encodeURIComponent(query)}`);
      if (r.ok) {
        const j = await r.json();
        if (j.ok && Array.isArray(j.results)) results.push(...j.results);
      }
    } else {
      const nom = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=4&countrycodes=cn,hk,mo,tw&accept-language=zh-CN&q=${encodeURIComponent(query)}`);
      if (nom.ok) {
        const arr = await nom.json();
        (arr || []).forEach(it => {
          const [gLon, gLat] = wgs84ToGcj02Client(Number(it.lon), Number(it.lat));
          const parts = String(it.display_name || "").split(",").map(s => s.trim()).filter(Boolean);
          results.push({ name: parts[0] || query, sub: parts.slice(1, 4).join(" · "), lon: gLon, lat: gLat });
        });
      }
    }
  } catch (_) {}

  // 3. Match loaded districts/cities fallback
  if (!results.length) {
    for (const p of places) {
      if (`${p.city}${p.name}`.includes(query)) {
        const [lon, lat] = svgToLonLat(p.cx, p.cy);
        results.push({ name: p.city === p.name ? p.name : `${p.city}·${p.name}`, sub: p.province || "", lon, lat });
        if (results.length >= 4) break;
      }
    }
  }
  return results.slice(0, 5);
}

function updateCommutePanelMultiScale() {
  if (!commuteActive || !commuteAnchor || !radiusAnchorInfo) return;
  const { lon, lat, name, price, prov, rentYield } = commuteAnchor;
  const tier = getActiveCommuteTier();
  lastResolvedCommuteTierKey = tier.key;
  const [rOuter, rMid, rInner] = tier.rings; // e.g. [10, 5, 2] -> inner=2, mid=5, outer=10

  // Auto-load target & neighboring metro provinces for cross-city accuracy
  if (prov) {
    const provs = [prov, ...(CROSS_PROVINCE_METRO_NEIGHBORS[prov] || [])];
    provs.forEach(pv => {
      const src = detailSources.find(s => s.prov === pv);
      if (src && !loadedDetailSources.has(src.id) && !loadingDetailSources.has(src.id)) {
        loadDetailSource(src).then(() => updateCommutePanel());
      }
    });
  }
  if (rOuter <= 25 && !streetPlatesCache && !streetPlatesLoading) {
    ensureStreetPlatesLoaded().then(() => updateCommutePanel());
  }

  const isRent = userIntent === "rent";
  const anchorVal = isRent
    ? (price ? estMonthlyRentFromUnit(price, rentYield || 2.1, rentLayout) : null)
    : price;

  const b1 = [], b2 = [], b3 = [], arbitrage = [];
  const seenArbNames = new Set();

  // A0. Include loaded Community (Xiaoqu) pins when zoomed into <= 5km micro/walking rings
  if (rOuter <= 5 && typeof activePlateCommunities !== "undefined" && activePlateCommunities.length) {
    for (let i = 0; i < activePlateCommunities.length; i += 1) {
      const it = activePlateCommunities[i];
      const det = (typeof selectedCommunityDetail !== "undefined" && selectedCommunityDetail?.id === it.id)
        ? selectedCommunityDetail
        : (typeof xqBrowserCache !== "undefined" ? xqBrowserCache.details[`${it.c}:${it.id}`]?.detail : null)
          || (typeof cityShardCache !== "undefined" ? cityShardCache.get(it.c)?.details?.[it.id] : null);
      if (!det?.lng || !det?.lat || !it.p) continue;
      const dKm = haversineKm(lon, lat, det.lng, det.lat);
      const val = isRent ? estMonthlyRentFromUnit(it.p, det.estRentYield || rentYield || 2.1, rentLayout) : it.p;
      if (!val) continue;
      if (dKm <= rInner) b1.push(val);
      else if (dKm <= rMid) b2.push(val);
      else if (dKm <= rOuter) b3.push(val);
      const arbLabel = `小区·${it.n}`;
      if (anchorVal && dKm >= tier.minArbKm && dKm <= tier.maxArbKm && val < anchorVal * 0.90 && !seenArbNames.has(arbLabel)) {
        seenArbNames.add(arbLabel);
        arbitrage.push({
          label: arbLabel,
          dKm,
          val,
          savePct: Math.max(1, Math.round((1 - val / anchorVal) * 100)),
          xqId: it.id,
        });
      }
    }
  }

  // A. Include Street/Business-Circle Plates when zoomed into <= 25km rings!
  if (rOuter <= 25 && streetPlatesCache?.platesByDistrict) {
    for (let i = 0; i < places.length; i += 1) {
      const dist = places[i];
      if (!dist.sk || dist.dataLevel === "city") continue;
      const [dLon, dLat] = svgToLonLat(dist.cx, dist.cy);
      if (haversineKm(lon, lat, dLon, dLat) > rOuter + 18) continue;
      const dp = streetPlatesCache.platesByDistrict[dist.sk];
      if (!dp?.plates?.length) continue;
      const seed = (strHash(dist.sk) % 12) * 0.26;
      const span = dist.span || 2.6;
      const dYld = effectiveRentYield(dist);
      dp.plates.forEach((pl, k) => {
        const theta = seed + (k + 1) * 2.39996;
        const rad = Math.min(span * (0.20 + 0.09 * Math.sqrt(k + 1)), 1.1);
        const [pLon, pLat] = svgToLonLat(dist.cx + Math.cos(theta) * rad, dist.cy + Math.sin(theta) * rad * 0.78);
        const dKm = haversineKm(lon, lat, pLon, pLat);
        const val = isRent ? estMonthlyRentFromUnit(pl.p, dYld, rentLayout) : pl.p;
        if (!val) return;
        if (dKm <= rInner) b1.push(val);
        else if (dKm <= rMid) b2.push(val);
        else if (dKm <= rOuter) b3.push(val);
        const arbLabel = `${dist.name.replace(/[区县市]$/, "")}·${pl.n}`;
        if (anchorVal && dKm >= tier.minArbKm && dKm <= tier.maxArbKm && val < anchorVal * 0.82 && !seenArbNames.has(arbLabel)) {
          seenArbNames.add(arbLabel);
          arbitrage.push({
            label: arbLabel,
            dKm,
            val,
            savePct: Math.round((1 - val / anchorVal) * 100),
            distId: dist.id,
            pIdx: k,
          });
        }
      });
    }
  }

  // B. Include Districts / Cities
  const preferDistricts = loadedDetailSources.size > 0;
  for (let i = 0; i < places.length; i += 1) {
    const r = places[i];
    if (!r.price || (preferDistricts && r.dataLevel === "city" && coveredProvinces.has(r.province))) continue;
    const [rLon, rLat] = svgToLonLat(r.cx, r.cy);
    const dKm = haversineKm(lon, lat, rLon, rLat);
    const val = isRent ? estPlaceMonthlyRent(r, rentLayout) : r.price;
    if (!val) continue;
    if (dKm <= rInner) b1.push(val);
    else if (dKm <= rMid) b2.push(val);
    else if (dKm <= rOuter) b3.push(val);
    const arbLabel = r.city === r.name ? r.name : `${r.city.replace(/市$/, "")}·${r.name}`;
    if (anchorVal && dKm >= tier.minArbKm && dKm <= tier.maxArbKm && val < anchorVal * 0.80 && !isInherited(r) && !seenArbNames.has(arbLabel)) {
      seenArbNames.add(arbLabel);
      arbitrage.push({
        label: arbLabel,
        dKm,
        val,
        savePct: Math.round((1 - val / anchorVal) * 100),
        id: r.id,
      });
    }
  }

  const fmtCell = v => (!v ? "--" : (isRent ? fmtRentShort(v) : fmtWan(v)));
  const coordStr = `${lon.toFixed(3)}°, ${lat.toFixed(3)}°`;
  const refStr = anchorVal ? (isRent ? `周边月租约 ${fmtRentShort(anchorVal)}` : `周边均价约 ${fmt(price)} 元/㎡`) : "";

  radiusAnchorInfo.innerHTML =
    `起点：<b>${escapeHtml(name)}</b> <small style="color:var(--ink-muted)">(${coordStr})</small>` +
    (refStr ? `<br><span>${escapeHtml(refStr)} · 可点图任意处或拖拽起点图钉</span>` : `<br><span>可直接点击地图任意位置或按住起点图钉拖拽</span>`);

  if (!b1.length && anchorVal) b1.push(anchorVal);
  const m1 = medianNum(b1), m2 = medianNum(b2), m3 = medianNum(b3);
  radiusRingStats.innerHTML =
    '<div class="ringStatCell"><span>' + tier.labels[0] + '</span><b>' + fmtCell(m1) + '</b></div>' +
    '<div class="ringStatCell"><span>' + tier.labels[1] + '</span><b>' + fmtCell(m2) + '</b></div>' +
    '<div class="ringStatCell"><span>' + tier.labels[2] + '</span><b>' + fmtCell(m3) + '</b></div>';

  arbitrage.sort((a, b) => b.savePct - a.savePct || a.dKm - b.dKm);
  const topArb = arbitrage.slice(0, 5);
  radiusArbitrage.innerHTML = topArb.length
    ? '<div style="font-size:12px;font-weight:800;color:var(--ink-secondary);margin-top:2px">' + escapeHtml(tier.title) + '</div>' +
      topArb.map((item, idx) =>
        '<div class="arbItem" data-arb-idx="' + idx + '"><span><b>' + escapeHtml(item.label) + '</b> <small style="color:var(--ink-muted)">' + (item.dKm < 1 ? Math.round(item.dKm * 1000) + "m" : item.dKm.toFixed(1) + "km") + '</small></span><span><b style="color:var(--down)">省' + item.savePct + '%</b> · ' + fmtCell(item.val) + '</span></div>'
      ).join("")
    : '<div style="font-size:12px;color:var(--ink-muted)">当前半径内价格较均衡；可拖拽起点图钉到核心商务区或切换更大半径发现周边低价片区。</div>';

  radiusArbitrage.querySelectorAll(".arbItem").forEach(el => {
    el.onclick = () => {
      const it = topArb[Number(el.dataset.arbIdx)];
      if (!it) return;
      if (it.xqId && typeof onTapCommunityPin === "function") {
        onTapCommunityPin(it.xqId);
      } else if (it.distId !== undefined && it.pIdx !== undefined) {
        selectStreetPlate(it.distId, it.pIdx, true);
      } else if (it.id) {
        locateRegion(it.id);
      }
    };
  });
}

function initCommuteControlsUX() {
  const freeBtn = document.getElementById("toggleFreeClickBtn");
  const myLocBtn = document.getElementById("commuteMyLocBtn");
  const poiInput = document.getElementById("commutePoiInput");
  const poiBtn = document.getElementById("commutePoiBtn");
  const candBox = document.getElementById("commutePoiCandidates");

  const syncFreeCursor = () => {
    svg.classList.toggle("commuteFreeClick", Boolean(commuteActive && commuteFreeClick));
    if (freeBtn) {
      freeBtn.classList.toggle("active", commuteFreeClick);
      freeBtn.textContent = commuteFreeClick ? "点图自由设圆心: 开" : "点图自由设圆心: 关";
    }
  };

  if (freeBtn) {
    freeBtn.onclick = () => {
      commuteFreeClick = !commuteFreeClick;
      syncFreeCursor();
      showToast(commuteFreeClick ? "已开启：点击地图任意位置即可设为通勤起点" : "已关闭点图设圆心（仍可拖拽起点图钉）");
    };
  }

  document.querySelectorAll(".ringModeBtn").forEach(btn => {
    btn.onclick = () => {
      commuteRingMode = btn.dataset.rmode;
      document.querySelectorAll(".ringModeBtn").forEach(b => b.classList.toggle("active", b === btn));
      renderCommuteOverlay();
      updateCommutePanel();
    };
  });

  if (myLocBtn) {
    myLocBtn.onclick = () => {
      if (!navigator.geolocation) {
        showToast("当前浏览器不支持地理定位，可直接点击地图或输入地点");
        return;
      }
      myLocBtn.textContent = "定位中...";
      navigator.geolocation.getCurrentPosition(
        pos => {
          myLocBtn.textContent = "定位当前处";
          const [gLon, gLat] = wgs84ToGcj02Client(pos.coords.longitude, pos.coords.latitude);
          setCommuteAnchorLonLat(gLon, gLat, "我的当前位置", 20);
          showToast("已将您的当前位置设为通勤起点");
        },
        () => {
          myLocBtn.textContent = "定位当前处";
          showToast("无法获取定位权限，请直接点击地图或输入写字楼/地铁站名称");
        },
        { timeout: 7000 }
      );
    };
  }

  const doPoiSearch = async () => {
    const q = poiInput?.value.trim();
    if (!q) {
      showToast("请输入写字楼、地铁站或街道名称，或直接点击地图任意位置");
      return;
    }
    poiBtn.disabled = true;
    poiBtn.textContent = "检索...";
    try {
      const list = await searchCommutePoiCandidates(q);
      if (!list.length) {
        candBox.style.display = "none";
        showToast("未找到该地点，您可开启「底图」后直接在地图上点击设圆心");
        return;
      }
      if (list.length === 1) {
        candBox.style.display = "none";
        setCommuteAnchorLonLat(list[0].lon, list[0].lat, list[0].name, 65);
        showToast(`已将通勤圆心设为：${list[0].name}`);
        return;
      }
      candBox.style.display = "flex";
      candBox.innerHTML = list.map((it, i) =>
        '<button type="button" class="poiCandItem" data-pidx="' + i + '"><b>' + escapeHtml(it.name) + '</b>' + (it.sub ? '<small>' + escapeHtml(it.sub) + '</small>' : '') + '</button>'
      ).join("");
      candBox.querySelectorAll(".poiCandItem").forEach(el => {
        el.onclick = () => {
          const picked = list[Number(el.dataset.pidx)];
          candBox.style.display = "none";
          setCommuteAnchorLonLat(picked.lon, picked.lat, picked.name, 65);
          showToast(`已将通勤圆心设为：${picked.name}`);
        };
      });
    } finally {
      poiBtn.disabled = false;
      poiBtn.textContent = "设圆心";
    }
  };

  if (poiBtn) poiBtn.onclick = doPoiSearch;
  if (poiInput) poiInput.onkeydown = e => { if (e.key === "Enter") doPoiSearch(); };
  window.__syncCommuteFreeCursor = syncFreeCursor;
}

function initMatchmakerUX() {
  initCommuteControlsUX();
  syncEstRentMetricConfig();
  document.querySelectorAll(".intentBtn[data-intent]").forEach(btn => {
    btn.onclick = () => setIntentMode(btn.dataset.intent);
    const on = btn.dataset.intent === userIntent;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  const mmBtn = document.getElementById("openMatchmakerBtn");
  if (mmBtn) mmBtn.onclick = () => toggleMatchmaker();

  // Open matchmaker gently by default on first visit when no URL deep-link region is specified
  const hasUrlTarget = new URLSearchParams(location.search).has("region") || new URLSearchParams(location.search).has("view");
  if (!hasUrlTarget) {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem("atlas-mm-seen") === "1"; } catch (_) {}
    if (!dismissed) {
      matchmakerOpen = true;
      mmBtn?.classList.add("active");
      try { sessionStorage.setItem("atlas-mm-seen", "1"); } catch (_) {}
    }
  }

  if (userIntent === "rent") {
    setIntentMode("rent", true);
  } else {
    renderMatchmakerPanel();
    updateNavBreadcrumb();
  }
}

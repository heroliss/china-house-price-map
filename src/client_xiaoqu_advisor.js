// ============================================================================
// 4th-Tier On-Demand Community (Xiaoqu) Engine + 5D Buying Advisor + BYOK AI
// ============================================================================

const communityPinLayer = document.getElementById("communityPinLayer");
const XQ_CACHE_KEY = "atlas-xq-cache-v1";
const XQ_TTL_MS = 7 * 24 * 3600 * 1000;
const cityShardCache = new Map();
const cityShardLoading = new Map();

let xqBrowserCache = { plates: {}, details: {} };
try {
  const rawXq = JSON.parse(localStorage.getItem(XQ_CACHE_KEY) || "null");
  if (rawXq && rawXq.plates && rawXq.details) xqBrowserCache = rawXq;
} catch (_) {}

let activePlateCommunities = [];
let activePlateSlug = "";
let activePlateSourceTag = "";
let selectedCommunityDetail = null;
let loadingCommunityId = "";
const discoveredDistrictAttempted = new Set();

function persistXqBrowserCache() {
  try {
    // Keep cache compact (max 60 plates & 120 community details)
    const pKeys = Object.keys(xqBrowserCache.plates);
    if (pKeys.length > 60) delete xqBrowserCache.plates[pKeys[0]];
    const dKeys = Object.keys(xqBrowserCache.details);
    if (dKeys.length > 120) delete xqBrowserCache.details[dKeys[0]];
    localStorage.setItem(XQ_CACHE_KEY, JSON.stringify(xqBrowserCache));
  } catch (_) {}
}

function bd09ToGcj02Client(bdLon, bdLat) {
  const x = Number(bdLon) - 0.0065, y = Number(bdLat) - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin((y * Math.PI * 3000.0) / 180.0);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos((x * Math.PI * 3000.0) / 180.0);
  return [Number((z * Math.cos(theta)).toFixed(6)), Number((z * Math.sin(theta)).toFixed(6))];
}

function stripTagsClient(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<i[^>]*icon-intro[^>]*>[\s\S]*?<\/i>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePlateHtmlInBrowser(html, sf = 1) {
  const out = [], seen = new Set();
  const re = /href=["']https?:\/\/m\.fang\.com\/(?:fangjia\/)?xiaoqu\/([a-z0-9]+)\/(\d+)\.html["'][^>]*>([\s\S]{1,600}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const c = m[1], id = m[2];
    if (seen.has(id)) continue;
    const nm = m[3].match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const pm = m[3].match(/class=["']price["'][^>]*>[\s\S]*?([\d,]{3,7})/i) || m[3].match(/([\d,]{4,7})\s*元/);
    if (!nm || !pm) continue;
    const n = stripTagsClient(nm[1]);
    const rp = Math.round(Number(String(pm[1]).replace(/,/g, "")));
    if (!n || !rp || rp < 800) continue;
    let mom = "--%";
    const cm = m[3].match(/class=["']([^"']*(?:jt-up|jt-dn|up|down)[^"']*)["'][^>]*>([\s\S]*?)<\/span>/i);
    if (cm) {
      const v = Number(stripTagsClient(cm[2]).replace(/[^\d.+-]/g, ""));
      if (Number.isFinite(v)) mom = (/dn|down/i.test(cm[1]) ? "-" : "+") + Math.abs(v).toFixed(2) + "%";
    }
    seen.add(id);
    out.push({ id, c, n, p: Math.round(rp * sf), rp: sf !== 1 ? rp : undefined, m: mom });
    if (out.length >= 20) break;
  }
  return out;
}

function parseDetailHtmlInBrowser(html, c, id, sf = 1) {
  const info = { id: String(id), c: String(c), name: "", rawPrice: null, price: null, mom: "", rating: null, address: "", developer: "", propertyCompany: "", propertyFee: "", year: null, propType: "", archType: "", households: null, buildings: null, greenRate: "", plotRatio: null, tenure: "", lng: null, lat: null, saleSamples: [], rentSamples: [], estRentYield: null };
  const tm = html.match(/<title>([^<-_—]+)/i);
  if (tm) info.name = stripTagsClient(tm[1]).replace(/(详情|二手房|房价|小区).*$/, "").trim();
  const dm = html.match(/<meta\s+name=["']Description["']\s+content=["']([^"']+)["']/i);
  if (dm) {
    const dev = dm[1].match(/由([^，,。]+?)负责开发/); if (dev) info.developer = stripTagsClient(dev[1]);
    const adr = dm[1].match(/小区地址是([^，,。]+?)(?:套|，|,|$)/); if (adr) info.address = stripTagsClient(adr[1]).replace(/^区/, "");
    const yr = dm[1].match(/竣工时间(\d{4})年/); if (yr) info.year = Number(yr[1]);
  }
  const rm = html.match(/>(\d\.\d)\s*分</); if (rm) info.rating = Number(rm[1]);
  const pm = html.match(/class=["']top-price["'][\s\S]{0,260}?<strong>([\d,]+)<\/strong>/i);
  if (pm) { const rp = Number(pm[1].replace(/,/g, "")); if (rp >= 800) { info.rawPrice = rp; info.price = Math.round(rp * sf); } }
  const mm = html.match(/markers=([\d.]+)\s*,\s*([\d.]+)/i) || html.match(/center=([\d.]+)\s*,\s*([\d.]+)/i);
  if (mm) { const [gLon, gLat] = bd09ToGcj02Client(mm[1], mm[2]); info.lng = gLon; info.lat = gLat; }
  const sr = /<li>\s*<span>\s*([^<]+?)\s*<\/span>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi;
  let sm;
  while ((sm = sr.exec(html))) {
    const k = stripTagsClient(sm[1]), v = stripTagsClient(sm[2]);
    if (!k || !v || v === "暂无") continue;
    if (k.includes("建筑年代")) { const y = Number((v.match(/(19\d{2}|20\d{2})/) || [])[1]); if (y) info.year = y; }
    else if (k.includes("建筑类型")) info.archType = v;
    else if (k.includes("房屋总数")) { const h = Number((v.match(/(\d+)/) || [])[1]); if (h) info.households = h; }
    else if (k.includes("楼栋总数")) { const b = Number((v.match(/(\d+)/) || [])[1]); if (b) info.buildings = b; }
    else if (k.includes("绿化率")) info.greenRate = v;
    else if (k.includes("容积率")) { const pr = Number((v.match(/([\d.]+)/) || [])[1]); if (pr > 0) info.plotRatio = Number(pr.toFixed(2)); }
    else if (k.includes("物业费")) info.propertyFee = v;
    else if (k.includes("物业公司")) info.propertyCompany = v;
  }
  const plain = stripTagsClient(html);
  const slRe = /建面[:：]?\s*([\d.]+)\s*㎡\s*(\d室\d厅)[\s\S]{0,60}?([\d.]+)\s*万\s*([\d,]+)\s*元\/㎡/g;
  let slm;
  while ((slm = slRe.exec(plain)) && info.saleSamples.length < 2) {
    info.saleSamples.push({ area: Number(slm[1]), layout: slm[2], totalWan: Number(slm[3]), unitPrice: Number(slm[4].replace(/,/g, "")) });
  }
  const rtRe = /(?:([\d.]+)\s*㎡\s*)?(\d室\d厅)\s*(?:整租|合租)[\s\S]{0,45}?([\d,]+)\s*元\/月/g;
  let rtm;
  while ((rtm = rtRe.exec(plain)) && info.rentSamples.length < 2) {
    info.rentSamples.push({ area: rtm[1] ? Number(rtm[1]) : null, layout: rtm[2], monthly: Number(rtm[3].replace(/,/g, "")) });
  }
  const rArea = info.rentSamples.find(x => x.area >= 20);
  const refU = info.rawPrice || info.saleSamples[0]?.unitPrice;
  if (refU && rArea) {
    const yld = ((rArea.monthly * 12) / (refU * rArea.area)) * 100;
    if (yld >= 0.4 && yld <= 9.5) info.estRentYield = Number(yld.toFixed(2));
  }
  return info;
}

const PREWARMED_SHARD_CODES = new Set([
  "sz", "gz", "sh", "bj", "hz", "cd", "nanjing", "suzhou", "wuhan", "cq",
  "dg", "fs", "sjz", "tj", "xian", "zz", "jn", "cs", "sy",
]);
const HAS_LOCAL_API = location.hostname === "localhost" || location.hostname === "127.0.0.1" || (!location.hostname.endsWith(".github.io") && location.protocol.startsWith("http"));

function parseXfHtmlInBrowser(html) {
  const out = [], seen = new Set();
  const re = /href=["']https?:\/\/m\.fang\.com\/xf\/([a-z0-9]+)\/(\d+)\.html?["'][^>]*>([\s\S]{1,700}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const c = m[1], id = m[2];
    if (seen.has(id)) continue;
    const plain = stripTagsClient(m[3]);
    const pm = plain.match(/([\d,]{3,6})\s*元\/[平㎡m]/i);
    if (!pm) continue;
    const rp = Math.round(Number(pm[1].replace(/,/g, "")));
    const n = plain.split(/\s+/)[0]?.trim();
    if (!n || n.length < 2 || !rp || rp < 800) continue;
    seen.add(id);
    out.push({ id, c, n, p: rp, rp, m: "在售楼盘", isXf: true });
    if (out.length >= 20) break;
  }
  return out;
}

async function ensureCityShard(cityCode) {
  if (!cityCode || !PREWARMED_SHARD_CODES.has(cityCode)) return null;
  if (cityShardCache.has(cityCode)) return cityShardCache.get(cityCode);
  if (cityShardLoading.has(cityCode)) return cityShardLoading.get(cityCode);
  const p = fetch(`data/communities/${cityCode}.json`)
    .then(r => (r.ok ? r.json() : null))
    .then(j => { cityShardCache.set(cityCode, j); return j; })
    .catch(() => { cityShardCache.set(cityCode, null); return null; });
  cityShardLoading.set(cityCode, p);
  return p;
}

async function fetchCorsHtml(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const buf = await res.arrayBuffer();
  const head = new TextDecoder("latin1").decode(buf.slice(0, 500));
  return /charset=['"]?gb/i.test(head) ? new TextDecoder("gb18030").decode(buf) : new TextDecoder("utf-8").decode(buf);
}

// 4-Channel Hybrid Loader for Street-Plate Communities
async function loadPlateCommunitiesHybrid(slug, cityCode, scaleFactor = 1) {
  const sf = scaleFactor || 1;
  const applyScale = items => items.map(it => ({
    ...it,
    p: Math.round((it.rp || it.p) * sf),
    rp: sf !== 1 ? (it.rp || it.p) : undefined,
  }));

  // 1. Browser 7d cache
  const mem = xqBrowserCache.plates[slug];
  if (mem && Date.now() - mem.ts < XQ_TTL_MS && mem.items?.length) {
    return { items: applyScale(mem.items), sourceTag: "本地缓存" };
  }

  // 2. Pre-warmed static shard (data/communities/<city>.json)
  const code = cityCode || slug.split("_")[0];
  const shard = await ensureCityShard(code);
  if (shard?.plates?.[slug]?.length) {
    const rawItems = shard.plates[slug].map(x => ({ ...x, rp: x.rp || x.p }));
    xqBrowserCache.plates[slug] = { ts: Date.now(), items: rawItems };
    persistXqBrowserCache();
    return { items: applyScale(rawItems), sourceTag: "预热分片" };
  }

  // 3. Local / Worker Proxy (/api/plate)
  if (HAS_LOCAL_API) {
    try {
      const apiRes = await fetch(`/api/plate?u=${encodeURIComponent(slug)}&sf=1`);
      if (apiRes.ok && (apiRes.headers.get("content-type") || "").includes("json")) {
        const json = await apiRes.json();
        if (json.ok && json.items?.length) {
          const rawItems = json.items.map(x => ({ ...x, rp: x.rp || x.p }));
          xqBrowserCache.plates[slug] = { ts: Date.now(), items: rawItems };
          persistXqBrowserCache();
          return { items: applyScale(rawItems), sourceTag: json.cached ? "服务缓存" : "按需实时" };
        }
      }
    } catch (_) {}
  }

  // 4. Direct Browser CORS Fallback (for pure static GitHub Pages)
  try {
    const workerUrl = new URLSearchParams(location.search).get("worker");
    const target = workerUrl ? `${workerUrl.replace(/\/$/, "")}/raw/plate?u=${encodeURIComponent(slug)}` : `https://m.fang.com/fangjia/${slug}/`;
    const html = await fetchCorsHtml(target);
    let rawItems = parsePlateHtmlInBrowser(html, 1).map(x => ({ ...x, rp: x.p }));
    if (!rawItems.length && !workerUrl) {
      const cityPrefix = slug.split("_list_")[0];
      if (cityPrefix) {
        try {
          const rHtml = await fetchCorsHtml(`https://m.fang.com/fangjia/${cityPrefix}/`);
          rawItems = parsePlateHtmlInBrowser(rHtml, 1).map(x => ({ ...x, rp: x.p }));
        } catch (_) {}
        if (!rawItems.length) {
          try {
            const xHtml = await fetchCorsHtml(`https://m.fang.com/xf/${cityPrefix}/`);
            rawItems = parseXfHtmlInBrowser(xHtml);
          } catch (_) {}
        }
      }
    }
    if (rawItems.length) {
      xqBrowserCache.plates[slug] = { ts: Date.now(), items: rawItems };
      persistXqBrowserCache();
      return { items: applyScale(rawItems), sourceTag: "跨域直连" };
    }
  } catch (_) {}

  return { items: [], sourceTag: "暂无样本" };
}

// 4-Channel Hybrid Loader for Single Community Specs & Coordinates
async function loadCommunityDetailHybrid(cityCode, xqId, scaleFactor = 1, fallbackItem = null) {
  const sf = scaleFactor || 1;
  const cacheKey = `${cityCode}:${xqId}`;
  const scaleDet = d => ({
    ...d,
    name: d.name || fallbackItem?.n || "",
    price: d.rawPrice ? Math.round(d.rawPrice * sf) : (fallbackItem?.p || null),
  });

  // 1. Browser 7d cache
  const mem = xqBrowserCache.details[cacheKey];
  if (mem && Date.now() - mem.ts < XQ_TTL_MS && mem.detail) {
    return scaleDet(mem.detail);
  }

  // 2. Pre-warmed static shard
  const shard = await ensureCityShard(cityCode);
  if (shard?.details?.[xqId]) {
    xqBrowserCache.details[cacheKey] = { ts: Date.now(), detail: shard.details[xqId] };
    persistXqBrowserCache();
    return scaleDet(shard.details[xqId]);
  }

  // 3. Local / Worker Proxy (/api/community)
  if (HAS_LOCAL_API) {
    try {
      const xfFlag = fallbackItem?.isXf ? "&xf=1" : "";
      const apiRes = await fetch(`/api/community?c=${encodeURIComponent(cityCode)}&id=${encodeURIComponent(xqId)}&sf=1${xfFlag}`);
      if (apiRes.ok && (apiRes.headers.get("content-type") || "").includes("json")) {
        const json = await apiRes.json();
        if (json.ok && json.detail) {
          xqBrowserCache.details[cacheKey] = { ts: Date.now(), detail: json.detail };
          persistXqBrowserCache();
          return scaleDet(json.detail);
        }
      }
    } catch (_) {}
  }

  // 4. Direct Browser CORS Fallback
  try {
    const workerUrl = new URLSearchParams(location.search).get("worker");
    const target = workerUrl
      ? `${workerUrl.replace(/\/$/, "")}/raw/community?c=${encodeURIComponent(cityCode)}&id=${encodeURIComponent(xqId)}`
      : (fallbackItem?.isXf ? `https://m.fang.com/xf/${cityCode}/${xqId}.html` : `https://m.fang.com/xiaoqu/${cityCode}/${xqId}.html`);
    const html = await fetchCorsHtml(target);
    const det = parseDetailHtmlInBrowser(html, cityCode, xqId, 1);
    xqBrowserCache.details[cacheKey] = { ts: Date.now(), detail: det };
    persistXqBrowserCache();
    return scaleDet(det);
  } catch (_) {}

  return fallbackItem ? { id: xqId, c: cityCode, name: fallbackItem.n, price: fallbackItem.p, mom: fallbackItem.m } : null;
}

// Render Community Pins onto #communityPinLayer
function renderCommunityPins() {
  if (!communityPinLayer) return;
  if (!fineModeEnabled || state.scale < 12) {
    if (communityPinLayer.innerHTML) communityPinLayer.innerHTML = "";
    return;
  }
  const pinned = [];
  if (selectedCommunityDetail?.lng && selectedCommunityDetail?.lat) {
    pinned.push({ ...selectedCommunityDetail, isSelected: true });
  }
  // Also show any cached coordinate pins from activePlateCommunities
  for (let i = 0; i < activePlateCommunities.length && pinned.length < 8; i += 1) {
    const it = activePlateCommunities[i];
    if (selectedCommunityDetail && it.id === selectedCommunityDetail.id) continue;
    const cached = xqBrowserCache.details[`${it.c}:${it.id}`]?.detail || cityShardCache.get(it.c)?.details?.[it.id];
    if (cached?.lng && cached?.lat) {
      pinned.push({ ...cached, id: it.id, c: it.c, name: it.n, price: it.p, isSelected: false });
    }
  }
  if (!pinned.length) {
    if (communityPinLayer.innerHTML) communityPinLayer.innerHTML = "";
    return;
  }

  const inv = 1 / state.scale;
  const curPlace = activeId ? placeById.get(activeId) : null;
  const isRent = typeof userIntent !== "undefined" && userIntent === "rent";
  communityPinLayer.innerHTML = pinned.map(xq => {
    const pt = projectLonLat(xq.lng, xq.lat);
    const valStr = isRent && xq.price && typeof estMonthlyRentFromUnit === "function"
      ? fmtRentShort(estMonthlyRentFromUnit(xq.price, xq.estRentYield || effectiveRentYield(curPlace)))
      : (xq.price ? fmtWan(xq.price) : "");
    const txt = `${xq.name.slice(0, 7)} ${valStr}`.trim();
    const w = Math.round(txt.length * 8.6 + 18);
    return '<g class="xqPinNode' + (xq.isSelected ? " active" : "") + '" data-xqid="' + xq.id + '" data-xqc="' + xq.c + '" transform="translate(' + pt.x.toFixed(2) + " " + pt.y.toFixed(2) + ") scale(" + inv.toFixed(6) + ')">' +
      '<polygon points="-5,-2 5,-2 0,5" fill="' + (xq.isSelected ? "var(--brand)" : "#0f222d") + '"></polygon>' +
      '<rect class="xqPinBg" x="' + (-w / 2).toFixed(1) + '" y="-21" width="' + w + '" height="19" rx="5"></rect>' +
      '<text class="xqPinTxt" x="0" y="-7.8" text-anchor="middle">' + escapeHtml(txt) + "</text></g>";
  }).join("");
}

async function inspectCommunityItem(r, dp, item, fly = true) {
  if (!item) return;
  loadingCommunityId = item.id;
  renderXqSubPanel(r, dp);
  const sf = dp?.scaleFactor || 1;
  const det = await loadCommunityDetailHybrid(item.c, item.id, sf, item);
  loadingCommunityId = "";
  if (!det) return;
  selectedCommunityDetail = { ...det, platePrice: selectedPlateInfo?.p || r.price, plateName: selectedPlateInfo?.n || "" };
  renderXqSubPanel(r, dp);
  renderBuyingAdviceUI(r);
  renderCommunityPins();
  if (typeof updateNavBreadcrumb === "function") updateNavBreadcrumb();
  if (fly && det.lng && det.lat) {
    focusLonLat(det.lng, det.lat, Math.max(state.scale, 28), true);
  }
}

function onTapCommunityPin(xqId) {
  const r = activeId ? placeById.get(activeId) : null;
  const dp = r?.sk ? streetPlatesCache?.platesByDistrict?.[r.sk] : null;
  const found = activePlateCommunities.find(x => x.id === xqId);
  if (r && found) inspectCommunityItem(r, dp, found, false);
}

if (communityPinLayer) {
  communityPinLayer.addEventListener("mousemove", event => {
    const node = event.target.closest ? event.target.closest(".xqPinNode") : null;
    if (!node) return;
    const xqId = node.dataset.xqid, xqC = node.dataset.xqc;
    const det = (selectedCommunityDetail && selectedCommunityDetail.id === xqId)
      ? selectedCommunityDetail
      : (xqBrowserCache.details[`${xqC}:${xqId}`]?.detail || cityShardCache.get(xqC)?.details?.[xqId]);
    const item = activePlateCommunities.find(x => x.id === xqId);
    const nm = det?.name || item?.n;
    if (!nm) return;
    const pr = item?.p || det?.price;
    tooltip.style.display = "block";
    tooltip.style.left = Math.min(window.innerWidth - 280, event.clientX + 14) + "px";
    tooltip.style.top = Math.min(window.innerHeight - 130, event.clientY + 14) + "px";
    const tipKey = `xq:${xqC}:${xqId}`;
    if (tooltipPlaceId !== tipKey) {
      tooltipPlaceId = tipKey;
      const meta = [det?.year ? `${det.year}年竣工` : "", det?.plotRatio ? `容积率 ${det.plotRatio}` : "", det?.archType || ""].filter(Boolean).join(" · ");
      tooltip.innerHTML =
        "<strong>" + escapeHtml(nm) + "</strong>" +
        '<div class="tipMain">小区参考均价：' + (pr ? fmt(pr) + " 元/㎡" : "待查") + "</div>" +
        (meta ? "<span>" + escapeHtml(meta) + "</span>" : "") +
        '<span style="color:#94b0c2;font-size:11px">GCJ-02 实测坐标 · 点击查看小区体检与置业诊断</span>';
    }
  });
  communityPinLayer.addEventListener("mouseleave", () => hideTip());
}

function renderCommunitySpecCardHtml(xq, platePrice) {
  if (!xq) return "";
  const ageTxt = xq.year ? `${xq.year}年 (${Math.max(0, 2026 - xq.year)}年楼龄)` : "待查";
  const prTxt = xq.plotRatio ? `${xq.plotRatio} ${xq.plotRatio <= 2.5 ? "(低密)" : xq.plotRatio >= 4.5 ? "(高密)" : "(适中)"}` : "待查";
  const scaleTxt = [xq.buildings ? `${xq.buildings}栋` : "", xq.households ? `${xq.households}户` : ""].filter(Boolean).join(" · ") || "待查";
  const alphaPct = xq.price && platePrice ? (((xq.price - platePrice) / platePrice) * 100) : null;
  const alphaStr = alphaPct !== null ? (alphaPct >= 0 ? `较板块 +${alphaPct.toFixed(1)}%` : `较板块 ${alphaPct.toFixed(1)}%`) : "";

  const sampleParts = [];
  if (xq.saleSamples?.length) {
    const s = xq.saleSamples[0];
    sampleParts.push(`在售样本：${s.layout} ${s.area}㎡ 约 ${s.totalWan}万`);
  }
  if (xq.rentSamples?.length) {
    const rt = xq.rentSamples[0];
    sampleParts.push(`整租参考：${rt.layout} ¥${fmt(rt.monthly)}/月` + (xq.estRentYield ? `（实算租售比 ${xq.estRentYield}%）` : ""));
  }

  return '<div class="xqSpecCard">' +
    '<div class="plateHead">' +
      '<span>' + escapeHtml(xq.name) + (xq.rating ? ' <small style="color:var(--brand-ink);font-weight:800">' + xq.rating + "分</small>" : "") + '</span>' +
      '<small>' + (xq.lng ? "已精准落图 GCJ-02" : "小区体检卡") + '</small>' +
    '</div>' +
    '<div style="font-size:12px;color:var(--ink)"><b>' + (xq.price ? fmt(xq.price) + " 元/㎡" : "暂无均价") + '</b>' +
      (alphaStr ? ' · <span style="color:var(--ink-secondary)">' + alphaStr + '</span>' : '') +
      (xq.address ? '<div style="font-size:11px;color:var(--ink-muted);margin-top:2px">地址：' + escapeHtml(xq.address) + '</div>' : '') +
    '</div>' +
    '<div class="xqSpecGrid">' +
      '<div class="xqSpecCell"><span>竣工/楼龄</span><b>' + escapeHtml(ageTxt) + '</b></div>' +
      '<div class="xqSpecCell"><span>容积率</span><b>' + escapeHtml(prTxt) + '</b></div>' +
      '<div class="xqSpecCell"><span>绿化率</span><b>' + escapeHtml(xq.greenRate || "待查") + '</b></div>' +
      '<div class="xqSpecCell"><span>建筑结构</span><b>' + escapeHtml(xq.archType || xq.propType || "住宅") + '</b></div>' +
      '<div class="xqSpecCell"><span>社区规模</span><b>' + escapeHtml(scaleTxt) + '</b></div>' +
      '<div class="xqSpecCell"><span>物业费</span><b>' + escapeHtml(xq.propertyFee || "待查") + '</b></div>' +
    '</div>' +
    (sampleParts.length ? '<div style="font-size:11.5px;color:var(--ink-secondary);line-height:1.45">' + escapeHtml(sampleParts.join(" ｜ ")) + '</div>' : '') +
  '</div>';
}

const PROVINCE_UMBRELLA_CODES = {
  "海南": "hn", "新疆": "xj", "内蒙古": "nm", "西藏": "lasa", "青海": "xn", "宁夏": "yinchuan",
};

function stripEthnicAdminSuffix(name) {
  return String(name || "")
    .replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|自治县|自治旗|地区|盟|市|县|区|旗)$/g, "")
    .replace(/(土家族苗族|哈尼族彝族|壮族苗族|苗族侗族|布依族苗族|藏族羌族|蒙古族藏族|傣族景颇族|黎族苗族|傈僳族|柯尔克孜|哈萨克|朝鲜族|蒙古族|土家族|彝族|白族|傣族|藏族|回族|黎族|苗族|瑶族|壮族|满族|侗族)$/g, "");
}

function resolveFangCityInfo(r) {
  if (!r || !streetPlatesCache) return { code: "", altCountyCode: "", isUmbrella: false };
  const dict = streetPlatesCache.cityCodes || {};
  const rawCity = (r.city || r.name || "").replace(/(特别行政区|自治州|地区|盟|市)$/, "");
  const cleanCity = stripEthnicAdminSuffix(r.city || r.name || "");
  const cleanArea = stripEthnicAdminSuffix(r.name || "");
  const altCountyCode = (r.dataLevel !== "city" && cleanArea.length >= 2 && dict[cleanArea]) ? dict[cleanArea] : "";

  const direct = dict[r.city] || dict[rawCity] || dict[cleanCity];
  if (direct) return { code: direct, altCountyCode, isUmbrella: false };

  for (const d of Object.values(streetPlatesCache.platesByDistrict || {})) {
    if (d.code && (d.city === rawCity || (r.city || "").includes(d.city))) {
      return { code: d.code, altCountyCode, isUmbrella: false };
    }
  }
  const provKey = String(r.province || "").replace(/(省|市|壮族自治区|维吾尔自治区|回族自治区|自治区|特别行政区)$/g, "");
  if (PROVINCE_UMBRELLA_CODES[provKey]) {
    return { code: PROVINCE_UMBRELLA_CODES[provKey], altCountyCode, isUmbrella: true };
  }
  return { code: altCountyCode || "", altCountyCode: "", isUmbrella: false };
}

async function discoverDistrictOnDemandHybrid(cityCode, r, altCountyCode = "") {
  const dynKey = r.sk || `${r.city}|${r.name}`;
  const existingDp = streetPlatesCache.platesByDistrict?.[dynKey];
  const dShort = stripEthnicAdminSuffix(r.name) || r.name;

  // 1. Local / Worker Proxy (/api/district)
  if (HAS_LOCAL_API) {
    try {
      const altParam = altCountyCode ? `&altc=${encodeURIComponent(altCountyCode)}` : "";
      const res = await fetch(`/api/district?c=${encodeURIComponent(cityCode)}&d=${encodeURIComponent(r.name)}&anchor=${r.price || 0}${altParam}`);
      if (res.ok && (res.headers.get("content-type") || "").includes("json")) {
        const json = await res.json();
        if (json.ok && json.du) {
          r.sk = dynKey;
          if (!streetPlatesCache.platesByDistrict) streetPlatesCache.platesByDistrict = {};
          const mergedPlates = existingDp?.plates?.length
            ? existingDp.plates.map(pl => ({ ...pl, u: pl.u || (json.plates || []).find(jp => jp.n === pl.n)?.u }))
            : (json.plates || []);
          if (selectedPlateInfo && selectedPlateInfo.distId === r.id && !selectedPlateInfo.u) {
            const foundPl = mergedPlates[selectedPlateInfo.pIdx] || mergedPlates.find(x => x.n === selectedPlateInfo.n);
            if (foundPl?.u) selectedPlateInfo.u = foundPl.u;
          }
          streetPlatesCache.platesByDistrict[dynKey] = {
            city: (r.city || "").replace(/市$/, ""),
            code: json.code || cityCode,
            du: json.du,
            district: r.name,
            scaleFactor: existingDp?.scaleFactor || json.scaleFactor || 1,
            plates: mergedPlates,
          };
          if (json.items?.length) {
            xqBrowserCache.plates[json.du] = { ts: Date.now(), items: json.items.map(x => ({ ...x, p: x.rp || x.p, rp: x.rp || x.p })) };
            persistXqBrowserCache();
          }
          return streetPlatesCache.platesByDistrict[dynKey];
        }
      }
    } catch (_) {}
  }

  // 2. Direct Browser CORS Fallback (for static GitHub Pages)
  try {
    const workerUrl = new URLSearchParams(location.search).get("worker");
    const cityTarget = workerUrl ? `${workerUrl.replace(/\/$/, "")}/raw/city?c=${encodeURIComponent(cityCode)}` : `https://m.fang.com/fangjia/${cityCode}/`;
    const cityHtml = await fetchCorsHtml(cityTarget);
    const re = new RegExp(`href=["']https?:\\/\\/m\\.fang\\.com\\/fangjia\\/(${cityCode}_list_\\d+)\\/["'][^>]*>([\\s\\S]*?)<\\/a>`, "gi");
    let m, matched = null;
    while ((m = re.exec(cityHtml))) {
      const txt = stripTagsClient(m[2]);
      const nm = txt.match(/^(?:\d+)?([^\d\s]+?)(?:\s+([\d,]+)\s*元|\s*$)/);
      if (!nm) continue;
      const dn = nm[1].replace(/房价$/, "").trim();
      if (dn === r.name || dn === dShort || r.name.includes(dn) || dn.includes(dShort)) {
        matched = { du: m[1], fp: nm[2] ? Number(nm[2].replace(/,/g, "")) : null };
        break;
      }
    }
    const finalCode = (!matched && altCountyCode) ? altCountyCode : cityCode;
    const du = matched ? matched.du : `${finalCode}_list_pinggu`;
    let sf = existingDp?.scaleFactor || 1;
    if (!existingDp && matched?.fp > 500 && r.price > 500 && Math.abs(r.price / matched.fp - 1) > 0.05) {
      sf = Number(Math.max(0.72, Math.min(1.38, r.price / matched.fp)).toFixed(3));
    }
    let plates = existingDp?.plates || [];
    if (matched) {
      const dTarget = workerUrl ? `${workerUrl.replace(/\/$/, "")}/raw/plate?u=${encodeURIComponent(du)}` : `https://m.fang.com/fangjia/${du}/`;
      const dHtml = await fetchCorsHtml(dTarget);
      const pRe = /<li[^>]*>\s*<a href=['"]https?:\/\/m\.fang\.com\/fangjia\/([^'"]+_list_\d+_\d+)\/['"][^>]*>[\s\S]*?<h3>([^<]+)<\/h3>[\s\S]*?<div class="price"><span>([\d,]+)<\/span>/gi;
      const discovered = [];
      const seenP = new Set();
      let pm;
      while ((pm = pRe.exec(dHtml)) && discovered.length < 18) {
        const n = stripTagsClient(pm[2]), rp = Number(pm[3].replace(/,/g, ""));
        if (n && rp && !seenP.has(n) && !n.includes("周边")) {
          seenP.add(n);
          discovered.push({ n, u: pm[1].trim(), p: Math.round(rp * sf), rp: sf !== 1 ? rp : undefined });
        }
      }
      plates = plates.length
        ? plates.map(pl => ({ ...pl, u: pl.u || discovered.find(dp2 => dp2.n === pl.n)?.u }))
        : discovered;
      if (selectedPlateInfo && selectedPlateInfo.distId === r.id && !selectedPlateInfo.u) {
        const foundPl = plates[selectedPlateInfo.pIdx] || plates.find(x => x.n === selectedPlateInfo.n);
        if (foundPl?.u) selectedPlateInfo.u = foundPl.u;
      }
      const rawItems = parsePlateHtmlInBrowser(dHtml, 1).map(x => ({ ...x, rp: x.p }));
      if (rawItems.length) {
        xqBrowserCache.plates[du] = { ts: Date.now(), items: rawItems };
        persistXqBrowserCache();
      }
    }
    r.sk = dynKey;
    if (!streetPlatesCache.platesByDistrict) streetPlatesCache.platesByDistrict = {};
    streetPlatesCache.platesByDistrict[dynKey] = { city: (r.city || "").replace(/市$/, ""), code: finalCode, du, district: r.name, scaleFactor: sf, plates };
    return streetPlatesCache.platesByDistrict[dynKey];
  } catch (_) {}
  return null;
}

function resolveTargetXqScope(r, dp) {
  const cInfo = resolveFangCityInfo(r);
  const cityCode = dp?.code || cInfo.code;
  const sp = selectedPlateInfo && selectedPlateInfo.distId === r.id ? selectedPlateInfo : null;

  // Trigger on-demand discovery if:
  // 1) A street plate is clicked whose `.u` slug wasn't indexed yet (e.g. Xiangyang), OR
  // 2) A district/county (or provincial-direct county under an umbrella province like Hainan Lingshui) has no `dp` yet
  const needsDiscovery = !!cityCode && (
    (sp && !sp.u) ||
    (!dp && (r.dataLevel !== "city" || cInfo.isUmbrella))
  );
  if (needsDiscovery && !discoveredDistrictAttempted.has(`${r.id}:${cityCode}`)) {
    return { slug: "", label: r.name, code: cityCode, altCountyCode: cInfo.altCountyCode, refPrice: r.price, sf: 1, needsDiscovery: true };
  }

  if (sp) {
    const slug = sp.u || dp?.du || (cityCode ? `${cityCode}_list_pinggu` : "");
    return { slug, label: sp.u ? sp.n : r.name, code: cityCode, refPrice: sp.p || r.price, sf: dp?.scaleFactor || 1 };
  }
  if (r.dataLevel === "city" && !dp?.du) {
    return { slug: cityCode ? `${cityCode}_list_pinggu` : "", label: `${r.name}热门`, code: cityCode, refPrice: r.price, sf: 1 };
  }
  if (dp?.du) {
    return { slug: dp.du, label: `${r.name}`, code: cityCode, refPrice: r.price, sf: dp.scaleFactor || 1 };
  }
  if (dp?.plates?.[0]?.u) {
    return { slug: dp.plates[0].u, label: dp.plates[0].n, code: cityCode, refPrice: dp.plates[0].p || r.price, sf: dp.scaleFactor || 1 };
  }
  return { slug: cityCode ? `${cityCode}_list_pinggu` : "", label: r.name, code: cityCode, refPrice: r.price, sf: 1 };
}

function renderXqSubPanel(r, dp) {
  const mount = document.getElementById("xqMount");
  if (!mount) return;
  const scope = resolveTargetXqScope(r, dp);

  if (scope.needsDiscovery) {
    const attemptKey = `${r.id}:${scope.code}`;
    discoveredDistrictAttempted.add(attemptKey);
    mount.innerHTML = '<div class="xqBox"><div class="plateHead"><span>正在自动检索「' + escapeHtml(r.name) + '」街道与代表小区...</span><small>按需自动获取</small></div></div>';
    discoverDistrictOnDemandHybrid(scope.code, r, scope.altCountyCode).then(foundDp => {
      if (activeId !== r.id) return;
      if (foundDp) mountDistrictPlatesUI(r);
      else renderXqSubPanel(r, dp);
    });
    return;
  }

  if (!scope.slug) {
    mount.innerHTML = "";
    return;
  }

  if (activePlateSlug !== scope.slug) {
    mount.innerHTML = '<div class="xqBox"><div class="plateHead"><span>正在按需获取「' + escapeHtml(scope.label) + '」代表小区...</span><small>轻量请求 &lt;35KB</small></div></div>';
    const reqSlug = scope.slug;
    loadPlateCommunitiesHybrid(reqSlug, scope.code, scope.sf).then(res => {
      const curDp = r.sk ? streetPlatesCache?.platesByDistrict?.[r.sk] : dp;
      const latestScope = resolveTargetXqScope(r, curDp);
      if (activeId !== r.id || latestScope.slug !== reqSlug) return;
      activePlateSlug = reqSlug;
      activePlateCommunities = res.items;
      activePlateSourceTag = res.sourceTag;
      renderXqSubPanel(r, curDp);
      renderCommunityPins();
    });
    return;
  }

  if (!activePlateCommunities.length) {
    mount.innerHTML = '<div class="xqBox"><div class="plateHead"><span>「' + escapeHtml(scope.label) + '」小区行情</span><small>' + escapeHtml(activePlateSourceTag) + '</small></div><div style="font-size:11.5px;color:var(--ink-muted)">暂未获取到该区域公开小区明细。</div></div>';
    return;
  }

  const isRent = typeof userIntent !== "undefined" && userIntent === "rent";
  const useYld = typeof effectiveRentYield === "function" ? effectiveRentYield(r) : 2.1;
  const specHtml = selectedCommunityDetail ? renderCommunitySpecCardHtml(selectedCommunityDetail, scope.refPrice) : "";
  mount.innerHTML =
    '<div class="xqBox">' +
      '<div class="plateHead"><span>「' + escapeHtml(scope.label) + '」代表小区 (' + activePlateCommunities.length + ')</span><small>' + escapeHtml(activePlateSourceTag) + ' · 点击看楼龄与落图</small></div>' +
      specHtml +
      '<div class="xqRows">' +
      activePlateCommunities.map((it, idx) => {
        const diff = scope.refPrice ? Math.round(((it.p - scope.refPrice) / scope.refPrice) * 100) : 0;
        const alphaBadge = diff <= -10
          ? `<span class="levelBadge district">低${Math.abs(diff)}%</span>`
          : diff >= 12
            ? `<span class="levelBadge supplement">高${diff}%</span>`
            : `<span class="levelBadge">适中</span>`;
        const isAct = selectedCommunityDetail && selectedCommunityDetail.id === it.id;
        const dispPrice = isRent && typeof estMonthlyRentFromUnit === "function"
          ? fmtRentShort(estMonthlyRentFromUnit(it.p, useYld))
          : fmtWan(it.p);
        return '<div class="xqRow' + (isAct ? " active" : "") + '" data-xq-idx="' + idx + '">' +
          '<span class="rankNum">' + (idx + 1) + '</span>' +
          '<span class="xqName">' + escapeHtml(it.n) + '</span>' +
          alphaBadge +
          '<span class="price">' + dispPrice + '</span>' +
          '<span class="iconAct">' + (loadingCommunityId === it.id ? "加载..." : "体检") + '</span></div>';
      }).join("") +
      '</div></div>';

  mount.querySelectorAll(".xqRow").forEach(row => {
    row.onclick = () => inspectCommunityItem(r, dp, activePlateCommunities[Number(row.dataset.xqIdx)], true);
  });
}

function mountPlateCommunitiesUI(r, dp) {
  const scope = resolveTargetXqScope(r, dp);
  if (scope.slug !== activePlateSlug) {
    activePlateSlug = "";
    activePlateCommunities = [];
    selectedCommunityDetail = null;
  }
  renderXqSubPanel(r, dp);
  renderBuyingAdviceUI(r);
  renderCommunityPins();
}

// ============================================================================
// 5-Dimension Quantitative Home-Buying Diagnostic Engine + Optional BYOK AI
// ============================================================================

function findCommuteAlternatives(r, maxKm = 28) {
  if (!r?.price) return [];
  const [lon, lat] = svgToLonLat(r.cx, r.cy);
  const alts = [];
  for (let i = 0; i < places.length; i += 1) {
    const cand = places[i];
    if (!cand.price || cand.id === r.id || isInherited(cand)) continue;
    if (cand.dataLevel === "city" && coveredProvinces.has(cand.province)) continue;
    const [cLon, cLat] = svgToLonLat(cand.cx, cand.cy);
    const dKm = haversineKm(lon, lat, cLon, cLat);
    if (dKm >= 4 && dKm <= maxKm && cand.price <= r.price * 0.76) {
      alts.push({ cand, dKm, savePct: Math.round((1 - cand.price / r.price) * 100) });
    }
  }
  alts.sort((a, b) => a.dKm - b.dKm || b.savePct - a.savePct);
  return alts.slice(0, 3);
}

function generateQuantitativeAdvice(r) {
  if (!r || !r.price) return null;
  const sp = selectedPlateInfo && selectedPlateInfo.distId === r.id ? selectedPlateInfo : null;
  const xq = selectedCommunityDetail;
  const targetPrice = xq?.price || sp?.p || r.price;
  const targetName = xq?.name ? `${sp?.n || r.name}·${xq.name}` : (sp?.n ? `${r.name}·${sp.n}板块` : (r.city === r.name ? r.name : `${r.city}${r.name}`));

  const dd = Number.isFinite(r.drawdownPct) ? r.drawdownPct : (r.peakPrice ? Number((((r.price - r.peakPrice) / r.peakPrice) * 100).toFixed(1)) : null);
  const yld = xq?.estRentYield || r.rentYield || null;
  const pti = r.priceToIncome || null;
  const spread = r.newPrice && r.price ? Number((((r.newPrice - r.price) / r.price) * 100).toFixed(1)) : null;

  // Determine overall quantitative verdict pill
  let verdict = "均衡自住片区";
  let verdictCls = "levelBadge district";
  if (xq?.year && xq.year < 2003 && (xq.plotRatio || 3) > 3.8) {
    verdict = "老龄高密折价 · 慎加高杠杆";
    verdictCls = "levelBadge inherited";
  } else if (xq?.year && xq.year >= 2014 && (xq.plotRatio || 3) <= 3.2 && sp?.p && xq.price <= sp.p * 0.95) {
    verdict = "板块内次新低密高性价比";
    verdictCls = "levelBadge district";
  } else if (dd !== null && dd <= -28 && yld && yld >= 2.4) {
    verdict = "深度回调 + 租金安全垫较厚";
    verdictCls = "levelBadge district";
  } else if (pti && pti >= 20 && (!yld || yld < 1.8)) {
    verdict = "高溢价核心资产 · 宜长持忌短炒";
    verdictCls = "levelBadge supplement";
  } else if (pti && pti <= 8.5 && (yld || 0) >= 2.5) {
    verdict = "低负担高租售比 · 刚需友好";
    verdictCls = "levelBadge district";
  }

  const bullets = [];

  // 1. Valuation & Cycle Position
  const valParts = [];
  if (xq && sp?.p) {
    const diff = (((xq.price - sp.p) / sp.p) * 100).toFixed(1);
    valParts.push(`小区均价较「${sp.n}」板块均价${diff >= 0 ? "溢价 +" + diff : "折价 " + diff}%`);
  } else if (sp && r.price) {
    const diff = (((sp.p - r.price) / r.price) * 100).toFixed(1);
    valParts.push(`「${sp.n}」属${r.name}${diff >= 10 ? "核心溢价板块（+" + diff + "%）" : diff <= -10 ? "价格洼地板块（" + diff + "%）" : "中位主流价格带"}`);
  }
  if (dd !== null) {
    valParts.push(`所属区域距近十年高点已调整 ${dd}%（${dd <= -30 ? "泡沫消化较充分，底部博弈区间" : dd <= -18 ? "处于中段回调水位" : "价格韧性较强、抗跌度高"}）`);
  }
  if (valParts.length) bullets.push(`<b>估值与水位：</b>${valParts.join("；")}。`);

  // 2. New vs Resale Strategy
  if (spread !== null) {
    if (spread <= -6) {
      bullets.push(`<b>一二手策略：</b>本区存在约 ${spread}% 的一二手倒挂（或新盘集中于新兴片区），打新与次新二手可同步比价，重点核查新盘通勤距离与交付配套兑现期。`);
    } else if (spread >= 15) {
      bullets.push(`<b>一二手策略：</b>在售新盘改善溢价较高（+${spread}%），同地段 5～10 年楼龄次新二手房单价优势显著、即买即住无期房风险，建议优先淘选次新现房。`);
    } else {
      bullets.push(`<b>一二手策略：</b>一二手价差温和（${spread >= 0 ? "+" : ""}${spread}%），首套刚需优先看配套成熟的存量现房，改善置换可关注第四代住宅/高得房率新盘。`);
    }
  }

  // 3. Cashflow & Rental Safety Cushion
  if (yld) {
    const gap = (yld - calcRate).toFixed(2);
    const tone = yld >= calcRate
      ? `年租金回报率（${yld}%）已高于或持平当前商贷利率（${calcRate}%），租金可覆盖贷款利息，持有安全垫扎实`
      : yld >= 2.1
        ? `年租售比 ${yld}% 处于二线主流稳健区间（利差 ${gap}%），建议首付 ≥20% 控制月供负担`
        : `年租售比偏低（${yld}%），资产定价主要由核心产业、稀缺配套或学区预期支撑，纯投资收租性价比一般，自住建议留足现金流冗余`;
    bullets.push(`<b>现金流安全垫：</b>${tone}。`);
  }

  // 4. Physical Building Checkup (Xiaoqu-specific if selected, else plate/district guidance)
  if (xq && (xq.year || xq.plotRatio || xq.archType)) {
    const checks = [];
    const age = xq.year ? 2026 - xq.year : null;
    if (age !== null) {
      if (age >= 22) checks.push(`楼龄约 ${age} 年，实地必查银行最高可贷年限、地下车位配比、外墙渗水与老旧管线改造计划`);
      else if (age <= 10) checks.push(`${xq.year} 年次新盘，人车分流与公区维护通常较好，重点核对得房率与物业服务口碑`);
      else checks.push(`${xq.year} 年成熟社区，园林与生活配套成熟，关注电梯维保与车位紧张度`);
    }
    if (xq.plotRatio) {
      if (xq.plotRatio > 4.2) checks.push(`容积率 ${xq.plotRatio} 偏高，务必在早高峰（8:00-8:45）实测候梯时长及中低楼层采光遮挡`);
      else if (xq.plotRatio <= 2.5) checks.push(`容积率仅 ${xq.plotRatio}，低密居住舒适度优于同城多数高层社区`);
    }
    if (xq.archType) checks.push(`建筑类型为「${xq.archType}」${xq.archType.includes("塔") ? "（留意户型通透性与厨卫明暗）" : "（南北通透性较佳）"}`);
    bullets.push(`<b>看房实地核查：</b>${checks.join("；")}。`);
  } else {
    bullets.push(`<b>选盘实操建议：</b>同板块内建议优先筛选「2012年后竣工、容积率 ≤3.5、品牌物业、近地铁800m内」的次新三房，流动性与未来置换保值率显著优于老龄塔楼与超高密大盘。`);
  }

  // 5. 25km Commute Arbitrage Alternatives
  const alts = findCommuteAlternatives(r, 28);
  return { targetName, targetPrice, verdict, verdictCls, bullets, alts };
}

function renderBuyingAdviceUI(r) {
  const mount = document.getElementById("adviceMount");
  if (!mount) return;
  const isRent = typeof userIntent !== "undefined" && userIntent === "rent" && typeof generateRentalAdvice === "function";
  const diag = isRent ? generateRentalAdvice(r) : generateQuantitativeAdvice(r);
  if (!diag) { mount.innerHTML = ""; return; }

  let savedAi = { url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat", key: "", brief: "" };
  try {
    const raw = JSON.parse(localStorage.getItem("atlas-ai-cfg") || "null");
    if (raw) savedAi = { ...savedAi, ...raw };
  } catch (_) {}

  const altHtml = diag.alts.length
    ? '<li><b>25km通勤省钱平替：</b>若想进一步降低成本，周边可重点对比 ' +
      diag.alts.map(a => {
        const costTag = isRent && a.altRent ? `约¥${fmt(a.altRent)}/月` : fmtWan(a.cand.price);
        return `<button type="button" class="linkBtn advAltBtn" data-id="${a.cand.id}">${escapeHtml(a.cand.city.replace(/市$/, "") + "·" + a.cand.name)}（${a.dKm.toFixed(0)}km · ${costTag} · 省${a.savePct}%）</button>`;
      }).join("、") +
      "。</li>"
    : "";

  const boxTitle = isRent ? `局部租住与租买建议 · ${diag.targetName}` : `局部置业诊断 · ${diag.targetName}`;
  const aiPlaceholder = isRent
    ? "输入您的租房需求：如 月租预算2500元、南山科技园上班、独居注重安静安全"
    : "输入您的买房需求：如 总预算300万、海淀通勤、首套三房兼顾学区";

  mount.innerHTML =
    '<div class="adviceBox">' +
      '<div class="adviceHead">' +
        '<span class="adviceTitle">' + escapeHtml(boxTitle) + '</span>' +
        '<span class="' + diag.verdictCls + '">' + escapeHtml(diag.verdict) + '</span>' +
      '</div>' +
      '<ul class="adviceList">' +
        diag.bullets.map(b => `<li>${b}</li>`).join("") +
        altHtml +
      '</ul>' +
      '<details class="calcBox" style="padding:8px 10px">' +
        '<summary><span>AI 定制' + (isRent ? "租房" : "看房") + '顾问（结合个人需求与实测数据深度推演）</span><span>展开 ▾</span></summary>' +
        '<div class="aiForm">' +
          '<input id="aiUserBrief" class="aiInput" type="text" placeholder="' + aiPlaceholder + '" value="' + escapeHtml(savedAi.brief) + '">' +
          '<div class="aiGrid2">' +
            '<input id="aiApiUrl" class="aiInput" type="url" placeholder="兼容OpenAI接口地址" value="' + escapeHtml(savedAi.url) + '">' +
            '<input id="aiApiModel" class="aiInput" type="text" placeholder="模型名 (如 deepseek-chat)" value="' + escapeHtml(savedAi.model) + '">' +
          '</div>' +
          '<div style="display:flex;gap:6px;align-items:center">' +
            '<input id="aiApiKey" class="aiInput" type="password" placeholder="填写您的 API Key（仅保存在本地浏览器）" value="' + escapeHtml(savedAi.key) + '">' +
            '<button type="button" class="miniBtn active" id="runAiAdvisorBtn">生成建议</button>' +
          '</div>' +
          '<div id="aiAdvisorOut" style="display:none" class="aiOutput"></div>' +
        '</div>' +
      '</details>' +
    '</div>';

  mount.querySelectorAll(".advAltBtn").forEach(btn => {
    btn.onclick = () => locateRegion(btn.dataset.id);
  });

  const runBtn = document.getElementById("runAiAdvisorBtn");
  if (runBtn) {
    runBtn.onclick = async () => {
      const url = document.getElementById("aiApiUrl").value.trim();
      const model = document.getElementById("aiApiModel").value.trim();
      const key = document.getElementById("aiApiKey").value.trim();
      const brief = document.getElementById("aiUserBrief").value.trim() || (isRent ? "通勤方便、性价比高、民水民电，请给出租房选点与签约避坑建议" : "自住兼顾保值，请给出客观选筹、谈判与避坑建议");
      const outEl = document.getElementById("aiAdvisorOut");
      if (!key || !url) {
        showToast("请先填写兼容 OpenAI 格式的 API Key 与接口地址");
        return;
      }
      try { localStorage.setItem("atlas-ai-cfg", JSON.stringify({ url, model, key, brief })); } catch (_) {}
      outEl.style.display = "block";
      outEl.textContent = "正在结合当前区域、板块与小区的实测多维数据为您推演方案...";
      runBtn.disabled = true;

      const contextPacket = {
        intent: isRent ? "租房居住" : "买房置业",
        region: { province: r.province, city: r.city, name: r.name, resalePrice: r.price, newPrice: r.newPrice, yoy: r.yoy, rentYield: r.rentYield, estMonthlyRent2BR: typeof estPlaceMonthlyRent === "function" ? estPlaceMonthlyRent(r, "two") : null, priceToIncome: r.priceToIncome, drawdownFromPeakPct: r.drawdownPct },
        selectedStreetPlate: selectedPlateInfo?.distId === r.id ? { name: selectedPlateInfo.n, price: selectedPlateInfo.p, mom: selectedPlateInfo.m } : null,
        topCommunitiesInPlate: activePlateCommunities.slice(0, 8).map(c => ({ name: c.n, price: c.p, mom: c.m })),
        selectedCommunity: selectedCommunityDetail ? { name: selectedCommunityDetail.name, price: selectedCommunityDetail.price, year: selectedCommunityDetail.year, plotRatio: selectedCommunityDetail.plotRatio, greenRate: selectedCommunityDetail.greenRate, archType: selectedCommunityDetail.archType, propertyFee: selectedCommunityDetail.propertyFee, estRentYield: selectedCommunityDetail.estRentYield } : null,
        commuteAlternatives25km: diag.alts.map(a => ({ name: `${a.cand.city}${a.cand.name}`, distKm: Number(a.dKm.toFixed(1)), price: a.cand.price, savePct: a.savePct })),
      };

      try {
        const sysPrompt = isRent
          ? "你是一位贴心、客观的中国城市租房与居住规划顾问。必须严格依据提供的实测JSON数据作答，严禁编造虚假租金。请分4点通俗易懂地输出：1.房租预算与通勤匹配度；2.候选街道/小区租住优缺点；3.租房vs买房现阶段建议；4.看房签约防坑要点与周边省钱平替。"
          : "你是一位严谨、客观的中国房产空间数据分析师。必须严格依据提供的实测JSON数据作答，严禁编造虚假房价。请分4点通俗易懂地输出：1.预算与板块匹配度；2.候选小区优劣势与挑房要点；3.议价与时机策略；4.通勤平替方案。";
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            temperature: 0.35,
            messages: [
              { role: "system", content: sysPrompt },
              { role: "user", content: `用户需求：${brief}\n当前局部实测数据JSON：${JSON.stringify(contextPacket)}` },
            ],
          }),
        });
        const j = await res.json();
        const reply = j.choices?.[0]?.message?.content;
        outEl.textContent = reply || ("接口返回异常：" + JSON.stringify(j).slice(0, 220));
      } catch (err) {
        outEl.textContent = "请求失败：" + err.message;
      } finally {
        runBtn.disabled = false;
      }
    };
  }
}

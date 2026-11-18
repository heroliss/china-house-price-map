/**
 * Shared parser & coordinate converter for street-plate community lists and community detail specs.
 * Works in Node.js (local server / pre-warm scripts) and mirrors browser-side fallback logic.
 */

function bd09ToGcj02(bdLon, bdLat) {
  const x = Number(bdLon) - 0.0065;
  const y = Number(bdLat) - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI * 3000.0 / 180.0);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI * 3000.0 / 180.0);
  const gcjLon = z * Math.cos(theta);
  const gcjLat = z * Math.sin(theta);
  return [Number(gcjLon.toFixed(6)), Number(gcjLat.toFixed(6))];
}

function cleanText(raw) {
  return String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<i[^>]*icon-intro[^>]*>[\s\S]*?<\/i>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePlateCommunitiesHtml(html, scaleFactor = 1) {
  const sf = Number.isFinite(Number(scaleFactor)) && Number(scaleFactor) > 0 ? Number(scaleFactor) : 1;
  const list = [];
  const seen = new Set();

  // Pattern 1: <a href="https://m.fang.com/fangjia/xiaoqu/sz/2810892334.html">...<h3 class="lp">恒裕滨城</h3><span class="price"><i>170043</i>...<span class="jt-up-n"><i>2.09</i>%
  const re = /href=["']https?:\/\/m\.fang\.com\/(?:fangjia\/)?xiaoqu\/([a-z0-9]+)\/(\d+)\.html["'][^>]*>([\s\S]{1,600}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const cityCode = m[1];
    const id = m[2];
    if (seen.has(id)) continue;
    const inner = m[3];
    const nameMatch = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const priceMatch = inner.match(/class=["']price["'][^>]*>[\s\S]*?([\d,]{3,7})/i) || inner.match(/([\d,]{4,7})\s*元/);
    if (!nameMatch || !priceMatch) continue;
    const name = cleanText(nameMatch[1]);
    const rawPrice = Math.round(Number(String(priceMatch[1]).replace(/,/g, "")));
    if (!name || !Number.isFinite(rawPrice) || rawPrice < 800 || rawPrice > 600000) continue;

    let mom = "--%";
    const chgMatch = inner.match(/class=["']([^"']*(?:jt-up|jt-dn|up|down|red|green)[^"']*)["'][^>]*>([\s\S]*?)<\/span>/i);
    if (chgMatch) {
      const cls = chgMatch[1];
      const num = Number(cleanText(chgMatch[2]).replace(/[^\d.+-]/g, ""));
      if (Number.isFinite(num)) {
        const isDown = /dn|down|green/i.test(cls);
        const signed = isDown ? -Math.abs(num) : Math.abs(num);
        mom = `${signed >= 0 ? "+" : ""}${signed.toFixed(2)}%`;
      }
    }

    seen.add(id);
    list.push({
      id,
      c: cityCode,
      n: name,
      p: Math.round(rawPrice * sf),
      rp: sf !== 1 ? rawPrice : undefined,
      m: mom,
    });
    if (list.length >= 24) break;
  }
  return list;
}

function parseCommunityDetailHtml(html, cityCode = "", xqId = "", scaleFactor = 1) {
  const sf = Number.isFinite(Number(scaleFactor)) && Number(scaleFactor) > 0 ? Number(scaleFactor) : 1;
  const info = {
    id: String(xqId || ""),
    c: String(cityCode || ""),
    name: "",
    rawPrice: null,
    price: null,
    mom: "",
    rating: null,
    address: "",
    developer: "",
    propertyCompany: "",
    propertyFee: "",
    year: null,
    propType: "",
    archType: "",
    households: null,
    buildings: null,
    greenRate: "",
    plotRatio: null,
    tenure: "",
    lng: null,
    lat: null,
    saleSamples: [],
    rentSamples: [],
    estRentYield: null,
  };

  // Title / Name
  const titleM = html.match(/<title>([^<-_—]+)/i);
  if (titleM) info.name = cleanText(titleM[1]).replace(/(详情|二手房|房价|小区).*$/, "").trim();

  // Meta description fallback for developer & address
  const descM = html.match(/<meta\s+name=["']Description["']\s+content=["']([^"']+)["']/i);
  if (descM) {
    const desc = descM[1];
    const devM = desc.match(/由([^，,。]+?)负责开发/);
    if (devM) info.developer = cleanText(devM[1]);
    const addrM = desc.match(/小区地址是([^，,。]+?)(?:套|，|,|$)/);
    if (addrM) info.address = cleanText(addrM[1]).replace(/^区/, "");
    const yrM = desc.match(/竣工时间(\d{4})年/);
    if (yrM) info.year = Number(yrM[1]);
  }

  // Score rating (e.g. 9.3分)
  const rateM = html.match(/>(\d\.\d)\s*分</);
  if (rateM) info.rating = Number(rateM[1]);

  // Price & MoM on xiaoqu page
  const topPriceM = html.match(/class=["']top-price["'][\s\S]{0,260}?<strong>([\d,]+)<\/strong>[\s\S]{0,180}?(?:class=["']([^"']*jt-[^"']*)["'][^>]*>([\d.]+)%|)/i);
  if (topPriceM) {
    const rp = Number(String(topPriceM[1]).replace(/,/g, ""));
    if (rp >= 800 && rp <= 600000) {
      info.rawPrice = rp;
      info.price = Math.round(rp * sf);
    }
    if (topPriceM[3]) {
      const down = /dn|down|green/i.test(topPriceM[2] || "");
      const v = Number(topPriceM[3]);
      if (Number.isFinite(v)) info.mom = `${down ? "-" : "+"}${v.toFixed(2)}%`;
    }
  }

  // Exact BD-09 static map coordinates -> GCJ-02
  const markerM = html.match(/markers=([\d.]+)\s*,\s*([\d.]+)/i) || html.match(/center=([\d.]+)\s*,\s*([\d.]+)/i);
  if (markerM) {
    const bLon = Number(markerM[1]), bLat = Number(markerM[2]);
    if (bLon > 72 && bLon < 138 && bLat > 15 && bLat < 55) {
      const [gLon, gLat] = bd09ToGcj02(bLon, bLat);
      info.lng = gLon;
      info.lat = gLat;
    }
  }

  // Structured flextable building specs
  const specRe = /<li>\s*<span>\s*([^<]+?)\s*<\/span>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi;
  let sm;
  while ((sm = specRe.exec(html))) {
    const k = cleanText(sm[1]);
    const v = cleanText(sm[2]);
    if (!k || !v || v === "暂无") continue;
    if (k.includes("建筑年代") || k.includes("竣工")) {
      const y = Number((v.match(/(19\d{2}|20\d{2})/) || [])[1]);
      if (y) info.year = y;
    } else if (k.includes("物业类型")) info.propType = v;
    else if (k.includes("建筑类型")) info.archType = v;
    else if (k.includes("房屋总数") || k.includes("总户数")) {
      const h = Number((v.match(/(\d+)/) || [])[1]);
      if (h) info.households = h;
    } else if (k.includes("楼栋总数")) {
      const b = Number((v.match(/(\d+)/) || [])[1]);
      if (b) info.buildings = b;
    } else if (k.includes("绿化率")) info.greenRate = v;
    else if (k.includes("容积率")) {
      const pr = Number((v.match(/([\d.]+)/) || [])[1]);
      if (pr > 0 && pr < 25) info.plotRatio = Number(pr.toFixed(2));
    } else if (k.includes("物业费")) info.propertyFee = v;
    else if (k.includes("物业公司")) info.propertyCompany = v;
    else if (k.includes("开发商") && !info.developer) info.developer = v;
    else if (k.includes("产权")) info.tenure = v.includes("70") ? "70年住宅" : v.slice(0, 14);
  }

  // Extract active resale & rental listing samples to compute real community rent yield
  const plain = cleanText(html);
  const saleRe = /建面[:：]?\s*([\d.]+)\s*㎡\s*(\d室\d厅)[\s\S]{0,60}?([\d.]+)\s*万\s*([\d,]+)\s*元\/㎡/g;
  let slm;
  while ((slm = saleRe.exec(plain)) && info.saleSamples.length < 3) {
    info.saleSamples.push({
      area: Number(slm[1]),
      layout: slm[2],
      totalWan: Number(slm[3]),
      unitPrice: Number(String(slm[4]).replace(/,/g, "")),
    });
  }

  const rentRe = /(?:([\d.]+)\s*㎡\s*)?(\d室\d厅)\s*(?:整租|合租)[\s\S]{0,45}?([\d,]+)\s*元\/月/g;
  let rtm;
  while ((rtm = rentRe.exec(plain)) && info.rentSamples.length < 3) {
    const monthly = Number(String(rtm[3]).replace(/,/g, ""));
    if (monthly >= 300 && monthly <= 250000) {
      info.rentSamples.push({
        area: rtm[1] ? Number(rtm[1]) : null,
        layout: rtm[2],
        monthly,
      });
    }
  }

  // Compute empirical community rental yield if paired area/layout rent + unit price exist
  const refUnit = info.rawPrice || info.saleSamples[0]?.unitPrice;
  const rentWithArea = info.rentSamples.find(r => r.area && r.area >= 20);
  if (refUnit && rentWithArea) {
    const yld = ((rentWithArea.monthly * 12) / (refUnit * rentWithArea.area)) * 100;
    if (yld >= 0.4 && yld <= 9.5) info.estRentYield = Number(yld.toFixed(2));
  }

  return info;
}

function parseXfEstatesFallbackHtml(html, scaleFactor = 1) {
  const sf = Number.isFinite(Number(scaleFactor)) && Number(scaleFactor) > 0 ? Number(scaleFactor) : 1;
  const list = [];
  const seen = new Set();
  const re = /href=["']https?:\/\/m\.fang\.com\/xf\/([a-z0-9]+)\/(\d+)\.html?["'][^>]*>([\s\S]{1,700}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const cityCode = m[1], id = m[2];
    if (seen.has(id)) continue;
    const plain = cleanText(m[3]);
    const pm = plain.match(/([\d,]{3,6})\s*元\/[平㎡m]/i);
    if (!pm) continue;
    const rawPrice = Math.round(Number(pm[1].replace(/,/g, "")));
    if (!rawPrice || rawPrice < 800 || rawPrice > 500000) continue;
    const name = plain.split(/\s+/)[0]?.trim();
    if (!name || name.length < 2) continue;
    seen.add(id);
    list.push({ id, c: cityCode, n: name, p: Math.round(rawPrice * sf), rp: sf !== 1 ? rawPrice : undefined, m: "在售楼盘", isXf: true });
    if (list.length >= 20) break;
  }
  return list;
}

module.exports = {
  bd09ToGcj02,
  parsePlateCommunitiesHtml,
  parseXfEstatesFallbackHtml,
  parseCommunityDetailHtml,
};

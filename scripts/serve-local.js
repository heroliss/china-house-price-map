#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");
const { parsePlateCommunitiesHtml, parseXfEstatesFallbackHtml, parseCommunityDetailHtml } = require("../src/xiaoqu_parser");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || process.argv[2] || 8788);
const CACHE_FILE = path.join(ROOT, "data", "communities", "_local_cache.json");
const TTL_MS = 7 * 24 * 3600 * 1000;
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

let diskCache = { plates: {}, details: {}, cityIndex: {}, districts: {} };
try {
  if (fs.existsSync(CACHE_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    diskCache = { plates: {}, details: {}, cityIndex: {}, districts: {}, ...loaded };
  }
} catch (_) {}

let saveTimer = 0;
function scheduleSaveCache() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(diskCache), "utf8");
    } catch (_) {}
  }, 1500);
}

async function fetchFangHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": MOBILE_UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const asciiHead = buf.subarray(0, 600).toString("latin1");
    return /charset=['"]?gb/i.test(asciiHead) ? new TextDecoder("gb18030").decode(buf) : buf.toString("utf8");
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://127.0.0.1:${PORT}`);

    // On-demand API 0: City + District -> Discover District Slug, Street Plates & District Communities
    if (u.pathname === "/api/district") {
      const c = String(u.searchParams.get("c") || "").replace(/[^a-z0-9]/gi, "");
      const dRaw = String(u.searchParams.get("d") || "").trim();
      const anchor = Number(u.searchParams.get("anchor") || 0) || 0;
      if (!c || !dRaw) return sendJson(res, 400, { error: "invalid_district_query" });

      const dShort = dRaw
        .replace(/(市辖区|自治县|自治旗|高新区|开发区|新区|区|县|市|旗)$/, "")
        .replace(/(黎族苗族|土家族苗族|苗族侗族|黎族|苗族|瑶族|壮族|满族|回族|蒙古族|彝族|土家族|侗族|藏族)$/, "") || dRaw;
      const dKey = `${c}:${dShort}`;
      const cachedDist = diskCache.districts[dKey];
      if (cachedDist && Date.now() - cachedDist.ts < TTL_MS) {
        return sendJson(res, 200, { ok: true, cached: true, ...cachedDist.payload });
      }

      let distLinks = diskCache.cityIndex[c];
      if (!distLinks || Date.now() - distLinks.ts >= TTL_MS || !distLinks.list?.some(x => x.fp)) {
        const cityHtml = await fetchFangHtml(`https://m.fang.com/fangjia/${c}/`);
        const list = [];
        const re = new RegExp(`href=["']https?:\\/\\/m\\.fang\\.com\\/fangjia\\/(${c}_list_\\d+)\\/["'][^>]*>([\\s\\S]*?)<\\/a>`, "gi");
        let m;
        while ((m = re.exec(cityHtml))) {
          const txt = m[2].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
          const nm = txt.match(/^(?:\d+)?([^\d\s]+?)(?:\s+([\d,]+)\s*元|\s*$)/);
          if (!nm) continue;
          const dn = nm[1].replace(/房价$/, "").trim();
          const fp = nm[2] ? Number(nm[2].replace(/,/g, "")) : null;
          if (dn && !dn.includes("周边")) list.push({ dn, du: m[1], fp });
        }
        distLinks = { ts: Date.now(), list };
        diskCache.cityIndex[c] = distLinks;
      }

      const matched = distLinks.list.find(x => x.dn === dRaw || x.dn === dShort || dRaw.includes(x.dn) || x.dn.includes(dShort));
      if (!matched) {
        const altc = String(u.searchParams.get("altc") || "").replace(/[^a-z0-9]/gi, "");
        if (altc && altc !== c) {
          return sendJson(res, 200, { ok: true, code: altc, du: `${altc}_list_pinggu`, scaleFactor: 1, plates: [], items: [] });
        }
        return sendJson(res, 200, { ok: true, code: c, du: `${c}_list_pinggu`, scaleFactor: 1, plates: [], items: [] });
      }

      let sf = 1;
      if (anchor > 500 && matched.fp > 500) {
        const ratio = anchor / matched.fp;
        if (Math.abs(ratio - 1) > 0.05) sf = Number(Math.max(0.72, Math.min(1.38, ratio)).toFixed(3));
      }

      const dHtml = await fetchFangHtml(`https://m.fang.com/fangjia/${matched.du}/`);
      const pRe = /<li[^>]*>\s*<a href=['"]https?:\/\/m\.fang\.com\/fangjia\/([^'"]+_list_\d+_\d+)\/['"][^>]*>[\s\S]*?<h3>([^<]+)<\/h3>[\s\S]*?<div class="price"><span>([\d,]+)<\/span>[\s\S]*?<span class="([^"]*)">([^<]*)<\/span>/gi;
      const plates = [];
      const seenP = new Set();
      let pm;
      while ((pm = pRe.exec(dHtml)) && plates.length < 18) {
        const n = pm[2].replace(/<[^>]*>/g, "").trim();
        const rp = Number(pm[3].replace(/,/g, ""));
        if (!n || !rp || seenP.has(n) || n.includes("周边")) continue;
        seenP.add(n);
        plates.push({ n, u: pm[1].trim(), p: Math.round(rp * sf), rp: sf !== 1 ? rp : undefined });
      }
      const rawComms = parsePlateCommunitiesHtml(dHtml, 1);
      diskCache.plates[matched.du] = { ts: Date.now(), items: rawComms.map(x => ({ ...x, rp: x.p })) };
      const items = rawComms.map(it => ({ ...it, p: Math.round(it.p * sf), rp: sf !== 1 ? it.p : undefined }));
      const payload = { code: c, du: matched.du, scaleFactor: sf, plates, items };
      diskCache.districts[dKey] = { ts: Date.now(), payload };
      scheduleSaveCache();
      return sendJson(res, 200, { ok: true, cached: false, ...payload });
    }

    // On-demand API 1: Street/Plate -> Top Communities
    if (u.pathname === "/api/plate") {
      const slug = String(u.searchParams.get("u") || "").replace(/[^a-z0-9_]/gi, "");
      const sf = Number(u.searchParams.get("sf") || 1) || 1;
      if (!slug || !slug.includes("_list_")) return sendJson(res, 400, { error: "invalid_plate_slug" });

      const cached = diskCache.plates[slug];
      if (cached && Date.now() - cached.ts < TTL_MS && Array.isArray(cached.items)) {
        const scaled = cached.items.map(it => ({ ...it, p: Math.round((it.rp || it.p) * sf), rp: sf !== 1 ? (it.rp || it.p) : undefined }));
        return sendJson(res, 200, { ok: true, cached: true, items: scaled });
      }

      const html = await fetchFangHtml(`https://m.fang.com/fangjia/${slug}/`);
      let rawItems = parsePlateCommunitiesHtml(html, 1);
      if (!rawItems.length) {
        const cityPrefix = slug.split("_list_")[0];
        if (cityPrefix) {
          try {
            const rootHtml = await fetchFangHtml(`https://m.fang.com/fangjia/${cityPrefix}/`);
            rawItems = parsePlateCommunitiesHtml(rootHtml, 1);
          } catch (_) {}
          if (!rawItems.length) {
            try {
              const xfHtml = await fetchFangHtml(`https://m.fang.com/xf/${cityPrefix}/`);
              rawItems = parseXfEstatesFallbackHtml(xfHtml, 1);
            } catch (_) {}
          }
        }
      }
      diskCache.plates[slug] = { ts: Date.now(), items: rawItems.map(x => ({ ...x, rp: x.p })) };
      scheduleSaveCache();
      const scaled = rawItems.map(it => ({ ...it, p: Math.round(it.p * sf), rp: sf !== 1 ? it.p : undefined }));
      return sendJson(res, 200, { ok: true, cached: false, items: scaled });
    }

    // On-demand API 2: Single Community -> Coordinates, Specs, Listings & Yield
    if (u.pathname === "/api/community") {
      const c = String(u.searchParams.get("c") || "").replace(/[^a-z0-9]/gi, "");
      const id = String(u.searchParams.get("id") || "").replace(/\D/g, "");
      const sf = Number(u.searchParams.get("sf") || 1) || 1;
      if (!c || !id) return sendJson(res, 400, { error: "invalid_community_id" });

      const cacheKey = `${c}:${id}`;
      const cached = diskCache.details[cacheKey];
      if (cached && Date.now() - cached.ts < TTL_MS && cached.detail) {
        const d = { ...cached.detail };
        if (d.rawPrice) d.price = Math.round(d.rawPrice * sf);
        return sendJson(res, 200, { ok: true, cached: true, detail: d });
      }

      const isXf = u.searchParams.get("xf") === "1";
      const targetUrl = isXf ? `https://m.fang.com/xf/${c}/${id}.html` : `https://m.fang.com/xiaoqu/${c}/${id}.html`;
      const html = await fetchFangHtml(targetUrl);
      const detail = parseCommunityDetailHtml(html, c, id, 1);
      diskCache.details[cacheKey] = { ts: Date.now(), detail };
      scheduleSaveCache();
      const scaledDetail = { ...detail, price: detail.rawPrice ? Math.round(detail.rawPrice * sf) : null };
      return sendJson(res, 200, { ok: true, cached: false, detail: scaledDetail });
    }

    // Static file serving
    let reqPath = decodeURIComponent(u.pathname);
    if (reqPath === "/") reqPath = "/index.html";
    const filePath = path.join(ROOT, reqPath);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); res.end("Forbidden"); return;
    }
    fs.readFile(filePath, (err, buf) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(buf);
    });
  } catch (err) {
    sendJson(res, 502, { ok: false, error: err.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Atlas Hybrid Server listening on http://127.0.0.1:${PORT} (Static + On-Demand /api/plate & /api/community)`);
});

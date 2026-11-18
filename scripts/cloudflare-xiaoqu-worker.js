/**
 * Optional Zero-Cost Cloudflare Worker for GitHub Pages On-Demand Community Proxy
 * Deploy on Cloudflare Workers (100,000 free requests/day) and set ?worker=https://your-worker.workers.dev
 * Automatically caches upstream responses at the Cloudflare Edge for 7 days.
 */
export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "text/html; charset=utf-8",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    let target = "";
    if (url.pathname === "/raw/plate") {
      const slug = (url.searchParams.get("u") || "").replace(/[^a-z0-9_]/gi, "");
      if (!slug.includes("_list_")) return new Response("Bad slug", { status: 400, headers: cors });
      target = `https://m.fang.com/fangjia/${slug}/`;
    } else if (url.pathname === "/raw/city") {
      const c = (url.searchParams.get("c") || "").replace(/[^a-z0-9]/gi, "");
      if (!c) return new Response("Bad city", { status: 400, headers: cors });
      target = `https://m.fang.com/fangjia/${c}/`;
    } else if (url.pathname === "/raw/community") {
      const c = (url.searchParams.get("c") || "").replace(/[^a-z0-9]/gi, "");
      const id = (url.searchParams.get("id") || "").replace(/\D/g, "");
      if (!c || !id) return new Response("Bad id", { status: 400, headers: cors });
      target = `https://m.fang.com/xiaoqu/${c}/${id}.html`;
    } else {
      return new Response("OK", { headers: cors });
    }

    const cache = caches.default;
    const cacheKey = new Request(target, { method: "GET" });
    let resp = await cache.match(cacheKey);
    if (!resp) {
      const upstream = await fetch(target, {
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" },
      });
      if (!upstream.ok) return new Response("Upstream error", { status: 502, headers: cors });
      const buf = await upstream.arrayBuffer();
      const head = new TextDecoder("latin1").decode(buf.slice(0, 500));
      const text = /charset=['"]?gb/i.test(head) ? new TextDecoder("gb18030").decode(buf) : new TextDecoder("utf-8").decode(buf);
      resp = new Response(text, {
        headers: { ...cors, "Cache-Control": "public, max-age=604800" },
      });
      await cache.put(cacheKey, resp.clone());
    }
    return resp;
  },
};

// Bubblaze on Cloudflare Workers: serves the built game (site/ in this repo) from GitHub,
// with Cloudflare's cache in front. Deployed through the Cloudflare API; see README.
const BASE = 'https://raw.githubusercontent.com/nithin486/bubble-brawl/claude/youthful-wright-wwuz3r/site';
const TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  glb: 'model/gltf-binary',
  json: 'application/json',
  woff2: 'font/woff2',
  woff: 'font/woff',
  png: 'image/png',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  webmanifest: 'application/manifest+json',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let path = url.pathname;
    if (path.endsWith('/')) path += 'index.html';
    if (!/\.[a-z0-9]+$/i.test(path)) path = '/index.html';
    const cache = caches.default;
    const key = new Request(url.origin + path);
    const hit = await cache.match(key);
    if (hit) return hit;
    const upstream = await fetch(BASE + path, { cf: { cacheTtl: 120, cacheEverything: true } });
    if (!upstream.ok) return new Response('Not found', { status: 404 });
    const ext = path.split('.').pop().toLowerCase();
    // hashed build files never change; everything else refreshes every 2 minutes
    const immutable = path.startsWith('/assets/') && /-[A-Za-z0-9_-]{8}\.(js|css|woff2?)$/.test(path);
    const res = new Response(upstream.body, {
      headers: {
        'content-type': TYPES[ext] || 'application/octet-stream',
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=120',
        'access-control-allow-origin': '*',
      },
    });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  },
};

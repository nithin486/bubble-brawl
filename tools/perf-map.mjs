// Frame cost of a map in the real game: draw calls, triangles, geometry/texture counts, JS heap, frame times.
// node tools/perf-map.mjs <map> [seconds] [--mobile]     (software GL: the call/triangle counts are exact, fps is NOT representative)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const map = process.argv[2] || 'bubblegum';
const secs = +(process.argv[3] || 6);
const mobile = process.argv.includes('--mobile');
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
await page.addInitScript((m) => localStorage.setItem('bb_profile_v1', JSON.stringify({ matches: 9, coins: 100, xp: 100, map: m, name: 'Nithin', camera: 'third', unlocked: ['bones', 'pinch', 'grizzle', 'ranger'], hero: 'ranger', firstSeen: '2026-11-24', lastSeen: '2026-11-24', sound: true, shake: true, quality: 'auto' })), map);
const t0 = Date.now();
await page.goto(`${process.env.URL || 'http://localhost:5173/'}?play&debug&map=${map}`);
await page.waitForFunction(() => window.__bb && window.__bb.world, null, { timeout: 180000 });
const loadMs = Date.now() - t0;
await page.waitForTimeout(3000);
const res = await page.evaluate(async (secs) => {
  const g = window.__bb;
  const r = g.stage.renderer;
  r.info.autoReset = false;
  const samples = [];
  const frames = [];
  let last = performance.now();
  const until = last + secs * 1000;
  // let bots fight: everyone gets a weapon now and then so projectiles/effects are on screen
  const w = g.world;
  while (performance.now() < until) {
    r.info.reset();
    await new Promise((res) => requestAnimationFrame(res));
    const now = performance.now();
    frames.push(now - last);
    last = now;
    samples.push({ calls: r.info.render.calls, tris: r.info.render.triangles });
    for (const p of w.players) if (!p.weapon && Math.random() < 0.02) { p.weapon = ['blaster', 'rocket', 'banana', 'freeze', 'hook', 'hammer'][Math.floor(Math.random() * 6)]; p.ammo = 9; }
  }
  r.info.autoReset = true;
  const max = (k) => Math.max(...samples.map((s) => s[k]));
  const avg = (k) => Math.round(samples.reduce((a, s) => a + s[k], 0) / samples.length);
  frames.sort((a, b) => a - b);
  return {
    calls: { avg: avg('calls'), max: max('calls') },
    tris: { avg: avg('tris'), max: max('tris') },
    frameMsMedian: +frames[Math.floor(frames.length / 2)].toFixed(1),
    geometries: r.info.memory.geometries,
    textures: r.info.memory.textures,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    drawingBuffer: [r.domElement.width, r.domElement.height],
    quality: g.stage.quality,
  };
}, secs);
console.log(JSON.stringify({ map, mobile, loadMs, ...res, errors: errors.slice(0, 8) }, null, 1));
await browser.close();

// Smoothness as a player feels it: waiting times, frame rate, stutters and freezes, with the game's own default settings.
//   URL=... node tools/smooth-test.mjs [seconds] [--phone] [--map=candy]      (playwright-core + CHROME; one browser, light on memory)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const base = process.env.URL || 'http://localhost:5173/';
const secs = +(process.argv.find((a) => /^\d+$/.test(a)) || 40);
const phone = process.argv.includes('--phone');
const map = process.argv.find((a) => a.startsWith('--map='))?.slice(6) || 'bubblegum';
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript((m) => localStorage.setItem('bb_profile_v1', JSON.stringify({ matches: 5, xp: 99999, map: m, mapV: 3, hero: 'ranger', sound: false })), map);
const until = (fn, ms = 180000) => page.waitForFunction(fn, null, { timeout: ms });
let t = Date.now();
await page.goto(base + '?debug');
await until(() => !document.getElementById('boot') && document.querySelector('#home .play'));
const out = { device: phone ? 'phone' : 'desktop', map, loadMs: Date.now() - t };
await page.waitForTimeout(6000);

/** Start recording every frame in the page. */
const record = () => page.evaluate(() => {
  const g = window.__bb;
  const log = (window.__f = { d: [], q: [g.stage.quality], stop: false });
  let last = performance.now();
  const step = () => {
    const n = performance.now();
    log.d.push(n - last);
    last = n;
    if (log.q.at(-1) !== g.stage.quality) log.q.push(g.stage.quality);
    if (!log.stop) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
const results = () => page.evaluate(() => {
  const log = window.__f;
  log.stop = true;
  const s = [...log.d].sort((a, b) => a - b);
  const total = s.reduce((a, b) => a + b, 0);
  const q = (f) => Math.round(s[Math.min(s.length - 1, Math.floor(s.length * f))]);
  return { fps: +((1000 * s.length) / total).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99), worst: Math.round(s.at(-1)), over50: s.filter((x) => x > 50).length, over200: s.filter((x) => x > 200).length, frozenMs: Math.round(s.filter((x) => x > 200).reduce((a, b) => a + b, 0)), quality: log.q.join('>'), programs: window.__bb.stage.renderer.info.programs.length };
});
async function play(label, length) {
  t = Date.now();
  await page.evaluate(() => document.querySelector('#home .play').click());
  await until(() => window.__bb.mode === 'match' && window.__bb.world.phase === 'playing');
  out[`${label}StartMs`] = Date.now() - t;
  // a bot plays our seat, so the match has real fighting
  await page.evaluate(() => {
    const g = window.__bb;
    const b = g.brains[0];
    g.autoBrain = new b.constructor(0, b.rng, -1);
  });
  await record();
  await page.waitForTimeout(length * 1000);
  out[label] = await results();
}
await play('match1', secs);
await page.evaluate(() => window.__bb.togglePause());
await page.evaluate(() => [...document.querySelectorAll('.big-btn')].find((b) => /QUIT/.test(b.textContent)).click());
await until(() => window.__bb.mode === 'home' && document.getElementById('home'));
await page.waitForTimeout(3000);
await play('match2', Math.round(secs / 2));
console.log(JSON.stringify(out));
console.log('errors:', [...new Set(errors)].slice(0, 5).join(' | ') || 'none');
await browser.close();

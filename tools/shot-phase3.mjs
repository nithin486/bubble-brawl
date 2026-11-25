// Phase 3 before/after capture + real-GPU performance. Needs playwright-core on NODE_PATH and CHROME.
//   node tools/shot-phase3.mjs <outDir> [home|maps|ui|perf ...] [--maps=desert,candy,bubblegum]
// URL (default http://localhost:5173/). Screenshots are real in-game frames.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || 'shots';
const maps = (args.find((a) => a.startsWith('--maps='))?.slice(7) || 'desert,candy,bubblegum').split(',');
const want = args.filter((a) => !a.startsWith('--')).slice(1);
const does = (s) => !want.length || want.includes(s);
const base = process.env.URL || 'http://localhost:5173/';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const errors = [];
const DESK = { viewport: { width: 1366, height: 768 } };
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const profile = (map, extra = {}) => ({ matches: 9, coins: 100, xp: 340, map, mapV: 2, name: 'Nithin', camera: 'third', unlocked: [], hero: 'ranger', firstSeen: '2026-11-24', lastSeen: '2026-11-25', sound: false, shake: true, quality: 'auto', ...extra });

async function open(device, map, query = '') {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${map} ${query}: ${m.text()} ${m.location()?.url ?? ''}`));
  page.on('pageerror', (e) => errors.push(`${map} ${query}: pageerror ${e.message}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.addInitScript((p) => localStorage.setItem('bb_profile_v1', JSON.stringify(p)), profile(map));
  await page.goto(base + query);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
  await page.waitForTimeout(3500);
  return { ctx, page };
}
const snap = (page, name) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 88, timeout: 120000 });

if (does('home')) {
  for (const map of maps) {
    for (const [tag, device] of [['', DESK], ['m-', PHONE]]) {
      const { ctx, page } = await open(device, map);
      await snap(page, `${tag}home-${map}`);
      await ctx.close();
    }
  }
}

if (does('maps')) {
  for (const map of maps) {
    const { ctx, page } = await open(DESK, map, `?play&debug&map=${map}&q=high`);
    await page.waitForTimeout(4000);
    await snap(page, `${map}-spawn`);
    // fixed viewpoints taken from the map itself so before/after line up
    const spots = await page.evaluate(() => {
      const m = window.__bb.world.map;
      const pick = (a, i) => a?.[i % a.length];
      return [pick(m.spawns, 2), pick(m.spawns, 5), pick(m.bankSpots, 1), pick(m.bankSpots, 4)].filter(Boolean).map((s) => ({ x: s.x, z: s.z }));
    });
    for (let i = 0; i <= spots.length; i++) {
      await page.evaluate(
        ([s, last]) => {
          const g = window.__bb;
          const me = g.world.players[0];
          if (last) {
            g.rig.setPreset('bird');
            g.rig.snap(g.v.set(0, 0, 0));
            return;
          }
          me.x = s.x;
          me.z = s.z;
          me.vx = me.vz = 0;
          me.facing = Math.atan2(-s.x, -s.z);
          g.rig.yaw = me.facing;
          g.rig.snap(g.v.set(me.x, 0, me.z));
        },
        [spots[i] ?? null, i === spots.length],
      );
      await page.waitForTimeout(1800);
      await snap(page, `${map}-${i === spots.length ? 'bird' : 'view' + (i + 1)}`);
    }
    await ctx.close();
    const m = await open(PHONE, map, `?play&debug&map=${map}`);
    await m.page.waitForTimeout(4000);
    await snap(m.page, `m-${map}-match`);
    await m.ctx.close();
  }
}

if (does('ui')) {
  for (const [tag, device] of [['', DESK], ['m-', PHONE]]) {
    let { ctx, page } = await open(device, 'candy');
    await page.click('.icon-btn');
    await page.waitForTimeout(900);
    await snap(page, `${tag}ui-settings`);
    await ctx.close();
    ({ ctx, page } = await open(device, 'candy'));
    await page.click('.friends', { force: true });
    await page.waitForTimeout(1500);
    await snap(page, `${tag}ui-friends`);
    await ctx.close();
    ({ ctx, page } = await open(device, 'candy', '?play&debug&map=candy'));
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const me = window.__bb.world.players[0];
      me.weapon = 'rocket';
      me.ammo = 3;
    });
    await page.waitForTimeout(700);
    await snap(page, `${tag}ui-hud-weapon`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    await snap(page, `${tag}ui-pause`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    // end the round, then the match
    await page.evaluate(() => (window.__bb.world.roundTime = 999));
    await page.waitForTimeout(1500);
    await snap(page, `${tag}ui-round-end`);
    await page.evaluate(() => {
      const w = window.__bb.world;
      w.round = 5;
      w.phaseT = 0.05;
    });
    await page.waitForTimeout(5000);
    await snap(page, `${tag}ui-match-end`);
    await ctx.close();
  }
  // loading screen
  const ctx = await browser.newContext(DESK);
  const page = await ctx.newPage();
  await page.route('**/*.glb', async (r) => {
    await new Promise((res) => setTimeout(res, 4000));
    await r.continue();
  });
  await page.goto(base);
  await page.waitForTimeout(1500);
  await snap(page, 'ui-loading');
  await ctx.close();
}

if (does('perf')) {
  const results = [];
  for (const map of maps) {
    for (const [tag, device] of [['desktop', DESK], ['phone', PHONE]]) {
      const t0 = Date.now();
      const { ctx, page } = await open(device, map, `?play&debug&autoplay&map=${map}`);
      const loadMs = Date.now() - t0 - 3500;
      const res = await page.evaluate(async () => {
        const g = window.__bb;
        const r = g.stage.renderer;
        const gl = r.getContext();
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        r.info.autoReset = false;
        const frames = [];
        const samples = [];
        let last = performance.now();
        const until = last + 20000;
        const w = g.world;
        while (performance.now() < until) {
          r.info.reset();
          await new Promise((res) => requestAnimationFrame(res));
          const now = performance.now();
          frames.push(now - last);
          last = now;
          samples.push({ calls: r.info.render.calls, tris: r.info.render.triangles });
          for (const p of w.players) if (!p.weapon && Math.random() < 0.02) {
            p.weapon = ['blaster', 'rocket', 'banana', 'freeze', 'hook', 'hammer'][Math.floor(Math.random() * 6)];
            p.ammo = 9;
          }
        }
        r.info.autoReset = true;
        const sorted = [...frames].sort((a, b) => a - b);
        const q = (f) => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))].toFixed(1);
        const avg = (k) => Math.round(samples.reduce((a, s) => a + s[k], 0) / samples.length);
        return {
          gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
          quality: g.stage.quality,
          fps: +(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)).toFixed(1),
          frameMs: { p50: q(0.5), p95: q(0.95), p99: q(0.99) },
          calls: { avg: avg('calls'), max: Math.max(...samples.map((s) => s.calls)) },
          tris: { avg: avg('tris'), max: Math.max(...samples.map((s) => s.tris)) },
          geometries: r.info.memory.geometries,
          textures: r.info.memory.textures,
          heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
          buffer: [r.domElement.width, r.domElement.height],
        };
      });
      results.push({ map, device: tag, loadMs, ...res });
      console.log(JSON.stringify(results.at(-1)));
      await ctx.close();
    }
  }
  fs.writeFileSync(`${out}/perf.json`, JSON.stringify(results, null, 1));
}

console.log('errors:', [...new Set(errors)].slice(0, 20).join('\n') || 'none');
await browser.close();

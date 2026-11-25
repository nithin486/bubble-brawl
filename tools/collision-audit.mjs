// How far does each prop's model stick out past what you collide with? (that is where a hero walks "into" things)
//   node tools/collision-audit.mjs   (URL, CHROME, playwright-core as for the other tools). Fails above LIMIT metres.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const base = process.env.URL || 'http://localhost:5173/';
const LIMIT = +(process.env.LIMIT || 0.35);
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const map of ['bubblegum', 'candy', 'desert']) {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
  await page.goto(`${base}?play&debug&map=${map}&q=low`);
  await page.waitForFunction(() => window.__bb?.world && window.__bb.island, null, { timeout: 120000 });
  const res = await page.evaluate(() => {
    const g = window.__bb;
    const w = g.world;
    const obs = w.map.obstacles;
    const shown = obs.filter((o) => !o.hidden);
    const solid = obs.filter((o) => o.r > 0);
    const out = {};
    const V = new g.stage.camera.position.constructor();
    g.island.props.forEach((p, i) => {
      const o = shown[i];
      // raised blocks are terrain (blocked by height); grass tufts are meant to be run through
      if (!o || /deckcell|block|ramp|bridge|path|plaza|dstone|dpebbles|dtyre|dplanks/i.test(o.kind)) return;
      p.obj.updateMatrixWorld(true);
      p.obj.traverse((m) => {
        if (!m.isMesh) return;
        const a = m.geometry.attributes.position;
        for (let k = 0; k < a.count; k++) {
          V.fromBufferAttribute(a, k).applyMatrix4(m.matrixWorld);
          if (!w.arena.solid(V.x, V.z)) continue;
          const h = V.y - w.terrain.heightAt(V.x, V.z);
          if (h < 0.35 || h > 1.5) continue; // what a hero's body can touch (not grass blades, not roofs overhead)
          let e = Infinity;
          for (const s of solid) {
            const d = Math.hypot(V.x - s.x, V.z - s.z) - s.r;
            if (d < e) e = d;
            if (e <= 0) break;
          }
          if (e <= 0) continue;
          const r = (out[o.kind] ??= { max: 0, pts: 0, r: o.r, at: '' });
          if (e > 0.15) r.pts++;
          if (e > r.max) {
            r.max = e;
            r.at = `${o.x.toFixed(1)},${o.z.toFixed(1)}`;
          }
        }
      });
    });
    return out;
  });
  const rows = Object.entries(res).sort((a, b) => b[1].max - a[1].max);
  console.log(`\n${map}`);
  for (const [kind, r] of rows) {
    if (r.max < 0.12) continue;
    const fail = r.max > LIMIT;
    if (fail) bad++;
    console.log(`  ${fail ? 'FAIL' : 'ok  '} ${kind.padEnd(14)} r ${r.r.toFixed(2)}  sticks out ${r.max.toFixed(2)} m  (e.g. at ${r.at})`);
  }
  await page.close();
}
console.log(bad ? `\n${bad} prop kinds stick out more than ${LIMIT} m` : `\nno prop sticks out more than ${LIMIT} m`);
await browser.close();
process.exit(bad ? 1 : 0);

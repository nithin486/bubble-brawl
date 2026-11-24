// In-game screenshots of a map.  node tools/shot-map.mjs <outDir> <map> "<name>:<cam>:<x>:<z>:<facingDeg>[:<yawDeg>]" ...
// cam = third | far | close | action | bird.  Needs playwright-core (NODE_PATH) and CHROME (chromium executable).
// Also prints draw calls / triangles after the last shot.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const out = process.argv[2] || 'shots';
const map = process.argv[3] || 'bubblegum';
const shots = process.argv.slice(4).map((s) => s.split(':'));
if (!shots.length) shots.push(['start', 'third']);
fs.mkdirSync(out, { recursive: true });
const url = `${process.env.URL || 'http://localhost:5173/'}?play&debug&map=${map}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } })).newPage();
const logs = [];
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()));
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
await page.addInitScript((m) => localStorage.setItem('bb_profile_v1', JSON.stringify({ matches: 9, coins: 100, xp: 100, map: m, name: 'Nithin', camera: 'third', unlocked: ['bones', 'pinch', 'grizzle', 'ranger'], hero: 'ranger', firstSeen: '2026-11-24', lastSeen: '2026-11-24', sound: true, shake: true, quality: 'auto' })), map);
await page.goto(url);
await page.waitForFunction(() => window.__bb && window.__bb.world, null, { timeout: 120000 });
await page.waitForTimeout(5000);
for (const [name, cam, x, z, face, yaw] of shots) {
  await page.evaluate(([cam, x, z, face, yaw]) => {
    const g = window.__bb;
    g.rig.setPreset(cam);
    const me = g.world.players[0];
    if (x !== undefined) {
      me.x = +x; me.z = +z; me.facing = (+face * Math.PI) / 180; me.vx = me.vz = 0;
      g.world.phase === 'countdown' && (g.world.phaseT = 0);
    }
    g.rig.snap(g.v.set(me.x, 0, me.z));
    if (yaw !== undefined) g.rig.yaw = (+yaw * Math.PI) / 180;
  }, [cam, x, z, face, yaw]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${map}-${name}.png`, timeout: 240000 });
}
const info = await page.evaluate(() => {
  const r = window.__bb.stage.renderer.info;
  return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures };
});
console.log('render info (last frame)', JSON.stringify(info));
console.log('errors:', logs.slice(0, 12).join('\n') || 'none');
await browser.close();

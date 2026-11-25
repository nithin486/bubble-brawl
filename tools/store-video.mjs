// Frames for the CrazyGames preview videos, taken from the game itself on a controlled clock, so they play smoothly
// even though this computer draws them slowly. Then tools/encode_video.py (Blender) turns them into MP4.
//   npm run build && node tools/store-art.mjs && node tools/store-video.mjs landscape|portrait [seconds]
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');

const shape = process.argv[2] === 'portrait' ? 'portrait' : 'landscape';
const SECONDS = Number(process.argv[3]) || 17;
const FPS = 30;
// 1920×1080 and 1080×1620 (2:3), drawn from a smaller layout so the on-screen controls stay readable
const view = shape === 'portrait' ? { width: 720, height: 1080 } : { width: 1280, height: 720 };
const dir = `release/frames-${shape}`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const server = createServer((q, r) => {
  const f = join('dist', new URL(q.url, 'http://x').pathname.slice(1) || 'index.html');
  if (!existsSync(f) || !statSync(f).isFile()) return r.writeHead(404).end();
  r.writeHead(200, { 'content-type': T[extname(f)] || 'application/octet-stream' });
  createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(4189, ok));
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: view, deviceScaleFactor: 1.5, serviceWorkers: 'block' })).newPage();
await page.addInitScript(() => localStorage.setItem('bb_profile_v1', JSON.stringify({ xp: 100000, mapV: 3, matches: 9, hero: 'ranger', sound: false, shake: true, name: '' })));
// the page's clock stands still from the start and moves only when this script says so
await page.clock.install({ time: new Date('2026-11-25T10:00:00') });
await page.clock.pauseAt(new Date('2026-11-25T10:00:01'));
await page.goto('http://localhost:4189/?play&debug&q=high');
for (let i = 0; i < 2400; i++) {
  if (await page.evaluate(() => window.__bb?.world?.phase === 'playing' && !document.getElementById('boot'))) break;
  await page.clock.runFor(100);
  await new Promise((ok) => setTimeout(ok, 100));
}
await page.addStyleTag({ content: '.lock-hint, .lockhint, .cam-hint, .tip, .prompt, .netbadge, .fps { display: none !important; }' });
await page.evaluate(() => {
  const g = window.__bb;
  const w = g.world;
  g.hud.lockHint = () => {};
  g.hud.tip = () => {};
  g.hud.prompt = () => {};
  g.tut = 'done';
  w.mod = 'none';
  const me = w.players[0];
  const near = (q) => Math.hypot(q.x - me.x, q.z - me.z);
  // the "player": a bot brain moves and shoots, the camera follows whoever it is fighting, and rivals keep coming
  let weapon = 'blaster';
  window.__stage = (kind, superNow) => {
    weapon = kind;
    me.weapon = kind;
    me.ammo = 30;
    if (superNow) me.charge = 1;
    const rivals = w.players.slice(1).filter((q) => q.state === 'normal').sort((a, b) => near(a) - near(b));
    const view = g.stage.camera.getWorldDirection(g.v.clone());
    const ahead = Math.atan2(view.x, view.z);
    rivals.slice(0, 3).forEach((q, i) => {
      const a = ahead + (i - 1) * 0.35;
      const d = 5 + i * 1.2;
      const x = me.x + Math.sin(a) * d;
      const z = me.z + Math.cos(a) * d;
      if (w.arena.solid(x, z) && w.clear(x, z, 0.7) && Math.abs(w.terrain.heightAt(x, z) - me.y) < 0.6) Object.assign(q, { x, z, y: w.terrain.heightAt(x, z), hp: 70 });
    });
  };
  const brain = new g.brains[0].constructor(0, new g.brains[0].rng.constructor(11), -1);
  g.autoBrain = {
    newRound() {},
    update(world, dt) {
      const input = brain.update(world, dt);
      me.hp = 100;
      if (me.state === 'bubble') me.state = 'normal';
      if (!me.weapon) (me.weapon = weapon), (me.ammo = 30);
      const target = world.players.filter((q) => q !== me && q.state !== 'falling' && !q.gone).sort((a, b) => near(a) - near(b))[0];
      if (!target) return input;
      const to = Math.atan2(target.x - me.x, target.z - me.z);
      const v = g.stage.camera.getWorldDirection(g.v.clone());
      const turn = Math.atan2(Math.sin(to - Math.atan2(v.x, v.z)), Math.cos(to - Math.atan2(v.x, v.z)));
      g.rig.addYaw(Math.sign(turn) * Math.min(Math.abs(turn), dt * 1.8));
      const d = near(target);
      const fire = d < (me.weapon === 'hammer' ? 3 : 14) && Math.abs(turn) < 0.5;
      return { ...input, grab: fire, aim: to, aimD: d, aimY: target.y + 1.05, ult: input.ult || (me.charge >= 1 && d < 7) };
    },
  };
});

const plan = [
  [0, 'blaster', false],
  [4, 'blaster', true],
  [8, 'rocket', false],
  [11.5, 'hammer', false],
  [14, 'blaster', true],
];
for (let f = 0; f < SECONDS * FPS; f++) {
  const t = f / FPS;
  const step = plan.find((p) => Math.abs(p[0] - t) < 0.5 / FPS);
  if (step) await page.evaluate(([k, s]) => window.__stage(k, s), [step[1], step[2]]);
  await page.clock.runFor(1000 / FPS);
  await page.screenshot({ path: join(dir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
  if (f % 90 === 0) console.log(shape, 'frame', f, '/', SECONDS * FPS);
}
await browser.close();
server.close();
console.log('frames ready in', dir);

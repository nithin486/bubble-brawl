// How does a friends match feel on the joining player's screen over a slow network?
// Two tabs, a simulated phone connection (delay, jitter, loss). Measured on the guest:
//   self     how evenly your own hero moves, and how far it slides after you let go
//   other    how evenly the other player moves across your screen
//   shots    share of laser shots that hit a rival who is strafing, aiming at where you see them
//   data     bytes per second sent to one friend
//   npm run build && node tools/net-feel.mjs [lagMs] [jitterMs] [loss] [ordered]
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');

const [lag = '80', jit = '60', loss = '0.03', ordered = ''] = process.argv.slice(2);
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = createServer((q, r) => {
  const f = join('dist', new URL(q.url, 'http://x').pathname.slice(1) || 'index.html');
  if (!existsSync(f) || !statSync(f).isFile()) return r.writeHead(404).end();
  r.writeHead(200, { 'content-type': T[extname(f)] || 'application/octet-stream' });
  createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(4185, ok));
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, serviceWorkers: 'block' });
const errors = [];
const net = `localnet&debug&q=low&lag=${lag}&jit=${jit}&loss=${loss}${ordered ? '&ordered=1' : ''}`;
const open = async (query) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:4185/?${query}`);
  await page.waitForFunction(() => !document.getElementById('boot') && window.__bb, null, { timeout: 180000 });
  return page;
};
const host = await open(net);
await host.click('.friends');
await host.click('.friends-panel .big-btn:has-text("CREATE ROOM")');
await host.waitForFunction(() => document.querySelector('.fp-bigcode')?.textContent.length === 5);
const code = await host.textContent('.fp-bigcode');
const guest = await open(`${net}&room=${code}`);
await host.waitForFunction(() => document.querySelector('.friends-panel .start')?.disabled === false, null, { timeout: 60000 });
await host.click('.friends-panel .start');
for (const p of [host, guest]) await p.waitForFunction(() => window.__bb.mode === 'match' && window.__bb.world.phase === 'playing', null, { timeout: 120000 });

// open ground on the east island; both heroes obey the test instead of the keyboard
await host.evaluate(() => {
  const g = window.__bb;
  const w = g.world;
  window.__host = { mx: 0, mz: 0 };
  g.readLocal = () => ({ mx: window.__host.mx, mz: window.__host.mz, dash: false, grab: false, skill: false });
  window.__place = (at = 19.5) => {
    for (const [p, x, z] of [[w.players[0], at, -1], [w.players[1], at, 5]]) {
      Object.assign(p, { x, z, y: w.terrain.heightAt(x, z), vx: 0, vz: 0, kx: 0, kz: 0, hp: 100, invuln: 0, state: 'normal', stateT: 0 });
    }
  };
  window.__hits = { shots: 0, hits: 0 };
  const on = g.onEvent.bind(g);
  g.onEvent = (e) => {
    if (e.t === 'laser' && e.p === 1 && window.__counting) (window.__hits.shots++, e.hit === 0 && window.__hits.hits++);
    on(e);
  };
  // nobody gets knocked out or pushed during the test, and no twist changes the speeds from run to run
  setInterval(() => w.players.forEach((p) => ((w.mod = 'none'), (p.speedT = 0), (p.hp = 100), (p.kx = p.kz = 0), p.state === 'stagger' && (p.state = 'normal'), (w.powerups.length = 0), w.brawl.boxes.forEach((b) => (b.respawn = 99)))), 20);
  window.__place();
});
await guest.evaluate(() => {
  const g = window.__bb;
  window.__me = { mx: 0, mz: 0, fire: false };
  g.readLocal = () => {
    const w = g.world;
    const [o, me] = w.players;
    const dx = o.x - me.x;
    const dz = o.z - me.z;
    const aim = Math.atan2(dx, dz);
    g.aimInfo = { heading: aim, dist: Math.hypot(dx, dz), y: o.y + 1.05 };
    return { mx: window.__me.mx, mz: window.__me.mz, dash: false, grab: window.__me.fire, skill: false, aim, aimD: Math.hypot(dx, dz), aimY: o.y + 1.05 };
  };
  /** Positions of one hero, one per drawn frame, for some seconds. */
  window.__track = (id, seconds) =>
    new Promise((done) => {
      const out = [];
      const t0 = performance.now();
      const step = () => {
        const p = g.world.players[id];
        const h = g.heroes[id].root.position;
        out.push([performance.now() - t0, h.x, h.z, p.x, p.z]);
        if (performance.now() - t0 < seconds * 1000) requestAnimationFrame(step);
        else done(out);
      };
      requestAnimationFrame(step);
    });
});
await guest.waitForTimeout(3000);

/** Unevenness of motion: how much the speed on screen varies frame to frame while it should be constant. */
const uneven = (rows) => {
  const v = [];
  for (let i = 1; i < rows.length; i++) {
    const dt = (rows[i][0] - rows[i - 1][0]) / 1000;
    if (dt > 0) v.push(Math.hypot(rows[i][1] - rows[i - 1][1], rows[i][2] - rows[i - 1][2]) / dt);
  }
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return { speed: +mean.toFixed(2), variation: +((100 * sd) / mean).toFixed(0), stalls: Math.round((100 * v.filter((x) => x < mean * 0.3).length) / v.length) };
};
const results = {};

// own movement: walk for 2.5 s each way, a few times
const self = [];
let slide = 0;
for (let k = 0; k < 4; k++) {
  await host.evaluate(() => window.__place());
  await guest.waitForTimeout(1500);
  await guest.evaluate(() => (window.__me.mx = 0.8));
  await guest.waitForTimeout(400);
  const rows = await guest.evaluate(() => window.__track(1, 0.7));
  self.push(uneven(rows));
  if (process.env.WHY) console.log('walk', k, JSON.stringify(self.at(-1)), 'from', rows[0].slice(1, 3).map((v) => v.toFixed(1)), 'to', rows.at(-1).slice(1, 3).map((v) => v.toFixed(1)));
  await guest.evaluate(() => (window.__me.mx = 0));
  const after = await guest.evaluate(() => window.__track(1, 1.5));
  slide += Math.hypot(after.at(-1)[1] - after[0][1], after.at(-1)[2] - after[0][2]) / 4;
}
const avg = (a, k) => Math.round(a.reduce((s, r) => s + r[k], 0) / a.length);
results.self = { variationPct: avg(self, 'variation'), stallPct: avg(self, 'stalls'), slideAfterStopM: +slide.toFixed(2) };

// the other player walking
const other = [];
for (let k = 0; k < 4; k++) {
  await host.evaluate(() => window.__place());
  await guest.waitForTimeout(1500);
  await host.evaluate(() => (window.__host.mx = 0.8));
  await guest.waitForTimeout(450);
  const seen = await guest.evaluate(() => window.__track(0, 0.7));
  other.push(uneven(seen));
  if (process.env.WHY) console.log('other', k, JSON.stringify(other.at(-1)), seen[0][1].toFixed(1), '->', seen.at(-1)[1].toFixed(1));
  await host.evaluate(() => (window.__host.mx = 0));
}
results.other = { variationPct: avg(other, 'variation'), stallPct: avg(other, 'stalls') };

// shooting a strafing rival
await host.evaluate(() => {
  window.__place(23);
  const w = window.__bb.world;
  Object.assign(w.players[1], { weapon: 'blaster', ammo: 9999 });
  window.__keep = setInterval(() => Object.assign(w.players[1], { weapon: 'blaster', ammo: 9999 }), 100);
  let t = 0.4; // start in the middle of a swing, so the strafe stays around its starting spot
  window.__strafe = setInterval(() => {
    t += 0.1;
    window.__host.mx = Math.floor(t / 0.8) % 2 ? -1 : 1;
  }, 100);
});
await guest.waitForTimeout(1500);
await host.evaluate(() => (window.__counting = true));
await guest.evaluate(() => (window.__me.fire = true));
await guest.waitForTimeout(14000);
await host.evaluate(() => (window.__counting = false));
const hits = await host.evaluate(() => window.__hits);
results.shots = { fired: hits.shots, hitPct: hits.shots ? Math.round((100 * hits.hits) / hits.shots) : 0 };

results.data = await host.evaluate(async () => {
  const r = window.__bb.room;
  let bytes = 0;
  const send = r.snapshot.bind(r);
  r.snapshot = (s) => ((bytes += JSON.stringify(s).length), send(s));
  await new Promise((ok) => setTimeout(ok, 5000));
  r.snapshot = send;
  return { bytesPerSecondPerFriend: Math.round(bytes / 5) };
});
const fps = await guest.evaluate(() => new Promise((ok) => { let n = 0; const t = performance.now(); const f = () => (++n, performance.now() - t < 2000 ? requestAnimationFrame(f) : ok(Math.round(n / 2))); requestAnimationFrame(f); }));
console.log(JSON.stringify({ network: { lagMs: +lag, jitterMs: +jit, loss: +loss, ordered: !!ordered, guestFps: fps }, ...results }));
console.log('errors:', errors.slice(0, 4).join(' | ') || 'none');
await browser.close();
server.close();

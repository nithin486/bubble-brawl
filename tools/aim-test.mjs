// Shooter accuracy in the real game: does the shot land where the crosshair is?
//   URL=http://localhost:4173/ node tools/aim-test.mjs [outDir]     (playwright-core + CHROME as for the other tools)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const base = process.env.URL || 'http://localhost:5173/';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
let fails = 0;
const errors = [];
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) fails++;
};
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}?play&debug&map=candy&q=low`);
await page.waitForFunction(() => window.__bb?.world?.phase === 'playing', null, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__bb;
  g.brains.forEach((br) => (br.update = () => ({ mx: 0, mz: 0, dash: false, grab: false, skill: false })));
  g.rig.shakeEnabled = false;
  g.hitStop = 0;
  window.__lasers = [];
  const on = g.onEvent.bind(g);
  g.onEvent = (e) => {
    if (e.t === 'laser' && e.p === 0) window.__lasers.push(e);
    on(e);
  };
});
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => {
  const step = () => (n-- > 0 ? requestAnimationFrame(step) : r());
  step();
}), n);

/** Stand at (x,z), a rival `dist` away on bearing `deg`; returns after placing. */
async function setup(x, z, dist, deg) {
  await page.evaluate(([x, z, dist, deg]) => {
    const g = window.__bb;
    const [me, o, ...rest] = g.world.players;
    const a = (deg * Math.PI) / 180;
    rest.forEach((q, i) => Object.assign(q, { x: -28 + i * 3, z: 27, vx: 0, vz: 0, kx: 0, kz: 0 }));
    Object.assign(me, { x, z, vx: 0, vz: 0, kx: 0, kz: 0, facing: a, state: 'normal', stateT: 0, weapon: 'blaster', ammo: 99, fireCd: 0, invuln: 99 });
    Object.assign(o, { x: x + Math.sin(a) * dist, z: z + Math.cos(a) * dist, y: 0, vx: 0, vz: 0, kx: 0, kz: 0, state: 'normal', stateT: 0, hp: 100, invuln: 0, shieldT: 0, weapon: null });
    g.rig.faceBehind(a);
  }, [x, z, dist, deg]);
  await frames(30);
}

/** Turn the camera until the screen centre sits on the point `up` metres up the rival, `side` metres to its right. */
async function pointAt(up, side = 0) {
  for (let i = 0; i < 6; i++) {
    await page.evaluate(([up, side]) => {
      const g = window.__bb;
      const [me, o] = g.world.players;
      const c = g.stage.camera.position;
      const r = g.rig.yaw;
      const tx = o.x + Math.cos(r) * side;
      const ty = g.world.terrain.heightAt(o.x, o.z) + up;
      const tz = o.z - Math.sin(r) * side;
      g.rig.yaw = Math.atan2(-(tx - c.x), -(tz - c.z));
      g.rig.pitch = Math.atan2(ty - c.y, Math.hypot(tx - c.x, tz - c.z));
      void me;
    }, [up, side]);
    await frames(6);
  }
}

async function fire() {
  await page.evaluate(() => {
    window.__lasers.length = 0;
    Object.assign(window.__bb.world.players[0], { fireCd: 0 });
    Object.assign(window.__bb.world.players[1], { hp: 100, state: 'normal', kx: 0, kz: 0, invuln: 0 });
  });
  await page.keyboard.down('KeyJ');
  await page.waitForFunction(() => window.__lasers.length > 0, null, { timeout: 5000 }).catch(() => {});
  await page.keyboard.up('KeyJ');
  await frames(2);
  return page.evaluate(() => {
    const g = window.__bb;
    const e = window.__lasers[0];
    if (!e) return null;
    const v = g.v.clone().set(e.tx, e.ty, e.tz).project(g.stage.camera);
    return { hit: e.hit, offPx: Math.hypot((v.x * innerWidth) / 2, (v.y * innerHeight) / 2), rival: g.world.players[1].hp };
  });
}

const spots = [[22, 4, 180], [22, 4, 160], [22, -4, 180], [6, 22, 90], [-6, -22, 270]];
let hits = 0;
let shots = 0;
const offs = [];
for (const [x, z, deg] of spots)
  for (const dist of [4, 8, 14]) {
    await setup(x, z, dist, deg);
    // only count lines of fire that are actually open (and where both players really stand on the map)
    const open = await page.evaluate(([x, z]) => {
      const g = window.__bb;
      const [a, b] = g.world.players;
      return g.world.arena.solid(a.x, a.z) && g.world.arena.solid(b.x, b.z) && Math.hypot(a.x - x, a.z - z) < 1 && g.canSee(a, b);
    }, [x, z]);
    if (!open) continue;
    for (const up of [0.45, 1.05, 1.7]) {
      await pointAt(up);
      const r = await fire();
      shots++;
      if (r?.hit === 1) hits++;
      if (r) offs.push(r.offPx);
      if (!r || r.hit !== 1)
        console.log(`      miss: spot ${x},${z} bearing ${deg} dist ${dist} height ${up}`, JSON.stringify(r), await page.evaluate(() => {
          const g = window.__bb;
          const [me, o] = g.world.players;
          const e = window.__lasers[0];
          const f = (v) => +v.toFixed(2);
          return JSON.stringify({ me: [f(me.x), f(me.z), me.state], o: [f(o.x), f(o.z), f(o.y), o.state, f(g.world.terrain.heightAt(o.x, o.z))], cam: g.stage.camera.position.toArray().map(f), end: e ? [f(e.tx), f(e.ty), f(e.tz)] : null, locked: g.aimLocked, aim: g.aimInfo && [f(g.aimInfo.heading), f(g.aimInfo.dist), f(g.aimInfo.y)] });
        }));
    }
  }
check('crosshair on a rival (legs, chest, head) hits it', hits === shots && shots >= 20, `${hits}/${shots}`);
offs.sort((a, b) => a - b);
check('the shot lands where the crosshair is', offs[Math.floor(offs.length * 0.9)] < 30, `median ${offs[offs.length >> 1].toFixed(1)} px, 90% within ${offs[Math.floor(offs.length * 0.9)].toFixed(1)} px of centre`);

let falseHits = 0;
let near = 0;
for (const dist of [5, 9, 13]) {
  await setup(22, 4, dist, 180);
  for (const [up, side] of [[2.6, 0], [1.05, 1.2], [1.05, -1.2]]) {
    await pointAt(up, side);
    const r = await fire();
    near++;
    if (r?.hit === 1) falseHits++;
  }
}
check('crosshair beside or above a rival misses it (no mouse snapping)', falseHits === 0, `${falseHits} wrong hits of ${near}`);

// the crosshair must not move by itself
await setup(22, 4, 8, 180);
await pointAt(1.05);
const view = () => page.evaluate(() => {
  const d = window.__bb.stage.camera.getWorldDirection(window.__bb.v.clone());
  return [Math.atan2(d.x, d.z), Math.asin(d.y)];
});
const a0 = await view();
for (const k of ['KeyW', 'KeyD', 'KeyS', 'KeyA']) {
  await page.keyboard.down(k);
  await page.waitForTimeout(450);
  await page.keyboard.up(k);
}
const a1 = await view();
check('running around never turns the view', Math.abs(a1[0] - a0[0]) < 1e-3 && Math.abs(a1[1] - a0[1]) < 1e-3, `${(a1[0] - a0[0]).toFixed(4)} / ${(a1[1] - a0[1]).toFixed(4)} rad`);
// back against a wall: the camera comes closer but keeps looking the same way
await page.evaluate(() => {
  const g = window.__bb;
  const o = g.world.map.obstacles.find((q) => q.kind === 'pillar');
  Object.assign(g.world.players[0], { x: o.x, z: o.z - o.r - 0.6, vx: 0, vz: 0 });
  g.rig.faceBehind(Math.PI);
  g.rig.pitch = 0.05;
});
await frames(40);
const w = await page.evaluate(() => {
  const g = window.__bb;
  const d = g.stage.camera.getWorldDirection(g.v.clone());
  return { yaw: Math.atan2(-d.x, -d.z) - g.rig.yaw, pitch: Math.asin(d.y) - g.rig.pitch };
});
check('near a wall the view still looks where you aim', Math.abs(Math.atan2(Math.sin(w.yaw), Math.cos(w.yaw))) < 1e-3 && Math.abs(w.pitch) < 1e-3, JSON.stringify(w));
if (out) await page.screenshot({ path: `${out}/wall.jpg`, type: 'jpeg' });

// real mouse: one click captures it, then movement turns the view in proportion
await page.mouse.click(640, 300);
await page.waitForTimeout(500);
const locked = await page.evaluate(() => !!document.pointerLockElement);
check('a click captures the mouse', locked);
if (locked) {
  const y0 = await page.evaluate(() => window.__bb.rig.yaw);
  await page.mouse.move(740, 300, { steps: 1 });
  await frames(4);
  const y1 = await page.evaluate(() => window.__bb.rig.yaw);
  check('moving the mouse right turns right', y1 < y0, `${(y0 - y1).toFixed(3)} rad for 100 px`);
}
if (out) {
  await setup(22, 4, 8, 180);
  await pointAt(1.05);
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/beam.jpg`, type: 'jpeg', quality: 92 });
  await page.keyboard.up('KeyJ');
  await pointAt(1.05, 2.5);
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/beam-miss.jpg`, type: 'jpeg', quality: 92 });
  await page.keyboard.up('KeyJ');
}
console.log(`\n${fails ? fails + ' FAILED' : 'aim checks passed'}`);
console.log('browser errors:', [...new Set(errors)].join('\n') || 'none');
await browser.close();
process.exit(fails ? 1 : 0);

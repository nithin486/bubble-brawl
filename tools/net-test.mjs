// Two real browser players in one friends room (uses the public PeerJS signalling server, so it needs internet).
//   URL=http://localhost:4173/ node tools/net-test.mjs [outDir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const base = process.env.URL || 'http://localhost:5173/';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const errors = [];
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) fails++;
};
const open = async () => {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base + '?debug&q=low&friends');
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 90000 });
  return page;
};
const until = (page, fn, arg, ms = 45000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const host = await open();
const guest = await open();
await host.click('.friends');
await host.fill('.fp-field input', 'Host');
await host.click('.friends-panel .big-btn:has-text("CREATE ROOM")');
const made = await until(host, () => document.querySelector('.fp-bigcode')?.textContent.length === 5);
check('host creates a room', made);
if (made) {
  const code = await host.textContent('.fp-bigcode');
  await guest.click('.friends');
  await guest.fill('.fp-field input', 'Guest');
  await guest.fill('.fp-code', code);
  await guest.click('.friends-panel .big-btn:has-text("JOIN")');
  check('guest joins with the code', await until(guest, () => document.querySelector('.fp-wait')));
  check('host sees both players', await until(host, () => document.querySelectorAll('.fp-seat:not(.empty)').length === 2));
  if (out) await host.screenshot({ path: `${out}/lobby.png` });
  await host.click('.friends-panel .big-btn:has-text("START MATCH")');
  const both = (await until(host, () => window.__bb.mode === 'match')) && (await until(guest, () => window.__bb.mode === 'match'));
  check('both are in the match', both);
  if (both) {
    await until(guest, () => window.__bb.world.phase === 'playing');
    const mapOf = (p) => p.evaluate(() => window.__bb.world.map.id);
    check('same map on both', (await mapOf(host)) === (await mapOf(guest)));
    check('guest has the six-slot weapon rack', (await guest.locator('.rack .slot').count()) === 6);
    await guest.bringToFront();
    const seat = await guest.evaluate(() => window.__bb.hud && window.__bb.world.players.findIndex((p) => p.name === 'You'));
    const read = () => host.evaluate((s) => ({ x: window.__bb.world.players[s].x, z: window.__bb.world.players[s].z }), seat);
    const a = await read();
    await guest.keyboard.down('KeyW');
    await guest.waitForTimeout(1500);
    await guest.keyboard.up('KeyW');
    await guest.waitForTimeout(500);
    const b = await read();
    check('guest movement reaches the host', Math.hypot(b.x - a.x, b.z - a.z) > 0.8, `${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)} m`);
    const g = await guest.evaluate((s) => ({ x: window.__bb.world.players[s].x, z: window.__bb.world.players[s].z }), seat);
    check('guest and host agree on the position', Math.hypot(g.x - b.x, g.z - b.z) < 2.5, `${Math.hypot(g.x - b.x, g.z - b.z).toFixed(1)} m apart`);
    await host.evaluate(() => (window.__bb.world.roundTime = 999));
    check('the results reach the guest', await until(guest, () => document.querySelector('.panel .standings')));
    if (out) await guest.screenshot({ path: `${out}/guest-round-end.png` });
  }
}
console.log(`\n${fails ? fails + ' FAILED' : 'multiplayer checks passed'}`);
console.log('browser errors:', [...new Set(errors)].join('\n') || 'none');
await browser.close();
process.exit(fails ? 1 : 0);

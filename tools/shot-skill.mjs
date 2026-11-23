// Triggers each effect on demand and screenshots it: node tools/shot-skill.mjs <outdir>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto('http://localhost:5173/?play&debug&q=high');
await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 60000 });
await page.waitForFunction(() => window.__bb.world.phase === 'playing', null, { timeout: 30000 });
const shoot = async (name, setup, wait) => {
  await page.evaluate(setup);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png` });
};
// pull two bots next to me with coins, then fire my skill
const crowd = `const w = window.__bb.world; const me = w.players[0];
  me.x = -4; me.z = 2; [1,2,3].forEach((i, k) => { const p = w.players[i]; p.x = me.x + [1.6,-1.4,0.2][k]; p.z = me.z + [-0.6,0.4,-1.7][k]; p.carried = 12; p.invuln = 0; });`;
for (const hero of ['bones', 'grizzle']) {
  await shoot(`skill-${hero}`, `${crowd} const w2 = window.__bb.world; w2.players[0].hero = '${hero}'; w2.players[0].skillCd = 0; w2.players[0].facing = 1.2;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' }));`, hero === 'grizzle' ? 520 : 330);
  await page.waitForTimeout(1500);
}
// power bubbles + a bomb
await shoot('powers', `const w = window.__bb.world; const me = w.players[0]; me.shieldT = 8; me.magnetT = 5;
  w.powerups.push({ id: 900, kind: 'speed', x: me.x + 2.5, z: me.z - 1, age: 1 }, { id: 901, kind: 'bomb', x: me.x - 2.5, z: me.z - 1.5, age: 1 }, { id: 902, kind: 'magnet', x: me.x + 0.5, z: me.z - 3, age: 1 });
  w.bombs.push({ id: 903, owner: 1, x: me.x + 3, z: me.z + 1.5, fuse: 1.0 });`, 500);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/boom.png` });
console.log('errors:', errs.join('\n') || 'none');
await browser.close();

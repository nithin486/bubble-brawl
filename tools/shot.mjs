// Screenshot helper: node tools/shot.mjs <outdir> [--mobile] [--script=name]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || 'shots';
const mobile = process.argv.includes('--mobile');
const url = process.env.URL || 'http://localhost:5173/?fps';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = mobile
  ? await browser.newContext({ ...devices['Pixel 7 landscape'] })
  : await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 60000 });
} catch (e) {
  await page.screenshot({ path: `${out}/00-fail.png` });
  console.log(logs.join('\n'));
  throw e;
}
console.log('ready in', Date.now() - t0, 'ms');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/01-start.png` });
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
await hold('KeyW', 900);
await hold('KeyD', 700);
await page.screenshot({ path: `${out}/02-moving.png` });
await page.keyboard.press('Space');
await page.waitForTimeout(120);
await page.screenshot({ path: `${out}/03-dash.png` });
for (let i = 0; i < 6; i++) { await hold(['KeyA','KeyS','KeyW','KeyD'][i%4], 600); await page.keyboard.press('KeyJ'); }
await page.keyboard.press('KeyK');
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/04-skill.png` });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/05-later.png` });
console.log(logs.filter(l => !l.includes('[analytics]')).slice(0, 30).join('\n'));
await browser.close();

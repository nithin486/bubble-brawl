// Autoplays a match at high speed and screenshots key moments: node tools/shot-flow.mjs <outdir>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || 'shots';
const speed = process.env.SPEED || '8';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const logs = [];
page.on('console', (m) => m.type() !== 'debug' && !m.text().includes('GL Driver') && logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:5173/?autoplay&q=medium&speed=${speed}`);
await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 60000 });
const shots = (process.env.AT || '4,9,14,22,40,70').split(',').map(Number);
let t = 0;
for (const s of shots) {
  await page.waitForTimeout((s - t) * 1000);
  t = s;
  await page.screenshot({ path: `${out}/flow-${String(s).padStart(3, '0')}.png` });
}
console.log(logs.slice(-25).join('\n'));
await browser.close();

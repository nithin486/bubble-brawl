// Screenshots the round-end panel and the results screen: node tools/shot-panels.mjs <outdir>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || 'shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(`http://localhost:5173/?autoplay&q=medium&speed=3`);
await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 60000 });
await page.waitForFunction(() => document.querySelector('.veil .standings'), null, { timeout: 120000, polling: 200 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/panel-round.png` });
// skip ahead: last round, nearly over
await page.evaluate(() => { const w = window.__bb.world; w.round = 5; w.roundTime = Math.max(w.roundTime, 71); });
await page.waitForFunction(() => document.querySelector('.big-btn'), null, { timeout: 300000, polling: 500 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/panel-results.png` });
await page.click('.hcard:nth-child(2)');
await page.click('.big-btn');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/rematch.png` });
console.log('errors:', errs.join('\n') || 'none');
await browser.close();

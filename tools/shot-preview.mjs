import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
page.on('pageerror', (e) => console.log(e.message));
await page.goto('http://localhost:5173/preview.html' + (process.argv[3] ? '?n=' + process.argv[3] : ''));
await page.waitForFunction(() => window.done, null, { timeout: 60000 });
await page.screenshot({ path: process.argv[2] });
await browser.close();

// Same machine, same minute, fixed quality: two builds side by side.
//   node tools/perf-compare.mjs <beforeUrl> <afterUrl> [out.json]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const [beforeUrl, afterUrl, outFile] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const results = [];
for (const map of (process.env.MAPS || 'desert,candy,bubblegum').split(','))
  for (const q of (process.env.QS || 'low,medium').split(','))
    for (const [build, url] of [['before', beforeUrl], ['after', afterUrl], ['before', beforeUrl], ['after', afterUrl]]) {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await page.goto(`${url}?play&debug&autoplay&map=${map}&q=${q}`);
      await page.waitForFunction(() => window.__bb?.world?.phase === 'playing', null, { timeout: 120000 });
      await page.evaluate((q) => {
        window.__bb.autoQuality = false;
        window.__bb.stage.setQuality(q);
      }, q);
      await page.waitForTimeout(6000);
      const r = await page.evaluate(async () => {
        const g = window.__bb;
        const R = g.stage.renderer;
        R.info.autoReset = false;
        const f = [];
        const c = [];
        const t = [];
        let last = performance.now();
        const end = last + 15000;
        while (performance.now() < end) {
          R.info.reset();
          await new Promise((res) => requestAnimationFrame(res));
          const n = performance.now();
          f.push(n - last);
          last = n;
          c.push(R.info.render.calls);
          t.push(R.info.render.triangles);
        }
        const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
        const s = [...f].sort((a, b) => a - b);
        return { fps: +(1000 / (f.reduce((a, b) => a + b, 0) / f.length)).toFixed(1), p50: +s[s.length >> 1].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), calls: avg(c), tris: avg(t), heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), quality: g.stage.quality };
      });
      results.push({ map, q, build, ...r });
      console.log(JSON.stringify(results.at(-1)));
      await ctx.close();
    }
if (outFile) fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
await browser.close();

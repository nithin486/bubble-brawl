// Short gameplay clips (autoplay, HUD included) → <outDir>/<map>.webp (animated). No video codec needed.
//   URL, CHROME and playwright-core as for the other tools.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import sharp from 'sharp';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const base = process.env.URL || 'http://localhost:5173/';
const out = process.argv[2] || 'clips';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
for (const map of ['desert', 'candy', 'bubblegum']) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  await page.goto(`${base}?play&autoplay&debug&map=${map}&q=low`);
  await page.waitForFunction(() => window.__bb?.world?.phase === 'playing', null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ data: Buffer.from(f.data, 'base64'), t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 640, maxHeight: 360 });
  await page.waitForTimeout(10000);
  await cdp.send('Page.stopScreencast');
  await ctx.close();
  // keep about 10 frames per second, with their real timing
  const keep = [];
  for (const f of frames) if (!keep.length || f.t - keep.at(-1).t >= 0.095) keep.push(f);
  const imgs = await Promise.all(keep.map((f) => sharp(f.data).resize(640, 360).png().toBuffer()));
  const delay = keep.map((f, i) => Math.max(20, Math.round(((keep[i + 1]?.t ?? f.t + 0.1) - f.t) * 1000)));
  const info = await sharp(imgs, { join: { animated: true } }).webp({ quality: 55, delay, loop: 0 }).toFile(`${out}/${map}.webp`);
  console.log(map, keep.length, 'frames', (info.size / 1024) | 0, 'KB');
}
await browser.close();

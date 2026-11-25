// Map picker thumbnails: a real in-game view of each map without HUD → client/public/thumbs/<map>.webp
import { createRequire } from 'node:module';
import sharp from 'sharp';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const base = process.env.URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
// camera position and target per map
const views = { bubblegum: [[22, 17, 30], [0, 1, 0]], candy: [[26, 18, 34], [0, 0, -4]], desert: [[10, 13, 34], [0, 2, -10]] };
for (const [map, [pos, look]] of Object.entries(views)) {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 400 } })).newPage();
  await page.goto(`${base}?play&debug&autoplay&map=${map}&q=high`);
  await page.waitForFunction(() => window.__bb?.world, null, { timeout: 90000 });
  await page.addStyleTag({ content: '#hud{display:none!important}' });
  await page.waitForTimeout(3000);
  await page.evaluate(([pos, look]) => {
    const g = window.__bb;
    const render = g.stage.render.bind(g.stage);
    g.stage.render = () => {
      g.stage.camera.position.set(...pos);
      g.stage.camera.lookAt(...look);
      render();
    };
  }, [pos, look]);
  await page.waitForTimeout(2500);
  const png = await page.screenshot({ timeout: 90000 });
  const info = await sharp(png).resize(600, 250).webp({ quality: 76 }).toFile(`client/public/thumbs/${map}.webp`);
  console.log(map, info.size);
  await page.close();
}
await browser.close();

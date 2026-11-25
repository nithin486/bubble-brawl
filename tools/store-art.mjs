// Draft store pictures taken from the game itself: CrazyGames covers (title only), Play feature graphic and
// screenshots.   npm run build && node tools/store-art.mjs [names…]
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');

const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const server = createServer((q, r) => {
  const f = join('dist', new URL(q.url, 'http://x').pathname.slice(1) || 'index.html');
  if (!existsSync(f) || !statSync(f).isFile()) return r.writeHead(404).end();
  r.writeHead(200, { 'content-type': T[extname(f)] || 'application/octet-stream' });
  createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(4183, ok));
mkdirSync('store/crazygames', { recursive: true });
mkdirSync('store/play', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const wanted = process.argv.slice(2);
const profile = JSON.stringify({ xp: 100000, mapV: 3, matches: 9, hero: 'ranger', coins: 640 });

async function open(viewport, query, mobile = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  await ctx.addInitScript(`localStorage.setItem('bb_profile_v1', ${JSON.stringify(profile)})`);
  const page = await ctx.newPage();
  await page.goto(`http://localhost:4183/?debug&q=high${query}`);
  await page.waitForFunction(() => !document.getElementById('boot') && window.__bb, null, { timeout: 240000 });
  return { ctx, page };
}

// ---------------------------------------------------------------- covers: the heroes and the title, nothing else
const covers = [
  ['store/crazygames/cover-1920x1080.png', { width: 1920, height: 1080 }, 15],
  ['store/crazygames/cover-800x1200.png', { width: 800, height: 1200 }, 13],
  ['store/crazygames/cover-800x800.png', { width: 800, height: 800 }, 12],
  ['store/play/feature-1024x500.png', { width: 1024, height: 500 }, 15],
];
for (const [file, viewport, logo] of covers) {
  if (wanted.length && !wanted.some((w) => file.includes(w))) continue;
  const { ctx, page } = await open(viewport, '');
  await page.addStyleTag({
    content: `#home > :not(.logo):not(.shade), #hud, .logo .tag, .logo .crown { display: none !important; }
      #home .logo { position: absolute !important; left: 50% !important; right: auto !important; top: 4% !important; transform: translateX(-50%) rotate(-3deg) !important; font-size: ${logo}vmin !important; width: max-content; text-align: center; }
      #home .logo .w { font-size: ${logo}vmin !important; line-height: .95 !important; display: block; }`,
  });
  await page.evaluate(() => {
    const g = window.__bb;
    g.showcase.set([
      { hero: 'bones', anim: 'Cheer', color: '#7fe3ff', height: 0.35 },
      { hero: 'ranger', anim: 'Cheer', color: '#ff9f1a', height: 0.6 },
      { hero: 'grizzle', anim: 'Cheer', color: '#ff5fd2', height: 0.35 },
    ]);
    g.showcase.screenX = 0;
    g.showcase.screenY = -0.12;
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: file });
  console.log('wrote', file);
  await ctx.close();
}

// ---------------------------------------------------------------- phone screenshots of real play
if (!wanted.length || wanted.includes('screens')) {
  const { ctx, page } = await open({ width: 960, height: 540 }, '&play', true);
  await page.waitForFunction(() => window.__bb.world.phase === 'playing', null, { timeout: 120000 });
  const stage = (weapon) =>
    page.evaluate((w) => {
      const g = window.__bb;
      const wd = g.world;
      const me = wd.players[0];
      wd.players.slice(1, 4).forEach((q, i) => {
        const side = (i - 1) * 2.6;
        q.x = me.x + Math.sin(me.facing) * (5 + (i % 2) * 2) + Math.cos(me.facing) * side;
        q.z = me.z + Math.cos(me.facing) * (5 + (i % 2) * 2) - Math.sin(me.facing) * side;
        q.invuln = 60;
      });
      Object.assign(me, { weapon: w, ammo: 20, charge: 1, hp: 100, invuln: 60 });
      document.querySelectorAll('.prompt, .tip').forEach((e) => (e.style.display = 'none'));
    }, weapon);
  await stage('blaster');
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.__bb.input.holdFire(true));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'store/play/screenshot-1-laser.png' });
  await page.evaluate(() => (window.__bb.input.holdFire(false), window.__bb.input.press('ult')));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'store/play/screenshot-2-super.png' });
  await stage('rocket');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'store/play/screenshot-3-rocket.png' });
  await page.evaluate(() => (window.__bb.world.roundTime = 999));
  await page.waitForSelector('.panel.results', { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'store/play/screenshot-4-results.png' });
  console.log('wrote 4 phone screenshots');
  await ctx.close();
}
await browser.close();
server.close();

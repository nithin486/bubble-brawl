// Checks the release features in a real browser: shop, purchases (stubbed store), friends rooms without bots,
// offline worker, and the CrazyGames build against a stand-in SDK. Serves the two builds itself and exits.
//   npm run build && npm run build:crazygames && node tools/release-test.mjs [outDir] [parts: web,play,rooms,crazy]
//   REAL=1 … rooms   connects through the real PeerJS service (needs internet) instead of between two tabs
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');

const out = process.argv[2];
const parts = (process.argv[3] || 'web,play,rooms,crazy').split(',');
if (out) mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };
const serve = (root, port) =>
  new Promise((ready) => {
    const s = createServer((req, res) => {
      let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\\/.])+(?=\.well-known)|^[\\/]+/, '');
      if (!p || p.endsWith('/') || p.endsWith('\\')) p += 'index.html';
      const f = join(root, p);
      if (!existsSync(f) || !statSync(f).isFile()) return res.writeHead(404).end();
      res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
      createReadStream(f).pipe(res);
    });
    s.listen(port, () => ready(s));
  });
const servers = [await serve('dist', 4180), await serve('dist-crazygames', 4181)];
const WEB = 'http://localhost:4180/';
const CG = 'http://localhost:4181/';
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const errors = [];
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) fails++;
};
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon|404|502/.test(m.text()) && errors.push(m.text()));
};
const until = (page, fn, arg, ms = 90000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const booted = (page) => until(page, () => !document.getElementById('boot') && window.__bb, null, 180000);
const shot = (page, n) => (out ? page.screenshot({ path: join(out, `${n}.jpg`), type: 'jpeg', quality: 80 }) : null);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('bb_profile_v1')));
const seed = (data) => `if (!localStorage.getItem('bb_profile_v1')) localStorage.setItem('bb_profile_v1', ${JSON.stringify(JSON.stringify(data))});`;
const phone = { viewport: { width: 800, height: 360 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true };

async function guard(name, fn) {
  if (!parts.includes(name)) return;
  console.log(`--- ${name}`);
  try {
    await fn();
  } catch (e) {
    check(`${name} ran to the end`, false, e.message.split('\n')[0]);
  }
}

// ------------------------------------------------------------ website: shop, no ads, offline
await guard('web', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 640 } });
  await ctx.addInitScript(seed({ coins: 200, mapV: 3, matches: 3, xp: 50, autoFire: true }));
  const page = await ctx.newPage();
  watch(page);
  await page.goto(WEB + '?debug&q=low');
  check('website boots', await booted(page));
  check('play with friends is open', !(await page.locator('.friends').isDisabled()));
  check('auto-attack is off, also for earlier players', await page.evaluate(() => window.__bb.profile.autoFire === false));
  await page.click('.wallet');
  check('the wallet opens the shop', await until(page, () => document.querySelector('.panel.shop'), null, 5000));
  check('no coin packs or videos on a plain website', (await page.locator('.shop .pack, .shop .ad').count()) === 0);
  await page.click('.shop-item[data-id="laser_gold"]');
  check('too dear: told how much is missing', /600 more/.test(await page.textContent('.panel.shop')));
  await page.click('.shop-item[data-id="laser_lime"]');
  let p = await saved(page);
  check('buying saves coins and look', p.coins === 50 && p.look.laser === 'laser_lime' && p.owned.includes('laser_lime'), `${p.coins} ${p.look.laser}`);
  await shot(page, 'shop-desktop');
  await page.click('.shop .fp-x');
  check('closing returns to the lobby with the new balance', (await page.textContent('.wallet b')) === '50' && !(await page.locator('.panel.shop').count()));
  await page.click('.play', { force: true });
  await until(page, () => window.__bb.world.phase === 'playing');
  check('solo play still has 6 fighters (bots)', (await page.evaluate(() => window.__bb.world.players.filter((q) => q.isBot).length)) === 5);
  check('your bought laser is used', await page.evaluate(() => window.__bb.looks[0].laser === 'laser_lime'));
  await page.evaluate(() => (window.__bb.world.roundTime = 999));
  await until(page, () => document.querySelector('.panel.results'));
  check('no "double coins" where there are no ads', (await page.locator('.results .double').count()) === 0);
  check('offline worker takes over', await until(page, () => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, 20000));
  await page.reload();
  await booted(page);
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload().catch(() => {});
  check('the game opens with no internet', await booted(page));
  await ctx.setOffline(false);
  const priv = await ctx.newPage();
  await priv.goto(WEB + 'privacy.html');
  check('privacy page is served', /Privacy Policy/.test(await priv.textContent('body')));
  await ctx.close();
});

// ------------------------------------------------------------ Android app: Google Play purchases (stand-in store)
await guard('play', async () => {
  const ctx = await browser.newContext(phone);
  await ctx.addInitScript(seed({ coins: 0, mapV: 3, matches: 3 }));
  await ctx.addInitScript(() => {
    const log = (window.__store = { consumed: [], bought: [] });
    const owed = () => JSON.parse(sessionStorage.getItem('owed') || '[]');
    window.getDigitalGoodsService = async () => ({
      getDetails: async (ids) => ids.map((itemId, i) => ({ itemId, price: { currency: 'INR', value: String(49 * (i + 1)) } })),
      listPurchases: async () => owed(),
      consume: async (t) => {
        log.consumed.push(t);
        sessionStorage.setItem('owed', JSON.stringify(owed().filter((o) => o.purchaseToken !== t)));
      },
    });
    window.PaymentRequest = class {
      constructor(methods) {
        this.sku = methods[0].data.sku;
      }
      async show() {
        log.bought.push(this.sku);
        return { details: { purchaseToken: `tok-${this.sku}-${log.bought.length}` }, complete: async () => {} };
      }
    };
  });
  let confirming = true;
  const confirmed = [];
  await ctx.route('**/api/purchase', (r) => {
    if (r.request().method() === 'GET') return r.fulfill({ json: { ready: true } });
    confirmed.push(JSON.parse(r.request().postData()).sku);
    return r.fulfill(confirming ? { json: { ok: true } } : { status: 502, json: { ok: false } });
  });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(WEB + '?source=play&debug&q=low');
  check('app version boots', await booted(page));
  await page.tap('.wallet');
  check('coin packs show with store prices', await until(page, () => document.querySelectorAll('.shop .pack').length === 3 && /₹/.test(document.querySelector('.shop .pack').textContent), null, 10000));
  check('the app shows no ads', (await page.locator('.shop .ad').count()) === 0);
  await shot(page, 'shop-phone');
  await page.tap('.shop .pack[data-id="coins_500"]');
  check('buying a pack adds coins and confirms it to the store', await until(page, () => document.querySelector('.shop .wallet b').textContent === '500' && window.__store.consumed.length === 1, null, 10000));
  const fits = await page.evaluate(() => [...document.querySelectorAll('.shop button')].every((b) => { const r = b.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1; }));
  check('phone shop fits on screen', fits);
  check('the purchase was confirmed on the server first', confirmed[0] === 'coins_500');
  confirming = false;
  await page.tap('.shop .pack[data-id="coins_4000"]');
  check('unconfirmed: no coins yet, and the player is told', (await until(page, () => /arrive as soon/.test(document.querySelector('.panel.shop').textContent), null, 10000)) && (await saved(page)).coins === 500);
  check('unconfirmed: left open in the store', (await page.evaluate(() => window.__store.consumed.length)) === 1);
  confirming = true;
  // paid, but the app closed before the coins arrived
  await page.evaluate(() => sessionStorage.setItem('owed', JSON.stringify([{ itemId: 'coins_1500', purchaseToken: 'lost-1' }])));
  await page.reload();
  await booted(page);
  check('an unfinished purchase is handed out at the next start', await until(page, () => document.querySelector('.wallet b')?.textContent === '2000', null, 10000));
  await page.evaluate(() => sessionStorage.setItem('owed', JSON.stringify([{ itemId: 'coins_1500', purchaseToken: 'lost-1' }])));
  await page.reload();
  await booted(page);
  await page.waitForTimeout(1500);
  check('the same purchase is never paid out twice', (await saved(page)).coins === 2000);
  await ctx.close();
});

// ------------------------------------------------------------ friends rooms: real players only
await guard('rooms', async () => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 520 } });
  const open = async (query) => {
    const page = await ctx.newPage();
    watch(page);
    await page.goto(WEB + query);
    await booted(page);
    return page;
  };
  const NET = process.env.REAL ? '' : 'localnet&';
  const host = await open(`?${NET}debug&q=low`);
  await host.click('.friends');
  await host.click('.friends-panel .big-btn:has-text("CREATE ROOM")');
  await until(host, () => document.querySelector('.fp-bigcode')?.textContent.length === 5);
  const code = await host.textContent('.fp-bigcode');
  check('alone in the room: START waits for a friend', await host.locator('.friends-panel .start').isDisabled());
  check('empty seats are not called bots', !/\bBot\b/.test(await host.textContent('.fp-seats')));
  check('WhatsApp invite offered', (await host.locator('.friends-panel .wa').count()) === 1);
  const guest = await open(`?${NET}debug&q=low&room=${code}`);
  check('the invite link joins the room', await until(host, () => !document.querySelector('.friends-panel .start')?.disabled, null, 20000));
  await shot(host, 'lobby');
  await host.click('.friends-panel .start');
  const two = () => window.__bb.mode === 'match' && window.__bb.world.players.length === 2 && window.__bb.world.players.every((p) => !p.isBot);
  check('host match: exactly the 2 players, no bots', await until(host, two));
  check('guest match: exactly the 2 players, no bots', await until(guest, two));
  await until(host, () => window.__bb.world.phase === 'playing');
  check('guest sees the match running', await until(guest, () => window.__bb.world.phase === 'playing' && window.__bb.world.roundTime > 1));
  await shot(guest, 'room-match');
  await host.evaluate(() => (window.__bb.world.roundTime = 999));
  check('both get the results', (await until(host, () => document.querySelector('.panel.results'))) && (await until(guest, () => document.querySelector('.panel.results'))));
  await host.click('.big-btn:has-text("REMATCH")');
  check('rematch brings both back', (await until(host, () => window.__bb.world.phase === 'playing' && !document.querySelector('.panel.results'))) && (await until(guest, () => window.__bb.world.phase === 'playing' && window.__bb.world.roundTime < 60 && !document.querySelector('.panel.results'))));
  await guest.waitForTimeout(1500);
  const link = await guest.evaluate(() => ({ badge: document.querySelector('.netbadge')?.textContent ?? '', ping: Math.round(window.__bb.guest.ping), seq: window.__bb.guest.seq }));
  const used = await host.evaluate(() => window.__bb.room.ack(window.__bb.seatPeers[1], window.__bb.world.time));
  check('the host is using the newest input from the friend', used[0] > 20 && link.seq - used[0] < 25, `sent ${link.seq}, used ${used[0]}`);
  check('the guest sees the delay to the host', /\d+ ms/.test(link.badge), `badge "${link.badge}", ${link.ping} ms`);
  // the host switches to another app: no frames are drawn, yet the match must go on
  await host.evaluate(() => {
    window.__raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (f) => (window.__held = f);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  });
  const t0 = await guest.evaluate(() => window.__bb.world.roundTime);
  await guest.waitForTimeout(3000);
  const t1 = await guest.evaluate(() => window.__bb.world.roundTime);
  check('a hidden host keeps the match running', t1 - t0 > 2, `${(t1 - t0).toFixed(1)} s in 3 s`);
  await host.evaluate(() => {
    delete document.hidden;
    window.requestAnimationFrame = window.__raf;
    requestAnimationFrame(window.__held);
  });
  await guest.evaluate(() => window.__bb.room.leave());
  await guest.close();
  check('a leaver is removed, not replaced by a bot', await until(host, () => window.__bb.world.players[1].gone && !window.__bb.world.players[1].isBot && window.__bb.brains.length === 0, null, 20000));
  check('alone: the match wraps up', await until(host, () => document.querySelector('.panel.results'), null, 40000));
  await host.click('.big-btn:has-text("REMATCH")');
  check('rematch alone returns to the lobby', await until(host, () => document.querySelector('.friends-panel .start')?.disabled, null, 20000));
  await ctx.close();
});

// ------------------------------------------------------------ CrazyGames build with a stand-in SDK
await guard('crazy', async () => {
  const SDK = `(() => {
    const calls = (window.__cg = []);
    const log = (n, a) => calls.push([n, a]);
    const q = new URLSearchParams(location.search);
    const mod = (name, methods) => Object.fromEntries(methods.map((m) => [m, (...a) => log(name + '.' + m, a)]));
    window.CrazyGames = { SDK: {
      environment: 'local',
      init: async () => log('init', []),
      game: Object.assign(mod('game', ['loadingStart','loadingStop','gameplayStart','gameplayStop','happytime','updateRoom','leftRoom','addJoinRoomListener','addSettingsChangeListener']), {
        settings: { muteAudio: q.has('muted') }, isInstantMultiplayer: q.has('instant'), inviteParams: null,
        getInviteParam: () => null, inviteLink: (p) => 'https://www.crazygames.com/game/bubble-brawl?room=' + p.room }),
      user: { getUser: async () => ({ username: 'CrazyTester' }) },
      data: { getItem: (k) => localStorage.getItem('cg:' + k), setItem: (k, v) => { log('data.setItem', [k]); localStorage.setItem('cg:' + k, v); } },
      ad: { requestAd: (type, cb) => { log('ad.' + type, []); setTimeout(() => { cb.adStarted(); window.__duringAd = { blocked: window.__bb.sfx.blocked, open: window.__bb.adOpen }; setTimeout(cb.adFinished, 500); }, 100); } },
    } };
  })();`;
  const run = async (query, opts = { viewport: { width: 960, height: 540 } }) => {
    const ctx = await browser.newContext(opts);
    await ctx.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK }));
    const page = await ctx.newPage();
    watch(page);
    await page.goto(CG + query);
    await booted(page);
    return { ctx, page };
  };
  const names = (page) => page.evaluate(() => window.__cg.map((c) => c[0]));
  {
    const { ctx, page } = await run('?debug&q=low&muted');
    let n = await names(page);
    check('SDK started and loading reported', n.indexOf('init') === 0 && n.includes('game.loadingStart') && n.includes('game.loadingStop'));
    check('no gameplay reported in the lobby', !n.includes('game.gameplayStart'));
    check('CrazyGames name used', (await page.textContent('.profile .who b')) === 'CrazyTester');
    check('platform mute silences the game', await page.evaluate(() => window.__bb.sfx.blocked));
    check('no offline worker on CrazyGames', (await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)) === 0);
    await page.click('.play', { force: true });
    await until(page, () => window.__bb.world.phase === 'playing');
    check('gameplayStart when the fight starts', await until(page, () => window.__cg.some((c) => c[0] === 'game.gameplayStart'), null, 5000));
    await page.evaluate(() => window.__bb.togglePause());
    check('gameplayStop on pause', await until(page, () => window.__cg.at(-1) && window.__cg.filter((c) => c[0] === 'game.gameplayStop').length >= 1, null, 5000));
    await page.evaluate(() => window.__bb.togglePause());
    await page.evaluate(() => Object.assign(window.__bb.world.players[0], { bankedTotal: 99 }));
    await page.evaluate(() => (window.__bb.world.roundTime = 999));
    await until(page, () => document.querySelector('.panel.results'));
    n = await names(page);
    check('progress saved through the data module', n.includes('data.setItem'));
    check('win reported', n.includes('game.happytime'));
    check('Basic Launch build: no ad button, no ad calls', (await page.locator('.results .double').count()) === 0 && !n.some((x) => x.startsWith('ad.')));
    await page.click('.big-btn:has-text("REMATCH")');
    check('rematch works with ads off', await until(page, () => window.__bb.world.roundTime < 20 && !document.querySelector('.panel.results'), null, 20000));
    await ctx.close();
  }
  {
    const { ctx, page } = await run('?debug&q=low&testads');
    await page.evaluate(() => (window.__bb.profile.matches = 3));
    await page.click('.play', { force: true });
    await until(page, () => window.__bb.world.phase === 'playing');
    await page.evaluate(() => (window.__bb.world.roundTime = 999));
    await until(page, () => document.querySelector('.results .double'));
    const before = await page.evaluate(() => window.__bb.profile.coins);
    await page.click('.results .double');
    check('rewarded video doubles the coins', await until(page, () => /DOUBLED/.test(document.querySelector('.results .double').textContent), null, 10000) && (await page.evaluate(() => window.__bb.profile.coins)) > before);
    const during = await page.evaluate(() => window.__duringAd);
    check('game silent and stopped during the ad', during?.blocked && during?.open, JSON.stringify(during));
    await shot(page, 'cg-double');
    await page.click('.big-btn:has-text("REMATCH")');
    check('a break ad between matches, then play', await until(page, () => window.__cg.some((c) => c[0] === 'ad.midgame') && window.__bb.world.roundTime < 20 && !document.querySelector('.ad-cover'), null, 20000));
    await ctx.close();
  }
  {
    const { ctx, page } = await run('?debug&q=low&instant&localnet');
    check('instant multiplayer opens a room at once', await until(page, () => document.querySelector('.fp-bigcode')?.textContent.length === 5, null, 20000));
    const info = await page.evaluate(() => ({ calls: window.__cg.filter((c) => c[0] === 'game.updateRoom').map((c) => c[1][0]), wa: document.querySelectorAll('.friends-panel .wa').length }));
    check('room reported to CrazyGames as joinable', info.calls.at(-1)?.isJoinable === true && info.calls.at(-1)?.roomId?.length === 5);
    check('no WhatsApp link on CrazyGames', info.wa === 0);
    await ctx.close();
  }
});

await browser.close();
servers.forEach((s) => s.close());
console.log(`\n${fails ? fails + ' FAILED' : 'release checks passed'}`);
console.log('browser errors:', [...new Set(errors)].slice(0, 8).join('\n') || 'none');
process.exit(fails ? 1 : 0);

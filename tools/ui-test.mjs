// Browser test of every menu and control in the real game (real clicks, keys and touches). Needs playwright-core + CHROME.
//   URL=http://localhost:4173/ node tools/ui-test.mjs [outDir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const base = process.env.URL || 'http://localhost:5173/';
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const errors = [];
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) fails++;
};
const shot = (page, n) => out && page.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 85 });
async function open(device, query = '?debug&q=low', profile = null) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()} ${m.location()?.url ?? ''}`));
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  page.on('requestfailed', (r) => errors.push(`failed ${r.url()} ${r.failure()?.errorText}`));
  if (profile) await page.addInitScript((p) => sessionStorage.getItem('seeded') || (localStorage.setItem('bb_profile_v1', JSON.stringify(p)), sessionStorage.setItem('seeded', '1')), profile);
  await page.goto(base + query);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const bb = (page, fn, arg) => page.evaluate(fn, arg);
const saved = (page) => bb(page, () => JSON.parse(localStorage.getItem('bb_profile_v1')));
const visible = (page, sel) => page.locator(sel).first().isVisible();
const until = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

// ------------------------------------------------------------ desktop: lobby
{
  const veteran = { matches: 20, coins: 5, xp: 99999, map: 'bubblegum', mapV: 3, name: '', camera: 'third', hero: 'ranger', firstSeen: '2026-11-01', lastSeen: '2026-11-01', sound: false, shake: true, quality: 'low' };
  const { ctx, page } = await open({ viewport: { width: 1366, height: 768 } }, '?debug&q=low', veteran);
  const start = await saved(page);
  check('home loads', await visible(page, '#home .play'));
  await page.click('.snd');
  check('sound button toggles and saves', (await saved(page)).sound !== start.sound);
  await page.click('.snd');
  check('sound button toggles back', (await saved(page)).sound === start.sound);
  await page.click('.set');
  check('settings opens', await visible(page, '.menu-panel'));
  const row = (label) => page.locator('.toggle', { hasText: label }).locator('button');
  for (const [label, key] of [['Sound', 'sound'], ['Screen shake', 'shake']]) {
    const before = (await saved(page))[key];
    await row(label).click();
    check(`settings: ${label} toggles`, (await saved(page))[key] !== before);
    await row(label).click();
  }
  const cams = new Set();
  for (let i = 0; i < 4; i++) {
    await row('Camera view').click();
    cams.add((await saved(page)).camera);
  }
  check('settings: camera cycles through 4 views', cams.size === 4, [...cams].join(','));
  const qs = new Set();
  for (let i = 0; i < 3; i++) {
    await row('Graphics').click();
    qs.add(await bb(page, () => window.__bb.stage.quality));
  }
  check('settings: graphics cycles low/medium/high', qs.size === 3, [...qs].join(','));
  await page.locator('.menu-panel .big-btn', { hasText: 'DONE' }).click();
  check('settings closes, lobby returns', (await visible(page, '#home .play')) && !(await page.locator('.menu-panel').count()));

  const names = [];
  for (const h of ['bones', 'pinch', 'grizzle', 'ranger']) {
    await page.click(`.pick[data-hero="${h}"]`);
    names.push(await page.textContent('.hero-name h2'));
  }
  check('hero portraits select each hero', new Set(names).size === 4, names.join(','));
  await page.click('.arrow.r');
  check('hero arrow right', (await page.textContent('.hero-name h2')) === names[0]);
  await page.click('.arrow.l');
  check('hero arrow left', (await page.textContent('.hero-name h2')) === names[3]);
  await page.mouse.click(5, 300);
  await page.keyboard.press('ArrowRight');
  check('keyboard changes hero', (await page.textContent('.hero-name h2')) === names[0]);

  const maps = [];
  for (let i = 0; i < 3; i++) {
    await page.click('.mp.r');
    const name = await page.textContent('.mapcard b');
    const ok = await until(page, (n) => !document.querySelector('.mapcard.busy') && window.__bb.world.map.name === n, name);
    maps.push(name);
    check(`map picker loads ${name}`, ok);
    await shot(page, `home-${i}`);
  }
  await page.click('.mp.l');
  check('map picker goes back', (await page.textContent('.mapcard b')) === maps[1]);
  await until(page, (n) => window.__bb.world.map.name === n, maps[1]);

  check('friends button says SOON and is off', (await page.locator('.friends').isDisabled()) && /SOON/.test(await page.textContent('.friends')));
  await page.click('.set');
  await row('Aim speed').click();
  check('settings: aim speed cycles', (await saved(page)).aimSpeed === 'high');
  await row('Credits').click();
  check('credits open and name the authors', /Kay Lousberg/.test(await page.textContent('.credits')));
  await page.locator('.big-btn', { hasText: 'BACK' }).click();
  await page.locator('.menu-panel .big-btn', { hasText: 'DONE' }).click();

  // ---------------------------------------------------------- match: keyboard + mouse
  await page.click('.play', { force: true });
  check('PLAY starts a match on the chosen map', await until(page, (n) => window.__bb.mode === 'match' && window.__bb.world.map.name === n && !document.getElementById('home'), maps[1]));
  await until(page, () => window.__bb.world.phase === 'playing');
  check('weapon rack shows six slots', (await page.locator('.rack .slot').count()) === 6);
  const pos = () => bb(page, () => ({ x: window.__bb.world.players[0].x, z: window.__bb.world.players[0].z }));
  const moved = async (key) => {
    const a = await pos();
    await page.keyboard.down(key);
    await page.waitForTimeout(700);
    await page.keyboard.up(key);
    const b = await pos();
    return Math.hypot(b.x - a.x, b.z - a.z);
  };
  for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
    const d = await moved(k);
    check(`${k} moves the hero`, d > 0.4, d.toFixed(1) + ' m');
  }
  await page.keyboard.press('Space');
  check('Space dashes (cooldown starts)', await until(page, () => window.__bb.world.players[0].dashCd > 0, null, 3000));
  await page.keyboard.press('KeyK');
  check('K uses the skill (cooldown starts)', await until(page, () => window.__bb.world.players[0].skillCd > 0, null, 3000));
  check('skill cooldown is shown', await until(page, () => document.querySelector('.btn.skill .num').textContent !== '', null, 3000));
  for (const w of ['blaster', 'rocket', 'banana', 'freeze', 'hook', 'hammer']) {
    await bb(page, (w) => {
      const me = window.__bb.world.players[0];
      Object.assign(me, { weapon: w, ammo: 3, fireCd: 0, state: 'normal', stateT: 0, hp: 100, invuln: 30 }); // untouchable: bots must not interrupt
    }, w);
    await page.waitForTimeout(500);
    const held = await until(page, (w) => document.querySelector('.slot.held img')?.alt && document.querySelectorAll('.slot.held').length === 1, w, 3000);
    // a press that lands during another action's wind-up is ignored by design: allow a second one
    let fired = false;
    for (let tries = 0; tries < 3 && !fired; tries++) {
      await page.keyboard.press('KeyJ');
      fired = await until(page, (w) => {
        const me = window.__bb.world.players[0];
        return me.ammo < 3 || me.weapon !== w;
      }, w, 1500);
    }
    check(`${w}: rack selects it and J fires it`, held && fired);
  }
  await bb(page, () => Object.assign(window.__bb.world.players[0], { weapon: 'blaster', ammo: 20, fireCd: 0, state: 'normal', stateT: 0, invuln: 30 }));
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyJ');
  const left = await bb(page, () => window.__bb.world.players[0].ammo);
  check('holding fire keeps the laser shooting', left <= 15, `${20 - left} shots`);
  await page.waitForTimeout(700);
  check('releasing fire stops it', (await bb(page, () => window.__bb.world.players[0].ammo)) === left);
  check('an armed hero faces the crosshair', await until(page, () => {
    const me = window.__bb.world.players[0];
    const a = window.__bb.aimInfo;
    return a && Math.abs(Math.atan2(Math.sin(me.facing - a.heading), Math.cos(me.facing - a.heading))) < 0.15;
  }, null, 3000));

  await bb(page, () => {
    const w = window.__bb.world;
    const me = w.players[0];
    Object.assign(me, { state: 'normal', stateT: 0, invuln: 0, hp: 1, shieldT: 0 });
    w.brawl.damage(me, w.players[1], 'rocket', 999, 1, 0, 0);
  });
  check('knocked out shows the respawn card', await until(page, () => document.querySelector('.respawn.on'), null, 3000));
  await shot(page, 'respawn');

  await page.click('.pause-btn');
  check('pause button pauses', await visible(page, '.menu-panel'));
  const t0 = await bb(page, () => window.__bb.world.roundTime);
  await page.waitForTimeout(800);
  check('the clock stops while paused', (await bb(page, () => window.__bb.world.roundTime)) === t0);
  await page.keyboard.press('Escape');
  check('Escape resumes', !(await page.locator('.menu-panel').count()));
  await page.keyboard.press('KeyP');
  await page.locator('.big-btn', { hasText: 'RESUME' }).click();
  check('P pauses, RESUME resumes', !(await page.locator('.menu-panel').count()));

  await bb(page, () => (window.__bb.world.roundTime = 999));
  check('round end panel', await until(page, () => document.querySelector('.panel .standings'), null, 6000));
  check('next round starts by itself', await until(page, () => window.__bb.world.round === 2, null, 30000));
  await bb(page, () => {
    const w = window.__bb.world;
    w.round = 3;
    w.phase = 'playing';
    w.roundTime = 999;
  });
  check('final results panel', await until(page, () => document.querySelector('.panel.results'), null, 30000));
  await page.locator('.big-btn', { hasText: 'REMATCH' }).click();
  check('REMATCH starts a new match', await until(page, () => window.__bb.world.round === 1 && !document.querySelector('.panel.results'), null, 15000));
  await page.keyboard.press('Escape');
  await page.locator('.big-btn', { hasText: 'QUIT' }).click();
  check('QUIT returns to the lobby', await until(page, () => window.__bb.mode === 'home' && document.getElementById('home'), null, 10000));

  // ---------------------------------------------------------- repeated map switching and sessions
  const sample = () => bb(page, () => {
    window.gc?.();
    const r = window.__bb.stage.renderer.info.memory;
    return { heap: +(performance.memory.usedJSHeapSize / 1048576).toFixed(0), geo: r.geometries, tex: r.textures, nodes: document.getElementsByTagName('*').length };
  });
  // the bots keep fighting behind the menu, so live effects come and go: take the quietest of several samples
  const mem = async () => {
    const all = [];
    for (let i = 0; i < 8; i++) {
      all.push(await sample());
      await page.waitForTimeout(700);
    }
    return Object.fromEntries(Object.keys(all[0]).map((k) => [k, Math.min(...all.map((x) => x[k]))]));
  };
  const cycle = async () => {
    for (let i = 0; i < 3; i++) {
      await page.click('.mp.r');
      const name = await page.textContent('.mapcard b');
      await until(page, (n) => window.__bb.world.map.name === n, name);
      await page.waitForTimeout(500);
    }
  };
  await cycle();
  const m1 = await mem();
  for (let i = 0; i < 5; i++) await cycle();
  const m2 = await mem();
  console.log('memory after 3 map loads', JSON.stringify(m1), 'after 18', JSON.stringify(m2));
  check('15 more map switches do not grow GPU geometry', m2.geo <= m1.geo * 1.15, `${m1.geo} → ${m2.geo}`);
  check('15 more map switches do not grow textures', m2.tex <= m1.tex * 1.15, `${m1.tex} → ${m2.tex}`);
  check('15 more map switches do not grow the heap much', m2.heap <= m1.heap + 40, `${m1.heap} → ${m2.heap} MB`);
  check('no DOM build-up', m2.nodes <= m1.nodes + 20, `${m1.nodes} → ${m2.nodes}`);
  const session = async () => {
    await page.click('.play', { force: true });
    await until(page, () => window.__bb.mode === 'match');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    await page.locator('.big-btn', { hasText: 'QUIT' }).click();
    await until(page, () => window.__bb.mode === 'home' && document.getElementById('home'));
    await page.waitForTimeout(300);
  };
  await session();
  const s1 = await mem();
  for (let i = 0; i < 6; i++) await session();
  const mid = await mem();
  for (let i = 0; i < 6; i++) await session();
  const s2 = await mem();
  console.log('memory after 1 session', JSON.stringify(s1), 'after 7', JSON.stringify(mid), 'after 13', JSON.stringify(s2));
  check('repeated matches do not leak', s2.geo <= s1.geo * 1.15 && s2.heap <= s1.heap + 40 && s2.nodes <= s1.nodes + 20);
  check('Enter starts a match', await (async () => {
    await page.mouse.click(5, 300);
    await page.keyboard.press('Enter');
    return until(page, () => window.__bb.mode === 'match', null, 8000);
  })());
  await ctx.close();
}

// ------------------------------------------------------------ new player: defaults, locks, level-up
{
  const { ctx, page } = await open({ viewport: { width: 1366, height: 768 } });
  check('default hero is the Ranger', (await page.textContent('.hero-name h2')) === 'Ranger');
  check('default map is Bubblegum Islands', (await page.textContent('.mapcard b')) === 'Bubblegum Islands' && (await bb(page, () => window.__bb.world.map.id)) === 'bubblegum');
  check('new players see how to play', /How to play/.test(await page.textContent('.howto')));
  check('three heroes start locked', (await page.locator('.pick.locked').count()) === 3);
  await page.click('.pick[data-hero="grizzle"]');
  check('a locked hero cannot be played', (await page.locator('.play').isDisabled()) && /level 8/i.test(await page.textContent('.play')));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check('Enter does not start a locked hero', (await bb(page, () => window.__bb.mode)) === 'home');
  await page.click('.pick[data-hero="ranger"]');
  await page.click('.mp.r');
  check('a locked map cannot be played', await page.locator('.play').isDisabled());
  check('a locked map is not saved', (await saved(page)).map === 'bubblegum');
  await page.click('.mp.l');
  await page.click('.play', { force: true });
  await until(page, () => window.__bb.mode === 'match' && window.__bb.world.phase === 'playing');
  check('new players get only unlocked weapons', await bb(page, () => !window.__bb.world.pool.includes('freeze') && !window.__bb.world.pool.includes('hammer')));
  check('new players meet gentle bots', await bb(page, () => window.__bb.world.skill < 0.3));
  await bb(page, () => {
    const w = window.__bb.world;
    const me = w.players[0];
    me.kos = 6;
    me.bankedTotal = 12;
    me.roundsWon = 3;
    window.__bb.tally.boxes = 7;
    w.round = 3;
    w.roundTime = 999;
  });
  check('results show', await until(page, () => document.querySelector('.panel.results'), null, 30000));
  const after = await saved(page);
  check('XP is earned and saved', after.xp > 100, `${after.xp} XP`);
  check('finished missions pay out', (await page.locator('.mdone').count()) >= 2);
  check('level-up shows what unlocked', /UNLOCKED: CANDY TOWN/.test(await page.textContent('.panel.results')));
  await shot(page, 'levelup');
  await page.locator('.big-btn', { hasText: 'HOME' }).click();
  await until(page, () => document.getElementById('home'));
  check('lobby now shows missions', /Missions/.test(await page.textContent('.howto')));
  await page.click('.mp.r');
  check('the unlocked map can be played', !(await page.locator('.play').isDisabled()));
  await page.reload();
  await until(page, () => !document.getElementById('boot'), null, 60000);
  check('progress survives a reload', (await saved(page)).xp === after.xp);
  await ctx.close();
}

// ------------------------------------------------------------ saved map survives a reload (the earlier crash)
for (const map of ['bubblegum', 'candy', 'desert']) {
  const p = { matches: 3, coins: 5, xp: 99999, map, mapV: 3, name: '', camera: 'third', hero: 'bones', firstSeen: '2026-11-01', lastSeen: '2026-11-01', sound: false, shake: true, quality: 'low' };
  const { ctx, page } = await open({ viewport: { width: 1280, height: 720 } }, '?debug', p);
  check(`saved map ${map} loads`, (await bb(page, () => window.__bb.world.map.id)) === map);
  await ctx.close();
}

// ------------------------------------------------------------ phone: touch
{
  const { ctx, page } = await open({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const small = await bb(page, () => [...document.querySelectorAll('#home button')].filter((b) => b.offsetParent && (b.getBoundingClientRect().width < 32 || b.getBoundingClientRect().height < 32)).map((b) => b.className));
  check('phone lobby: every button is at least 32 px', !small.length, small.join(','));
  const off = await bb(page, () => [...document.querySelectorAll('#home button')].filter((b) => b.offsetParent).filter((b) => {
    const r = b.getBoundingClientRect();
    return r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
  }).map((b) => b.className));
  check('phone lobby: no button off screen', !off.length, off.join(','));
  await page.tap('.pick[data-hero="bones"]');
  check('tap picks a hero', (await page.textContent('.hero-name h2')) === 'Bones');
  await page.tap('.pick[data-hero="ranger"]');
  await page.tap('.set');
  check('tap opens settings', await visible(page, '.menu-panel'));
  await page.locator('.menu-panel .big-btn', { hasText: 'DONE' }).tap();
  await page.tap('.play', { force: true });
  check('tap PLAY starts a match', await until(page, () => window.__bb.mode === 'match'));
  await until(page, () => window.__bb.world.phase === 'playing');
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const before = await bb(page, () => ({ x: window.__bb.world.players[0].x, z: window.__bb.world.players[0].z }));
  await touch('touchStart', [{ x: 150, y: 270, id: 1 }]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: 150, y: 270 - i * 10, id: 1 }]);
  await page.waitForTimeout(900);
  check('joystick appears under the thumb', await visible(page, '.stick'));
  // second finger presses DASH while the first keeps steering
  const c = async (sel) => {
    const b = await page.locator(sel).boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width };
  };
  const dash = await c('.btn.dash');
  await touch('touchStart', [{ x: 150, y: 210, id: 1 }, { x: dash.x, y: dash.y, id: 2 }]);
  check('dash while steering (multi-touch)', await until(page, () => window.__bb.world.players[0].dashCd > 0, null, 3000));
  await touch('touchEnd', []);
  const after = await bb(page, () => ({ x: window.__bb.world.players[0].x, z: window.__bb.world.players[0].z }));
  check('joystick moves the hero', Math.hypot(after.x - before.x, after.z - before.z) > 0.8);
  await page.tap('.btn.skill');
  check('tap skill', await until(page, () => window.__bb.world.players[0].skillCd > 0, null, 3000));
  await bb(page, () => Object.assign(window.__bb.world.players[0], { weapon: 'blaster', ammo: 5, fireCd: 0, state: 'normal', stateT: 0 }));
  await page.waitForTimeout(800); // let the skill's wind-up finish
  await page.tap('.btn.grab');
  check('tap fires the weapon', await until(page, () => window.__bb.world.players[0].ammo < 5, null, 3000));
  await bb(page, () => {
    const g = window.__bb;
    g.brains.forEach((br) => (br.update = () => ({ mx: 0, mz: 0, dash: false, grab: false, skill: false })));
    const [me, o] = g.world.players;
    Object.assign(me, { x: 12, z: 2, weapon: 'blaster', ammo: 20, fireCd: 0, state: 'normal', invuln: 30 });
    Object.assign(o, { x: 12, z: -4, state: 'normal', invuln: 0, hp: 100 });
    g.updateAim = () => ((g.aimLocked = true), (g.aimInfo = { heading: Math.PI, dist: 6 }));
  });
  check('touch auto-fire shoots a rival under the crosshair', await until(page, () => window.__bb.world.players[0].ammo < 17, null, 5000));
  const sizes = [await c('.btn.dash'), await c('.btn.skill'), await c('.btn.grab')].map((s) => Math.round(s.w));
  check('phone action buttons are finger sized', sizes.every((s) => s >= 44), sizes.join('/') + ' px');
  const overlap = await bb(page, () => {
    const boxes = ['.btn.dash', '.btn.skill', '.btn.grab', '.rack', '.mine', '.board', '.pause-btn', '.top-center'].map((s) => [s, document.querySelector(s)?.getBoundingClientRect()]).filter((b) => b[1] && b[1].width);
    const hit = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, r] = boxes[i];
        const [b, q] = boxes[j];
        if (a.startsWith('.btn') && b.startsWith('.btn')) continue;
        if (r.left < q.right - 2 && r.right > q.left + 2 && r.top < q.bottom - 2 && r.bottom > q.top + 2) hit.push(`${a}×${b}`);
      }
    return hit;
  });
  check('phone HUD pieces do not overlap', !overlap.length, overlap.join(' '));
  await shot(page, 'm-hud');
  await page.tap('.pause-btn');
  check('tap pause', await visible(page, '.menu-panel'));
  await shot(page, 'm-pause');
  await page.locator('.big-btn', { hasText: 'QUIT' }).tap();
  check('tap quit', await until(page, () => window.__bb.mode === 'home' && document.getElementById('home'), null, 8000));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  check('portrait phone asks to rotate', await visible(page, '.rotate'));
  await ctx.close();
}

// ------------------------------------------------------------ loading failure is shown, not a blank screen
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/env.glb', (r) => r.abort());
  await page.goto(base);
  check('a failed download shows an error message', await until(page, () => document.getElementById('boot')?.textContent.includes('Could not start'), null, 30000));
  await ctx.close();
}

console.log(`\n${fails ? fails + ' FAILED' : 'all UI checks passed'}`);
console.log('browser errors:', [...new Set(errors)].slice(0, 20).join('\n') || 'none');
await browser.close();
process.exit(fails ? 1 : 0);

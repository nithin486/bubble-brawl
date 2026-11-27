// Poster-style CrazyGames cover from the real heroes (dev server on :5174). See store/crazygames/v2 for the result.
// node tools/cover-poster.cjs out.png W H '<json: actors, cam, look, fov, lasers, bubble2d, coins2d, stars2d, title, css>'
// Poster-style store cover: real game heroes + effects over a designed background, big title.
// node poster.cjs out.png W H '<json>'
const { chromium } = require('playwright');
const [out, W, H, J] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5] || '{}'];
const P = JSON.parse(J);
(async () => {
  const b = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
  const dpr = P.dpr || 2;
  const p = await (await b.newContext({ viewport: { width: Math.round(W / dpr), height: Math.round(H / dpr) }, deviceScaleFactor: dpr })).newPage();
  p.on('console', (m) => /^\[poster\]/.test(m.text()) && console.log(m.text()));
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.addInitScript(() => localStorage.setItem('bb_profile_v1', JSON.stringify({ xp: 100000, mapV: 3, matches: 9, hero: 'ranger', sound: false })));
  await p.goto('http://127.0.0.1:5174/?play&debug&q=high&map=' + (P.map || 'bubblegum'));
  await p.waitForFunction(() => window.__bb?.world?.phase === 'playing', null, { timeout: 180000 });
  await p.waitForTimeout(1200);
  await p.addStyleTag({ content: `#hud, .rotate { display:none !important; }` });
  await p.evaluate((P) => {
    const g = window.__bb, w = g.world, scene = g.stage.scene, cam = g.stage.camera;
    const V = cam.position.constructor;
    g.simulate = () => {}; g.rig.update = () => {}; g.keepCameraOutOfWalls = () => {}; g.rig.autoFollow = () => {};
    if (g.markers) g.markers.update = () => {};
    // actors
    const used = new Set();
    for (const a of P.actors) { a.id = w.players.findIndex((q, k) => q.hero === a.hero && !used.has(k)); used.add(a.id); if (a.id < 0) console.log('[poster] missing hero', a.hero); }
    w.players.forEach((pl, i) => { if (!used.has(i)) { pl.x = 900; pl.z = 900; pl.gone = true; g.heroes[i].root.visible = false; } });
    for (const a of P.actors) {
      const pl = w.players[a.id], h = g.heroes[a.id];
      Object.assign(pl, { x: a.x, z: a.z, y: a.y ?? 0, facing: a.face, vx: 0, vz: 0, state: a.state || 'normal', weapon: a.weapon ?? null, ammo: 9, gone: false, superT: a.super ? 5 : 0, rageT: 0, speedT: 0 });
      const orig = h.update.bind(h), act = h.actions.get(a.anim);
      h.update = (dt, t, f) => { orig(dt, t, f); if (act) { h.mixer.stopAllAction(); act.reset(); act.setEffectiveWeight(1); act.play(); act.time = a.t ?? 0.3; h.mixer.update(0); }
        h.root.position.set(pl.x, pl.y, pl.z); h.root.rotation.y = a.face; h.root.scale.setScalar(a.scale ?? 1); h.root.visible = true; h.fadeTarget = 1; return false; };
    }
    // only heroes, held weapons, bubbles, effects and lights stay
    const keep = new Set([...P.actors.map((a) => g.heroes[a.id].root), g.weapons?.group].filter(Boolean));
    for (const o of [...scene.children]) if (!keep.has(o) && !o.isLight && !o.isPoints && !(o.isInstancedMesh && o.count === 0)) o.visible = false;
    // the weapons group also holds boxes/shots of the paused match: hide all but KO bubbles and lasers
    scene.fog = null;
    const hideStray = () => {
      if (g.weapons) for (const v of g.weapons.boxes.values()) v.root.visible = false;
      g.weapons?.group.traverse((o) => { if (o.isSprite && !near(o)) o.visible = false; });
      for (const a of P.actors) g.heroes[a.id].root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.geometry && /Ring|Circle/.test(o.geometry.type)) o.visible = false; });
      scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.visible && o.position.y < 0.2 && o.parent !== scene) { const v = new V(); o.getWorldPosition(v); if (v.y < 0.25 && P.actors.some((a) => !a.state && Math.hypot(v.x - a.x, v.z - a.z) < 3.2) && /Ring|Circle|Shape|Buffer|Cone|Plane|Extrude/.test(o.geometry?.type) && o.material?.color && o.material.color.r > 0.8 && o.material.color.g > 0.6 && o.material.color.b < 0.4) o.visible = false; } });
    };
    const near = (o) => { const v = new V(); o.getWorldPosition(v); return P.actors.some((a) => Math.hypot(v.x - a.x, v.z - a.z) < 2.2); };
    const R0 = g.stage.render.bind(g.stage); g.stage.render = () => { hideStray(); R0(); };
    // hide mystery boxes, shots and the "you" ring: only the fight stays
    if (g.weapons) { for (const v of g.weapons.boxes.values()) v.root.visible = false; g.weapons.constructor.LIFE = 30; }
    for (const a of P.actors) g.heroes[a.id].root.traverse((o) => { const t = o.geometry?.type || ''; if (/Ring|Circle|Shape/.test(t) || /ring|marker|arrow/i.test(o.name)) o.visible = false; });
    // stray sprites (box badges, pops) far from the actors
    g.weapons?.group.traverse((o) => { if (o.isSprite && !near(o)) o.visible = false; });
    scene.traverse((o) => { if (o.isSprite && !near(o) && o.parent === scene) o.visible = false; });
    console.log('[poster] fx points', scene.children.filter((o) => o.isPoints).length);
    // designed background
    const c = document.createElement('canvas'); c.width = 2048; c.height = Math.round(2048 * (innerHeight / innerWidth)); const x = c.getContext('2d');
    const cx = c.width * (P.bgx ?? 0.62), cy = c.height * (P.bgy ?? 0.5), R = Math.hypot(c.width, c.height);
    const gr = x.createRadialGradient(cx, cy, 10, cx, cy, R * 0.75);
    (P.bg || ['#fff3b0', '#ff8fd8', '#a45cff', '#3b1d8f']).forEach((col, i, arr) => gr.addColorStop(i / (arr.length - 1), col));
    x.fillStyle = gr; x.fillRect(0, 0, c.width, c.height);
    // sun rays
    x.save(); x.translate(cx, cy); x.globalAlpha = 0.16; x.fillStyle = '#ffffff';
    for (let i = 0; i < 24; i++) { x.rotate(Math.PI * 2 / 24); x.beginPath(); x.moveTo(0, 0); x.lineTo(R, -R * 0.07); x.lineTo(R, R * 0.07); x.fill(); }
    x.restore();
    // floating soap bubbles
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) { const r = 12 + rnd() * 60, bx = rnd() * c.width, by = rnd() * c.height; const bg = x.createRadialGradient(bx - r * 0.3, by - r * 0.3, r * 0.1, bx, by, r);
      bg.addColorStop(0, 'rgba(255,255,255,0.55)'); bg.addColorStop(0.6, 'rgba(255,255,255,0.08)'); bg.addColorStop(0.92, 'rgba(180,240,255,0.5)'); bg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = bg; x.beginPath(); x.arc(bx, by, r, 0, 7); x.fill(); }
    // vignette
    const vg = x.createRadialGradient(c.width / 2, c.height / 2, R * 0.3, c.width / 2, c.height / 2, R * 0.62); vg.addColorStop(0, 'rgba(20,0,60,0)'); vg.addColorStop(1, 'rgba(20,0,60,0.45)');
    x.fillStyle = vg; x.fillRect(0, 0, c.width, c.height);
    const T = g.glowTex.constructor; // CanvasTexture class
    const tex = new T(c); tex.colorSpace = 'srgb'; scene.background = tex;
    cam.fov = P.fov || 30; cam.updateProjectionMatrix();
    cam.position.set(...P.cam); cam.lookAt(new V(...P.look));
    window.__fire = () => {
      for (const l of P.lasers || []) { let from = new V(l[0], l[1], l[2]); const m = g.heroes[P.actors[0].id].muzzle?.(new V()); if (m && l.length > 6) from = m; g.weapons.laser(from, new V(l[3], l[4], l[5]), true); }
      for (const q of P.coins || []) g.fx.emit(q[0], q[1], q[2], { n: q[3] || 30, color: ['#ffe27a', '#ffb400', '#fff6c9'], speed: q[4] || 5, up: 4, gravity: 0, life: 9, size: q[5] || 0.5, drag: 0.5, spread: 0.6 });
      for (const q of P.sparks || []) g.fx.emit(q[0], q[1], q[2], { n: q[4] || 30, color: [q[3] || '#ffffff', '#ffffff'], speed: 3, up: 2, gravity: 0, life: 9, size: 0.35, drag: 0.5, spread: 0.6 });
    };
  }, P);
  await p.waitForTimeout(900);
  await p.evaluate(() => window.__fire());
  await p.waitForTimeout(P.wait ?? 70);
  await p.evaluate((P) => {
    const c = document.createElement('canvas'); c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
    c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:98;pointer-events:none'; document.body.append(c);
    const x = c.getContext('2d'); const W = c.width, H = c.height, U = Math.min(W, H) / 100;
    for (const bb of P.bubble2d || []) { // [xPct, yPct, rPct of height]
      const cx = bb[0] * W / 100, cy = bb[1] * H / 100, r = bb[2] * H / 100;
      const film = x.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
      film.addColorStop(0, 'rgba(255,255,255,0)'); film.addColorStop(0.8, 'rgba(200,240,255,0.10)'); film.addColorStop(1, 'rgba(255,255,255,0.35)');
      x.fillStyle = film; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
      const rim = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      ['#7ff3ff', '#b38cff', '#ff8fd8', '#ffe27a', '#9dff7a', '#7ff3ff'].forEach((c2, i, a) => rim.addColorStop(i / (a.length - 1), c2));
      x.strokeStyle = rim; x.lineWidth = r * 0.035; x.globalAlpha = 0.9; x.beginPath(); x.arc(cx, cy, r * 0.985, 0, 7); x.stroke();
      x.globalAlpha = 0.85; x.strokeStyle = '#ffffff'; x.lineCap = 'round'; x.lineWidth = r * 0.05;
      x.beginPath(); x.arc(cx, cy, r * 0.84, Math.PI * 1.08, Math.PI * 1.38); x.stroke();
      x.lineWidth = r * 0.035; x.beginPath(); x.arc(cx, cy, r * 0.84, Math.PI * 1.45, Math.PI * 1.52); x.stroke();
      x.globalAlpha = 1; }
    for (const k of P.coins2d || []) { // [xPct, yPct, rU, tiltDeg]
      const cx = k[0] * W / 100, cy = k[1] * H / 100, r = k[2] * U, tl = (k[3] || 0) * Math.PI / 180;
      x.save(); x.translate(cx, cy); x.rotate(tl); x.scale(1, k[4] ?? 0.85);
      x.shadowColor = 'rgba(120,40,0,0.45)'; x.shadowBlur = r * 0.5; x.shadowOffsetY = r * 0.15;
      x.fillStyle = '#d98a00'; x.beginPath(); x.arc(0, r * 0.12, r, 0, 7); x.fill(); x.shadowColor = 'transparent';
      const gg = x.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r); gg.addColorStop(0, '#fff6b8'); gg.addColorStop(0.45, '#ffd23f'); gg.addColorStop(1, '#f0a400');
      x.fillStyle = gg; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill();
      x.strokeStyle = '#fff0a0'; x.lineWidth = r * 0.12; x.beginPath(); x.arc(0, 0, r * 0.68, 0, 7); x.stroke();
      x.fillStyle = '#e39a00'; x.font = `900 ${r * 1.05}px "Lilita One", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('★', 0, r * 0.06);
      x.restore(); }
    for (const sp of P.stars2d || []) { // sparkle
      const cx = sp[0] * W / 100, cy = sp[1] * H / 100, r = sp[2] * U; x.save(); x.translate(cx, cy); x.fillStyle = sp[3] || '#fff';
      x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.22 : r; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.shadowColor = sp[3] || '#fff'; x.shadowBlur = r; x.fill(); x.restore(); }
  }, P);
  if (P.title) await p.evaluate((P) => {
    const d = document.createElement('div'); d.id = 'cover-ui';
    d.innerHTML = P.title;
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99;font-family:"Lilita One",Nunito,sans-serif;';
    document.body.append(d);
    const st = document.createElement('style'); st.textContent = P.css || ''; document.head.append(st);
  }, P);
  await p.waitForTimeout(300);
  await p.screenshot({ path: out });
  await b.close();
})();

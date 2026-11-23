import * as THREE from 'three';
import './hud.css';
import type { World } from '../../../shared/sim/world.ts';
import type { Player } from '../../../shared/sim/types.ts';
import { TUNING } from '../../../shared/config/tuning.ts';
import { HEROES, type HeroId } from '../../../shared/config/heroes.ts';
import type { InputManager } from '../input.ts';
import { powerIconCanvas, POWER_INFO } from '../render/powerups.ts';
import type { PowerKind } from '../../../shared/sim/types.ts';

export const ICONS = {
  grab: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V10h.5V3.5a1.5 1.5 0 0 1 3 0V10h.5V4.5a1.5 1.5 0 0 1 3 0V11h.5V7.5a1.5 1.5 0 0 1 3 0V14c0 4.4-3.1 8-7.5 8-3 0-4.8-1.3-6.3-3.6L3.8 14.6a1.5 1.5 0 0 1 2.4-1.8L7 13.8z"/></svg>`,
  dash: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M13 4l8 8-8 8v-5H3V9h10z"/><rect x="1" y="7" width="3" height="2" rx="1" opacity=".6"/><rect x="0" y="15" width="4" height="2" rx="1" opacity=".6"/></svg>`,
  rattleBurst: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="3" fill="#fff"/><circle cx="12" cy="12" r="7.5" stroke-dasharray="3 3"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2"/></svg>`,
  stickyFingers: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2c2 3 6 6 6 11a6 6 0 0 1-12 0c0-5 4-8 6-11z"/><circle cx="10" cy="14" r="1.6" fill="#ff5fd2"/></svg>`,
  groundSlam: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M9 2h6l-1 9h4l-6 7-6-7h4z"/><path d="M2 20h20v2H2z" opacity=".7"/></svg>`,
};

export const PLAYER_COLORS = ['#ffd84a', '#ff5fd2', '#3fe0ff', '#7dff6a', '#ff9a3d', '#b38cff'];

const el = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface Tag {
  root: HTMLElement;
  count: HTMLElement;
  ring: SVGCircleElement | null;
  ringWrap: HTMLElement | null;
  name: HTMLElement;
  say: HTMLElement;
  sayUntil: number;
}

/** Info the game passes each frame that the sim doesn't know (bot intent, nemesis, targeting). */
export interface HudExtra {
  threats: Set<number>; // bots hunting you
  nemesis: number; // bot id or -1
  grabTarget: number;
  skillHits: number;
}

export const MOD_INFO: Record<string, { name: string; text: string; icon: string; color: string }> = {
  none: { name: 'CLASSIC', text: 'Grab coins, steal, bank them!', icon: '🪙', color: '#ffd84a' },
  giant: { name: 'GIANT COINS', text: 'Fewer coins, but each is worth 3', icon: '💰', color: '#ffd84a' },
  thieves: { name: 'THIEF PARTY', text: 'Grabs steal DOUBLE and recharge fast', icon: '🖐️', color: '#ff5fd2' },
  bombs: { name: 'BOMB RAIN', text: 'Bubble bombs fall from the sky — watch the red circles', icon: '💣', color: '#ff8a3d' },
  turbo: { name: 'TURBO', text: 'Everyone runs 35% faster', icon: '⚡', color: '#ffd23f' },
  magnet: { name: 'MAGNET STORM', text: 'Everyone pulls nearby coins', icon: '🧲', color: '#ff5f7a' },
  goldrush: { name: 'GOLD RUSH', text: 'The jackpot erupts every 9 seconds', icon: '⛲', color: '#7ff3ff' },
  double: { name: 'FINAL ROUND · DOUBLE POINTS', text: 'Every bank counts ×2 — anyone can still win!', icon: '✨', color: '#ff5fd2' },
};

export class Hud {
  root = el('div');
  private timer = el('div', 'timer stroke');
  private roundEl = el('div', 'round stroke');
  private finaleTag = el('div', 'finale-tag', 'FINAL 15s · ISLAND CRUMBLING');
  private board = el('div', 'board');
  private rows: HTMLElement[] = [];
  private carryPill = el('div', 'pill carry');
  private bankPill = el('div', 'pill banked');
  private promptEl = el('div', 'prompt stroke');
  private tags: Tag[] = [];
  private edgeBank = el('div', 'edge bank', `<div class="ar"><i></i></div>`);
  private edgeRich: HTMLElement[] = [];
  private btnSkill: HTMLElement;
  private btnGrab: HTMLElement;
  private btnDash: HTMLElement;
  private skillTip = el('div', 'btn-tip stroke', 'Press SKILL!');
  private fpsEl = el('div', 'fps');
  private panel: HTMLElement | null = null;
  private feedEl = el('div', 'feed');
  private bankValEl = el('div', 'bankval stroke');
  private modEl = el('div', 'modchip');
  private comboEl = el('div', 'combo stroke');
  private powersEl = el('div', 'powers');
  private powerChips = new Map<PowerKind, HTMLElement>();
  private flashEl = el('div', 'flash');
  private lastCombo = 0;
  private lastCarry = -1;
  private lastBanked = -1;
  private portraits: Map<HeroId, string>;
  private v = new THREE.Vector3();
  onPause: (() => void) | null = null;
  touch: boolean;

  constructor(world: World, localId: number, portraits: Map<HeroId, string>, touch: boolean, input: InputManager) {
    this.portraits = portraits;
    this.touch = touch;
    this.root.id = 'hud';
    if (!touch) this.root.classList.add('desktop');
    document.body.appendChild(this.root);

    const top = el('div', 'top-center');
    top.append(this.timer, this.roundEl, this.modEl, this.finaleTag);
    this.root.append(top, this.board);
    world.players.forEach((p) => {
      const r = el('div', 'row' + (p.id === localId ? ' me' : ''));
      r.innerHTML = `<div class="rk"></div><div class="face" style="background-image:url(${portraits.get(p.hero)});border-color:${PLAYER_COLORS[p.id]}"></div><div class="nm">${p.id === localId ? 'You' : p.name}</div><div class="bk"><i class="coin-ico"></i><span>0</span></div>`;
      this.rows.push(r);
      this.board.append(r);
    });
    const pause = el('button', 'pause-btn tap', 'II');
    pause.addEventListener('click', () => this.onPause?.());
    this.root.append(pause, this.feedEl);

    const mine = el('div', 'mine');
    mine.append(this.carryPill, this.bankPill);
    this.root.append(mine, this.comboEl, this.powersEl, this.flashEl, this.bankValEl);
    for (const k of ['magnet', 'speed', 'shield'] as PowerKind[]) {
      const c = el('div', 'pchip', `<img src="${powerIconCanvas(k, 96).toDataURL()}"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="#ffffff40" stroke-width="4"/><circle class="t" cx="20" cy="20" r="17" fill="none" stroke="${POWER_INFO[k].color}" stroke-width="4" stroke-dasharray="106.8" transform="rotate(-90 20 20)"/></svg>`);
      this.powerChips.set(k, c);
      this.powersEl.append(c);
    }
    this.root.append(this.promptEl);

    // name tags
    world.players.forEach((p) => {
      const root = el('div', 'tag' + (p.id === localId ? ' me' : ''));
      const count = el('div', 'tc stroke');
      const name = el('div', 'tn', p.id === localId ? 'YOU' : p.name);
      const say = el('div', 'say');
      root.append(say, name, count);
      let ring: SVGCircleElement | null = null;
      let ringWrap: HTMLElement | null = null;
      if (p.id === localId) {
        ringWrap = el('div', 'ring', `<svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="#1d0d52a0" stroke="#ffffff40" stroke-width="5"/><circle class="pr" cx="23" cy="23" r="19" fill="none" stroke="#7ff3ff" stroke-width="5" stroke-linecap="round" stroke-dasharray="119.4" stroke-dashoffset="119.4" transform="rotate(-90 23 23)"/></svg>`);
        ring = ringWrap.querySelector('.pr');
        root.append(ringWrap);
      }
      this.tags.push({ root, count, ring, ringWrap, name, say, sayUntil: 0 });
      this.root.append(root);
    });
    this.root.append(this.edgeBank);
    for (let i = 0; i < 2; i++) {
      const e = el('div', 'edge rich', `<div class="ar"><i></i></div><span class="stroke"></span>`);
      this.edgeRich.push(e);
      this.root.append(e);
    }

    // controls
    const me = world.players[localId];
    const ab = HEROES[me.hero].ability;
    const ctr = el('div', 'controls');
    this.btnSkill = el('div', 'btn skill tap', `<div class="cd"></div>${ICONS[ab]}<span class="lbl">SKILL</span><span class="num"></span><span class="hits"></span>${touch ? '' : '<span class="key">K</span>'}`);
    this.btnGrab = el('div', 'btn grab tap', `<div class="cd"></div>${ICONS.grab}<span class="lbl">GRAB</span>${touch ? '' : '<span class="key">J</span>'}`);
    this.btnDash = el('div', 'btn dash tap', `<div class="cd"></div>${ICONS.dash}<span class="lbl">DASH</span>${touch ? '' : '<span class="key">SPACE</span>'}`);
    ctr.append(this.btnSkill, this.btnGrab, this.btnDash, this.skillTip);
    this.root.append(ctr);
    const bind = (b: HTMLElement, k: 'dash' | 'grab' | 'skill') => {
      const down = (e: Event) => {
        e.preventDefault();
        b.classList.add('down');
        input.press(k);
      };
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
    };
    bind(this.btnSkill, 'skill');
    bind(this.btnGrab, 'grab');
    bind(this.btnDash, 'dash');

    // floating joystick on the left half
    const zone = el('div', 'stick-zone');
    const stick = el('div', 'stick');
    const knob = el('div', 'knob');
    stick.append(knob);
    zone.append(stick);
    const ghost = el('div', 'stick-ghost stroke', 'MOVE');
    this.root.append(ghost, zone);
    let sid = -1;
    let ox = 0;
    let oy = 0;
    const R = 56;
    zone.addEventListener('pointerdown', (e) => {
      if (sid !== -1) return;
      sid = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      ox = e.clientX;
      oy = e.clientY;
      stick.style.left = `${ox}px`;
      stick.style.top = `${oy - 70}px`;
      stick.style.display = 'block';
      ghost.style.display = 'none';
      knob.style.transform = 'translate(-50%,-50%)';
      input.setStick(0, 0, true);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // drag the base along so the stick never "runs out"
        ox += (dx / d) * (d - R);
        oy += (dy / d) * (d - R);
        stick.style.left = `${ox}px`;
        stick.style.top = `${oy - 70}px`;
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const m = Math.min(1, Math.hypot(dx, dy) / R);
      const dead = 0.12;
      const k = m < dead ? 0 : (m - dead) / (1 - dead) / (m || 1);
      input.setStick((dx / R) * k * (R / R), (dy / R) * k, true);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== sid) return;
      sid = -1;
      stick.style.display = 'none';
      input.setStick(0, 0, false);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    this.root.append(this.fpsEl);
    const rot = el('div', 'rotate', `<div class="phone"></div><div>Rotate your phone</div><div style="font-size:16px;opacity:.8">Bubble Brawl plays in landscape</div>`);
    document.body.append(rot);
  }

  set fps(v: string) {
    this.fpsEl.textContent = v;
  }

  // ---------------------------------------------------------------- per frame

  /** Speech bubble over a hero's head. */
  speak(id: number, text: string, now: number, dur = 2.2) {
    const t = this.tags[id];
    if (!t || t.root.style.opacity === '0') return;
    if (!t.sayUntil && this.tags.filter((x) => x.sayUntil > now).length >= 2) return;
    t.say.textContent = text;
    t.say.classList.remove('on');
    void t.say.offsetWidth;
    t.say.classList.add('on');
    t.sayUntil = now + dur;
  }

  /** Round Roulette card: spins through twists, lands on this round's. */
  roulette(mod: string, round: number) {
    const keys = Object.keys(MOD_INFO).filter((k) => k !== 'double' && k !== 'none');
    const card = el('div', 'roulette');
    card.innerHTML = `<div class="rl-top stroke">ROUND ${round}</div><div class="rl-reel"><span class="rl-ic"></span></div><div class="rl-name stroke"></div><div class="rl-text"></div>`;
    this.root.append(card);
    const ic = card.querySelector('.rl-ic') as HTMLElement;
    const nm = card.querySelector('.rl-name') as HTMLElement;
    const tx = card.querySelector('.rl-text') as HTMLElement;
    const final = MOD_INFO[mod] ?? MOD_INFO.none;
    let i = 0;
    const spins = mod === 'none' ? 0 : 9;
    const tick = () => {
      if (i < spins) {
        const k = MOD_INFO[keys[i % keys.length]];
        ic.textContent = k.icon;
        nm.textContent = k.name;
        nm.style.color = k.color;
        i++;
        this.onTick?.();
        setTimeout(tick, 60 + i * 18);
      } else {
        ic.textContent = final.icon;
        nm.textContent = final.name;
        nm.style.color = final.color;
        tx.textContent = final.text;
        card.classList.add('landed');
        this.onLand?.();
      }
    };
    tick();
    setTimeout(() => card.classList.add('out'), 3400);
    setTimeout(() => card.remove(), 3900);
  }
  onTick: (() => void) | null = null;
  onLand: (() => void) | null = null;

  update(world: World, camera: THREE.PerspectiveCamera, localId: number, now: number, extra?: HudExtra) {
    const me = world.players[localId];
    const playing = world.phase === 'playing';
    const remaining = world.phase === 'countdown' ? TUNING.match.roundSeconds : world.remaining;
    const tt = fmt(Math.ceil(remaining));
    if (this.timer.dataset.t !== tt) {
      this.timer.dataset.t = tt;
      this.timer.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="#fff"/><path d="M12 9v4l3 2" stroke="#4a2fd0" stroke-width="2.4" fill="none" stroke-linecap="round"/><rect x="9" y="2" width="6" height="3" rx="1.5" fill="#fff"/></svg>${tt}`;
    }
    this.timer.classList.toggle('final', world.finale && playing);
    const dots = Array.from({ length: TUNING.match.rounds }, (_, i) => `<i class="${i + 1 < world.round ? 'done' : i + 1 === world.round ? 'now' : ''}"></i>`).join('');
    const rh = `<span>ROUND ${world.round}</span>${dots}`;
    if (this.roundEl.innerHTML !== rh) this.roundEl.innerHTML = rh;
    this.finaleTag.classList.toggle('on', world.finale && playing);

    // scoreboard: total banked this match (+ this round), hidden during the finale
    const order = [...world.players].sort((a, b) => b.bankedTotal + b.bankedRound - (a.bankedTotal + a.bankedRound));
    order.forEach((p, i) => {
      const r = this.rows[p.id];
      r.style.order = String(i);
      const rk = r.querySelector('.rk')!;
      if (rk.textContent !== String(i + 1)) rk.textContent = String(i + 1);
      const v = world.finale && playing && p.id !== localId ? '???' : String(p.bankedTotal + p.bankedRound);
      const span = r.querySelector('.bk span')!;
      if (span.textContent !== v) span.textContent = v;
    });

    if (me.carried !== this.lastCarry) {
      this.carryPill.innerHTML = `<i class="coin-ico"></i>${me.carried}<small>CARRYING</small>`;
      if (me.carried > this.lastCarry) this.bumpEl(this.carryPill);
      this.lastCarry = me.carried;
    }
    const banked = me.bankedTotal + me.bankedRound;
    if (banked !== this.lastBanked) {
      this.bankPill.innerHTML = `<i class="bub-ico"></i>${banked} <small style="font-size:11px;font-family:var(--body);font-weight:900">BANKED</small>`;
      if (banked > this.lastBanked && this.lastBanked >= 0) this.bumpEl(this.bankPill);
      this.lastBanked = banked;
    }

    // combo counter
    if (me.combo !== this.lastCombo) {
      if (me.combo >= 3) {
        this.comboEl.innerHTML = `COMBO <b>x${me.combo}</b>`;
        this.comboEl.classList.add('on');
        this.bumpEl(this.comboEl);
      } else this.comboEl.classList.remove('on');
      this.lastCombo = me.combo;
    }
    // active power-ups with time rings
    const P = TUNING.powerups;
    const times: Record<string, [number, number]> = { magnet: [me.magnetT, P.magnet.seconds], speed: [me.speedT, P.speed.seconds], shield: [me.shieldT, P.shield.seconds] };
    for (const [k, c] of this.powerChips) {
      const [t, max] = times[k];
      c.classList.toggle('on', t > 0);
      if (t > 0) (c.querySelector('.t') as SVGCircleElement).style.strokeDashoffset = String(106.8 * (1 - t / max));
    }

    // tags above heads
    const w = window.innerWidth;
    const h = window.innerHeight;
    // De-clutter: important tags win, the rest hide when they would overlap.
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const prio = (p: Player) =>
      p.id === localId ? 1000 : p.id === extra?.grabTarget ? 500 : extra?.threats.has(p.id) ? 400 : p.id === world.crownId ? 300 : p.id === extra?.nemesis ? 200 : p.carried;
    const order2 = [...world.players].sort((a, b) => prio(b) - prio(a));
    let bubbles = 0;
    for (const p of order2) {
      const i = p.id;
      const t = this.tags[i];
      this.v.set(p.x, p.y + 2.25, p.z).project(camera);
      const sx = (this.v.x * 0.5 + 0.5) * w;
      const sy = (-this.v.y * 0.5 + 0.5) * h;
      const box = { x: sx - 40, y: sy - 34, w: 80, h: 34 };
      const overlaps = placed.some((q) => box.x < q.x + q.w && box.x + box.w > q.x && box.y < q.y + q.h && box.y + box.h > q.y);
      const important = prio(p) >= 200;
      const vis = p.state !== 'falling' && this.v.z < 1 && (!overlaps || p.id === localId);
      if (vis) placed.push(box);
      t.root.style.opacity = vis ? '1' : '0';
      t.root.classList.toggle('compact', vis && overlaps && !important);
      t.root.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
      t.root.style.left = '0';
      t.root.style.top = '0';
      const crown = p.id === world.crownId ? '👑' : '';
      const c = p.carried > 0 ? `${crown}<i class="coin-ico"></i>${p.carried}` : crown;
      if (t.count.innerHTML !== c) t.count.innerHTML = c;
      // red "!" = this bot is coming for you; skull = your nemesis
      const threat = !!extra?.threats.has(p.id);
      const nem = extra?.nemesis === p.id;
      t.root.classList.toggle('threat', threat);
      t.root.classList.toggle('nemesis', nem);
      t.root.classList.toggle('targeted', extra?.grabTarget === p.id);
      // at most two speech bubbles, and never on a hidden tag
      if (t.sayUntil && (now > t.sayUntil || !vis || bubbles >= 2)) {
        t.say.classList.remove('on');
        t.sayUntil = 0;
      }
      if (t.sayUntil) bubbles++;
      if (t.ring && t.ringWrap) {
        const on = p.bankT > 0;
        t.ringWrap.classList.toggle('on', on);
        if (on) t.ring.style.strokeDashoffset = String(119.4 * (1 - p.bankT / TUNING.bank.bankSeconds));
      }
    }

    // edge arrows: bank (when off-screen) and the 2 richest rivals off-screen
    this.edgeArrow(this.edgeBank, world.bank.x, 1, world.bank.z, camera, playing, '');
    // crown holder always gets an arrow; plus the richest other rival
    const crownP = world.crownId >= 0 && world.crownId !== localId ? world.players[world.crownId] : null;
    const rich = world.players
      .filter((p) => p.id !== localId && p !== crownP && p.carried >= 8 && p.state !== 'falling')
      .sort((a, b) => b.carried - a.carried);
    const list = [crownP, rich[0]].filter(Boolean) as Player[];
    this.edgeRich.forEach((e, i) => {
      const p = list[i];
      e.classList.toggle('crown', !!p && p === crownP);
      if (!p || !playing) e.style.display = 'none';
      else this.edgeArrow(e, p.x, 1, p.z, camera, true, `${p === crownP ? '👑' : ''}${p.carried}`);
    });

    // what banking is worth right now (greed tiers)
    const bv = world.bankValue(me.carried);
    const nextTier = [...TUNING.bankBonus].reverse().find((b) => me.carried < b.min);
    const bvHtml =
      me.carried > 0
        ? `<span>BANK = <b>${bv.total}</b></span>${bv.mult > 1 ? `<em>×${bv.mult}</em>` : ''}${nextTier ? `<small>${nextTier.min - me.carried} more → ×${nextTier.mult}${world.mod === 'double' ? '×2' : ''}</small>` : ''}`
        : '';
    if (this.bankValEl.innerHTML !== bvHtml) this.bankValEl.innerHTML = bvHtml;
    this.bankValEl.classList.toggle('hot', bv.mult >= 1.5);
    // current twist
    const mi = MOD_INFO[world.mod];
    const modHtml = world.mod !== 'none' && mi ? `${mi.icon} ${mi.name}` : '';
    if (this.modEl.innerHTML !== modHtml) this.modEl.innerHTML = modHtml;
    this.modEl.style.display = modHtml ? 'block' : 'none';
    // buttons light up only when they'd land
    this.btnGrab.classList.toggle('can', !!extra && extra.grabTarget >= 0 && me.grabCd <= 0.05);
    this.btnSkill.classList.toggle('hot', !!extra && extra.skillHits > 0 && me.skillCd <= 0);
    const hitsEl = this.btnSkill.querySelector('.hits') as HTMLElement | null;
    const hitsTxt = extra && extra.skillHits > 0 && me.skillCd <= 0 ? `×${extra.skillHits}` : '';
    if (hitsEl && hitsEl.textContent !== hitsTxt) hitsEl.textContent = hitsTxt;

    // buttons: cooldown rings
    this.cooldown(this.btnSkill, me.skillCd, TUNING.abilities[HEROES[me.hero].ability].cooldown, true);
    this.cooldown(this.btnGrab, me.grabCd, TUNING.grab.cooldown, false);
    this.cooldown(this.btnDash, me.dashCd, TUNING.dash.cooldown, false);
    this.btnSkill.classList.toggle('ready', me.skillCd <= 0 && playing);
    void now;
  }

  private cooldown(b: HTMLElement, cd: number, max: number, showNum: boolean) {
    const p = cd > 0 ? (cd / max) * 100 : 0;
    (b.querySelector('.cd') as HTMLElement).style.setProperty('--p', `${p}%`);
    if (showNum) {
      const n = b.querySelector('.num') as HTMLElement;
      const t = cd > 0 ? String(Math.ceil(cd)) : '';
      if (n.textContent !== t) n.textContent = t;
      (b.querySelector('svg') as SVGElement).style.opacity = cd > 0 ? '0.35' : '1';
    }
  }

  private edgeArrow(e: HTMLElement, x: number, y: number, z: number, camera: THREE.PerspectiveCamera, show: boolean, label: string) {
    this.v.set(x, y, z).project(camera);
    const behind = this.v.z > 1;
    let sx = this.v.x;
    let sy = this.v.y;
    if (behind) {
      sx = -sx;
      sy = -sy;
    }
    const on = show && (behind || Math.abs(sx) > 0.92 || Math.abs(sy) > 0.88);
    e.style.display = on ? 'flex' : 'none';
    if (!on) return;
    const m = Math.max(Math.abs(sx) / 0.86, Math.abs(sy) / 0.78);
    sx /= m;
    sy /= m;
    const w = window.innerWidth;
    const h = window.innerHeight;
    e.style.left = `${(sx * 0.5 + 0.5) * w}px`;
    e.style.top = `${(-sy * 0.5 + 0.5) * h}px`;
    const ang = Math.atan2(sx * w, sy * h);
    (e.querySelector('.ar i') as HTMLElement).style.transform = `rotate(${ang}rad)`;
    const span = e.querySelector('span');
    if (span && span.textContent !== label) span.textContent = label;
  }

  private bumpEl(e: HTMLElement) {
    e.classList.remove('bump');
    void e.offsetWidth;
    e.classList.add('bump');
  }

  // ---------------------------------------------------------------- moments

  private banners: Record<string, HTMLElement | null> = {};

  /** One big + one small banner at a time; a new one replaces the old. */
  banner(text: string, cls = 'gold', small = false) {
    const slot = small ? 'small' : 'big';
    this.banners[slot]?.remove();
    const b = el('div', `banner stroke ${cls}${small ? ' small' : ''}`, text);
    this.banners[slot] = b;
    this.root.append(b);
    setTimeout(() => b.remove(), 1300);
  }

  /** Small event line top-right: "Rocket stole 6 from Zara". */
  feed(html: string) {
    const f = el('div', 'fd', html);
    this.feedEl.prepend(f);
    while (this.feedEl.children.length > 4) this.feedEl.lastElementChild!.remove();
    setTimeout(() => f.classList.add('out'), 3200);
    setTimeout(() => f.remove(), 3700);
  }

  /** Full-screen colour flash for big moments. */
  flash(color: string, strength = 0.55) {
    this.flashEl.style.background = `radial-gradient(circle, transparent 30%, ${color})`;
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = String(strength);
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = 'opacity .45s ease-out';
    this.flashEl.style.opacity = '0';
  }

  /** Huge ability name in the hero's colour. */
  skillBanner(text: string, color: string) {
    const b = el('div', 'skillname stroke', text);
    b.style.color = color;
    this.root.append(b);
    setTimeout(() => b.remove(), 1000);
  }

  countdown(n: number | 'GO!') {
    const c = el('div', 'countdown stroke', String(n));
    this.root.append(c);
    setTimeout(() => c.remove(), 900);
  }

  floater(pos: THREE.Vector3, camera: THREE.PerspectiveCamera, text: string, cls: 'plus' | 'minus' | 'bank') {
    this.v.copy(pos).project(camera);
    if (this.v.z > 1) return;
    // cap pop-up numbers so a brawl doesn't become a wall of text
    const live = this.root.querySelectorAll('.floater');
    if (live.length >= 4) live[0].remove();
    const f = el('div', `floater stroke ${cls}`, text);
    f.style.left = `${(this.v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 30}px`;
    f.style.top = `${(-this.v.y * 0.5 + 0.5) * window.innerHeight}px`;
    this.root.append(f);
    setTimeout(() => f.remove(), 900);
  }

  prompt(html: string | null) {
    if (html) this.promptEl.innerHTML = html;
    this.promptEl.classList.toggle('on', !!html);
  }

  hintButton(which: 'skill' | 'grab' | 'dash' | null) {
    this.btnSkill.classList.toggle('hint', which === 'skill');
    this.btnGrab.classList.toggle('hint', which === 'grab');
    this.btnDash.classList.toggle('hint', which === 'dash');
    this.skillTip.classList.toggle('on', which === 'skill');
  }

  // ---------------------------------------------------------------- panels

  /** Pin the podium labels under the 3D podiums. */
  placePodium(points: { x: number; y: number }[]) {
    const els = this.root.querySelectorAll<HTMLElement>('.pn');
    els.forEach((e, i) => {
      const p = points[i];
      if (!p) return;
      e.style.left = `${p.x}px`;
      e.style.top = `${p.y}px`;
    });
  }

  /** True behind the landing page: the game HUD stays hidden, only panels show. */
  attract = false;

  closePanel() {
    if (!this.attract) this.root.classList.remove('menu');
    this.panel?.remove();
    this.panel = null;
  }

  private open(inner: HTMLElement) {
    this.closePanel();
    const v = el('div', 'veil');
    v.append(inner);
    this.root.append(v);
    this.panel = v;
    return v;
  }

  private standings(players: Player[], localId: number, key: (p: Player) => number, extra: (p: Player) => string) {
    const list = el('div', 'standings');
    [...players]
      .sort((a, b) => key(b) - key(a))
      .forEach((p, i) => {
        const r = el('div', 'st' + (p.id === localId ? ' me' : ''));
        r.innerHTML = `<div class="rk stroke">${i + 1}</div><div class="face" style="background-image:url(${this.portraits.get(p.hero)})"></div>
          <div>${p.id === localId ? 'You' : p.name}${p.isBot ? '<span class="bot">BOT</span>' : ''}</div><div class="rw">${extra(p)}</div><div class="sc"><i class="coin-ico"></i>${key(p)}</div>`;
        list.append(r);
      });
    return list;
  }

  showRoundEnd(world: World, localId: number, winner: number, lostMine: number, reward: number) {
    const p = el('div', 'panel');
    const won = winner === localId;
    p.append(el('h1', 'stroke', won ? 'ROUND WON!' : `${world.players[winner].name} wins round ${world.round}`));
    if (reward > 0) p.append(el('div', 'reward stroke', `+${reward} <i class="coin-ico"></i> first win bonus!`));
    p.append(this.standings(world.players, localId, (x) => x.bankedRound, () => 'this round'));
    if (lostMine > 0) p.append(el('div', 'lost', `You lost ${lostMine} unbanked coins. Bank before the bell!`));
    const next = world.round < TUNING.match.rounds ? `Round ${world.round + 1} starting…` : 'Final results…';
    p.append(el('div', 'sub', next));
    this.open(p).style.pointerEvents = 'none';
  }

  showResults(
    world: World,
    localId: number,
    opts: {
      podium: { name: string; place: number }[];
      unlocked: HeroId | null;
      coinsWon: number;
      xpWon: number;
      level: number;
      levelUp: boolean;
      xpFrac: number;
      trial: HeroId | null;
      onRematch: () => void;
      onHome: () => void;
    },
  ) {
    const p = el('div', 'panel results');
    const ranking = world.ranking();
    const rank = ranking.indexOf(localId) + 1;
    const title = rank === 1 ? 'YOU WIN!' : rank === 2 ? '2nd PLACE!' : rank === 3 ? '3rd PLACE!' : `${rank}th place`;
    p.append(el('h1', 'stroke' + (rank === 1 ? ' gold' : ''), title));
    p.append(this.standings(world.players, localId, (x) => x.bankedTotal, (x) => `${x.roundsWon} round${x.roundsWon === 1 ? '' : 's'}`));

    const by = (f: (x: Player) => number) => [...world.players].sort((a, b) => f(b) - f(a))[0];
    const thief = by((x) => x.stats.stolen);
    const banker = by((x) => x.stats.bestBank);
    const oops = by((x) => x.stats.falls);
    const aw = el('div', 'awards');
    const nm = (x: Player) => (x.id === localId ? 'You' : x.name);
    if (thief.stats.stolen > 0) aw.append(el('div', 'award', `<b>Top Thief</b><span>${nm(thief)} · ${thief.stats.stolen} stolen</span>`));
    if (banker.stats.bestBank > 0) aw.append(el('div', 'award', `<b>Big Banker</b><span>${nm(banker)} · ${banker.stats.bestBank} at once</span>`));
    if (oops.stats.falls > 0) aw.append(el('div', 'award', `<b>Butterfingers</b><span>${nm(oops)} · fell ${oops.stats.falls}×</span>`));
    p.append(aw);

    const rw = el('div', 'rewards');
    rw.innerHTML = `<div class="rw-coins stroke"><i class="coin-ico"></i>+${opts.coinsWon}</div>
      <div class="rw-xp"><span class="lv">${opts.level}</span><span class="bar"><i style="width:${Math.round(opts.xpFrac * 100)}%"></i></span><b class="stroke">+${opts.xpWon} XP</b></div>`;
    p.append(rw);
    if (opts.levelUp) p.append(el('div', 'unlock stroke', `LEVEL UP! You are level ${opts.level}`));
    if (opts.unlocked) p.append(el('div', 'unlock stroke', `<img src="${this.portraits.get(opts.unlocked)}"> NEW HERO: ${HEROES[opts.unlocked].name.toUpperCase()}!`));
    else if (opts.trial) p.append(el('div', 'sub', `That was a free trial of ${HEROES[opts.trial].name}. Keep playing to unlock!`));

    const row = el('div', 'btn-row');
    const home = el('button', 'big-btn alt tap', 'HOME');
    home.addEventListener('click', opts.onHome);
    const re = el('button', 'big-btn tap', 'REMATCH');
    re.addEventListener('click', opts.onRematch);
    row.append(home, re);
    p.append(row);
    const v = this.open(p);
    v.classList.add('side');
    // names under the 3D podium (2nd · 1st · 3rd)
    const names = el('div', 'podium-names');
    names.innerHTML = opts.podium.map((x) => `<div class="pn p${x.place}"><b class="stroke">${x.place}</b><span>${x.name}</span></div>`).join('');
    v.prepend(names);
    this.root.classList.add('menu');
    re.focus();
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Enter') {
        window.removeEventListener('keydown', key);
        opts.onRematch();
      }
    };
    window.addEventListener('keydown', key);
  }

  showPause(
    state: { sound: boolean; shake: boolean; quality: string; inMatch: boolean; canUnlockAll: boolean },
    on: { resume: () => void; toggle: (k: 'sound' | 'shake') => void; quality: () => void; home: () => void; unlockAll: () => void },
  ) {
    const p = el('div', 'panel');
    p.append(el('h1', 'stroke', state.inMatch ? 'Paused' : 'Settings'));
    const t = (label: string, val: string, onClick: () => void, isOn: boolean) => {
      const r = el('div', 'toggle', `<span>${label}</span>`);
      const b = el('button', isOn ? 'on' : '', val);
      b.addEventListener('click', onClick);
      r.append(b);
      p.append(r);
    };
    t('Sound', state.sound ? 'ON' : 'OFF', () => on.toggle('sound'), state.sound);
    t('Screen shake', state.shake ? 'ON' : 'OFF', () => on.toggle('shake'), state.shake);
    t('Graphics', state.quality.toUpperCase(), () => on.quality(), true);
    // playtest builds only: skip the unlock flow
    if (state.canUnlockAll) t('All heroes (playtest)', 'UNLOCK', () => on.unlockAll(), false);
    const row = el('div', 'btn-row');
    if (state.inMatch) {
      const h = el('button', 'big-btn alt tap', 'QUIT');
      h.addEventListener('click', on.home);
      row.append(h);
    }
    const b = el('button', 'big-btn tap', state.inMatch ? 'RESUME' : 'DONE');
    b.addEventListener('click', on.resume);
    row.append(b);
    p.append(row);
    if (state.inMatch) p.append(el('div', 'sub', this.touch ? '' : 'Move: WASD · Dash: Space · Grab: J / click · Skill: K / right-click'));
    this.open(p);
  }
}

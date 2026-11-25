import * as THREE from 'three';
import { WEAPON_INFO, weaponIcon } from '../render/weapons-view.ts';
import { weaponShot } from '../render/portraits.ts';
import './hud.css';
import type { World } from '../../../shared/sim/world.ts';
import type { Player } from '../../../shared/sim/types.ts';
import { TUNING } from '../../../shared/config/tuning.ts';
import { HEROES, type HeroId } from '../../../shared/config/heroes.ts';
import type { InputManager } from '../input.ts';
import { powerIconCanvas, POWER_INFO } from '../render/powerups.ts';
import type { PowerKind } from '../../../shared/sim/types.ts';
import { UI } from './icons.ts';
import { CREDITS_HTML } from './credits.ts';

export const ICONS = {
  grab: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V10h.5V3.5a1.5 1.5 0 0 1 3 0V10h.5V4.5a1.5 1.5 0 0 1 3 0V11h.5V7.5a1.5 1.5 0 0 1 3 0V14c0 4.4-3.1 8-7.5 8-3 0-4.8-1.3-6.3-3.6L3.8 14.6a1.5 1.5 0 0 1 2.4-1.8L7 13.8z"/></svg>`,
  dash: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M13 4l8 8-8 8v-5H3V9h10z"/><rect x="1" y="7" width="3" height="2" rx="1" opacity=".6"/><rect x="0" y="15" width="4" height="2" rx="1" opacity=".6"/></svg>`,
  rattleBurst: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="3" fill="#fff"/><circle cx="12" cy="12" r="7.5" stroke-dasharray="3 3"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2"/></svg>`,
  stickyFingers: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2c2 3 6 6 6 11a6 6 0 0 1-12 0c0-5 4-8 6-11z"/><circle cx="10" cy="14" r="1.6" fill="#ff5fd2"/></svg>`,
  groundSlam: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M9 2h6l-1 9h4l-6 7-6-7h4z"/><path d="M2 20h20v2H2z" opacity=".7"/></svg>`,
};

/** A health bar fill: green → amber → red as it drains. */
function hpFill(hp: number, full: number) {
  const f = Math.max(0, Math.min(1, hp / full));
  const c = f > 0.6 ? '#5cf06a' : f > 0.3 ? '#ffc83a' : '#ff4a5a';
  return `<i class="hpfill" style="width:${(f * 100).toFixed(0)}%;background:${c}"></i>`;
}

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
  none: { name: 'CLASSIC', text: 'Grab coins, steal, bank them!', icon: UI.coin, color: '#ffd84a' },
  giant: { name: 'GIANT COINS', text: 'Fewer coins, but each is worth 3', icon: UI.coin, color: '#ffd84a' },
  thieves: { name: 'THIEF PARTY', text: 'Grabs steal DOUBLE and recharge fast', icon: UI.gift, color: '#ff5fd2' },
  bombs: { name: 'BOMB RAIN', text: 'Bubble bombs fall from the sky — watch the red circles', icon: UI.bomb, color: '#ff8a3d' },
  turbo: { name: 'TURBO', text: 'Everyone runs 35% faster', icon: UI.bolt, color: '#ffd23f' },
  magnet: { name: 'MAGNET STORM', text: 'Everyone pulls nearby coins', icon: UI.coin, color: '#ff5f7a' },
  goldrush: { name: 'GOLD RUSH', text: 'The jackpot erupts every 9 seconds', icon: UI.coin, color: '#7ff3ff' },
  double: { name: 'FINAL ROUND · DOUBLE POINTS', text: 'Every bank counts ×2 — anyone can still win!', icon: UI.star, color: '#ff5fd2' },
  // weapons-mode twists
  rapid: { name: 'RAPID FIRE', text: 'Every weapon reloads twice as fast', icon: UI.bolt, color: '#5fe3ff' },
  ammo: { name: 'DOUBLE AMMO', text: 'Every box gives you twice the ammo', icon: UI.ammo, color: '#9dff7a' },
  rockets: { name: 'ROCKET PARTY', text: 'Every mystery box is a Rocket Launcher — boom!', icon: UI.rocket, color: '#ff7a3d' },
  blasters: { name: 'LASER PARTY', text: 'Every mystery box is a Bubble Laser', icon: UI.bubble, color: '#5fe3ff' },
  frost: { name: 'DEEP FREEZE', text: 'Every mystery box is a Freeze Bomb — keep moving!', icon: UI.snow, color: '#9fe8ff' },
  boxfest: { name: 'BOX FEST', text: 'Mystery boxes come back almost instantly', icon: UI.gift, color: '#ffd84a' },
};

/** Weapons mode shows its own words for the shared twists. */
const WEAPON_MODS = ['turbo', 'bombs', 'rapid', 'ammo', 'rockets', 'blasters', 'frost', 'boxfest'];
export function modInfo(mod: string, mode: string) {
  const base = MOD_INFO[mod] ?? MOD_INFO.none;
  if (mode !== 'weapons') return base;
  if (mod === 'none') return { ...base, name: 'CLASSIC', text: 'Grab mystery boxes, shoot rivals, pop bubbles!', icon: UI.gift };
  if (mod === 'double') return { ...base, text: 'Every KO and every pop counts ×2 — anyone can still win!' };
  if (mod === 'bombs') return { ...base, text: 'Bubble bombs fall from the sky — watch the red circles' };
  return base;
}

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
  private rack = el('div', 'rack');
  private slots = new Map<string, HTMLElement>();
  private rackLabel = el('span', 'label');
  private respawn = el('div', 'respawn', '<i></i><div><b></b><span></span></div>');
  private lastRack = '';
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
    if (world.mode === 'weapons') {
      for (const k of Object.keys(WEAPON_INFO) as (keyof typeof WEAPON_INFO)[]) {
        const slot = el('div', 'slot', `<img alt="${WEAPON_INFO[k].name}" src="${weaponShot(k)}"><div class="cool"></div><b></b>`);
        slot.style.setProperty('--wc', WEAPON_INFO[k].color);
        this.slots.set(k, slot);
        this.rack.append(slot);
      }
      this.rack.append(this.rackLabel);
      this.root.append(this.rack);
    }
    this.root.append(this.respawn);

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
      if (k !== 'grab') b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
    };
    bind(this.btnSkill, 'skill');
    bind(this.btnGrab, 'grab');
    bind(this.btnDash, 'dash');
    // the fire button: hold to keep firing, and slide the thumb to aim while you shoot
    let aimId = -1;
    let ax = 0;
    let ay = 0;
    this.btnGrab.addEventListener('pointerdown', (e) => {
      aimId = e.pointerId;
      ax = e.clientX;
      ay = e.clientY;
      this.btnGrab.setPointerCapture(e.pointerId);
      input.holdFire(true);
    });
    this.btnGrab.addEventListener('pointermove', (e) => {
      if (e.pointerId !== aimId) return;
      input.look(e.clientX - ax, e.clientY - ay);
      ax = e.clientX;
      ay = e.clientY;
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== aimId) return;
      aimId = -1;
      input.holdFire(false);
    };
    this.btnGrab.addEventListener('pointerup', release);
    this.btnGrab.addEventListener('pointercancel', release);

    // floating joystick on the left half
    const zone = el('div', 'stick-zone');
    const stick = el('div', 'stick');
    const knob = el('div', 'knob');
    stick.append(knob);
    zone.append(stick);
    const ghost = el('div', 'stick-ghost stroke', 'MOVE');
    // right half: drag to turn the camera (third-person view)
    const lookZone = el('div', 'look-zone');
    let lid = -1;
    let lx = 0;
    let ly = 0;
    lookZone.addEventListener('pointerdown', (e) => {
      if (lid !== -1) return;
      lid = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      lookZone.setPointerCapture(e.pointerId);
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lid) return;
      input.look(e.clientX - lx, e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
    });
    const lend = (e: PointerEvent) => {
      if (e.pointerId === lid) lid = -1;
    };
    lookZone.addEventListener('pointerup', lend);
    lookZone.addEventListener('pointercancel', lend);
    this.root.append(lookZone, ghost, zone);
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
    if (!document.querySelector('.rotate')) document.body.append(rot);
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
  roulette(mod: string, round: number, mode = 'coins') {
    const keys = mode === 'weapons' ? WEAPON_MODS : Object.keys(MOD_INFO).filter((k) => k !== 'double' && k !== 'none' && !WEAPON_MODS.includes(k));
    const card = el('div', 'roulette');
    card.innerHTML = `<div class="rl-top stroke">ROUND ${round}</div><div class="rl-reel"><span class="rl-ic"></span></div><div class="rl-name stroke"></div><div class="rl-text"></div>`;
    this.root.append(card);
    const ic = card.querySelector('.rl-ic') as HTMLElement;
    const nm = card.querySelector('.rl-name') as HTMLElement;
    const tx = card.querySelector('.rl-text') as HTMLElement;
    const final = modInfo(mod, mode);
    let i = 0;
    const spins = mod === 'none' ? 0 : 9;
    const tick = () => {
      if (i < spins) {
        const k = modInfo(keys[i % keys.length], mode);
        ic.innerHTML = k.icon;
        nm.textContent = k.name;
        nm.style.color = k.color;
        i++;
        this.onTick?.();
        setTimeout(tick, 60 + i * 18);
      } else {
        ic.innerHTML = final.icon;
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
      r.classList.toggle('far', i >= 3 && p.id !== localId);
      const rk = r.querySelector('.rk')!;
      if (rk.textContent !== String(i + 1)) rk.textContent = String(i + 1);
      const v = world.finale && playing && p.id !== localId ? '???' : String(p.bankedTotal + p.bankedRound);
      const span = r.querySelector('.bk span')!;
      if (span.textContent !== v) span.textContent = v;
    });

    if (world.mode === 'weapons') {
      // health hearts + KO points instead of carried / banked coins
      const hpKey = me.state === 'bubble' ? -1 : me.hp;
      if (hpKey !== this.lastCarry) {
        const full = TUNING.weapons.hp;
        this.carryPill.innerHTML =
          me.state === 'bubble'
            ? `${UI.bubble}<small>BUBBLED</small>`
            : `<span class="hpbar">${hpFill(me.hp, full)}<b>${Math.ceil(me.hp)}</b></span><small>HEALTH</small>`;
        this.carryPill.classList.toggle('low', me.hp <= TUNING.weapons.hitHp && me.state !== 'bubble');
        if (hpKey < this.lastCarry) this.bumpEl(this.carryPill);
        this.lastCarry = hpKey;
      }
      const pts = me.bankedTotal + me.bankedRound;
      if (pts !== this.lastBanked) {
        this.bankPill.innerHTML = `${UI.star}${pts} <small style="font-size:11px;font-family:var(--body);font-weight:900">POINTS</small>`;
        if (pts > this.lastBanked && this.lastBanked >= 0) this.bumpEl(this.bankPill);
        this.lastBanked = pts;
      }
      // the rack: which of the six you hold, its ammo and reload
      const held = me.weapon;
      const rackKey = `${held}:${me.ammo}:${me.state === 'bubble'}`;
      if (rackKey !== this.lastRack) {
        this.lastRack = rackKey;
        for (const [k, slot] of this.slots) {
          const on = k === held;
          slot.classList.toggle('held', on);
          slot.classList.toggle('empty', on && me.ammo <= 0);
          if (on) slot.querySelector('b')!.textContent = String(me.ammo);
          else (slot.querySelector('.cool') as HTMLElement).style.setProperty('--p', '0%');
        }
        this.rack.classList.toggle('off', me.state === 'bubble');
        this.rackLabel.textContent = held ? WEAPON_INFO[held].name : '';
        this.rack.style.setProperty('--wc', held ? WEAPON_INFO[held].color : '#fff');
      }
      if (held) this.cooldown(this.slots.get(held)!, me.fireCd, TUNING.weapons[held].cooldown, false, '.cool');
      // action button: weapon + ammo, or a punch
      const key = me.weapon ? `${me.weapon}:${me.ammo}` : 'punch';
      if (this.btnGrab.dataset.w !== key) {
        this.btnGrab.dataset.w = key;
        const info = me.weapon ? WEAPON_INFO[me.weapon] : null;
        this.btnGrab.classList.toggle('armed', !!info);
        this.btnGrab.style.setProperty('--wc', info?.color ?? '');
        const svg = this.btnGrab.querySelector('svg, .wicon');
        const icon = info && me.weapon ? Object.assign(document.createElement('img'), { className: 'wicon', src: weaponIcon(me.weapon, 96).toDataURL() }) : null;
        if (svg && icon) svg.replaceWith(icon);
        else if (svg && !icon && svg.classList.contains('wicon')) svg.outerHTML = ICONS.grab;
        this.btnGrab.querySelector('.lbl')!.textContent = info ? `x${me.ammo}` : 'PUNCH';
      }
    } else if (me.carried !== this.lastCarry) {
      this.carryPill.innerHTML = `<i class="coin-ico"></i>${me.carried}<small>CARRYING</small>`;
      if (me.carried > this.lastCarry) this.bumpEl(this.carryPill);
      this.lastCarry = me.carried;
    }
    const banked = me.bankedTotal + me.bankedRound;
    if (world.mode === 'coins' && banked !== this.lastBanked) {
      this.bankPill.innerHTML = `<i class="bub-ico"></i>${banked} <small style="font-size:11px;font-family:var(--body);font-weight:900">BANKED</small>`;
      if (banked > this.lastBanked && this.lastBanked >= 0) this.bumpEl(this.bankPill);
      this.lastBanked = banked;
    }

    // knocked out or fallen: say what happens next
    const down = playing && (me.state === 'bubble' || me.state === 'falling');
    this.respawn.classList.toggle('on', down);
    if (down) {
      const secs = String(Math.max(1, Math.ceil(me.stateT)));
      const num = this.respawn.querySelector('i')!;
      if (num.textContent !== secs) num.textContent = secs;
      const title = me.state === 'bubble' ? 'BUBBLED!' : 'FELL OFF!';
      const b = this.respawn.querySelector('b')!;
      if (b.textContent !== title) {
        b.textContent = title;
        this.respawn.querySelector('span')!.textContent = me.state === 'bubble' ? (this.touch ? 'Tap the buttons fast to escape' : 'Mash the action keys to escape') : 'Back on the map in a moment';
      }
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
      const crown = p.id === world.crownId ? UI.crown : '';
      const c =
        world.mode === 'weapons'
          ? p.state === 'bubble'
            ? '<span class="tbub">POP ME!</span>'
            : `<span class="thp">${hpFill(p.hp, TUNING.weapons.hp)}</span>`
          : p.carried > 0
            ? `${crown}<i class="coin-ico"></i>${p.carried}`
            : crown;
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
    const coinMode = playing && world.mode === 'coins'; // the bank and coin carriers only exist in Coin Clash
    this.edgeArrow(this.edgeBank, world.bank.x, 1, world.bank.z, camera, coinMode, '');
    // crown holder always gets an arrow; plus the richest other rival
    const crownP = world.crownId >= 0 && world.crownId !== localId ? world.players[world.crownId] : null;
    const rich = world.players
      .filter((p) => p.id !== localId && p !== crownP && p.carried >= 8 && p.state !== 'falling')
      .sort((a, b) => b.carried - a.carried);
    const list = [crownP, rich[0]].filter(Boolean) as Player[];
    this.edgeRich.forEach((e, i) => {
      const p = list[i];
      e.classList.toggle('crown', !!p && p === crownP);
      if (!p || !coinMode) e.style.display = 'none';
      else this.edgeArrow(e, p.x, 1, p.z, camera, true, `${p === crownP ? '♛ ' : ''}${p.carried}`);
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
    const mi = modInfo(world.mod, world.mode);
    const modHtml = world.mod !== 'none' && mi ? `${mi.icon} ${mi.name}` : '';
    if (this.modEl.innerHTML !== modHtml) this.modEl.innerHTML = modHtml;
    this.modEl.style.display = modHtml ? 'flex' : 'none';
    // buttons light up only when they'd land
    this.btnGrab.classList.toggle('can', !!extra && extra.grabTarget >= 0 && me.grabCd <= 0.05);
    this.btnSkill.classList.toggle('hot', !!extra && extra.skillHits > 0 && me.skillCd <= 0);
    const hitsEl = this.btnSkill.querySelector('.hits') as HTMLElement | null;
    const hitsTxt = extra && extra.skillHits > 0 && me.skillCd <= 0 ? `×${extra.skillHits}` : '';
    if (hitsEl && hitsEl.textContent !== hitsTxt) hitsEl.textContent = hitsTxt;

    // buttons: cooldown rings
    this.cooldown(this.btnSkill, me.skillCd, TUNING.abilities[HEROES[me.hero].ability].cooldown, true);
    // weapon in hand: the ring shows the weapon's own cooldown (fire rate), not the punch's
    if (me.weapon) this.cooldown(this.btnGrab, me.fireCd, TUNING.weapons[me.weapon].cooldown, false);
    else this.cooldown(this.btnGrab, me.grabCd, TUNING.grab.cooldown, false);
    this.cooldown(this.btnDash, me.dashCd, TUNING.dash.cooldown, false);
    this.btnSkill.classList.toggle('ready', me.skillCd <= 0 && playing);
    void now;
  }

  private cooldown(b: HTMLElement, cd: number, max: number, showNum: boolean, ring = '.cd') {
    const p = cd > 0 ? Math.round(Math.min(1, cd / max) * 100) : 0;
    const r = b.querySelector(ring) as HTMLElement;
    if (r.dataset.p !== String(p)) {
      r.dataset.p = String(p); // touch the DOM only when the ring actually moves
      r.style.setProperty('--p', `${p}%`);
    }
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

  private xhair: HTMLElement | null = null;
  private xState = '';
  /** Shooter crosshair at the screen centre: white, red when a rival is under it, faint when unarmed. */
  crosshair(on: boolean, locked: boolean, armed: boolean) {
    const st = on ? `${locked ? 'l' : ''}${armed ? 'a' : ''}` : 'off';
    if (st === this.xState) return;
    this.xState = st;
    if (!this.xhair) {
      this.xhair = el('div', 'xhair', '<i></i><i></i><i></i><i></i><b></b>');
      this.root.append(this.xhair);
    }
    this.xhair.style.display = on ? 'block' : 'none';
    this.xhair.classList.toggle('locked', locked);
    this.xhair.classList.toggle('armed', armed);
  }

  private lockEl: HTMLElement | null = null;
  /** Desktop: the mouse is not captured yet, so aiming needs one click. */
  lockHint(on: boolean) {
    if (!this.lockEl) {
      if (!on) return;
      this.lockEl = el('div', 'lockhint', '<b>CLICK TO AIM</b><span>Move the mouse to aim · hold left button to fire · Esc to pause</span>');
      this.root.append(this.lockEl);
    }
    this.lockEl.classList.toggle('on', on);
  }

  /** The crosshair kicks open on every shot. */
  shotKick() {
    const x = this.xhair;
    if (!x) return;
    x.classList.remove('kick');
    void x.offsetWidth;
    x.classList.add('kick');
  }

  private marker: HTMLElement | null = null;
  /** The X over the crosshair that says your shot landed (gold and bigger for a knock-out). */
  hitMarker(ko: boolean) {
    this.marker?.remove();
    const m = el('div', `hitx${ko ? ' ko' : ''}`, '<i></i><i></i><i></i><i></i>');
    this.root.append(m);
    this.marker = m;
    setTimeout(() => m.remove(), ko ? 520 : 200);
  }

  private wcard: HTMLElement | null = null;
  /** Weapon pickup card: big icon, name and what it does (slides up above the buttons, 2.2 s). */
  weaponCard(kind: keyof typeof WEAPON_INFO) {
    const info = WEAPON_INFO[kind];
    this.wcard?.remove();
    const c = el('div', 'wcard', `<img src="${weaponIcon(kind, 128).toDataURL()}"><div><b>${info.name}</b><span>${info.tip}</span></div>`);
    c.style.setProperty('--wc', info.color);
    this.root.append(c);
    this.wcard = c;
    setTimeout(() => c.classList.add('out'), 2000);
    setTimeout(() => c.remove(), 2400);
  }

  /** A short hint near the middle of the screen. */
  tip(text: string, seconds: number) {
    const t = el('div', 'cam-hint', text);
    this.root.append(t);
    setTimeout(() => t.remove(), seconds * 1000);
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
    if (this.panelKey) window.removeEventListener('keydown', this.panelKey);
    this.panelKey = null;
  }
  private panelKey: ((e: KeyboardEvent) => void) | null = null;

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
    p.classList.toggle('win', won);
    p.append(el('span', 'verdict', `ROUND ${world.round} OF ${TUNING.match.rounds}`));
    p.append(el('h1', 'stroke', won ? 'ROUND WON!' : `${world.players[winner].name} takes it`));
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
      unlocks: { name: string; img: string }[];
      missions: { text: string; xp: number }[];
      next: { level: number; name: string; img: string } | null;
      coinsWon: number;
      xpWon: number;
      level: number;
      levelUp: boolean;
      xpFrac: number;
      waitForHost?: boolean;
      onRematch: () => void;
      onHome: () => void;
    },
  ) {
    const p = el('div', 'panel results');
    const ranking = world.ranking();
    const rank = ranking.indexOf(localId) + 1;
    const title = rank === 1 ? 'YOU WIN!' : rank === 2 ? '2nd PLACE!' : rank === 3 ? '3rd PLACE!' : `${rank}th place`;
    p.classList.add(rank === 1 ? 'win' : 'loss');
    p.append(el('span', 'verdict', rank === 1 ? 'VICTORY' : rank <= 3 ? 'ON THE PODIUM' : 'DEFEAT'));
    p.append(el('h1', 'stroke' + (rank > 3 ? ' lose' : ''), title));
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
    for (const m of opts.missions) p.append(el('div', 'mdone', `<span>MISSION COMPLETE</span><b>${m.text}</b><em>+${m.xp} XP</em>`));
    if (opts.levelUp) p.append(el('div', 'unlock stroke', `LEVEL UP! You are level ${opts.level}`));
    for (const u of opts.unlocks) p.append(el('div', 'unlock stroke', `<img src="${u.img}" alt=""> UNLOCKED: ${u.name.toUpperCase()}`));
    if (!opts.unlocks.length && opts.next) p.append(el('div', 'sub', `Next: ${opts.next.name} at level ${opts.next.level}`));

    const row = el('div', 'btn-row');
    const home = el('button', 'big-btn alt tap', `${UI.home}HOME`);
    home.addEventListener('click', opts.onHome);
    const re = el('button', 'big-btn tap', opts.waitForHost ? 'WAITING FOR HOST…' : `${UI.again}REMATCH`);
    if (opts.waitForHost) (re as HTMLButtonElement).disabled = true;
    else re.addEventListener('click', opts.onRematch);
    row.append(home, re);
    p.append(row);
    const v = this.open(p);
    v.classList.add('side');
    // names under the 3D podium (2nd · 1st · 3rd)
    const names = el('div', 'podium-names');
    names.innerHTML = opts.podium.map((x) => `<div class="pn p${x.place}"><b class="stroke">${x.place}</b><span>${x.name}</span></div>`).join('');
    v.prepend(names);
    if (rank === 1) {
      const colors = ['#ffd23f', '#ff5fd2', '#3fe0ff', '#7dff6a', '#ff9a3d'];
      v.prepend(el('div', 'confetti', Array.from({ length: 24 }, (_, i) => `<i style="left:${(i * 41) % 100}%;background:${colors[i % 5]};animation-delay:-${((i * 7) % 32) / 10}s"></i>`).join('')));
    }
    this.root.classList.add('menu');
    re.focus();
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && !opts.waitForHost) {
        window.removeEventListener('keydown', key);
        opts.onRematch();
      }
    };
    this.panelKey = key;
    window.addEventListener('keydown', key);
  }

  /** Art and sound credits (CC-BY models must be named). */
  showCredits(back: () => void) {
    const p = el('div', 'panel menu-panel credits');
    p.append(el('h1', 'stroke', 'Credits'));
    p.append(el('div', 'cr', CREDITS_HTML));
    const row = el('div', 'btn-row');
    const b = el('button', 'big-btn tap', 'BACK');
    b.addEventListener('click', back);
    row.append(b);
    p.append(row);
    this.open(p);
  }

  showPause(
    state: { sound: boolean; shake: boolean; quality: string; inMatch: boolean; camera: string; aimSpeed: string; autoFire: boolean | null; aimAssist: boolean | null },
    on: { resume: () => void; toggle: (k: 'sound' | 'shake') => void; quality: () => void; home: () => void; camera: () => void; aimSpeed: () => void; autoFire: () => void; aimAssist: () => void; credits: () => void },
  ) {
    const p = el('div', 'panel menu-panel');
    p.append(el('h1', 'stroke', state.inMatch ? 'Paused' : 'Settings'));
    const t = (icon: string, label: string, val: string, onClick: () => void, kind: 'switch' | 'cycle' | 'act', isOn = false) => {
      const r = el('div', 'toggle', `<span class="tl"><i>${icon}</i>${label}</span>`);
      const b = el('button', `tap ${kind === 'act' ? '' : kind}${isOn ? ' on' : ''}`, val);
      b.setAttribute('aria-label', `${label}: ${val}`);
      b.addEventListener('click', onClick);
      r.append(b);
      p.append(r);
    };
    t(state.sound ? UI.soundOn : UI.soundOff, 'Sound', state.sound ? 'ON' : 'OFF', () => on.toggle('sound'), 'switch', state.sound);
    t(UI.shake, 'Screen shake', state.shake ? 'ON' : 'OFF', () => on.toggle('shake'), 'switch', state.shake);
    t(UI.camera, 'Camera view', state.camera, () => on.camera(), 'cycle');
    t(UI.display, 'Graphics', state.quality.toUpperCase(), () => on.quality(), 'cycle');
    t(UI.bolt, 'Aim speed', state.aimSpeed.toUpperCase(), () => on.aimSpeed(), 'cycle');
    if (state.aimAssist !== null) t(UI.star, 'Aim assist', state.aimAssist ? 'ON' : 'OFF', () => on.aimAssist(), 'switch', state.aimAssist);
    if (state.autoFire !== null) t(UI.star, 'Auto-fire laser', state.autoFire ? 'ON' : 'OFF', () => on.autoFire(), 'switch', state.autoFire);
    if (!state.inMatch) t(UI.heroes, 'Credits', 'VIEW', () => on.credits(), 'act');
    const row = el('div', 'btn-row');
    if (state.inMatch) {
      const h = el('button', 'big-btn alt tap', `${UI.home}QUIT`);
      h.addEventListener('click', on.home);
      row.append(h);
    }
    const b = el('button', 'big-btn tap', state.inMatch ? `${UI.play}RESUME` : 'DONE');
    b.addEventListener('click', on.resume);
    row.append(b);
    p.append(row);
    if (state.inMatch && !this.touch)
      p.append(el('div', 'keys', '<span><kbd>W A S D</kbd>Move</span><span><kbd>SPACE</kbd>Dash</span><span><kbd>J</kbd><kbd>CLICK</kbd>Fire / punch</span><span><kbd>K</kbd><kbd>RIGHT CLICK</kbd>Skill</span>'));
    this.open(p);
  }
}

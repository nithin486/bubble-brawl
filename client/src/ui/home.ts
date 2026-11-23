import './home.css';
import { HEROES, HERO_IDS, type HeroId } from '../../../shared/config/heroes.ts';
import { TUNING } from '../../../shared/config/tuning.ts';
import { ICONS } from './hud.ts';

const SVG = {
  gear: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.7 7.7 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.7 7.7 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>`,
  left: `<svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8" fill="none" stroke="#4a2fd0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  right: `<svg viewBox="0 0 24 24"><path d="m9 4 8 8-8 8" fill="none" stroke="#4a2fd0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="#ffd84a"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>`,
  crown: `<svg viewBox="0 0 64 44"><path d="M4 14l14 12L32 4l14 22 14-12-6 28H10z" fill="#ffd84a" stroke="#3a1fb0" stroke-width="4" stroke-linejoin="round"/><circle cx="32" cy="4" r="4" fill="#ff5fd2"/></svg>`,
  coin: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#ffc81e" stroke="#b86400" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#fff6b0" stroke-width="2"/></svg>`,
  steal: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V10h.5V3.5a1.5 1.5 0 0 1 3 0V10h.5V4.5a1.5 1.5 0 0 1 3 0V11h.5V7.5a1.5 1.5 0 0 1 3 0V14c0 4.4-3.1 8-7.5 8-3 0-4.8-1.3-6.3-3.6L3.8 14.6a1.5 1.5 0 0 1 2.4-1.8L7 13.8z"/></svg>`,
  bubble: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#5fe3ff" fill-opacity=".5" stroke="#fff" stroke-width="2"/><circle cx="9" cy="9" r="2.5" fill="#fff"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v3H8v-3h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z"/></svg>`,
};

export interface HomeState {
  coins: number;
  level: number;
  xpFrac: number;
  hero: HeroId;
  unlocked: HeroId[];
  lockText: (h: HeroId) => string;
  touch: boolean;
  maps: { id: string; name: string; blurb: string }[];
  map: string;
}

export class Home {
  root = document.createElement('div');
  private idx: number;
  private state: HomeState;
  private nameEl: HTMLElement;
  private roleEl: HTMLElement;
  private abilityEl: HTMLElement;
  private lockEl: HTMLElement;
  private playBtn: HTMLButtonElement;
  onHero: ((h: HeroId, locked: boolean) => void) | null = null;
  onPlay: ((h: HeroId) => void) | null = null;
  onSettings: (() => void) | null = null;
  onMap: ((id: string) => void) | null = null;
  private mapIdx = 0;

  constructor(state: HomeState) {
    this.state = state;
    this.idx = Math.max(0, HERO_IDS.indexOf(state.hero));
    const r = this.root;
    r.id = 'home';
    r.innerHTML = `
      <div class="shade"></div>
      <div class="logo">
        <span class="bub" style="width:26px;height:26px;left:-14px;top:52px"></span>
        <span class="bub" style="width:16px;height:16px;left:250px;top:40px"></span>
        <span class="bub" style="width:12px;height:12px;left:236px;top:96px"></span>
        <span class="crown">${SVG.crown}</span>
        <span class="w">BUBBLE</span><span class="w b">BRAWL</span>
        <span class="tag">GRAB · STEAL · BANK</span>
      </div>
      <div class="home-top">
        <div class="chip"><span class="lv">${state.level}</span><span class="xp"><i style="width:${Math.round(state.xpFrac * 100)}%"></i></span></div>
        <div class="chip">${SVG.coin.replace('<svg', '<svg width="24" height="24"')}<span>${state.coins}</span></div>
        <button class="icon-btn" aria-label="Settings">${SVG.gear}</button>
      </div>
      <button class="arrow l tap" aria-label="Previous hero">${SVG.left}</button>
      <button class="arrow r tap" aria-label="Next hero">${SVG.right}</button>
      <div class="lockbadge">${SVG.lock}<span></span></div>
      <div class="hero-name"><h2></h2><span class="role"></span></div>
      <div class="ability"></div>
      <div class="howto">
        <h3>How to play</h3>
        <div class="step"><div class="n" style="background:linear-gradient(#ffe27a,#ffb400)">${SVG.coin}</div><div>Grab coins<small>The more you carry, the slower you get</small></div></div>
        <div class="step"><div class="n" style="background:linear-gradient(#ff9fe0,#ff5fd2)">${SVG.steal}</div><div>Steal from rivals<small>Any hit makes them drop coins</small></div></div>
        <div class="step"><div class="n" style="background:linear-gradient(#a5f6ff,#2aa8e0)">${SVG.bubble}</div><div>Bank them in the bubble<small>Only banked coins count!</small></div></div>
      </div>
      <div class="play-col">
        <div class="mapcard"><button class="mp l" aria-label="Previous map">${SVG.left}</button><div class="mt"><small>MAP</small><b></b><span></span></div><button class="mp r" aria-label="Next map">${SVG.right}</button></div>
        <div class="mode"><div class="mi">${SVG.trophy}</div><div><b>COIN CLASH</b><span>${TUNING.match.rounds} rounds · vs bots</span></div></div>
        <button class="play tap">PLAY<small></small></button>
        <button class="friends" disabled>Play with friends<em>SOON</em></button>
        <div class="keyhint">${state.touch ? '' : 'Press Enter to play · ← → to change hero'}</div>
      </div>`;
    document.body.appendChild(r);
    this.nameEl = r.querySelector('.hero-name h2')!;
    this.roleEl = r.querySelector('.role')!;
    this.abilityEl = r.querySelector('.ability')!;
    this.lockEl = r.querySelector('.lockbadge')!;
    this.playBtn = r.querySelector('.play')!;
    r.querySelector('.arrow.l')!.addEventListener('click', () => this.step(-1));
    r.querySelector('.arrow.r')!.addEventListener('click', () => this.step(1));
    r.querySelector('.icon-btn')!.addEventListener('click', () => this.onSettings?.());
    this.mapIdx = Math.max(0, state.maps.findIndex((m) => m.id === state.map));
    const showMap = () => {
      const m = state.maps[this.mapIdx];
      r.querySelector('.mapcard b')!.textContent = m.name;
      r.querySelector('.mapcard span')!.textContent = m.blurb;
    };
    showMap();
    const stepMap = (d: number) => {
      this.mapIdx = (this.mapIdx + d + state.maps.length) % state.maps.length;
      showMap();
      this.onMap?.(state.maps[this.mapIdx].id);
    };
    r.querySelector('.mp.l')!.addEventListener('click', () => stepMap(-1));
    r.querySelector('.mp.r')!.addEventListener('click', () => stepMap(1));
    this.playBtn.addEventListener('click', () => this.onPlay?.(this.hero));
    window.addEventListener('keydown', this.onKey);
    // swipe on the hero to change
    let sx = -1;
    r.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      sx = e.clientX;
    });
    r.addEventListener('pointerup', (e) => {
      if (sx < 0) return;
      const dx = e.clientX - sx;
      sx = -1;
      if (Math.abs(dx) > 50) this.step(dx < 0 ? 1 : -1);
    });
    r.style.pointerEvents = 'auto';
    this.refresh();
  }

  get hero() {
    return HERO_IDS[this.idx];
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.root.classList.contains('hide')) return;
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      this.onPlay?.(this.hero);
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.step(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.step(1);
  };

  private step(d: number) {
    this.idx = (this.idx + d + HERO_IDS.length) % HERO_IDS.length;
    this.refresh();
  }

  private refresh() {
    const h = HEROES[this.hero];
    const locked = !this.state.unlocked.includes(h.id);
    this.nameEl.textContent = h.name;
    this.roleEl.textContent = h.role.toUpperCase();
    this.roleEl.style.color = h.color;
    this.abilityEl.innerHTML = `<div class="ic">${ICONS[h.ability]}</div><div><b>${h.abilityName}</b><span>${h.abilityText}</span></div><div class="cdt">${TUNING.abilities[h.ability].cooldown}s</div>`;
    this.lockEl.classList.toggle('on', locked);
    this.lockEl.querySelector('span')!.textContent = locked ? this.state.lockText(h.id) : '';
    this.playBtn.innerHTML = locked ? `TRY<small>free trial match as ${h.name}</small>` : `PLAY<small>as ${h.name}</small>`;
    this.onHero?.(h.id, locked);
  }

  show(on: boolean) {
    this.root.classList.toggle('hide', !on);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}

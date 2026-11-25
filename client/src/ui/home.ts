import './home.css';
import { HEROES, HERO_IDS, type HeroId } from '../../../shared/config/heroes.ts';
import { TUNING } from '../../../shared/config/tuning.ts';
import { ICONS } from './hud.ts';
import { UI } from './icons.ts';
import { heroLevel, mapLevel, missionText, type Mission } from '../progress.ts';

export interface HomeState {
  coins: number;
  level: number;
  xpFrac: number;
  name: string;
  hero: HeroId;
  /** Matches played: new players see how to play, everyone else their missions. */
  matches: number;
  /** Friends rooms are off for this release (test builds can turn them on). */
  friends: boolean;
  xpLeft: number;
  xpNeed: number;
  missions: Mission[];
  /** The next reward on the level track. */
  next: { level: number; name: string; img: string } | null;
  touch: boolean;
  maps: { id: string; name: string; blurb: string }[];
  map: string;
  sound: boolean;
  portraits: Map<HeroId, string>;
  /** The arsenal found in mystery boxes (information, not a loadout: the game deals weapons at random). */
  weapons: { name: string; tip: string; color: string; img: string; level: number }[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Home {
  root = document.createElement('div');
  private idx: number;
  private state: HomeState;
  private nameEl: HTMLElement;
  private roleEl: HTMLElement;
  private abilityEl: HTMLElement;
  private lockEl: HTMLElement;
  private playBtn: HTMLButtonElement;
  private soundBtn: HTMLButtonElement;
  private picks: HTMLButtonElement[];
  onHero: ((h: HeroId, locked: boolean) => void) | null = null;
  onPlay: ((h: HeroId) => void) | null = null;
  onFriends: (() => void) | null = null;
  onSettings: (() => void) | null = null;
  onShop: (() => void) | null = null;
  onSound: (() => boolean) | null = null;
  onMap: ((id: string) => void) | null = null;
  private mapIdx = 0;

  constructor(state: HomeState) {
    this.state = state;
    this.idx = Math.max(0, HERO_IDS.indexOf(state.hero));
    const r = this.root;
    r.id = 'home';
    const order = [...HERO_IDS].sort((a, b) => heroLevel(a) - heroLevel(b));
    const picks = order.map(
      (h) =>
        `<button class="pick tap${heroLevel(h) <= state.level ? '' : ' locked'}" data-hero="${h}" aria-label="${HEROES[h].name}${heroLevel(h) <= state.level ? '' : `, unlocks at level ${heroLevel(h)}`}" style="--hc:${HEROES[h].color};background-image:url(${state.portraits.get(h)})">${heroLevel(h) <= state.level ? '' : UI.lock}<span>${heroLevel(h) <= state.level ? HEROES[h].name : `LV ${heroLevel(h)}`}</span></button>`,
    ).join('');
    const arsenal = state.weapons
      .map((w) => `<li class="${w.level <= state.level ? '' : 'locked'}" style="--wc:${w.color}" title="${w.name}: ${w.level <= state.level ? w.tip : `unlocks at level ${w.level}`}"><img src="${w.img}" alt="${w.name}">${w.level <= state.level ? '' : `<em>LV ${w.level}</em>`}</li>`)
      .join('');
    const howto = `<h3>How to play</h3>
        <ol>
          <li><i class="a">${UI.gift}</i><div><b>Grab mystery boxes</b><small>Each one holds a random weapon</small></div></li>
          <li><i class="b">${UI.bolt}</i><div><b>Shoot your rivals</b><small>Aim with the crosshair, hold to fire the laser</small></div></li>
          <li><i class="c">${UI.bubble}</i><div><b>Pop the bubbles</b><small>Touch a knocked-out rival to score again</small></div></li>
        </ol>`;
    const missions = `<h3>Missions</h3>
        <ol class="missions">${state.missions
          .map((m) => `<li><div><b>${missionText(m)}</b><span class="bar"><i style="width:${Math.round((m.done / m.goal) * 100)}%"></i></span><small>${m.done} / ${m.goal}</small></div><em>+${m.xp} XP</em></li>`)
          .join('')}</ol>`;
    r.innerHTML = `
      <div class="shade"></div>
      <div class="motes">${'<i></i>'.repeat(9)}</div>
      <div class="logo">
        <span class="crown">${UI.crown}</span>
        <span class="w">BUBBLE</span><span class="w b">BRAWL</span>
        <span class="tag">GRAB · SHOOT · POP</span>
      </div>
      <header class="home-top">
        <div class="profile glass">
          <div class="avatar"></div>
          <div class="who"><b>${esc(state.name)}</b><span class="xp"><i style="width:${Math.round(state.xpFrac * 100)}%"></i></span></div>
          <div class="lv" title="Player level ${state.level}: ${state.xpLeft} / ${state.xpNeed} XP">${state.level}</div>
        </div>
        <button class="wallet glass tap" aria-label="Shop" title="Shop">${UI.coin}<b>${state.coins}</b><em>+</em></button>
        <button class="round-btn snd tap" aria-label="Sound"></button>
        <button class="round-btn set tap" aria-label="Settings">${UI.gear}</button>
      </header>
      <aside class="howto glass">
        ${state.matches ? missions : howto}
        <div class="arsenal"><span>IN THE BOXES</span><ul>${arsenal}</ul></div>
      </aside>
      <button class="arrow l tap" aria-label="Previous hero">${UI.left}</button>
      <button class="arrow r tap" aria-label="Next hero">${UI.right}</button>
      <div class="lockbadge">${UI.lock}<span></span></div>
      ${state.next ? `<div class="nextup glass"><img src="${state.next.img}" alt=""><div><small>LEVEL ${state.next.level} REWARD</small><b>${state.next.name}</b><span class="bar"><i style="width:${Math.round(state.xpFrac * 100)}%"></i></span></div></div>` : ''}
      <section class="hero-dock">
        <div class="hero-name"><h2></h2><span class="role"></span></div>
        <div class="picks">${picks}</div>
        <div class="ability glass"></div>
      </section>
      <nav class="play-col">
        <div class="mapcard">
          <div class="thumb"></div>
          <button class="mp l tap" aria-label="Previous map">${UI.left}</button>
          <button class="mp r tap" aria-label="Next map">${UI.right}</button>
          <div class="mt"><small></small><b></b><span></span></div>
        </div>
        <div class="mode glass">${UI.trophy}<div><b>Weapon Brawl</b><span>${TUNING.match.roundSeconds / 60} minutes · ${TUNING.match.playersPerMatch} fighters · charge your Super</span></div></div>
        <button class="play tap">PLAY<small></small></button>
        <button class="friends tap"${state.friends ? '' : ' disabled'}>${UI.friends}<span>Play with friends</span>${state.friends ? '' : '<em>SOON</em>'}</button>
        <div class="keyhint">${state.touch ? '' : '<kbd>Enter</kbd> play <kbd>←</kbd><kbd>→</kbd> hero'}</div>
      </nav>`;
    document.body.appendChild(r);
    this.nameEl = r.querySelector('.hero-name h2')!;
    this.roleEl = r.querySelector('.role')!;
    this.abilityEl = r.querySelector('.ability')!;
    this.lockEl = r.querySelector('.lockbadge')!;
    this.playBtn = r.querySelector('.play')!;
    this.soundBtn = r.querySelector('.snd')!;
    this.picks = [...r.querySelectorAll<HTMLButtonElement>('.pick')];
    r.querySelector('.arrow.l')!.addEventListener('click', () => this.step(-1));
    r.querySelector('.arrow.r')!.addEventListener('click', () => this.step(1));
    for (const b of this.picks)
      b.addEventListener('click', () => {
        this.idx = HERO_IDS.indexOf(b.dataset.hero as HeroId);
        this.refresh();
      });
    r.querySelector('.set')!.addEventListener('click', () => this.onSettings?.());
    r.querySelector('.wallet')!.addEventListener('click', () => this.onShop?.());
    this.setSound(state.sound);
    this.soundBtn.addEventListener('click', () => this.setSound(this.onSound?.() ?? true));
    this.mapIdx = Math.max(0, state.maps.findIndex((m) => m.id === state.map));
    this.showMap();
    const stepMap = (d: number) => {
      this.mapIdx = (this.mapIdx + d + state.maps.length) % state.maps.length;
      this.showMap();
      this.refreshPlay();
      this.onMap?.(state.maps[this.mapIdx].id);
    };
    r.querySelector('.mp.l')!.addEventListener('click', () => stepMap(-1));
    r.querySelector('.mp.r')!.addEventListener('click', () => stepMap(1));
    this.playBtn.addEventListener('click', () => this.play());
    r.querySelector('.friends')!.addEventListener('click', () => this.onFriends?.());
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

  /** The level still missing for the hero or map on screen (0 = ready to play). */
  private lockedAt() {
    const need = Math.max(heroLevel(this.hero), mapLevel(this.state.maps[this.mapIdx].id));
    return need > this.state.level ? need : 0;
  }

  private play() {
    if (!this.lockedAt()) this.onPlay?.(this.hero);
  }

  private showMap() {
    const m = this.state.maps[this.mapIdx];
    const card = this.root.querySelector('.mapcard')!;
    (card.querySelector('.thumb') as HTMLElement).style.backgroundImage = `url(thumbs/${m.id}.webp)`;
    card.querySelector('small')!.textContent = `MAP ${this.mapIdx + 1} / ${this.state.maps.length}`;
    card.querySelector('b')!.textContent = m.name;
    card.querySelector('span')!.textContent = m.blurb;
    card.classList.toggle('locked', mapLevel(m.id) > this.state.level);
    (card.querySelector('.thumb') as HTMLElement).dataset.lock = `Unlocks at level ${mapLevel(m.id)}`;
  }

  /** Map card sub-line: a loading note while a map's art downloads (empty = show the map's description again). */
  setMapNote(note: string) {
    this.root.querySelector('.mapcard span')!.textContent = note || this.state.maps[this.mapIdx].blurb;
    this.root.querySelector('.mapcard')!.classList.toggle('busy', !!note);
  }

  setSound(on: boolean) {
    this.soundBtn.innerHTML = on ? UI.soundOn : UI.soundOff;
    this.soundBtn.classList.toggle('off', !on);
    this.soundBtn.setAttribute('aria-pressed', String(on));
  }

  get hero() {
    return HERO_IDS[this.idx];
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.root.classList.contains('hide') || document.querySelector('.friends-veil')) return; // (the shop uses the same veil)
    if (e.code === 'Enter' || e.code === 'Space') {
      // a focused button handles Enter/Space itself
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      e.preventDefault();
      this.play();
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
    const locked = heroLevel(h.id) > this.state.level;
    this.nameEl.textContent = h.name;
    this.roleEl.textContent = h.role.toUpperCase();
    this.roleEl.style.color = h.color;
    this.abilityEl.innerHTML = `<div class="ic">${ICONS[h.ability]}</div><div><b>${h.abilityName}</b><span>${h.abilityText}</span><span class="sup"><em>SUPER · ${h.superName}</em> ${h.superText}</span></div><div class="cdt">${TUNING.abilities[h.ability].cooldown}s</div>`;
    this.lockEl.classList.toggle('on', locked);
    this.lockEl.querySelector('span')!.textContent = locked ? `Reach level ${heroLevel(h.id)} to unlock ${h.name}` : '';
    this.refreshPlay();
    (this.root.querySelector('.avatar') as HTMLElement).style.backgroundImage = `url(${this.state.portraits.get(h.id)})`;
    for (const b of this.picks) b.classList.toggle('sel', b.dataset.hero === h.id);
    this.onHero?.(h.id, locked);
  }

  private refreshPlay() {
    const need = this.lockedAt();
    this.playBtn.disabled = !!need;
    this.playBtn.innerHTML = need ? `LOCKED<small>reach level ${need}</small>` : `PLAY<small>as ${HEROES[this.hero].name}</small>`;
  }

  setCoins(n: number) {
    this.root.querySelector('.wallet b')!.textContent = String(n);
  }

  show(on: boolean) {
    this.root.classList.toggle('hide', !on);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}

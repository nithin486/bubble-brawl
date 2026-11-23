import * as THREE from 'three';
import { World } from '../../shared/sim/world.ts';
import { BotBrain } from '../../shared/sim/bots.ts';
import { Rng } from '../../shared/sim/math.ts';
import { NO_INPUT, type Input, type SimEvent } from '../../shared/sim/types.ts';
import { TUNING } from '../../shared/config/tuning.ts';
import { HEROES, HERO_IDS, type HeroId } from '../../shared/config/heroes.ts';
import { Stage, isTouch, type Quality } from './render/stage.ts';
import type { Assets } from './render/assets.ts';
import { ArenaView } from './render/arena-view.ts';
import { MAPS, MAP_ROTATION, type MapId } from '../../shared/config/maps.ts';
import { HeroView } from './render/hero.ts';
import { CoinsView } from './render/coins.ts';
import { BankView } from './render/bank.ts';
import { Fx, makeGlowTexture } from './render/fx.ts';
import { CameraRig } from './camera.ts';
import { InputManager } from './input.ts';
import { Hud, PLAYER_COLORS } from './ui/hud.ts';
import { Sfx } from './audio.ts';
import { track } from './analytics.ts';
import { saveProfile, levelOf, type Profile } from './save.ts';
import { Home } from './ui/home.ts';
import { Showcase } from './render/showcase.ts';
import { PowerView, POWER_INFO } from './render/powerups.ts';

const BOT_NAMES = ['Chintu', 'Golu', 'Mango', 'Rocket', 'Bunty', 'Zara', 'Pixel', 'Tiki', 'Momo', 'Laddoo', 'Noodle', 'Bolt', 'Pappu', 'Rani', 'Jelly'];
const LOCAL = 0;
// debug: ?autoplay lets a bot drive the local hero; ?speed=N fast-forwards the sim
const PARAMS = new URLSearchParams(location.search);
const AUTOPLAY = PARAMS.has('autoplay');
const SPEED = Number(PARAMS.get('speed')) || 1;
const UNLOCKS: { hero: HeroId; afterMatches: number }[] = [
  { hero: 'pinch', afterMatches: 1 },
  { hero: 'grizzle', afterMatches: 2 },
];

type TutStep = 'move' | 'coins' | 'bank' | 'done';

export class Game {
  private stage: Stage;
  private assets: Assets;
  private world!: World;
  private brains: BotBrain[] = [];
  private autoBrain: BotBrain | null = null;
  private heroes: HeroView[] = [];
  private island!: ArenaView;
  private mapId: MapId = 'city';
  private coins: CoinsView;
  private bank!: BankView;
  private fx: Fx;
  private rig: CameraRig;
  private input: InputManager;
  private hud!: Hud;
  private sfx: Sfx;
  private profile: Profile;
  private portraits: Map<HeroId, string>;
  private glowTex = makeGlowTexture();
  private acc = 0;
  private time = 0;
  private hitStop = 0;
  private paused = false;
  private last = performance.now();
  private touch = isTouch();
  private firstMatch: boolean;
  private tut: TutStep = 'done';
  private tutT = 0;
  private movedDist = 0;
  private skillHintShown = false;
  private skillHintT = 0;
  private grabHintShown = false;
  private grabHintT = 0;
  private bankTickT = 0;
  private roundStats = { stolen: 0, steals: 0 };
  private matchStart = 0;
  private fpsFrames = 0;
  private fpsT = 0;
  private lowFpsStreak = 0;
  private autoQuality: boolean;
  private v = new THREE.Vector3();
  private lead = new THREE.Vector3();
  /** 'home' = landing page with bots playing behind it; 'match' = you are playing. */
  private mode: 'home' | 'match' = 'home';
  private home: Home | null = null;
  private showcase: Showcase;
  private trial = false;
  private powers: PowerView | null = null;
  private wellWarnT = 0;
  private slowT = 0;
  private slowScale = 1;
  private trailT = 0;

  constructor(stage: Stage, assets: Assets, portraits: Map<HeroId, string>, profile: Profile, sfx: Sfx) {
    this.stage = stage;
    this.assets = assets;
    this.portraits = portraits;
    this.profile = profile;
    this.sfx = sfx;
    this.autoQuality = profile.quality === 'auto';
    this.firstMatch = profile.matches === 0;
    this.input = new InputManager(stage.renderer.domElement);
    this.input.onFirstInput = () => {
      sfx.unlock();
      track('first_input', { ms_since_load: Math.round(performance.now()) });
    };
    window.addEventListener('pointerdown', () => sfx.unlock(), { once: false, passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') this.togglePause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'match' && this.world?.phase === 'playing') this.setPaused(true);
    });
    this.rig = new CameraRig(stage.camera);
    this.rig.shakeEnabled = profile.shake;
    this.sfx.muted = !profile.sound;
    this.fx = new Fx(stage.scene, this.glowTex);
    this.coins = new CoinsView(assets.env, stage.scene, this.glowTex);
    this.showcase = new Showcase(assets);
    const forced = PARAMS.get('map');
    if (forced && forced in MAPS) {
      this.mapId = forced as MapId;
      this.profile.map = forced;
    }
    if (AUTOPLAY || PARAMS.has('play')) {
      this.mode = 'match';
      this.startMatch(profile.hero);
    }
    else this.goHome();
    requestAnimationFrame(this.frame);
    if (PARAMS.has('debug') || AUTOPLAY) (window as unknown as { __bb: Game }).__bb = this;
  }

  // ---------------------------------------------------------------- setup

  /** Landing page: bots play an attract-mode match behind the menu. */
  private goHome() {
    this.mode = 'home';
    this.paused = false;
    this.mapId = (MAP_ROTATION as string[]).includes(this.profile.map) ? (this.profile.map as MapId) : MAP_ROTATION[0];
    this.startMatch(this.profile.hero, true);
    const lv = levelOf(this.profile.xp);
    this.home?.destroy();
    this.home = new Home({
      coins: this.profile.coins,
      level: lv.level,
      xpFrac: lv.frac,
      hero: this.profile.hero,
      unlocked: this.profile.unlocked,
      lockText: (h) => {
        const u = UNLOCKS.find((x) => x.hero === h);
        const n = u ? u.afterMatches - this.profile.matches : 0;
        return `Unlocks after ${n} more match${n === 1 ? '' : 'es'}`;
      },
      touch: this.touch,
      maps: MAP_ROTATION.map((id) => ({ id, name: MAPS[id].name, blurb: MAPS[id].blurb })),
      map: this.mapId,
    });
    this.home.onMap = (id) => {
      this.sfx.click();
      this.mapId = id as MapId;
      this.profile.map = id;
      saveProfile(this.profile);
      track('map_selected', { map: id });
      this.startMatch(this.profile.hero, true);
    };
    this.home.onHero = (h, locked) => {
      this.showcase.set([{ hero: h, anim: locked ? 'Idle' : 'Cheer', locked, color: HEROES[h].color, height: 0.45 }]);
      this.showcase.screenX = 0;
      this.showcase.screenY = 0.13;
      this.sfx.click();
    };
    this.home.onHero(this.home.hero, !this.profile.unlocked.includes(this.home.hero));
    this.home.onSettings = () => this.setPaused(true);
    this.home.onPlay = (h) => {
      this.sfx.unlock();
      this.sfx.click();
      const trial = !this.profile.unlocked.includes(h);
      track('play_click', { hero: h, trial });
      if (!trial) {
        this.profile.hero = h;
        saveProfile(this.profile);
      }
      this.home?.destroy();
      this.home = null;
      this.showcase.clear();
      this.mode = 'match';
      this.trial = trial;
      this.startMatch(h);
    };
  }

  private startMatch(hero: HeroId, attract = false) {
    const rng = new Rng((Math.random() * 1e9) | 0);
    const names = [...BOT_NAMES].sort(() => rng.next() - 0.5);
    const botHeroes: HeroId[] = HERO_IDS;
    const setups = [{ name: attract ? names[0] : 'You', hero, isBot: attract }];
    const off = rng.int(0, botHeroes.length - 1);
    // spread bots evenly over the roster so every match shows every hero
    for (let i = 1; i < TUNING.match.playersPerMatch; i++) setups.push({ name: names[i], hero: botHeroes[(off + i) % botHeroes.length], isBot: true });
    this.world = new World(setups, { firstMatch: this.firstMatch && !attract, map: this.mapId });
    if (this.firstMatch || attract) this.world.phaseT = 0.6; // no countdown wait in the very first round
    this.brains = this.world.players.filter((p) => p.isBot).map((p) => new BotBrain(p.id, new Rng(rng.int(1, 1e9)), LOCAL));
    this.autoBrain = AUTOPLAY || attract ? new BotBrain(LOCAL, new Rng(5), LOCAL) : null;
    this.sfx.muted = attract || !this.profile.sound;

    // views
    for (const h of this.heroes) this.stage.scene.remove(h.root);
    this.heroes = this.world.players.map((p) => {
      const hv = new HeroView(this.assets.heroes.get(p.hero)!, p, p.id === LOCAL && !attract, PLAYER_COLORS[p.id], this.glowTex);
      this.stage.scene.add(hv.root);
      return hv;
    });
    if (this.island) this.stage.scene.remove(this.island.group);
    this.island = new ArenaView(this.world, this.assets.env, this.stage.scene, this.glowTex);
    this.stage.applyTheme(this.island.theme);
    if (this.bank) {
      this.stage.scene.remove(this.bank.group);
    }
    this.bank = new BankView(this.world, this.assets.env, this.stage.scene, this.glowTex);
    if (!this.powers) this.powers = new PowerView(this.world, this.stage.scene, this.glowTex);
    else this.powers.setWorld(this.world);
    this.slowT = 0;
    this.wellWarnT = 0;
    this.hud?.root.remove();
    this.hud = new Hud(this.world, LOCAL, this.portraits, this.touch, this.input);
    this.hud.onPause = () => this.togglePause();
    this.hud.root.classList.toggle('menu', attract);
    this.hud.attract = attract;
    this.rig.zoomTarget = 0;
    const me = this.world.players[LOCAL];
    this.rig.snap(this.v.set(me.x, 0, me.z));
    this.tut = this.firstMatch && !attract ? 'move' : 'done';
    this.tutT = 0;
    this.movedDist = 0;
    this.roundStats = { stolen: 0, steals: 0 };
    this.matchStart = performance.now();
    this.input.enabled = !attract;
    if (!attract) track('match_start', { hero, first: this.firstMatch, trial: this.trial });
  }

  // ---------------------------------------------------------------- loop

  private frame = (nowMs: number) => {
    requestAnimationFrame(this.frame);
    let dt = (nowMs - this.last) / 1000;
    this.last = nowMs;
    if (dt > 0.1) dt = 0.1;
    this.time += dt;
    this.monitorFps(dt);
    if (this.paused) {
      this.stage.render();
      this.showcase.render(this.stage.renderer);
      return;
    }

    // fixed-step simulation (hit-stop freezes it briefly)
    const step = TUNING.sim.dt;
    if (this.hitStop > 0) this.hitStop -= dt;
    else {
      let scale = SPEED;
      if (this.slowT > 0) {
        this.slowT -= dt;
        scale *= this.slowScale;
      }
      this.acc += dt * scale;
      let n = 0;
      while (this.acc >= step && n < 6 * SPEED) {
        this.acc -= step;
        n++;
        const inputs: Input[] = new Array(this.world.players.length).fill(NO_INPUT);
        inputs[LOCAL] = this.autoBrain ? this.autoBrain.update(this.world, step) : this.input.read();
        for (const b of this.brains) inputs[b.id] = b.update(this.world, step);
        const prevRound = this.world.round;
        this.world.tick(step, inputs);
        if (this.world.round !== prevRound) this.brains.forEach((b) => b.newRound());
        if (this.world.round !== prevRound) this.autoBrain?.newRound();
        for (const e of this.world.events) this.onEvent(e);
        if (this.hitStop > 0) {
          this.acc = 0;
          break;
        }
      }
    }

    // views
    const frozen = this.hitStop > 0;
    const adt = this.slowT > 0 ? dt * this.slowScale : dt;
    for (const h of this.heroes) {
      if (h.update(adt, this.time, frozen)) this.fx.dust(h.player.x, h.player.z);
    }
    this.powers?.update(this.time);
    // trails: speed boots (yellow streaks), sticky fingers (pink sparkles), magnet (red bits)
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.05;
      for (const p of this.world.players) {
        if (p.state === 'falling') continue;
        if (p.speedT > 0 && Math.hypot(p.vx, p.vz) > 2) this.fx.emit(p.x, 0.5, p.z, { n: 2, color: ['#ffd23f', '#fff6b0'], speed: 0.3, up: 0.5, life: 0.4, size: 0.45 });
        if (p.stickyT > 0) this.fx.emit(p.x, 1.1, p.z, { n: 2, color: ['#ff5fd2', '#ffb3ec'], speed: 0.8, up: 1.2, life: 0.5, size: 0.3, spread: 0.7 });
        if (p.magnetT > 0) this.fx.emit(p.x, 0.4, p.z, { n: 1, color: ['#ff5f7a'], speed: 3.5, up: 0.2, life: 0.4, size: 0.25 });
      }
      // the well bubbles before a jackpot
      const J = this.world.map.jackpot;
      if (this.wellWarnT > 0) this.fx.emit(J.x, 1.6, J.z, { n: 4, color: ['#7ff3ff', '#ffffff', '#ffe27a'], speed: 1.2, up: 5, life: 0.7, size: 0.4, gravity: 6, spread: 0.8 });
    }
    if (this.wellWarnT > 0) this.wellWarnT -= dt;
    this.island.focus = this.mode === 'match' ? this.v.set(this.world.players[LOCAL].x, 0, this.world.players[LOCAL].z).clone() : null;
    this.island.update(dt, this.time);
    this.coins.update(this.world, dt, this.time);
    this.bank.update(dt, this.time);
    this.fx.update(dt);
    const me = this.world.players[LOCAL];
    let focus = this.v.set(me.x, 0, me.z);
    if (this.world.phase === 'matchEnd') {
      const w = this.world.players[this.world.ranking()[0]];
      focus = this.v.set(w.x, 0, w.z);
    }
    this.lead.set(me.vx, 0, me.vz);
    if (this.mode === 'home') {
      // slow orbit over the island while bots play
      const a = this.time * 0.07;
      const cam = this.stage.camera;
      cam.position.set(Math.sin(a) * 23, 15, Math.cos(a) * 23);
      cam.lookAt(0, -2.5, 0);
      focus = this.v.set(0, 0, 0);
      if (this.world.phase === 'matchEnd') this.startMatch(this.profile.hero, true);
    } else this.rig.update(dt, focus, this.lead);
    // keep the shadow camera on the action
    this.stage.aimSun(focus.x, focus.z);
    this.hud.update(this.world, this.stage.camera, LOCAL, this.time);
    if (this.mode === 'match') {
      this.tutorial(dt);
      this.bankTicks(dt);
    }
    this.showcase.update(dt);
    this.stage.render();
    this.showcase.render(this.stage.renderer);
    if (this.showcase.active && this.mode === 'match') this.hud.placePodium(this.showcase.labelPoints());
  };

  private monitorFps(dt: number) {
    this.fpsFrames++;
    this.fpsT += dt;
    if (this.fpsT < 2) return;
    const fps = this.fpsFrames / this.fpsT;
    this.fpsFrames = 0;
    this.fpsT = 0;
    if (new URLSearchParams(location.search).has('fps')) this.hud.fps = `${fps.toFixed(0)} fps · ${this.stage.quality}`;
    if (!this.autoQuality || this.paused) return;
    const q = this.stage.quality;
    const tooSlow = (q === 'high' && fps < 45) || (q === 'medium' && fps < 34);
    this.lowFpsStreak = tooSlow ? this.lowFpsStreak + 1 : 0;
    if (this.lowFpsStreak >= 2) {
      this.lowFpsStreak = 0;
      this.stage.setQuality(q === 'high' ? 'medium' : 'low');
    }
  }

  // ---------------------------------------------------------------- events → feel

  private pos(id: number, y = 1.2) {
    const p = this.world.players[id];
    return new THREE.Vector3(p.x, p.y + y, p.z);
  }

  /** Brief slow motion for big moments (offline only — the sim just runs slower). */
  private slowMo(scale: number, dur: number) {
    this.slowScale = scale;
    this.slowT = dur;
  }

  private who(id: number) {
    return id === LOCAL ? '<span class="me">You</span>' : `<b>${this.world.players[id].name}</b>`;
  }

  private onEvent(e: SimEvent) {
    // attract mode behind the landing page: animations and effects only, no HUD moments
    if (this.mode === 'home' && ['countdown', 'roundStart', 'roundEnd', 'matchEnd', 'finale', 'bankWarn', 'fall', 'stun'].includes(e.t)) {
      if (e.t === 'bankWarn') this.bank.showNext(e.x, e.z);
      return;
    }
    const w = this.world;
    const cam = this.stage.camera;
    const hv = (id: number) => this.heroes[id];
    switch (e.t) {
      case 'pickup':
        if (e.p === LOCAL) {
          if (e.v > 1) {
            this.sfx.golden();
            this.hud.banner(`GOLDEN COIN +${e.v}!`, 'gold', true);
            this.hud.floater(this.pos(e.p, 2.6), cam, `+${e.v}`, 'plus');
          } else this.sfx.pickup();
          if (e.combo > 0 && e.combo % 5 === 0) this.hud.floater(this.pos(e.p, 2.8), cam, `COMBO x${e.combo}!`, 'bank');
        }
        this.fx.sparkle(e.x, 0.6, e.z, e.v > 1 ? '#fff27a' : '#ffe27a', e.v > 1 ? 30 : 5);
        if (e.v > 1) this.fx.pillar(e.x, e.z, '#ffd84a', 6, 0.7, 0.6);
        break;
      case 'grab':
        hv(e.p).oneShot(hv(e.p).grabAnim, this.time, 1.9, 0.45);
        if (!e.hit && e.p === LOCAL) this.sfx.whiff();
        if (e.p === LOCAL && this.grabHintT > 0) {
          this.grabHintT = 0;
          this.hud.hintButton(null);
          this.hud.prompt(null);
        }
        break;
      case 'steal': {
        const from = this.pos(e.from);
        if (e.n > 0) this.coins.fly(from, () => this.pos(e.to, 1.0), e.n, { dur: 0.4, arc: 1.4 });
        if (e.sticky) {
          this.fx.beam(this.pos(e.to, 1.1), from, '#ff5fd2', 0.45);
          if (e.to === LOCAL || e.from === LOCAL) this.slowMo(0.35, 0.25);
          if (e.to === LOCAL) this.rig.punch(5);
        }
        if (e.to === LOCAL) {
          this.sfx.steal();
          this.hud.banner(e.n > 0 ? `STOLEN ${e.n}!` : 'SHOVED!', e.sticky ? 'pink' : 'gold');
          if (e.n > 0) this.roundStats.steals++;
          this.roundStats.stolen += e.n;
        } else if (e.from === LOCAL && e.n > 0) {
          this.sfx.stolenFrom();
          this.hud.banner(`-${e.n} ROBBED!`, 'red', true);
        }
        if (e.n >= 3) this.hud.feed(`${this.who(e.to)} stole ${e.n} from ${this.who(e.from)}`);
        if (e.n > 0) {
          this.hud.floater(this.pos(e.to, 2.6), cam, `+${e.n}`, 'plus');
          this.hud.floater(this.pos(e.from, 2.6), cam, `-${e.n}`, 'minus');
        }
        break;
      }
      case 'hit': {
        const big = e.kind !== 'grab';
        hv(e.victim).flash();
        hv(e.victim).bump(big ? 0.4 : 0.25);
        if (big) hv(e.victim).knockSpin(e.kind === 'bomb' ? 2 : 1);
        if (w.players[e.victim].state !== 'stunned') hv(e.victim).oneShot(Math.random() < 0.5 ? 'Hit_A' : 'Hit_B', this.time, 1.6, 0.4);
        this.hitStop = Math.max(this.hitStop, big ? 0.09 : 0.06);
        if (e.drop > 0) {
          this.fx.coinBurst(e.x, 1.1, e.z, 6 + e.drop * 2);
          this.hud.floater(this.pos(e.victim, 2.6), cam, `-${e.drop}`, 'minus');
        }
        this.fx.emit(e.x, 1.1, e.z, { n: big ? 22 : 10, color: ['#ffffff', '#fff2a8'], speed: big ? 9 : 6, up: 2, life: 0.3, size: big ? 0.6 : 0.4 });
        if (big) this.fx.dust(e.x, e.z, true);
        if (e.kind !== 'grab') this.sfx.hit();
        if (e.victim === LOCAL) {
          this.rig.shake(big ? 0.5 : 0.35);
          if (big) this.hud.flash('#ff3a5a', 0.45);
        }
        // the local player landing a big hit gets a beat of slow motion
        if (big && (e.by === LOCAL || e.victim === LOCAL)) this.slowMo(0.32, 0.3);
        break;
      }
      case 'dash':
        hv(e.p).oneShot('Dodge_Forward', this.time, 1.8, 0.35);
        hv(e.p).bump(-0.2);
        this.fx.dust(w.players[e.p].x, w.players[e.p].z, true);
        if (e.p === LOCAL) this.sfx.dash();
        break;
      case 'skill': {
        const h = hv(e.p);
        const P = w.players[e.p];
        h.oneShot(h.abilityAnim, this.time, e.ability === 'groundSlam' ? 1.5 : 1.4, 0.7);
        const color = HEROES[P.hero].color;
        // wind-up: glow gathers under the caster
        this.fx.ring(P.x, P.z, color, 0.4, 0.3, 2.2);
        this.fx.sparkle(P.x, 1.2, P.z, color, 18);
        if (e.ability === 'groundSlam') {
          h.jump(1.5, TUNING.abilities.groundSlam.castDelay);
          this.sfx.whoosh();
        } else this.sfx.charge();
        if (e.ability === 'stickyFingers') {
          this.sfx.sticky();
          this.fx.dome(P.x, P.z, '#ff5fd2', 1.6, 0.4);
          this.fx.emit(P.x, 1.2, P.z, { n: 30, color: ['#ff5fd2', '#ffb3ec', '#ffffff'], speed: 3, up: 3, life: 0.7, size: 0.35, spread: 0.8 });
        }
        if (e.p === LOCAL) {
          track('skill_used', { ability: e.ability });
          this.skillHintT = 0;
          this.hud.hintButton(null);
          this.hud.skillBanner(HEROES[P.hero].abilityName.toUpperCase() + '!', color);
          this.rig.punch(3);
        }
        break;
      }
      case 'skillFire': {
        const local = e.p === LOCAL;
        if (e.ability === 'rattleBurst') {
          const c = TUNING.abilities.rattleBurst;
          this.fx.dome(e.x, e.z, '#cfefff', c.radius + 0.4, 0.45);
          this.fx.ring(e.x, e.z, '#ffffff', c.radius, 0.3);
          this.fx.ring(e.x, e.z, '#7fe3ff', c.radius * 1.25, 0.55);
          this.fx.debris(e.x, 1.1, e.z, 22, ['#f4efe2', '#e2d8c2', '#cdbf9f'], 11, 7, 1.1);
          this.fx.emit(e.x, 1, e.z, { n: 40, color: ['#ffffff', '#bfefff'], speed: 12, up: 2, life: 0.35, size: 0.5 });
          this.fx.crack(e.x, e.z, 5);
          this.sfx.burst();
          this.rig.shake(local ? 0.45 : 0.15);
          if (local) {
            this.rig.punch(7);
            this.hud.flash('#7fe3ff', 0.5);
          }
        } else if (e.ability === 'groundSlam') {
          const c = TUNING.abilities.groundSlam;
          this.fx.cone(e.x, e.z, e.facing, c.range, c.coneDeg, '#ffb03a');
          const fx = e.x + Math.sin(e.facing) * 1.6;
          const fz = e.z + Math.cos(e.facing) * 1.6;
          this.fx.crack(fx, fz, 5.5, e.facing);
          this.fx.crack(e.x, e.z, 3);
          this.fx.debris(fx, 0.3, fz, 26, ['#9a8a7a', '#b49a72', '#7d6b5a', '#6fbb40'], 7, 12, 1.4);
          this.fx.emit(fx, 0.3, fz, { n: 34, color: ['#b48a5a', '#e0c08a', '#ffffff'], speed: 7, up: 8, life: 0.7, size: 0.5, gravity: 18 });
          this.fx.dust(fx, fz, true);
          this.fx.dust(e.x, e.z, true);
          this.fx.ring(fx, fz, '#ffcf6a', 3.2, 0.45, 0.5);
          this.sfx.slam();
          this.rig.shake(local ? 0.7 : 0.2);
          if (local) {
            this.rig.punch(8);
            this.hud.flash('#ffb03a', 0.5);
          }
        }
        if (local && e.hits >= 2) this.hud.banner(e.ability === 'groundSlam' ? `STUNNED ×${e.hits}!` : `MULTI HIT ×${e.hits}!`, 'gold');
        else if (local && e.hits === 1 && e.ability === 'groundSlam') this.hud.banner('STUNNED!', 'gold', true);
        break;
      }
      case 'powerSpawn':
        this.fx.pillar(e.x, e.z, POWER_INFO[e.kind].color, 7, 0.8, 0.7);
        this.fx.sparkle(e.x, 1, e.z, POWER_INFO[e.kind].color, 16);
        this.sfx.pop();
        break;
      case 'power': {
        const info = POWER_INFO[e.kind];
        this.fx.ring(e.x, e.z, info.color, 2.2, 0.4);
        this.fx.emit(e.x, 1, e.z, { n: 26, color: [info.color, '#ffffff'], speed: 5, up: 4, life: 0.6, size: 0.4 });
        this.sfx.pop();
        if (e.p === LOCAL) {
          this.sfx.power();
          this.hud.banner(info.name + '!', 'teal', true);
          this.hud.flash(info.color, 0.3);
        } else this.hud.feed(`${this.who(e.p)} got <b>${info.name}</b>`);
        break;
      }
      case 'shieldBlock':
        this.fx.dome(w.players[e.p].x, w.players[e.p].z, '#5ff0ff', 1.8, 0.35);
        this.fx.emit(w.players[e.p].x, 1, w.players[e.p].z, { n: 24, color: ['#5ff0ff', '#ffffff'], speed: 6, up: 3, life: 0.4, size: 0.4 });
        this.sfx.shieldBlock();
        if (e.p === LOCAL) this.hud.banner('BLOCKED!', 'teal', true);
        break;
      case 'bombPlant':
        this.sfx.fuse();
        if (e.owner === LOCAL) this.hud.banner('BOMB PLANTED! Run!', 'gold', true);
        break;
      case 'bombBoom': {
        const R = TUNING.powerups.bomb.radius;
        this.fx.dome(e.x, e.z, '#ffb03a', R, 0.4);
        this.fx.ring(e.x, e.z, '#fff0a0', R * 1.2, 0.5);
        this.fx.emit(e.x, 0.8, e.z, { n: 60, color: ['#ffd23f', '#ff8a3d', '#ff4a3d', '#ffffff'], speed: 10, up: 7, life: 0.6, size: 0.8, gravity: 4 });
        this.fx.emit(e.x, 1.2, e.z, { n: 20, color: ['#5a4a6a', '#3a3048'], speed: 3, up: 5, life: 1.2, size: 1.4, drag: 3 });
        this.fx.debris(e.x, 0.6, e.z, 16, ['#2a2440', '#ff8a3d', '#8a8aa0'], 9, 9, 0.9);
        this.fx.crack(e.x, e.z, 5);
        this.sfx.boom();
        const d = Math.hypot(w.players[LOCAL].x - e.x, w.players[LOCAL].z - e.z);
        this.rig.shake(d < 8 ? 0.7 : 0.25);
        if (d < 8) this.hud.flash('#ffb03a', 0.45);
        if (e.owner === LOCAL && e.hits > 0) {
          this.hud.banner(e.hits > 1 ? `BOOM ×${e.hits}!` : 'BOOM!', 'gold');
          this.slowMo(0.3, 0.35);
        }
        break;
      }
      case 'jackpotWarn':
        this.wellWarnT = TUNING.jackpot.warn;
        this.sfx.jackpotWarn();
        if (this.mode === 'match') this.hud.banner(`${this.world.map.jackpot.name.toUpperCase()} IS BUBBLING…`, 'teal', true);
        break;
      case 'jackpot': {
        this.wellWarnT = 0;
        const J = w.map.jackpot;
        this.fx.pillar(J.x, J.z, '#ffd84a', 14, 1.2, 1.3);
        this.fx.dome(J.x, J.z, '#ffe27a', 3, 0.5);
        this.fx.emit(J.x, 2.2, J.z, { n: 60, color: ['#7ff3ff', '#ffffff', '#ffe27a'], speed: 4, up: 12, life: 1, size: 0.5, gravity: 14 });
        this.sfx.jackpot();
        this.rig.shake(0.2);
        if (this.mode === 'match') {
          this.hud.skillBanner('JACKPOT!', '#ffd84a');
          this.hud.feed(`The ${w.map.jackpot.name} erupted <b>${e.n + 1} coins</b> + a golden one!`);
        }
        break;
      }
      case 'stun':
        if (e.p === LOCAL) {
          this.hud.banner('STUNNED!', 'red', true);
          this.sfx.stun();
        }
        break;
      case 'bankProgress':
        if (e.p === LOCAL) this.bankTickT = 0;
        break;
      case 'bank': {
        const from = this.pos(e.p, 1.0);
        this.coins.fly(from, () => this.bank.pos, e.n, { dur: TUNING.bank.flySeconds, arc: 2.2, spread: 0.6 });
        this.bank.onBanked();
        this.fx.ring(e.x, e.z, '#7ff3ff', 3, 0.5, 1.5);
        this.fx.sparkle(e.x, 2, e.z, ['#7ff3ff', '#ffe27a'] as unknown as string, 30);
        this.hud.floater(this.v.set(e.x, 3.6, e.z), cam, `+${e.n}`, 'bank');
        if (e.n >= 10) this.hud.feed(`${this.who(e.p)} banked ${e.n}!`);
        if (e.p === LOCAL) {
          this.sfx.bank(e.n);
          this.hud.banner(`BANKED ${e.n}!`, 'teal');
          if (this.tut === 'bank' || this.tut === 'coins') this.tutAdvance('done');
        }
        break;
      }
      case 'fall':
        this.sfx.fall();
        this.hud.feed(`${this.who(e.p)} fell off${e.lost > 0 ? ` (−${e.lost})` : ''}`);
        if (e.p === LOCAL) {
          this.hud.banner(e.lost > 0 ? `FELL! -${e.lost}` : 'FELL OFF!', 'red', true);
          this.rig.shake(0.3);
        }
        break;
      case 'respawn':
        this.fx.ring(w.players[e.p].x, w.players[e.p].z, '#ffffff', 1.6, 0.4);
        hv(e.p).bump(0.3);
        break;
      case 'bounce':
        hv(e.p).bump(0.4);
        this.sfx.bounce();
        this.fx.ring(w.players[e.p].x, w.players[e.p].z, '#ffd23f', 2, 0.35);
        break;
      case 'land':
        hv(e.p).bump(0.35);
        this.fx.dust(w.players[e.p].x, w.players[e.p].z, true);
        if (e.p === LOCAL) this.sfx.land();
        break;
      case 'wave':
        this.sfx.wave();
        break;
      case 'bankWarn':
        this.bank.showNext(e.x, e.z);
        this.hud.banner('BANK MOVING!', 'teal', true);
        this.sfx.warn();
        break;
      case 'bankMove':
        this.fx.ring(e.x, e.z, '#7ff3ff', 3.2, 0.6, 0.5);
        break;
      case 'finale':
        this.hud.banner('FINAL 15 SECONDS!', 'red');
        setTimeout(() => this.hud.banner('Scores hidden · coins ×2', 'gold', true), 1100);
        this.sfx.rumble();
        this.rig.shake(0.2);
        break;
      case 'tilesFall':
        this.sfx.rumble();
        this.rig.shake(0.12);
        break;
      case 'countdown':
        if (e.n === Math.ceil(TUNING.match.countdownSeconds)) this.hud.closePanel();
        this.hud.countdown(e.n);
        this.sfx.count();
        break;
      case 'roundStart':
        this.hud.countdown('GO!');
        this.sfx.count(true);
        this.hud.closePanel();
        this.heroes.forEach((h) => (h.celebrating = false));
        this.roundStats = { stolen: 0, steals: 0 };
        break;
      case 'roundEnd':
        this.onRoundEnd(e);
        break;
      case 'matchEnd':
        this.onMatchEnd(e.ranking);
        break;
    }
  }

  private onRoundEnd(e: Extract<SimEvent, { t: 'roundEnd' }>) {
    const me = this.world.players[LOCAL];
    const won = e.winner === LOCAL;
    const lost = e.lost.find((l) => l.p === LOCAL)?.n ?? 0;
    for (const l of e.lost) {
      const p = this.world.players[l.p];
      this.fx.coinBurst(p.x, 1.2, p.z, 8);
    }
    this.heroes[e.winner].celebrating = true;
    let reward = 0;
    if (won && this.firstMatch && e.round === 1) {
      reward = TUNING.rewards.firstRoundWinCoins;
      this.profile.coins += reward;
      saveProfile(this.profile);
    }
    if (won) {
      this.sfx.win();
      this.fx.confetti(me.x, 2.5, me.z, 140);
      this.hud.banner('ROUND WON!', 'gold');
    } else this.sfx.lose();
    this.hud.prompt(null);
    this.hud.hintButton(null);
    this.tut = 'done';
    track('round_end', { round: e.round, banked: me.bankedRound, stolen: this.roundStats.stolen, steals: this.roundStats.steals, won, lostUnbanked: lost });
    setTimeout(() => {
      if (this.world.phase === 'roundEnd') this.hud.showRoundEnd(this.world, LOCAL, e.winner, lost, reward);
    }, 900);
  }

  private onMatchEnd(ranking: number[]) {
    const rank = ranking.indexOf(LOCAL) + 1;
    const me = this.world.players[LOCAL];
    this.hud.closePanel();
    this.heroes.forEach((h) => (h.celebrating = false));
    this.heroes[ranking[0]].celebrating = true;
    this.input.enabled = false;
    if (rank === 1) {
      this.fx.confetti(me.x, 3, me.z, 200);
      this.sfx.win();
    }
    if (this.mode === 'home') return;
    this.profile.matches++;
    const coinsWon = 20 + Math.round(me.bankedTotal / 4) + (rank === 1 ? 50 : 0);
    const xpWon = 40 + me.bankedTotal + (rank === 1 ? 60 : 0);
    const before = levelOf(this.profile.xp);
    this.profile.coins += coinsWon;
    this.profile.xp += xpWon;
    const after = levelOf(this.profile.xp);
    let unlocked: HeroId | null = null;
    for (const u of UNLOCKS) {
      if (this.profile.matches >= u.afterMatches && !this.profile.unlocked.includes(u.hero)) {
        this.profile.unlocked.push(u.hero);
        unlocked = u.hero;
      }
    }
    this.profile.lastSeen = new Date().toISOString().slice(0, 10);
    saveProfile(this.profile);
    track('match_end', { rank, banked: me.bankedTotal, seconds: Math.round((performance.now() - this.matchStart) / 1000) });
    setTimeout(() => {
      // 3D podium: 2nd · 1st · 3rd
      const top = ranking.slice(0, 3).map((id) => this.world.players[id]);
      const order = [top[1], top[0], top[2]].filter(Boolean);
      this.showcase.set(
        order.map((p) => ({
          hero: p.hero,
          anim: p === top[0] ? 'Cheer' : 'Idle',
          color: PLAYER_COLORS[p.id],
          height: p === top[0] ? 1.0 : p === top[1] ? 0.65 : 0.4,
        })),
      );
      this.showcase.screenX = this.touch && innerWidth < 900 ? -0.5 : -0.42;
      this.showcase.screenY = -0.12;
      this.hud.showResults(this.world, LOCAL, {
        podium: order.map((p) => ({ name: p.id === LOCAL ? 'You' : p.name, place: ranking.indexOf(p.id) + 1 })),
        unlocked,
        coinsWon,
        xpWon,
        level: after.level,
        levelUp: after.level > before.level,
        xpFrac: after.frac,
        trial: this.trial ? this.world.players[LOCAL].hero : null,
        onRematch: () => {
          this.sfx.click();
          track('rematch_click', { hero: this.world.players[LOCAL].hero });
          this.firstMatch = false;
          this.showcase.clear();
          this.hud.closePanel();
          this.startMatch(this.trial ? this.profile.hero : this.world.players[LOCAL].hero);
          this.trial = false;
        },
        onHome: () => {
          this.sfx.click();
          this.firstMatch = false;
          this.trial = false;
          this.showcase.clear();
          this.hud.closePanel();
          this.goHome();
        },
      });
    }, 1600);
  }

  // ---------------------------------------------------------------- tutorial

  private tutAdvance(s: TutStep) {
    this.tut = s;
    this.tutT = 0;
    const key = (k: string) => `<span class="key">${k}</span>`;
    if (s === 'move') this.hud.prompt(this.touch ? 'Drag on the left to MOVE' : `${key('W')}${key('A')}${key('S')}${key('D')} to move`);
    else if (s === 'coins') this.hud.prompt('Grab the coins!');
    else if (s === 'bank') this.hud.prompt('Bank it! Stand in the <i class="bub-ico"></i> bubble');
    else this.hud.prompt(null);
  }

  private tutorial(dt: number) {
    const w = this.world;
    const me = w.players[LOCAL];
    if (w.phase !== 'playing') return;
    this.tutT += dt;
    if (this.tut === 'move') {
      if (this.tutT < dt * 1.5) this.tutAdvance('move');
      this.movedDist += Math.hypot(me.vx, me.vz) * dt;
      if (this.movedDist > 2.5) this.tutAdvance('coins');
    } else if (this.tut === 'coins') {
      if (me.carried >= 5) this.tutAdvance('bank');
    } else if (this.tut === 'bank') {
      if (me.carried === 0 && this.tutT > 4) this.tutAdvance('coins');
    }

    // skill hint: first time a rival is within range and the skill is ready
    if (!this.skillHintShown && me.skillCd <= 0 && this.firstMatch) {
      const range = HEROES[me.hero].ability === 'groundSlam' ? 3.2 : 2.8;
      const near = w.players.some((o) => o.id !== LOCAL && o.state !== 'falling' && Math.hypot(o.x - me.x, o.z - me.z) < range);
      if (near && w.roundTime > 6) {
        this.skillHintShown = true;
        this.skillHintT = 5;
        this.hud.hintButton('skill');
      }
    }
    if (this.skillHintT > 0) {
      this.skillHintT -= dt;
      if (this.skillHintT <= 0) this.hud.hintButton(null);
    }
    // grab hint: a rival carrying coins is right next to you
    if (!this.grabHintShown && this.firstMatch && me.grabCd <= 0 && this.skillHintT <= 0) {
      const rich = w.players.find((o) => o.id !== LOCAL && o.carried >= 3 && Math.hypot(o.x - me.x, o.z - me.z) < 2.6);
      if (rich && w.roundTime > 10) {
        this.grabHintShown = true;
        this.grabHintT = 4;
        this.hud.hintButton('grab');
        this.hud.prompt(this.touch ? 'They have coins! Tap GRAB to steal' : 'They have coins! Press <span class="key">J</span> to steal');
      }
    }
    if (this.grabHintT > 0) {
      this.grabHintT -= dt;
      if (this.grabHintT <= 0) {
        this.hud.hintButton(null);
        this.tutAdvance(this.tut);
      }
    }
  }

  private bankTicks(dt: number) {
    const me = this.world.players[LOCAL];
    if (me.bankT <= 0) return;
    this.bankTickT -= dt;
    if (this.bankTickT <= 0) {
      this.bankTickT = 0.25;
      this.sfx.bankTick(me.bankT / TUNING.bank.bankSeconds);
    }
  }

  // ---------------------------------------------------------------- pause

  private togglePause() {
    if (this.world.phase === 'matchEnd' && this.mode === 'match') return;
    this.setPaused(!this.paused);
  }

  private setPaused(p: boolean) {
    this.paused = p;
    // the landing UI sits above the HUD layer: hide it while the settings panel is open
    this.home?.show(!p);
    if (p) {
      this.hud.showPause(
        {
          sound: this.profile.sound,
          shake: this.profile.shake,
          quality: this.autoQuality ? `auto (${this.stage.quality})` : this.stage.quality,
          inMatch: this.mode === 'match',
          canUnlockAll: (!!import.meta.env.VITE_PACKED || PARAMS.has('dev')) && this.mode === 'home' && HERO_IDS.some((h) => !this.profile.unlocked.includes(h)),
        },
        {
          resume: () => this.setPaused(false),
          home: () => {
            this.sfx.click();
            track('quit_match', { round: this.world.round });
            this.paused = false;
            this.hud.closePanel();
            this.firstMatch = false;
            this.trial = false;
            this.goHome();
          },
          toggle: (k) => {
            this.profile[k] = !this.profile[k];
            this.sfx.muted = !this.profile.sound;
            this.rig.shakeEnabled = this.profile.shake;
            saveProfile(this.profile);
            this.setPaused(true);
          },
          unlockAll: () => {
            this.sfx.click();
            this.profile.unlocked = [...HERO_IDS];
            saveProfile(this.profile);
            track('unlock_all_playtest');
            this.paused = false;
            this.hud.closePanel();
            this.goHome();
          },
          quality: () => {
            const order: Quality[] = ['low', 'medium', 'high'];
            const next = order[(order.indexOf(this.stage.quality) + 1) % 3];
            this.autoQuality = false;
            this.profile.quality = next;
            saveProfile(this.profile);
            this.stage.setQuality(next);
            this.setPaused(true);
          },
        },
      );
    } else {
      this.hud.closePanel();
      this.last = performance.now();
    }
  }
}

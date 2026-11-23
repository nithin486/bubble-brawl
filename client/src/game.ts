import * as THREE from 'three';
import { World } from '../../shared/sim/world.ts';
import { BotBrain } from '../../shared/sim/bots.ts';
import { Rng } from '../../shared/sim/math.ts';
import { NO_INPUT, type Input, type SimEvent } from '../../shared/sim/types.ts';
import { TUNING } from '../../shared/config/tuning.ts';
import { HEROES, HERO_IDS, type HeroId } from '../../shared/config/heroes.ts';
import { Stage, isTouch, type Quality } from './render/stage.ts';
import type { Assets } from './render/assets.ts';
import { IslandView } from './render/island.ts';
import { HeroView } from './render/hero.ts';
import { CoinsView } from './render/coins.ts';
import { BankView } from './render/bank.ts';
import { Fx, makeGlowTexture } from './render/fx.ts';
import { CameraRig } from './camera.ts';
import { InputManager } from './input.ts';
import { Hud, PLAYER_COLORS } from './ui/hud.ts';
import { Sfx } from './audio.ts';
import { track } from './analytics.ts';
import { saveProfile, type Profile } from './save.ts';

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
  private island!: IslandView;
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
      if (document.hidden && this.world?.phase === 'playing') this.setPaused(true);
    });
    this.rig = new CameraRig(stage.camera);
    this.rig.shakeEnabled = profile.shake;
    this.sfx.muted = !profile.sound;
    this.fx = new Fx(stage.scene, this.glowTex);
    this.coins = new CoinsView(assets.env, stage.scene, this.glowTex);
    this.startMatch(profile.hero);
    requestAnimationFrame(this.frame);
    if (PARAMS.has('debug') || AUTOPLAY) (window as unknown as { __bb: Game }).__bb = this;
  }

  // ---------------------------------------------------------------- setup

  private startMatch(hero: HeroId) {
    const rng = new Rng((Math.random() * 1e9) | 0);
    const names = [...BOT_NAMES].sort(() => rng.next() - 0.5);
    const botHeroes: HeroId[] = HERO_IDS;
    const setups = [{ name: 'You', hero, isBot: false }];
    const off = rng.int(0, botHeroes.length - 1);
    // spread bots evenly over the roster so every match shows every hero
    for (let i = 1; i < TUNING.match.playersPerMatch; i++) setups.push({ name: names[i], hero: botHeroes[(off + i) % botHeroes.length], isBot: true });
    this.world = new World(setups, { firstMatch: this.firstMatch });
    if (this.firstMatch) this.world.phaseT = 0.6; // no countdown wait in the very first round
    this.brains = this.world.players.filter((p) => p.isBot).map((p) => new BotBrain(p.id, new Rng(rng.int(1, 1e9)), LOCAL));
    this.autoBrain = AUTOPLAY ? new BotBrain(LOCAL, new Rng(5), LOCAL) : null;

    // views
    for (const h of this.heroes) this.stage.scene.remove(h.root);
    this.heroes = this.world.players.map((p) => {
      const hv = new HeroView(this.assets.heroes.get(p.hero)!, p, p.id === LOCAL, PLAYER_COLORS[p.id], this.glowTex);
      this.stage.scene.add(hv.root);
      return hv;
    });
    if (this.island) this.stage.scene.remove(this.island.group);
    this.island = new IslandView(this.world, this.assets.env, this.stage.scene);
    if (this.bank) {
      this.stage.scene.remove(this.bank.group);
    }
    this.bank = new BankView(this.world, this.assets.env, this.stage.scene, this.glowTex);
    this.hud?.root.remove();
    this.hud = new Hud(this.world, LOCAL, this.portraits, this.touch, this.input);
    this.hud.onPause = () => this.togglePause();
    this.rig.zoomTarget = 0;
    const me = this.world.players[LOCAL];
    this.rig.snap(this.v.set(me.x, 0, me.z));
    this.tut = this.firstMatch ? 'move' : 'done';
    this.tutT = 0;
    this.movedDist = 0;
    this.roundStats = { stolen: 0, steals: 0 };
    this.matchStart = performance.now();
    this.input.enabled = true;
    track('match_start', { hero, first: this.firstMatch });
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
      return;
    }

    // fixed-step simulation (hit-stop freezes it briefly)
    const step = TUNING.sim.dt;
    if (this.hitStop > 0) this.hitStop -= dt;
    else {
      this.acc += dt * SPEED;
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
    for (const h of this.heroes) {
      if (h.update(dt, this.time, frozen)) this.fx.dust(h.player.x, h.player.z);
    }
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
    this.rig.update(dt, focus, this.lead);
    // keep the shadow camera on the action
    this.stage.sun.position.set(focus.x - 12, 26, focus.z + 14);
    this.stage.sun.target.position.set(focus.x, 0, focus.z);
    this.hud.update(this.world, this.stage.camera, LOCAL, this.time);
    this.tutorial(dt);
    this.bankTicks(dt);
    this.stage.render();
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

  private onEvent(e: SimEvent) {
    const w = this.world;
    const cam = this.stage.camera;
    const hv = (id: number) => this.heroes[id];
    switch (e.t) {
      case 'pickup':
        if (e.p === LOCAL) this.sfx.pickup();
        this.fx.sparkle(e.x, 0.6, e.z, '#ffe27a', 5);
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
        if (e.to === LOCAL) {
          this.sfx.steal();
          this.hud.banner(e.n > 0 ? `STOLEN ${e.n}!` : 'SHOVED!', e.sticky ? 'pink' : 'gold');
          if (e.n > 0) this.roundStats.steals++;
          this.roundStats.stolen += e.n;
        } else if (e.from === LOCAL && e.n > 0) {
          this.sfx.stolenFrom();
          this.hud.banner(`-${e.n} ROBBED!`, 'red', true);
        }
        if (e.n > 0) {
          this.hud.floater(this.pos(e.to, 2.6), cam, `+${e.n}`, 'plus');
          this.hud.floater(this.pos(e.from, 2.6), cam, `-${e.n}`, 'minus');
        }
        break;
      }
      case 'hit': {
        hv(e.victim).flash();
        hv(e.victim).bump(0.25);
        if (w.players[e.victim].state !== 'stunned') hv(e.victim).oneShot(Math.random() < 0.5 ? 'Hit_A' : 'Hit_B', this.time, 1.6, 0.4);
        this.hitStop = Math.max(this.hitStop, 0.06);
        if (e.drop > 0) {
          this.fx.coinBurst(e.x, 1.1, e.z, 6 + e.drop * 2);
          this.hud.floater(this.pos(e.victim, 2.6), cam, `-${e.drop}`, 'minus');
        }
        this.fx.emit(e.x, 1.1, e.z, { n: 10, color: ['#ffffff', '#fff2a8'], speed: 6, up: 2, life: 0.25, size: 0.4 });
        if (e.kind !== 'grab') this.sfx.hit();
        if (e.victim === LOCAL) this.rig.shake(0.35);
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
        h.oneShot(h.abilityAnim, this.time, e.ability === 'groundSlam' ? 1.5 : 1.4, 0.7);
        if (e.ability === 'stickyFingers') {
          this.sfx.sticky();
          this.fx.sparkle(w.players[e.p].x, 1.2, w.players[e.p].z, '#ff5fd2', 20);
        }
        if (e.p === LOCAL) {
          track('skill_used', { ability: e.ability });
          this.skillHintT = 0;
          this.hud.hintButton(null);
          if (e.ability === 'stickyFingers') this.hud.banner('STICKY FINGERS!', 'pink', true);
        }
        break;
      }
      case 'skillFire':
        if (e.ability === 'rattleBurst') {
          const c = TUNING.abilities.rattleBurst;
          this.fx.ring(e.x, e.z, '#e8f6ff', c.radius, 0.35);
          this.fx.ring(e.x, e.z, '#7fe3ff', c.radius * 1.15, 0.5);
          this.fx.emit(e.x, 1, e.z, { n: 30, color: ['#f4f0e6', '#d8d0c0'], speed: 9, up: 3, life: 0.4, size: 0.35, gravity: 8 });
          this.sfx.burst();
          if (e.p === LOCAL) this.rig.shake(0.25);
        } else if (e.ability === 'groundSlam') {
          const c = TUNING.abilities.groundSlam;
          this.fx.cone(e.x, e.z, e.facing, c.range, c.coneDeg, '#ffb03a');
          const fx = e.x + Math.sin(e.facing) * 1.2;
          const fz = e.z + Math.cos(e.facing) * 1.2;
          this.fx.emit(fx, 0.3, fz, { n: 26, color: ['#b48a5a', '#e0c08a', '#ffffff'], speed: 6, up: 7, life: 0.6, size: 0.4, gravity: 18 });
          this.fx.dust(fx, fz, true);
          this.sfx.slam();
          this.rig.shake(e.p === LOCAL ? 0.45 : 0.15);
        }
        if (e.p === LOCAL && e.hits >= 2) this.hud.banner(e.ability === 'groundSlam' ? `STUNNED ×${e.hits}!` : `MULTI HIT ×${e.hits}!`, 'gold');
        else if (e.p === LOCAL && e.hits === 1 && e.ability === 'groundSlam') this.hud.banner('STUNNED!', 'gold', true);
        break;
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
        if (e.p === LOCAL) {
          this.sfx.bank(e.n);
          this.hud.banner(`BANKED ${e.n}!`, 'teal');
          if (this.tut === 'bank' || this.tut === 'coins') this.tutAdvance('done');
        }
        break;
      }
      case 'fall':
        this.sfx.fall();
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
    this.rig.zoomTarget = 1;
    this.input.enabled = false;
    if (rank === 1) {
      this.fx.confetti(me.x, 3, me.z, 200);
      this.sfx.win();
    }
    this.profile.matches++;
    this.profile.coins += 20 + Math.round(me.bankedTotal / 4) + (rank === 1 ? 50 : 0);
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
    const locked: Record<string, string> = {};
    for (const u of UNLOCKS) if (!this.profile.unlocked.includes(u.hero)) locked[u.hero] = `Play ${u.afterMatches - this.profile.matches} more`;
    setTimeout(() => {
      this.hud.showResults(this.world, LOCAL, {
        unlocked,
        heroes: HERO_IDS,
        locked,
        selected: unlocked ?? this.profile.hero,
        coins: this.profile.coins,
        onRematch: (h) => {
          this.sfx.click();
          track('rematch_click', { hero: h });
          if (h !== this.profile.hero) track('hero_selected', { hero: h });
          this.profile.hero = h;
          saveProfile(this.profile);
          this.firstMatch = false;
          this.hud.closePanel();
          this.startMatch(h);
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
    if (this.world.phase === 'matchEnd') return;
    this.setPaused(!this.paused);
  }

  private setPaused(p: boolean) {
    this.paused = p;
    if (p) {
      this.hud.showPause(
        {
          sound: this.profile.sound,
          shake: this.profile.shake,
          quality: this.autoQuality ? `auto (${this.stage.quality})` : this.stage.quality,
          hero: this.world.players[LOCAL].hero,
          heroes: HERO_IDS,
          unlocked: this.profile.unlocked,
        },
        {
          resume: () => this.setPaused(false),
          hero: (h) => {
            this.sfx.click();
            track('hero_selected', { hero: h, trial: !this.profile.unlocked.includes(h), from: 'pause' });
            if (this.profile.unlocked.includes(h)) {
              this.profile.hero = h;
              saveProfile(this.profile);
            }
            this.firstMatch = false;
            this.paused = false;
            this.hud.closePanel();
            this.last = performance.now();
            this.startMatch(h);
          },
          toggle: (k) => {
            this.profile[k] = !this.profile[k];
            this.sfx.muted = !this.profile.sound;
            this.rig.shakeEnabled = this.profile.shake;
            saveProfile(this.profile);
            this.setPaused(true);
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

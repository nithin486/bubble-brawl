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
import { Markers } from './render/markers.ts';
import { Room, type StartMsg, MAX_HUMANS } from './net/room.ts';
import { FriendsPanel } from './ui/friends.ts';
import { SnapshotEncoder, applySnapshot, type Snapshot } from '../../shared/sim/snapshot.ts';
import type { Personality } from '../../shared/sim/bots.ts';

/** What bots say, by personality. Short, readable, and they tell you what's going on. */
const LINES: Record<string, Record<Personality, string[]>> = {
  robbedYou: {
    greedy: ['Mine now! 💰', 'Thanks!', 'More for me!'],
    thief: ['Too easy 😜', 'Yoink!', 'Catch me if you can!'],
    coward: ['Sorry!! 😅', 'Don\'t hurt me!', 'Eep!'],
    bully: ['Too slow!', 'Get rekt 😤', 'Ha! Weak!'],
  },
  youRobbed: {
    greedy: ['MY COINS!! 😡', 'Give them back!', 'Noooo!'],
    thief: ['Hey! That\'s my trick!', 'Not cool!', 'Revenge is coming…'],
    coward: ['Help!! 😭', 'Please stop!', 'Why me?!'],
    bully: ['You\'re dead! 😠', 'Big mistake!', 'I\'ll get you!'],
  },
  hunting: {
    greedy: ['Ooh, shiny…', 'Gimme those!', ''],
    thief: ['I see your coins 👀', 'Here I come~', 'Nice coins you got'],
    coward: ['', 'Uh… hi?', ''],
    bully: ['You\'re MINE!', 'Coming for you!', 'Run!! 😈'],
  },
  bankBig: {
    greedy: ['KA-CHING! 🤑', 'Rich rich rich!', 'Jackpot!'],
    thief: ['Safe and sound 😎', 'Banked!', 'Easy money'],
    coward: ['Phew… safe!', 'Banked! 😅', 'Safe now!'],
    bully: ['Bow down! 💪', 'Count it!', 'Too good'],
  },
  crown: {
    greedy: ['I\'m the king! 👑', 'All mine!', ''],
    thief: ['Royal thief 👑', 'Crown suits me', ''],
    coward: ['Uh oh… 👑', 'I don\'t want this!', ''],
    bully: ['BOW TO THE KING 👑', 'Come at me!', ''],
  },
};

const BOT_NAMES = ['Chintu', 'Golu', 'Mango', 'Rocket', 'Bunty', 'Zara', 'Pixel', 'Tiki', 'Momo', 'Laddoo', 'Noodle', 'Bolt', 'Pappu', 'Rani', 'Jelly'];
/** Seat of the player on this device (0 offline; any seat in a friends room). */
let LOCAL = 0;
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
  private markers: Markers | null = null;
  // ---- friends rooms
  private room: Room | null = null;
  private friends: FriendsPanel | null = null;
  /** Host: which room peer sits in each seat ('' = bot / host). */
  private seatPeers: string[] = [];
  private encoder = new SnapshotEncoder();
  private snapT = 0;
  private pending: SimEvent[] = [];
  /** Client: server positions to smooth toward. */
  private targets: { x: number; z: number; y: number }[] = [];
  private sendT = 0;
  private netInput: Input = { ...NO_INPUT };
  /** coins each bot stole from you this match → the top one is your NEMESIS */
  private robbedBy = new Map<number, number>();
  private nemesis = -1;
  private lastSay = new Map<number, number>();
  private lastHunt = new Map<number, number>();
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
    } else this.goHome();
    // invite link: straight into the friend's room
    const invite = PARAMS.get('room');
    if (invite && !AUTOPLAY) setTimeout(() => this.openFriends(invite.toUpperCase().slice(0, 5)), 300);
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
    this.home.onFriends = () => {
      this.sfx.click();
      this.openFriends();
    };
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

  private startMatch(hero: HeroId, attract = false, net?: { start: StartMsg; seat: number }) {
    const rng = new Rng((Math.random() * 1e9) | 0);
    const names = [...BOT_NAMES].sort(() => rng.next() - 0.5);
    const botHeroes: HeroId[] = HERO_IDS;
    let setups = [{ name: attract ? names[0] : 'You', hero, isBot: attract }];
    const off = rng.int(0, botHeroes.length - 1);
    // spread bots evenly over the roster so every match shows every hero
    for (let i = 1; i < TUNING.match.playersPerMatch; i++) setups.push({ name: names[i], hero: botHeroes[(off + i) % botHeroes.length], isBot: true });
    LOCAL = 0;
    if (net) {
      setups = net.start.seats.map((s) => ({ name: s.name, hero: s.hero, isBot: s.isBot }));
      this.mapId = net.start.map;
      LOCAL = net.seat;
      this.firstMatch = false;
    }
    this.world = new World(setups, { firstMatch: this.firstMatch && !attract && !net, map: this.mapId, seed: net?.start.seed });
    if (this.world.players[LOCAL]) this.world.players[LOCAL].name = 'You';
    if ((this.firstMatch || attract) && !net) this.world.phaseT = 0.6; // no countdown wait in the very first round
    // bots: offline every bot seat; in a room only the host runs them (clients never tick the sim)
    const client = this.room && !this.room.isHost && !attract;
    this.brains = client ? [] : this.world.players.filter((p) => p.isBot).map((p) => new BotBrain(p.id, new Rng(rng.int(1, 1e9)), LOCAL));
    this.autoBrain = AUTOPLAY || attract ? new BotBrain(LOCAL, new Rng(5), LOCAL) : null;
    this.seatPeers = net ? net.start.seats.map((s) => (s.isBot ? '' : s.peer)) : [];
    this.encoder = new SnapshotEncoder();
    this.pending = [];
    this.targets = this.world.players.map((p) => ({ x: p.x, z: p.z, y: 0 }));
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
    if (!this.markers) this.markers = new Markers(this.stage.scene, this.assets.env, this.glowTex);
    else this.markers.setWorld();
    this.robbedBy.clear();
    this.nemesis = -1;
    this.lastSay.clear();
    this.lastHunt.clear();
    this.slowT = 0;
    this.wellWarnT = 0;
    this.hud?.root.remove();
    this.hud = new Hud(this.world, LOCAL, this.portraits, this.touch, this.input);
    this.hud.onPause = () => this.togglePause();
    this.hud.onTick = () => this.sfx.tick();
    this.hud.onLand = () => this.sfx.land2();
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
    // a shared match never pauses (the menu still opens, the game keeps running)
    if (this.paused && !this.room) {
      this.stage.render();
      this.showcase.render(this.stage.renderer);
      return;
    }

    // fixed-step simulation (hit-stop freezes it briefly — offline only; a shared match never pauses)
    const step = TUNING.sim.dt;
    const netClient = !!this.room && !this.room.isHost && this.mode === 'match';
    if (netClient) {
      if (this.hitStop > 0) this.hitStop -= dt;
      this.clientFrame(dt);
    } else if (this.hitStop > 0 && !this.room) this.hitStop -= dt;
    else {
      if (this.hitStop > 0) this.hitStop -= dt;
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
        if (this.room?.isHost && this.mode === 'match')
          this.seatPeers.forEach((peer, i) => {
            if (peer && i !== LOCAL) inputs[i] = this.room!.takeInput(peer) ?? NO_INPUT;
          });
        const prevRound = this.world.round;
        this.world.tick(step, inputs);
        if (this.room?.isHost && this.mode === 'match') this.pending.push(...this.world.events);
        if (this.world.round !== prevRound) this.brains.forEach((b) => b.newRound());
        if (this.world.round !== prevRound) this.autoBrain?.newRound();
        for (const e of this.world.events) this.onEvent(e);
        if (this.hitStop > 0 && !this.room) {
          this.acc = 0;
          break;
        }
      }
      // host: send the world to friends ~15×/s
      if (this.room?.isHost && this.mode === 'match') {
        this.snapT += dt;
        if (this.snapT >= 1 / 15) {
          this.snapT = 0;
          this.room.snapshot(this.encoder.encode(this.world, this.pending));
          this.pending = [];
        }
      }
    }

    // views
    // crowd readability: fade bots standing in front of you, ease the camera out, calm the glows
    {
      const me = this.world.players[LOCAL];
      let near = 0;
      for (const h of this.heroes) {
        const p = h.player;
        h.loudGlow = this.mode !== 'match' || p.id === LOCAL || p.id === this.world.crownId;
        const dx = p.x - me.x;
        const dz = p.z - me.z;
        const d = Math.hypot(dx, dz);
        if (p.id !== LOCAL && d < 5 && p.state !== 'falling') near++;
        h.fadeTarget = this.mode === 'match' && p.id !== LOCAL && dz > 0 && dz < 2.2 && Math.abs(dx) < 1.3 ? 0.4 : 1;
      }
      this.rig.crowd = this.mode === 'match' ? Math.min(1, Math.max(0, (near - 1) / 3)) : 0;
    }
    const frozen = this.hitStop > 0;
    const adt = this.slowT > 0 ? dt * this.slowScale : dt;
    for (const h of this.heroes) {
      if (h.update(adt, this.time, frozen)) this.fx.dust(h.player.x, h.player.z);
    }
    this.powers?.update(this.time);
    this.markers?.update(this.world, this.world.players[LOCAL], this.time, this.mode === 'match');
    if (this.mode === 'match') this.chatterHunting();
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
    const threats = new Set<number>();
    if (this.mode === 'match') {
      const me = this.world.players[LOCAL];
      for (const b of this.brains) {
        const p = this.world.players[b.id];
        if (b.targetId === LOCAL && Math.hypot(p.x - me.x, p.z - me.z) < 9) threats.add(b.id);
      }
    }
    this.hud.update(this.world, this.stage.camera, LOCAL, this.time, {
      threats,
      nemesis: this.nemesis,
      grabTarget: this.markers?.grabTarget ?? -1,
      skillHits: this.markers?.skillHits ?? 0,
    });
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

  // ---------------------------------------------------------------- friends rooms

  /** Client: predict my own movement, smooth everyone else, send my input ~30×/s. */
  private clientFrame(dt: number) {
    const w = this.world;
    const inp = this.input.read();
    // buttons latch until the next send
    this.netInput = { mx: inp.mx, mz: inp.mz, dash: this.netInput.dash || inp.dash, grab: this.netInput.grab || inp.grab, skill: this.netInput.skill || inp.skill };
    this.sendT += dt;
    if (this.sendT >= 1 / 30) {
      this.sendT = 0;
      this.room?.sendInput(this.netInput);
      this.netInput = { ...this.netInput, dash: false, grab: false, skill: false };
    }
    w.players.forEach((p, i) => {
      const t = this.targets[i];
      if (!t) return;
      if (i === LOCAL && w.phase === 'playing' && p.state === 'normal') {
        // prediction: move right away, then ease toward what the host says
        const sp = TUNING.hero.walkSpeed * Math.max(TUNING.hero.carrySlowFloor, 1 - p.carried * TUNING.hero.carrySlowPerCoin);
        const nx = p.x + inp.mx * sp * dt;
        const nz = p.z + inp.mz * sp * dt;
        if (w.arena.solid(nx, nz)) {
          p.x = nx;
          p.z = nz;
        }
        p.vx = inp.mx * sp;
        p.vz = inp.mz * sp;
        if (Math.hypot(inp.mx, inp.mz) > 0.1) p.facing = Math.atan2(inp.mx, inp.mz);
        const err = Math.hypot(t.x - p.x, t.z - p.z);
        const k = err > 2.5 ? 1 : Math.min(1, dt * 5);
        p.x += (t.x - p.x) * k;
        p.z += (t.z - p.z) * k;
      } else {
        const k = Math.min(1, dt * 14);
        p.x += (t.x - p.x) * k;
        p.z += (t.z - p.z) * k;
      }
    });
  }

  private onSnapshot(s: Snapshot) {
    if (!this.world || this.mode !== 'match') return;
    const prevRound = this.world.round;
    applySnapshot(this.world, s, this.targets, LOCAL);
    if (this.world.round !== prevRound) this.markers?.setWorld();
    for (const e of s.ev) this.onEvent(e);
  }

  private openFriends(joinCode = '') {
    this.friends?.close();
    const fp = new FriendsPanel(this.portraits);
    this.friends = fp;
    this.home?.show(false);
    if (!this.profile.name) {
      this.profile.name = `Player${Math.floor(100 + Math.random() * 900)}`;
      saveProfile(this.profile);
    }
    const me = () => ({ name: this.profile.name, hero: this.profile.hero });
    const lobby = () => {
      const r = this.room;
      if (!r || this.mode === 'match') return;
      fp.lobby(r.code, r.link(), r.members, r.isHost, MAPS[this.mapId].name);
    };
    const wire = (r: Room) => {
      this.room = r;
      r.onLobby = () => lobby();
      r.onStart = (s, seat) => this.beginNet(s, seat);
      r.onSnap = (s) => this.onSnapshot(s);
      r.onLeft = (peer) => this.peerLeft(peer);
      r.onClosed = (why) => this.roomClosed(why);
      lobby();
    };
    fp.onCreate = async (name) => {
      this.profile.name = name;
      saveProfile(this.profile);
      fp.busy('Making your room…');
      try {
        wire(await Room.create(me()));
        track('room_create');
      } catch (e) {
        fp.error(`Could not create a room (${String((e as Error)?.message ?? e)}). Check your internet and try again.`, this.profile.name);
      }
    };
    fp.onJoin = async (code, name) => {
      this.profile.name = name;
      saveProfile(this.profile);
      fp.busy(`Joining ${code}…`);
      const timeout = setTimeout(() => !this.room && fp.error('Could not reach that room. Is the host still in the lobby?', this.profile.name), 12000);
      try {
        wire(await Room.join(code, me()));
        clearTimeout(timeout);
        fp.busy('Joined! Waiting for the host…');
        track('room_join');
      } catch (e) {
        clearTimeout(timeout);
        fp.error(String((e as Error)?.message ?? e), this.profile.name);
      }
    };
    fp.onStart = () => this.hostStart();
    fp.onLeave = () => {
      this.leaveRoom();
      fp.close();
      this.friends = null;
      this.home?.show(true);
    };
    fp.menu(this.profile.name, joinCode);
    if (joinCode) fp.onJoin(joinCode, this.profile.name);
  }

  /** Host: fill empty seats with bots and start everyone's match. */
  private hostStart() {
    const r = this.room;
    if (!r?.isHost) return;
    const rng = new Rng((Math.random() * 1e9) | 0);
    const names = [...BOT_NAMES].sort(() => rng.next() - 0.5);
    const seats: StartMsg['seats'] = r.members.slice(0, MAX_HUMANS).map((m) => ({ name: m.name, hero: m.hero, isBot: false, peer: m.peer }));
    for (let i = seats.length; i < TUNING.match.playersPerMatch; i++) seats.push({ name: names[i], hero: HERO_IDS[i % HERO_IDS.length], isBot: true, peer: '' });
    seats[0].hero = this.profile.hero;
    const start: StartMsg = { map: this.mapId, seed: rng.int(1, 1e9), seats };
    r.start(start);
    track('room_start', { humans: r.members.length });
    this.beginNet(start, 0);
  }

  private beginNet(start: StartMsg, seat: number) {
    this.friends?.close();
    this.friends = null;
    this.home?.destroy();
    this.home = null;
    this.showcase.clear();
    this.hud?.closePanel();
    this.mode = 'match';
    this.paused = false;
    this.trial = false;
    this.startMatch(start.seats[seat].hero, false, { start, seat });
  }

  private peerLeft(peer: string) {
    if (this.mode !== 'match') return;
    const seat = this.seatPeers.indexOf(peer);
    if (seat < 0) return;
    this.seatPeers[seat] = '';
    const p = this.world.players[seat];
    p.isBot = true;
    this.brains.push(new BotBrain(seat, new Rng(seat * 31 + 7), LOCAL));
    this.hud.feed(`<b>${p.name}</b> left — a bot took over`);
  }

  private roomClosed(why: string) {
    this.leaveRoom();
    this.friends?.close();
    this.friends = null;
    this.hud?.closePanel();
    this.goHome();
    setTimeout(() => this.hud.banner(why, 'red', true), 200);
  }

  private leaveRoom() {
    this.room?.leave();
    this.room = null;
  }

  /** Brief slow motion for big moments (offline only — the sim just runs slower). */
  private slowMo(scale: number, dur: number) {
    if (this.room) return;
    this.slowScale = scale;
    this.slowT = dur;
  }

  /** A bot says something (rate-limited so it never spams). */
  private say(id: number, kind: keyof typeof LINES, force = false) {
    if (this.mode !== 'match' || id === LOCAL) return;
    const b = this.brains.find((x) => x.id === id);
    if (!b) return;
    const last = this.lastSay.get(id) ?? -99;
    if (!force && this.time - last < 3.5) return;
    const opts = LINES[kind][b.personality].filter(Boolean);
    if (!opts.length) return;
    this.lastSay.set(id, this.time);
    this.hud.speak(id, opts[Math.floor(Math.random() * opts.length)], this.time);
  }

  /** Bots announce when they start hunting you, so attacks never come out of nowhere. */
  private chatterHunting() {
    const me = this.world.players[LOCAL];
    for (const b of this.brains) {
      if (b.targetId !== LOCAL) continue;
      const p = this.world.players[b.id];
      if (Math.hypot(p.x - me.x, p.z - me.z) > 8) continue;
      const last = this.lastHunt.get(b.id) ?? -99;
      if (this.time - last < 10) continue;
      this.lastHunt.set(b.id, this.time);
      this.say(b.id, 'hunting');
    }
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
          if (e.v >= 5) {
            this.sfx.golden();
            this.hud.banner(`GOLDEN COIN +${e.v}!`, 'gold', true);
            this.hud.floater(this.pos(e.p, 2.6), cam, `+${e.v}`, 'plus');
          } else if (e.v > 1) {
            this.sfx.pickup();
            this.hud.floater(this.pos(e.p, 2.6), cam, `+${e.v}`, 'plus');
          } else this.sfx.pickup();
          if (e.combo > 0 && e.combo % 5 === 0) this.hud.floater(this.pos(e.p, 2.8), cam, `COMBO x${e.combo}!`, 'bank');
        }
        this.fx.sparkle(e.x, 0.6, e.z, e.v > 1 ? '#fff27a' : '#ffe27a', e.v > 1 ? 30 : 5);
        if (e.v >= 5) this.fx.pillar(e.x, e.z, '#ffd84a', 6, 0.7, 0.6);
        break;
      case 'grabStart': {
        // the lunge: anim + a quick red swipe in front so the target can see it coming
        hv(e.p).oneShot(hv(e.p).grabAnim, this.time, 1.6, 0.5);
        const P = w.players[e.p];
        this.fx.cone(P.x, P.z, e.facing, TUNING.grab.range + TUNING.grab.lunge + 0.3, TUNING.grab.coneDeg, e.p === LOCAL ? '#ffd23f' : '#ff3a5a', TUNING.grab.windup + 0.05, 0.6);
        break;
      }
      case 'dodge':
        this.fx.ring(w.players[e.p].x, w.players[e.p].z, '#7ff3ff', 2, 0.35, 0.6);
        this.fx.emit(w.players[e.p].x, 1, w.players[e.p].z, { n: 18, color: ['#7ff3ff', '#ffffff'], speed: 5, up: 2, life: 0.4, size: 0.45 });
        if (e.p === LOCAL) {
          this.hud.skillBanner('DODGED!', '#7ff3ff');
          this.sfx.dodge();
          this.slowMo(0.35, 0.25);
        } else if (e.from === LOCAL) this.hud.banner(`${w.players[e.p].name} dodged!`, 'teal', true);
        break;
      case 'grab':
        if (!e.hit) hv(e.p).oneShot('Hit_B', this.time, 1.8, 0.35);
        if (!e.hit && e.p === LOCAL) {
          this.sfx.whiff();
          this.hud.banner('MISSED!', 'red', true);
        }
        if (e.p === LOCAL && this.grabHintT > 0) {
          this.grabHintT = 0;
          this.hud.hintButton(null);
          this.hud.prompt(null);
        }
        break;
      case 'steal': {
        if (e.n > 0 && e.from === LOCAL) {
          this.say(e.to, 'robbedYou', true);
          const tot = (this.robbedBy.get(e.to) ?? 0) + e.n;
          this.robbedBy.set(e.to, tot);
          const top = [...this.robbedBy.entries()].sort((a, b) => b[1] - a[1])[0];
          if (top && top[1] >= 6 && top[0] !== this.nemesis) {
            this.nemesis = top[0];
            this.hud.feed(`☠ <b>${w.players[top[0]].name}</b> is your NEMESIS — rob them back for REVENGE!`);
          }
        }
        if (e.n > 0 && e.to === LOCAL) this.say(e.from, 'youRobbed', true);
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
        // telegraph: a warning that grows to the exact reach and lands when the skill fires — dash out!
        const cast = TUNING.abilities[e.ability].castDelay;
        const warn = e.p === LOCAL ? color : '#ff3a3a';
        if (e.ability === 'rattleBurst') this.fx.ring(P.x, P.z, warn, TUNING.abilities.rattleBurst.radius, cast, 0.4);
        else if (e.ability === 'groundSlam') this.fx.cone(P.x, P.z, P.facing, TUNING.abilities.groundSlam.range, TUNING.abilities.groundSlam.coneDeg, warn, cast, 0.3);
        else this.fx.ring(P.x, P.z, color, 0.4, 0.3, 2.2);
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
          this.fx.debris(e.x, 1.1, e.z, local ? 14 : 6, ['#f4efe2', '#e2d8c2', '#cdbf9f'], 11, 7, 0.8);
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
          this.fx.debris(fx, 0.3, fz, local ? 14 : 6, ['#9a8a7a', '#b49a72', '#7d6b5a', '#6fbb40'], 7, 12, 1.0);
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
        this.fx.debris(e.x, 0.6, e.z, 10, ['#2a2440', '#ff8a3d', '#8a8aa0'], 9, 9, 0.8);
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
        this.hud.floater(this.v.set(e.x, 3.6, e.z), cam, `+${e.total}`, 'bank');
        if (e.total >= 12) this.hud.feed(`${this.who(e.p)} banked ${e.total}${e.mult > 1 ? ` (×${e.mult})` : ''}!`);
        if (e.n >= 15) this.say(e.p, 'bankBig');
        if (e.mult >= 1.5) {
          this.fx.pillar(e.x, e.z, '#7ff3ff', 12, 1, 1.8);
          this.fx.confetti(e.x, 3, e.z, e.mult >= 2 ? 160 : 70);
        }
        if (e.n >= TUNING.bankPopAt) this.hud.feed('🫧 The bank bubble overloaded — it\'s moving!');
        if (e.p === LOCAL) {
          this.sfx.bank(e.n);
          if (e.label) {
            this.hud.skillBanner(`${e.label} ×${e.mult}!`, '#7ff3ff');
            this.hud.banner(`+${e.total}`, 'teal', true);
            this.rig.punch(5);
          } else this.hud.banner(`BANKED ${e.total}!`, 'teal');
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
      case 'crown': {
        if (e.p === LOCAL) {
          this.hud.skillBanner('YOU HAVE THE CROWN!', '#ffd84a');
          this.hud.banner('Everyone is hunting you — BANK IT!', 'red', true);
          this.sfx.crown();
        } else if (e.p >= 0) {
          this.hud.feed(`👑 ${this.who(e.p)} has the CROWN — hit them for a bounty!`);
          this.say(e.p, 'crown');
          this.sfx.crownOther();
        }
        break;
      }
      case 'bounty':
        if (e.p === LOCAL) {
          this.hud.banner(`👑 BOUNTY +${e.n}!`, 'gold');
          this.sfx.golden();
        } else this.hud.feed(`${this.who(e.p)} claimed the bounty on ${this.who(e.from)}`);
        break;
      case 'revenge':
        if (e.p === LOCAL) {
          this.hud.skillBanner(`REVENGE! +${e.n}`, '#ff5f7a');
          this.sfx.golden();
          if (e.from === this.nemesis) this.hud.feed(`☠ You got back at your nemesis <b>${w.players[e.from].name}</b>!`);
        }
        break;
      case 'hazardWarn':
        if (this.mode !== 'match') break;
        if (e.kind === 'traffic') {
          this.hud.skillBanner('🚕 RUSH HOUR!', '#ffd23f');
          this.hud.banner('Get off the street!', 'red', true);
          this.sfx.horn();
        } else {
          this.hud.skillBanner('🔔 MIDNIGHT BELL', '#7dff6a');
          this.hud.banner('Get away from the graves!', 'red', true);
          this.sfx.bell();
        }
        break;
      case 'hazardHit': {
        const p = w.players[e.p];
        if (e.kind === 'bell') {
          this.fx.debris(p.x, 0.2, p.z, 10, ['#f4efe2', '#d8d0c0'], 3, 9, 0.9);
          this.fx.emit(p.x, 0.5, p.z, { n: 24, color: ['#7dff6a', '#d6ffcf'], speed: 3, up: 6, life: 0.7, size: 0.5 });
        } else this.sfx.horn();
        if (e.p === LOCAL) {
          this.hud.banner(e.kind === 'traffic' ? 'HIT BY TRAFFIC!' : 'GRABBED BY THE DEAD!', 'red', true);
          this.hud.flash(e.kind === 'traffic' ? '#ffd23f' : '#7dff6a', 0.5);
        }
        break;
      }
      case 'countdown':
        if (e.n === Math.ceil(TUNING.match.countdownSeconds)) {
          this.hud.closePanel();
          if (this.mode === 'match') this.hud.roulette(w.mod, w.round);
        }
        if (e.n <= 3) this.hud.countdown(e.n);
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
        waitForHost: !!this.room && !this.room.isHost,
        onRematch: () => {
          this.sfx.click();
          track('rematch_click', { hero: this.world.players[LOCAL].hero, room: !!this.room });
          if (this.room?.isHost) {
            // everyone still in the room plays again
            this.showcase.clear();
            this.hud.closePanel();
            this.hostStart();
            return;
          }
          this.firstMatch = false;
          this.showcase.clear();
          this.hud.closePanel();
          this.startMatch(this.trial ? this.profile.hero : this.world.players[LOCAL].hero);
          this.trial = false;
        },
        onHome: () => {
          this.sfx.click();
          this.leaveRoom();
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

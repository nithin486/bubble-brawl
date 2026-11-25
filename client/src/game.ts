import { release } from './render/dispose.ts';
import { castRay, propHeight, GUN_HEIGHT } from '../../shared/sim/ray.ts';
import * as THREE from 'three';
import { World, targetable } from '../../shared/sim/world.ts';
import { BotBrain } from '../../shared/sim/bots.ts';
import { Rng } from '../../shared/sim/math.ts';
import { NO_INPUT, type Input, type Player, type SimEvent } from '../../shared/sim/types.ts';
import { TUNING } from '../../shared/config/tuning.ts';
import { HEROES, HERO_IDS, type HeroId } from '../../shared/config/heroes.ts';
import { Stage, isTouch, type Quality } from './render/stage.ts';
import { loadModel } from './render/models.ts';
import { WeaponsView, WEAPON_INFO } from './render/weapons-view.ts';
import { weaponShot } from './render/portraits.ts';
import { loadPack, type Assets } from './render/assets.ts';
import { ArenaView } from './render/arena-view.ts';
import { MAPS, MAP_ROTATION, MAP_PACK, type MapId } from '../../shared/config/maps.ts';
import { HeroView } from './render/hero.ts';
import { CoinsView } from './render/coins.ts';
import { BankView } from './render/bank.ts';
import { Fx, makeGlowTexture } from './render/fx.ts';
import { CameraRig, CAM_PRESETS, type CamPreset, type PlayerCam } from './camera.ts';
import { InputManager, haptics } from './input.ts';
import { platform, type AdHooks, type Product } from './platform/index.ts';
import { RELEASE } from './platform/release.ts';
import { ITEMS, adCoinsLeft, buyOrWear, countAd, item, redeem, cleanLook, type Look } from './cosmetics.ts';
import { Shop, type ShopState } from './ui/shop.ts';
import { Hud, PLAYER_COLORS } from './ui/hud.ts';
import { Sfx } from './audio.ts';
import { track } from './analytics.ts';
import { saveProfile, type Profile } from './save.ts';
import { DEFAULT_MAP, advanceMissions, botSkill, levelOf, mapLevel, missionText, nextForm, nextUnlock, UNLOCK_TRACK, weaponLevel, weaponPool, type Stat } from './progress.ts';
import { Home } from './ui/home.ts';
import { Showcase } from './render/showcase.ts';
import { PowerView, POWER_INFO } from './render/powerups.ts';
import { Markers } from './render/markers.ts';
import { Room, type StartMsg, MAX_HUMANS } from './net/room.ts';
import { GuestNet } from './net/guest.ts';
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
/** Test switches (?play ?autoplay ?debug ?speed) only work on a developer's machine: players can't use them to cheat. */
const DEV = import.meta.env.DEV || ['localhost', '127.0.0.1'].includes(location.hostname);
const AUTOPLAY = DEV && PARAMS.has('autoplay');
const SPEED = (DEV && Number(PARAMS.get('speed'))) || 1;

type TutStep = 'move' | 'coins' | 'bank' | 'done';

export class Game {
  private stage: Stage;
  private assets: Assets;
  private world!: World;
  private brains: BotBrain[] = [];
  private autoBrain: BotBrain | null = null;
  private heroes: HeroView[] = [];
  private island!: ArenaView;
  private mapId: MapId = DEFAULT_MAP;
  /** This match's mission counters. */
  private tally: Partial<Record<Stat, number>> = {};
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
  private goodStreak = 0;
  /** False while the shaders are being built behind the loading screen. */
  private ready = false;
  private autoQuality: boolean;
  private v = new THREE.Vector3();
  private lead = new THREE.Vector3();
  /** 'home' = landing page with bots playing behind it; 'match' = you are playing. */
  private mode: 'home' | 'match' = 'home';
  private home: Home | null = null;
  private showcase: Showcase;
  private powers: PowerView | null = null;
  /** Weapon tips already shown this session. */
  private weaponTips = new Set<string>();
  private weapons: WeaponsView | null = null;
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
      // (Esc may have just paused the game by releasing the mouse: don't let the same press resume it)
      if ((e.code === 'Escape' || e.code === 'KeyP') && performance.now() - this.lockPausedAt > 300) {
        this.togglePause();
        if (!this.paused && this.mode === 'match') this.captureMouse();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'match' && this.world?.phase === 'playing') this.setPaused(true);
    });
    this.rig = new CameraRig(stage.camera);
    this.rig.blocked = (x, y, z) => {
      const w = this.world;
      if (!w) return false;
      if (w.terrain.heightAt(x, z) > y - 0.3) return true;
      for (const o of w.map.obstacles) {
        if (o.r < 0.6) continue;
        const dx = x - o.x;
        const dz = z - o.z;
        if (dx * dx + dz * dz < (o.r + 0.2) ** 2 && y < w.terrain.heightAt(o.x, o.z) + propHeight(o.kind) && y < 3.4) return true;
      }
      return false;
    };
    // losing the captured mouse mid-fight (Esc) opens the pause menu
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) this.hadMouse = true;
      else if (this.hadMouse) {
        this.hadMouse = false;
        if (this.mode === 'match' && !this.paused && this.world?.phase === 'playing' && this.input.enabled) {
          this.lockPausedAt = performance.now();
          this.setPaused(true);
        }
      }
    });
    this.rig.shakeEnabled = profile.shake;
    this.applyCamera((PARAMS.get('cam') as CamPreset) || profile.camera || 'close');
    this.sfx.muted = !profile.sound;
    this.applyAimSpeed();
    this.applyPhonePrefs();
    this.fx = new Fx(stage.scene, this.glowTex);
    this.fx.ground = (x, z) => this.world?.terrain.heightAt(x, z) ?? 0; // ground effects ride raised plazas and ramps
    this.coins = new CoinsView(assets.env, stage.scene, this.glowTex);
    this.showcase = new Showcase(assets);
    {
      // home screen: drag anywhere on the 3D view to turn the hero (all sides, and up to a top view)
      const cv = this.stage.renderer.domElement;
      let last: { x: number; y: number } | null = null;
      cv.addEventListener('pointerdown', (e) => {
        if (this.mode === 'home') last = { x: e.clientX, y: e.clientY };
      });
      window.addEventListener('pointermove', (e) => {
        if (!last || this.mode !== 'home') return;
        this.showcase.orbit(e.clientX - last.x, e.clientY - last.y);
        last = { x: e.clientX, y: e.clientY };
      });
      window.addEventListener('pointerup', () => (last = null));
    }
    const forced = PARAMS.get('map');
    if (forced && forced in MAPS) {
      this.mapId = forced as MapId;
      this.profile.map = forced;
    }
    if (AUTOPLAY || (DEV && PARAMS.has('play'))) {
      this.mode = 'match';
      const begin = () => {
        this.startMatch(profile.hero);
        // ?model=crate,rock — preview models fetched by scripts/fetch_model.js in front of your hero
        const preview = PARAMS.get('model');
        if (preview) void this.previewModels(preview.split(','));
      };
      void this.ensureMap(this.mapId).then(begin);
    } else this.goHome();
    // opened from an invite: straight into the friend's room
    const invite = platform.launchRoom();
    if (!AUTOPLAY && this.mode === 'home') {
      if (invite) setTimeout(() => this.openFriends(invite), 300);
      else if (platform.wantsRoom()) setTimeout(() => this.openFriends('', true), 300);
    }
    platform.onJoinRoom((code) => {
      if (this.room?.code === code) return;
      this.leaveRoom();
      this.friends?.close();
      this.friends = null;
      this.hud?.closePanel();
      this.goHome();
      this.openFriends(code);
    });
    platform.onMuted(() => (this.sfx.blocked = this.adOpen || platform.muted()));
    this.sfx.blocked = platform.muted();
    void this.settlePurchases();
    requestAnimationFrame(this.frame);
    if ((DEV && PARAMS.has('debug')) || AUTOPLAY) (window as unknown as { __bb: Game }).__bb = this;
  }

  /**
   * Compile every shader a session needs while the loading screen is still up: the world, the heroes (also faded),
   * held weapons, beams, ice and effects. compileAsync keeps the page responsive while the driver works.
   */
  async prepare() {
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    for (let i = 0; i < 600 && !this.world; i++) await wait(50); // the first map's art may still be on its way
    if (this.world) {
      const extra = new THREE.Group();
      extra.position.set(0, -400, 0);
      for (const [name, obj] of this.assets.env) if (name.startsWith('weap_') || name === 'mystery_cube' || name === 'chest_gold') extra.add(obj.clone());
      this.weapons?.warm();
      const faded = this.heroes[0]?.warm();
      if (faded) extra.add(faded);
      const o = new THREE.Vector3(0, 1, 0);
      this.fx.ring(0, 0, '#ffffff', 1, 0.1, 0.5);
      this.fx.cone(0, 0, 0, 2, 60, '#ffffff', 0.1, 0.4);
      this.fx.emit(0, -50, 0, { n: 1, color: '#ffffff', speed: 0, up: 0, life: 0.05, size: 0.1 });
      this.weapons?.laser(o, o.clone().setZ(1), false);
      this.stage.scene.add(extra);
      const compile = Promise.all([this.stage.renderer.compileAsync(this.stage.scene, this.stage.camera), this.stage.renderer.compileAsync(this.showcase.scene, this.showcase.camera)]);
      await Promise.race([compile.catch(() => {}), wait(45000)]);
      this.stage.scene.remove(extra);
    }
    this.ready = true;
    this.last = performance.now();
  }


  private camPull = 1;
  private koStreak = 0;
  private koStreakT = -99;
  /**
   * Third-person camera never sits inside a wall, a deck or a big prop: walk the line from the hero to the camera
   * and pull the camera in front of the first thing that blocks it (fast in, slow back out).
   */
  private keepCameraOutOfWalls(dt: number, focus: THREE.Vector3) {
    const cam = this.stage.camera.position;
    const w = this.world;
    const fx = focus.x;
    const fy = focus.y + 1.3;
    const fz = focus.z;
    const dx = cam.x - fx;
    const dy = cam.y - fy;
    const dz = cam.z - fz;
    let hit = 1;
    const tall = w.map.obstacles.filter((o) => o.r >= 0.8 && Math.abs(o.x - fx) < 14 && Math.abs(o.z - fz) < 14);
    for (let i = 1; i <= 14 && hit === 1; i++) {
      const t = 0.12 + (i / 14) * 0.88;
      const x = fx + dx * t;
      const y = fy + dy * t;
      const z = fz + dz * t;
      if (w.terrain.heightAt(x, z) > y - 0.35) hit = t;
      else
        for (const o of tall)
          if (y < 3.2 && (x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + 0.35) ** 2) {
            hit = t;
            break;
          }
    }
    const want = hit < 1 ? Math.max(0.5, hit - 0.1) : 1;
    this.camPull += (want - this.camPull) * Math.min(1, dt * (want < this.camPull ? 14 : 2.5));
    if (this.camPull < 0.999) {
      cam.set(fx + dx * this.camPull, fy + dy * this.camPull + (1 - this.camPull) * 3.2, fz + dz * this.camPull); // rise over the wall
      this.stage.camera.lookAt(fx, fy, fz);
    }
  }

  // ---------------------------------------------------------------- setup

  /** Landing page: bots play an attract-mode match behind the menu. */
  private goHome() {
    this.mode = 'home';
    this.paused = false;
    this.mapId = (MAP_ROTATION as string[]).includes(this.profile.map) ? (this.profile.map as MapId) : DEFAULT_MAP;
    this.startMatch(this.profile.hero, true);
    const lv = levelOf(this.profile.xp);
    this.home?.destroy();
    this.home = new Home({
      coins: this.profile.coins,
      level: lv.level,
      xpFrac: lv.frac,
      hero: this.profile.hero,
      matches: this.profile.matches,
      friends: true,
      xpLeft: lv.left,
      xpNeed: lv.need,
      missions: this.profile.missions,
      next: this.nextReward(lv.level),
      touch: this.touch,
      maps: MAP_ROTATION.map((id) => ({ id, name: MAPS[id].name, blurb: MAPS[id].blurb })),
      map: this.mapId,
      name: this.profile.name || 'Player',
      sound: this.profile.sound,
      portraits: this.portraits,
      weapons: (Object.keys(WEAPON_INFO) as (keyof typeof WEAPON_INFO)[]).map((k) => ({ ...WEAPON_INFO[k], img: weaponShot(k), level: weaponLevel(k) })),
    });
    this.home.onSound = () => {
      this.profile.sound = !this.profile.sound;
      saveProfile(this.profile);
      this.sfx.muted = true; // the match behind the menu stays silent
      if (this.profile.sound) {
        this.sfx.unlock();
        this.sfx.muted = false;
        this.sfx.click();
        this.sfx.muted = true;
      }
      return this.profile.sound;
    };
    this.home.onMap = (id) => {
      this.sfx.click();
      this.mapId = id as MapId;
      // a locked map can be looked at, but is not remembered
      if (mapLevel(id) <= levelOf(this.profile.xp).level) {
        this.profile.map = id;
        saveProfile(this.profile);
      }
      track('map_selected', { map: id });
      if (this.mapReady(this.mapId)) {
        this.startMatch(this.profile.hero, true);
        return;
      }
      // its art is a separate download: show a note, then switch the background when it has arrived
      this.home?.setMapNote('Loading map…');
      void this.ensureMap(id as MapId).then(() => {
        this.home?.setMapNote('');
        if (this.mode === 'home' && this.mapId === id) this.startMatch(this.profile.hero, true);
      });
    };
    this.home.onHero = (h, locked) => {
      this.showcase.set([{ hero: h, anim: locked ? 'Idle' : 'Cheer', locked, color: HEROES[h].color, height: 0.45 }]);
      if (!locked) {
        this.profile.hero = h;
        saveProfile(this.profile);
      }
      this.showcase.screenX = 0;
      this.showcase.screenY = 0.22;
      this.sfx.click();
    };
    this.home.onHero(this.home.hero, false);
    this.home.onSettings = () => this.setPaused(true);
    this.home.onShop = () => this.openShop();
    this.home.onFriends = () => {
      this.sfx.click();
      this.openFriends();
    };
    this.home.onPlay = (h) => {
      this.sfx.unlock();
      this.sfx.click();
      track('play_click', { hero: h });
      this.profile.hero = h;
      saveProfile(this.profile);
      this.fillScreen();
      this.captureMouse();
      const go = () => {
        this.home?.destroy();
        this.home = null;
        this.showcase.clear();
        this.mode = 'match';
        this.startMatch(h);
      };
      if (this.mapReady(this.mapId)) go();
      else {
        this.home?.setMapNote('Loading map…');
        void this.ensureMap(this.mapId).then(go);
      }
    };
  }

  /** The next thing on the level track, ready for the lobby card. */
  private nextReward(level: number) {
    const u = nextUnlock(level);
    return u ? { level: u.level, ...this.rewardCard(u) } : null;
  }

  private rewardCard(u: NonNullable<ReturnType<typeof nextUnlock>>) {
    if ('hero' in u) return { name: HEROES[u.hero].name, img: this.portraits.get(u.hero)! };
    if ('map' in u) return { name: MAPS[u.map].name, img: `thumbs/${u.map}.webp` };
    return { name: WEAPON_INFO[u.weapon].name, img: weaponShot(u.weapon) };
  }

  /** Download a map's art pack if it has one (resolved at once when it is already here). */
  private ensureMap(id: MapId): Promise<void> {
    const pack = MAP_PACK[id];
    return pack && !this.assets.packs.has(pack) ? loadPack(this.assets, pack) : Promise.resolve();
  }

  private mapReady(id: MapId) {
    const pack = MAP_PACK[id];
    return !pack || this.assets.packs.has(pack);
  }

  private startMatch(hero: HeroId, attract = false, net?: { start: StartMsg; seat: number }) {
    if (!net && !this.mapReady(this.mapId)) this.mapId = MAP_ROTATION.find((id) => this.mapReady(id))!; // art still downloading // art still downloading: play on a map that is here (one has no pack)
    const rng = new Rng((Math.random() * 1e9) | 0);
    const names = [...BOT_NAMES].sort(() => rng.next() - 0.5);
    const botHeroes: HeroId[] = HERO_IDS; // bots show off every hero, including ones still to unlock
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
    const level = levelOf(this.profile.xp).level;
    if (!attract && !net) {
      this.world.skill = botSkill(level, this.profile.form);
      this.world.pool = weaponPool(level);
      this.tally = {};
    }
    if (this.world.players[LOCAL]) this.world.players[LOCAL].name = 'You';
    if ((this.firstMatch || attract) && !net) this.world.phaseT = 0.6; // no countdown wait in the very first round
    // bots: offline every bot seat; in a room only the host runs them (clients never tick the sim)
    const client = this.room && !this.room.isHost && !attract;
    this.brains = client ? [] : this.world.players.filter((p) => p.isBot).map((p) => new BotBrain(p.id, new Rng(rng.int(1, 1e9)), LOCAL));
    this.autoBrain = AUTOPLAY || attract ? new BotBrain(LOCAL, new Rng(5), LOCAL) : null;
    this.seatPeers = net ? net.start.seats.map((s) => (s.isBot ? '' : s.peer)) : [];
    this.encoder = new SnapshotEncoder();
    this.pending = [];
    this.matchId = net?.start.seed ?? 0;
    this.guest.reset();
    if (net && this.room) {
      this.room.freshMatch();
      this.world.recordPositions = this.room.isHost;
      if (this.room.isHost) this.keepHosting();
    }
    this.targets = this.world.players.map((p) => ({ x: p.x, z: p.z, y: 0 }));
    this.sfx.muted = attract || !this.profile.sound;

    // looks: yours, your friends', and a few bots showing off what the shop sells
    this.looks = this.world.players.map((p, i) => {
      if (net) return i === LOCAL ? this.profile.look : cleanLook(net.start.seats[i]?.look);
      if (i === LOCAL) return this.profile.look;
      const one = (slot: 'laser' | 'trail' | 'ko') => rng.pick(ITEMS.filter((x) => x.slot === slot)).id;
      return rng.next() < 0.35 ? { laser: one('laser'), trail: one('trail'), ko: one('ko') } : cleanLook(null);
    });

    // views
    for (const h of this.heroes) release(h.root);
    this.heroes = this.world.players.map((p) => {
      const hv = new HeroView(this.assets.heroes.get(p.hero)!, p, p.id === LOCAL && !attract, PLAYER_COLORS[p.id], this.glowTex, this.assets.env);
      this.stage.scene.add(hv.root);
      return hv;
    });
    // building a map takes seconds on a slow laptop: the next match on the same one reuses it
    if (this.island && this.island.mapId === this.world.map.id) this.island.reuse(this.world);
    else {
      release(this.island?.group);
      this.island = new ArenaView(this.world, this.assets.env, this.stage.scene, this.glowTex);
    }
    this.stage.applyTheme(this.island.theme);
    this.bank?.dispose();
    this.bank = new BankView(this.world, this.assets.env, this.stage.scene, this.glowTex);
    this.bank.group.visible = this.world.mode === 'coins';
    document.body.classList.toggle('mode-weapons', this.world.mode === 'weapons');
    document.body.classList.toggle('mode-coins', this.world.mode === 'coins');
    if (!this.weapons) this.weapons = new WeaponsView(this.world, this.stage.scene, this.fx, this.glowTex, this.assets.env);
    else this.weapons.setWorld(this.world);
    this.weapons.localId = attract ? -1 : LOCAL;
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
    this.hud?.closePanel();
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
    this.rig.faceBehind(me.facing);
    this.input.mouseLook = this.rig.turns && !attract;
    if (this.rig.turns && !attract && !this.touch) this.hud.tip('Click, then move the mouse to look around · Q/E to turn', 5);
    this.tut = this.firstMatch && !attract ? 'move' : 'done';
    this.tutT = 0;
    this.movedDist = 0;
    this.roundStats = { stolen: 0, steals: 0 };
    this.superTold = false;
    this.matchStart = performance.now();
    this.input.enabled = !attract;
    if (!attract) track('match_start', { hero, first: this.firstMatch });
  }

  // ---------------------------------------------------------------- loop

  private frame = (nowMs: number) => {
    requestAnimationFrame(this.frame);
    if (!this.world) return; // the first match is still waiting for its map's art
    if (!this.ready) {
      this.last = nowMs;
      return;
    }
    let dt = (nowMs - this.last) / 1000;
    this.last = nowMs;
    if (dt > 0.1) dt = 0.1;
    this.time += dt;
    this.monitorFps(dt);
    platform.gameplay(this.mode === 'match' && !this.paused && !this.adOpen && this.world.phase === 'playing');
    // a shared match never pauses (the menu still opens, the game keeps running)
    if ((this.paused && !this.room) || this.adOpen) {
      this.stage.render();
      this.showcase.render(this.stage.renderer);
      return;
    }

    // turn the camera before anything reads the crosshair: this frame's shot goes where this frame looks
    if (this.mode === 'match' && this.input.enabled) {
      this.rig.addYaw(this.input.takeYaw(dt));
      this.rig.addPitch(this.input.takePitch());
      this.aimMagnet(dt);
      if (this.rig.turns && !this.paused) {
        const me = this.world.players[LOCAL];
        const at = this.visPos(LOCAL) ?? me;
        this.rig.update(0, this.v.set(at.x, at.y, at.z), this.lead);
      }
    }
    this.updateAim();
    this.simulate(dt);

    // views
    // draw between the last two sim steps: smooth on 90/120 Hz screens and when a frame is late
    this.lerpA = this.room && !this.room.isHost ? 1 : Math.min(1, this.acc / TUNING.sim.dt);
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
        void dz;
        h.fadeTarget = this.mode === 'match' && p.id !== LOCAL && this.blocksView(p.x, p.z, me.x, me.z, 1.0) ? 0.35 : 1;
      }
      this.rig.crowd = this.mode === 'match' ? Math.min(1, Math.max(0, (near - 1) / 3)) : 0;
    }
    const frozen = this.hitStop > 0;
    const adt = this.slowT > 0 ? dt * this.slowScale : dt;
    for (const h of this.heroes) {
      h.view = this.visPos(h.player.id);
      if (h.update(adt, this.time, frozen)) this.fx.dust(h.player.x, h.player.z);
      if (h.player.gone) h.root.visible = false;
    }
    this.powers?.update(this.time);
    if (this.markers) {
      this.markers.aimHint = this.aimInfo;
      this.markers.hideScope = this.rig.turns;
      this.markers.cam = this.stage.camera;
      if (this.weapons) this.weapons.camPos = this.stage.camera.position;
    }
    this.markers?.update(this.world, this.world.players[LOCAL], this.time, this.mode === 'match');
    {
      const me = this.world.players[LOCAL];
      const on = this.mode === 'match' && this.rig.turns && this.world.mode === 'weapons' && this.world.phase === 'playing' && me.state !== 'bubble' && me.state !== 'falling';
      this.hud.crosshair(on, this.aimLocked, !!me.weapon);
      this.rig.armed = this.mode === 'match' && this.world.mode === 'weapons' && !!me.weapon && this.world.phase === 'playing';
      const view = this.heroes[LOCAL];
      if (view) view.aimPitch = this.aimInfo?.y !== undefined ? Math.atan2(this.aimInfo.y - (me.y + 1.25), this.aimInfo.dist) : 0;
      this.hud.lockHint(this.mode === 'match' && !this.touch && this.rig.turns && !this.paused && this.input.enabled && !this.input.mouseLocked);
    }
    if (this.mode === 'match') this.chatterHunting();
    // trails: speed boots (yellow streaks), sticky fingers (pink sparkles), magnet (red bits)
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.05;
      for (const p of this.world.players) {
        if (p.state === 'falling' || p.gone) continue;
        const trail = item(this.looks[p.id]?.trail ?? '')?.colors;
        if (trail?.length && Math.hypot(p.vx, p.vz) > 2) this.fx.emit(p.x, p.y + 0.35, p.z, { n: 2, color: trail, speed: 0.4, up: 0.6, life: 0.55, size: 0.36, spread: 0.5 });
        if (p.superT > 0) this.fx.emit(p.x, p.y + 0.9, p.z, { n: 3, color: [HEROES[p.hero].color, '#ffffff'], speed: 1.2, up: 1.6, life: 0.45, size: 0.45, spread: 0.8 });
        if (p.rageT > 0) this.fx.emit(p.x, p.y + 1.2, p.z, { n: 1, color: ['#ff4a6e', '#ffd23f'], speed: 0.8, up: 1.8, life: 0.45, size: 0.4, spread: 0.7 });
        if (p.speedT > 0 && Math.hypot(p.vx, p.vz) > 2) this.fx.emit(p.x, 0.5, p.z, { n: 2, color: ['#ffd23f', '#fff6b0'], speed: 0.3, up: 0.5, life: 0.4, size: 0.45 });
        if (p.stickyT > 0) this.fx.emit(p.x, 1.1, p.z, { n: 2, color: ['#ff5fd2', '#ffb3ec'], speed: 0.8, up: 1.2, life: 0.5, size: 0.3, spread: 0.7 });
        if (p.magnetT > 0) this.fx.emit(p.x, 0.4, p.z, { n: 1, color: ['#ff5f7a'], speed: 3.5, up: 0.2, life: 0.4, size: 0.25 });
      }
      // the well bubbles before a jackpot
      const J = this.world.map.jackpot;
      if (this.wellWarnT > 0) this.fx.emit(J.x, 1.6, J.z, { n: 4, color: ['#7ff3ff', '#ffffff', '#ffe27a'], speed: 1.2, up: 5, life: 0.7, size: 0.4, gravity: 6, spread: 0.8 });
    }
    if (this.wellWarnT > 0) this.wellWarnT -= dt;
    this.island.focus = this.mode === 'match' ? this.v.set(this.world.players[LOCAL].x, this.world.players[LOCAL].y, this.world.players[LOCAL].z).clone() : null;
    this.island.blocks = (x, z, fx, fz) => this.blocksView(x, z, fx, fz, 1.9);
    this.island.camPos = this.stage.camera.position;
    this.island.update(dt, this.time);
    this.coins.update(this.world, dt, this.time);
    this.bank.update(dt, this.time, this.stage.camera.position);
    this.weapons?.update(dt, this.time);
    this.fx.update(dt);
    const me = this.world.players[LOCAL];
    const mv = this.visPos(LOCAL) ?? me;
    let focus = this.v.set(mv.x, me.state === 'falling' || me.state === 'launched' ? 0 : mv.y, mv.z);
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
    } else {
      if (this.mode === 'match' && this.input.enabled && this.touch) {
        const me2 = this.world.players[LOCAL];
        this.rig.autoFollow(dt, me2.facing, Math.max(0, this.lastStickFwd));
      }
      this.rig.update(dt, focus, this.lead);
      if (!this.rig.turns) this.keepCameraOutOfWalls(dt, focus);
    }
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
      // say it once a match, the first time the Super is charged
      const meS = this.world.players[LOCAL];
      if (!this.superTold && this.world.mode === 'weapons' && this.world.phase === 'playing' && meS.charge >= 1) {
        this.superTold = true;
        const def = HEROES[meS.hero];
        this.hud.tip(`SUPER READY: ${def.superName}! ${this.touch ? 'Tap the glowing button' : 'Press F'}`, 4);
        this.sfx.power();
        haptics.buzz([20, 60, 20]);
      }
      this.tutorial(dt);
      this.bankTicks(dt);
    }
    this.showcase.update(dt);
    this.stage.render();
    this.showcase.render(this.stage.renderer);
    if (this.showcase.active && this.mode === 'match') this.hud.placePodium(this.showcase.labelPoints());
  };

  /** Advance the match by one drawn (or, for a hidden host, one timed) frame. */
  private simulate(dt: number) {
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
        inputs[LOCAL] = this.autoBrain ? this.autoBrain.update(this.world, step) : this.readLocal();
        for (const b of this.brains) inputs[b.id] = b.update(this.world, step);
        if (this.room?.isHost && this.mode === 'match')
          this.seatPeers.forEach((peer, i) => {
            if (peer && i !== LOCAL) inputs[i] = this.room!.takeInput(peer, this.world.time, this.world.players[i]) ?? NO_INPUT;
          });
        const prevRound = this.world.round;
        this.prevPos = this.world.players.map((q) => ({ x: q.x, y: q.y, z: q.z }));
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
          const acks = this.seatPeers.map((peer) => (peer ? this.room!.ack(peer, this.world.time) : ([0, 0] as [number, number])));
          this.room.snapshot(this.encoder.encode(this.world, this.pending, this.matchId, acks));
          this.pending = [];
        }
      }
    }
  }

  private monitorFps(dt: number) {
    if (dt >= 0.1) return; // a hitch (tab switch, loading) says nothing about how fast the game runs
    this.fpsFrames++;
    this.fpsT += dt;
    if (this.fpsT < 2) return;
    const fps = this.fpsFrames / this.fpsT;
    this.fpsFrames = 0;
    this.fpsT = 0;
    if (PARAMS.has('fps')) this.hud.fps = `${fps.toFixed(0)} fps · ${this.stage.quality} ×${this.stage.scale}`;
    if (!this.autoQuality || this.paused) return;
    // only the picture size changes while playing; shadows and effects never switch mid-session
    const steps = [1, 0.85, 0.72, 0.6];
    const i = Math.max(0, steps.indexOf(this.stage.scale));
    this.lowFpsStreak = fps < 44 ? this.lowFpsStreak + 1 : 0;
    this.goodStreak = fps > 57 ? this.goodStreak + 1 : 0;
    if (this.lowFpsStreak >= 2 && i < steps.length - 1) {
      this.stage.setScale(steps[i + 1]);
      this.lowFpsStreak = 0;
    } else if (this.goodStreak >= 6 && i > 0) {
      this.stage.setScale(steps[i - 1]);
      this.goodStreak = 0;
    }
  }

  // ---------------------------------------------------------------- events → feel

  private pos(id: number, y = 1.2) {
    const p = this.world.players[id];
    return new THREE.Vector3(p.x, p.y + y, p.z);
  }

  // ---------------------------------------------------------------- friends rooms

  /** Joining player: show my own actions at once, smooth everyone else, send my input ~30×/s. */
  private clientFrame(dt: number) {
    const w = this.world;
    const inp = this.readLocal();
    // buttons latch until the next send
    this.netInput = { mx: inp.mx, mz: inp.mz, dash: this.netInput.dash || inp.dash, grab: this.netInput.grab || inp.grab, skill: this.netInput.skill || inp.skill, ult: this.netInput.ult || inp.ult, aim: inp.aim, aimD: inp.aimD, aimY: inp.aimY };
    this.guest.frame(w, LOCAL, inp, dt);
    this.predictShot(inp, dt);
    this.sendT += dt;
    if (this.sendT >= 1 / 30) {
      this.sendT = 0;
      const me = w.players[LOCAL];
      const i = this.netInput;
      const aimAt = i.aim === undefined ? undefined : { x: me.x + Math.sin(i.aim) * (i.aimD ?? 8), z: me.z + Math.cos(i.aim) * (i.aimD ?? 8) };
      this.room?.sendInput(i, this.guest.stamp(), this.guest.viewTime, aimAt);
      this.netInput = { ...i, dash: false, grab: false, skill: false, ult: false };
    }
    // say so when the host goes quiet, and give up if it stays that way
    const quiet = performance.now() / 1000 - this.guest.heardAt;
    const playing = w.phase === 'playing' || w.phase === 'countdown';
    this.hud.net(this.guest.ping, playing && quiet > 1.5);
    if (playing && quiet > 15) this.roomClosed('Lost the connection to the host');
  }

  /** The laser leaves your gun the instant you press: the host still decides what it hit. */
  private predictShot(inp: Input, dt: number) {
    this.shotWait = Math.max(0, this.shotWait - dt);
    const w = this.world;
    const me = w.players[LOCAL];
    if (!inp.grab || this.shotWait > 0 || w.phase !== 'playing' || me.state !== 'normal' || me.weapon !== 'blaster' || me.ammo <= 0 || me.cast || inp.aim === undefined) return;
    const c = TUNING.weapons.blaster;
    this.shotWait = c.cooldown * (w.mod === 'rapid' ? TUNING.mods.rapid.cooldownMult : 1) * (me.superT > 0 && me.hero === 'ranger' ? TUNING.weapons.super.overdrive.cooldownMult : 1);
    const oy = me.y + GUN_HEIGHT;
    const rise = inp.aimY === undefined ? 0 : (inp.aimY - oy) / Math.max(0.6, inp.aimD ?? 8);
    const n = Math.hypot(1, rise);
    const hit = castRay(w, me.x, oy, me.z, Math.sin(inp.aim) / n, rise / n, Math.cos(inp.aim) / n, c.range, me);
    this.onEvent({ t: 'fire', p: LOCAL, weapon: 'blaster', x: me.x, z: me.z, facing: inp.aim });
    this.onEvent({ t: 'laser', p: LOCAL, tx: hit.x, ty: hit.y, tz: hit.z, hit: -1 });
  }

  private onSnapshot(s: Snapshot) {
    if (!this.world || this.mode !== 'match' || s.m !== this.matchId) return;
    const prevRound = this.world.round;
    if (this.guest.arrive(s)) {
      applySnapshot(this.world, s, this.targets, LOCAL);
      this.guest.correct(s, this.world, LOCAL);
      if (this.world.round !== prevRound) this.markers?.setWorld();
    }
    for (const e of s.ev) {
      // my own laser was already drawn when I pressed: only the host's verdict is news
      if (e.t === 'fire' && e.p === LOCAL && e.weapon === 'blaster') continue;
      if (e.t === 'laser' && e.p === LOCAL) {
        if (e.hit >= 0) this.hud.hitMarker(false);
        continue;
      }
      this.onEvent(e);
    }
  }

  /** The host keeps the match running while its tab is hidden (a quick reply on WhatsApp must not freeze friends). */
  private keepHosting() {
    if (this.hostClock) return;
    const src = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50)'], { type: 'text/javascript' }));
    this.hostClock = new Worker(src);
    this.hostClock.onmessage = () => {
      if (!document.hidden || !this.room?.isHost || this.mode !== 'match') return;
      const now = performance.now();
      let behind = Math.min(0.5, (now - this.last) / 1000);
      this.last = now;
      while (behind > 0) {
        const d = Math.min(0.1, behind);
        behind -= d;
        this.simulate(d);
      }
    };
  }

  private openFriends(joinCode = '', createNow = false) {
    this.friends?.close();
    const fp = new FriendsPanel(this.portraits);
    this.friends = fp;
    this.home?.show(false);
    if (!this.profile.name) {
      this.profile.name = `Player${Math.floor(100 + Math.random() * 900)}`;
      saveProfile(this.profile);
    }
    const me = () => ({ name: this.profile.name, hero: this.profile.hero, look: this.profile.look });
    const lobby = () => {
      const r = this.room;
      if (!r || this.mode === 'match') return;
      platform.roomOpen(r.code, r.members.length < MAX_HUMANS);
      fp.lobby(r.code, platform.roomLink(r.code, r.link()), r.members, r.isHost, MAPS[this.mapId].name, platform.externalShare);
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
    // back from a match: the room is still there
    if (this.room) return wire(this.room);
    fp.menu(this.profile.name, joinCode);
    if (joinCode) fp.onJoin(joinCode, this.profile.name);
    else if (createNow) fp.onCreate(this.profile.name);
  }

  /** Host: start the match with the people in the room (no bots). */
  private hostStart() {
    const r = this.room;
    if (!r?.isHost) return;
    if (r.members.length < 2) {
      // everyone else has left: back to the lobby to invite someone
      this.showcase.clear();
      this.hud.closePanel();
      this.goHome();
      this.openFriends();
      return;
    }
    const rng = new Rng((Math.random() * 1e9) | 0);
    const seats: StartMsg['seats'] = r.members.slice(0, MAX_HUMANS).map((m) => ({ name: m.name, hero: m.hero, isBot: false, peer: m.peer, look: m.look }));
    seats[0].hero = this.profile.hero;
    seats[0].look = this.profile.look;
    const start: StartMsg = { map: this.mapId, seed: rng.int(1, 1e9), seats };
    r.start(start);
    platform.roomOpen(r.code, false);
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
    void this.ensureMap(start.map).then(() => this.startMatch(start.seats[seat].hero, false, { start, seat }));
  }

  private peerLeft(peer: string) {
    if (this.mode !== 'match' || !this.room?.isHost) return;
    const seat = this.seatPeers.indexOf(peer);
    if (seat < 0 || this.world.phase === 'matchEnd') return;
    this.seatPeers[seat] = '';
    const p = this.world.players[seat];
    this.world.remove(seat);
    this.hud.feed(`<b>${p.name}</b> left the match`);
    if (this.world.players.filter((q) => !q.gone).length < 2) {
      this.hud.banner('Everyone else left', 'red', true);
      this.world.roundTime = TUNING.match.roundSeconds;
    }
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
    if (this.room) platform.roomLeft();
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
      case 'weaponSteal': {
        const info = WEAPON_INFO[e.weapon];
        this.fx.beam(this.pos(e.to, 1.1), this.pos(e.from, 1.1), '#ff5fd2', 0.45);
        this.fx.emit(this.pos(e.from, 1.1).x, 1.1, this.pos(e.from, 1.1).z, { n: 16, color: ['#ff5fd2', '#ffffff', info.color], speed: 4, up: 3, life: 0.5, size: 0.4 });
        if (e.to === LOCAL) {
          this.sfx.steal();
          this.hud.banner(`STOLE ${info.name}!`, 'pink');
          this.slowMo(0.35, 0.25);
        } else if (e.from === LOCAL) {
          this.sfx.stolenFrom();
          this.hud.banner('DISARMED!', 'red', true);
        }
        this.hud.feed(`${this.who(e.to)} stole ${this.who(e.from)}'s ${info.name.toLowerCase()}`);
        break;
      }
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
          this.hud.floater(this.pos(e.from, 2.6), cam, `-${Math.round(e.n * TUNING.weapons.hitHp)}`, 'minus');
        }
        break;
      }
      case 'hit': {
        const big = e.kind !== 'grab';
        hv(e.victim).flash();
        hv(e.victim).bump(big ? 0.4 : 0.25);
        if (big) hv(e.victim).knockSpin(e.kind === 'bomb' ? 2 : 1);
        if (w.players[e.victim].state !== 'stunned') hv(e.victim).oneShot(Math.random() < 0.5 ? 'Hit_A' : 'Hit_B', this.time, 1.6, 0.4);
        // a tiny freeze sells a heavy blow you dealt or took; never for the rapid laser or other people's fights
        if (e.kind !== 'blaster' && (e.victim === LOCAL || e.by === LOCAL)) this.hitStop = Math.max(this.hitStop, 0.035);
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
      case 'boxPick': {
        if (e.p === LOCAL) this.tally.boxes = (this.tally.boxes ?? 0) + 1;
        const info = WEAPON_INFO[e.weapon];
        this.fx.emit(e.x, 0.9, e.z, { n: 26, color: ['#ffd84a', '#ffffff', info.color], speed: 5, up: 4, life: 0.5, size: 0.45 });
        this.fx.ring(e.x, e.z, info.color, 2.2, 0.35, 0.4);
        this.weapons?.pickup(e.x, e.z, e.weapon);
        if (e.p === LOCAL) {
          this.sfx.power();
          this.hud.skillBanner(info.name, info.color);
          this.hud.weaponCard(e.weapon);
          if (this.weaponTips.has(e.weapon) === false) {
            this.weaponTips.add(e.weapon);
            this.hud.tip(`${info.name}: ${info.tip} · press ${this.touch ? 'the big button' : 'J or click'} to use`, 3.5);
          }
        }
        break;
      }
      case 'laser': {
        const H = hv(e.p);
        const from = H.muzzle(new THREE.Vector3()) ?? new THREE.Vector3(w.players[e.p].x, w.players[e.p].y + 1.05, w.players[e.p].z);
        const to = new THREE.Vector3(e.tx, e.ty, e.tz);
        this.weapons?.laser(from, to, e.hit >= 0, item(this.looks[e.p]?.laser ?? '')?.colors);
        if (e.p === LOCAL) {
          this.hud.shotKick();
          if (e.hit >= 0) this.hud.hitMarker(false);
        }
        break;
      }
      case 'fire': {
        const H = hv(e.p);
        const anim = e.weapon === 'banana' ? 'Interact' : e.weapon === 'freeze' ? 'Throw' : e.weapon === 'hammer' ? '2H_Melee_Attack_Spin' : e.weapon === 'hook' ? 'Spellcast_Raise' : '1H_Ranged_Shoot';
        if (e.weapon === 'blaster' || e.weapon === 'rocket') H.shoot(this.time);
        else H.oneShot(anim, this.time, 1.6, 0.45);
        H.onFire(e.weapon, this.time);
        const near = e.p === LOCAL || Math.hypot(e.x - w.players[LOCAL].x, e.z - w.players[LOCAL].z) < 14;
        if (near) this.sfx.shoot(e.weapon);
        if (e.weapon === 'blaster' || e.weapon === 'rocket') {
          const fx = e.x + Math.sin(e.facing) * 0.8;
          const fz = e.z + Math.cos(e.facing) * 0.8;
          const my = w.players[e.p].y + 1.05;
          if (e.weapon === 'rocket') {
            this.fx.emit(fx, my, fz, { n: 14, color: [WEAPON_INFO[e.weapon].color, '#ffffff', '#ffd23f'], speed: 3, up: 1, life: 0.2, size: 0.45 });
            this.fx.emit(e.x - Math.sin(e.facing) * 0.9, my, e.z - Math.cos(e.facing) * 0.9, { n: 10, color: ['#bbbbbb', '#ffffff'], speed: 2.5, up: 0.8, life: 0.5, size: 0.7 }); // backblast smoke
          }
          if (e.p === LOCAL && e.weapon === 'rocket') this.rig.punch(4);
        }
        if (e.weapon === 'hammer') this.fx.cone(e.x, e.z, e.facing, TUNING.weapons.hammer.radius, 360, '#ffd23f', TUNING.weapons.hammer.windup + 0.05, 0.4);
        break;
      }
      case 'super': {
        const def = HEROES[w.players[e.p].hero];
        const gy = w.terrain.heightAt(e.x, e.z);
        if (e.p !== LOCAL) this.fx.pillar(e.x, e.z, def.color, 8, 0.5, 0.6); // never in front of your own view
        this.fx.ring(e.x, e.z, def.color, 4.5, 0.6, 0.6);
        this.fx.ring(e.x, e.z, '#ffffff', 2.8, 0.45, 0.4);
        this.fx.emit(e.x, gy + 1.2, e.z, { n: 60, color: [def.color, '#ffffff', '#ffd23f'], speed: 8, up: 6, life: 0.7, size: 0.55 });
        hv(e.p).bump(0.5);
        if (w.players[e.p].hero !== 'bones') hv(e.p).oneShot('Cheer', this.time, 2, 0.5);
        if (e.p === LOCAL) {
          this.hud.skillBanner(def.superName + '!', def.color);
          this.hud.flash(def.color, 0.55);
          this.sfx.crown();
          this.rig.shake(0.35);
          haptics.buzz([30, 40, 60]);
        } else {
          this.hud.feed(`${this.who(e.p)} unleashed <b>${def.superName}</b>!`);
          if (Math.hypot(e.x - w.players[LOCAL].x, e.z - w.players[LOCAL].z) < 18) this.sfx.warn();
        }
        break;
      }
      case 'superEnd':
        this.fx.ring(w.players[e.p].x, w.players[e.p].z, '#ffffff', 2, 0.3);
        break;
      case 'streak': {
        const q = w.players[e.p];
        if (e.p !== LOCAL) this.fx.pillar(q.x, q.z, '#ffd23f', 7, 0.4, 0.5);
        else this.fx.ring(q.x, q.z, '#ffd23f', 3, 0.5, 0.5);
        if (e.p === LOCAL) {
          setTimeout(() => this.hud.banner(`${e.n} KO STREAK!`, 'gold'), 900);
          setTimeout(() => this.hud.banner('Health + speed + Super energy', 'teal', true), 1600);
          this.sfx.crown();
          haptics.buzz([20, 30, 20]);
        } else this.hud.feed(`${this.who(e.p)} is on a <b>${e.n} KO streak</b>!`);
        break;
      }
      case 'twist':
        if (this.mode === 'match' && e.mod !== 'double') { // (the finale banner announces double points)
          this.hud.twist(e.mod, w.mode);
          this.sfx.land2();
        }
        break;
      case 'boom': {
        if (e.kind === 'quake') {
          this.fx.ring(e.x, e.z, '#7fe3ff', e.r + 0.5, 0.7, 0.8);
          this.fx.ring(e.x, e.z, '#ffffff', e.r * 0.65, 0.5, 0.5);
          this.fx.dome(e.x, e.z, '#7fe3ff', e.r * 0.7, 0.5);
          this.fx.crack(e.x, e.z, e.r * 1.6);
          this.fx.dust(e.x, e.z, true);
          this.fx.emit(e.x, 0.6, e.z, { n: 70, color: ['#7fe3ff', '#ffffff'], speed: 13, up: 4, life: 0.6, size: 0.6 });
        } else if (e.kind === 'rocket') {
          this.fx.emit(e.x, 1, e.z, { n: 40, color: ['#ff8a3d', '#ffd23f', '#ffffff', '#555555'], speed: 8, up: 4, life: 0.6, size: 0.7 });
          this.fx.dome(e.x, e.z, '#ff8a3d', e.r * 1.3, 0.35);
          this.fx.dust(e.x, e.z, true);
        } else if (e.kind === 'freeze') {
          this.fx.emit(e.x, 0.8, e.z, { n: 50, color: ['#c9f6ff', '#ffffff', '#7fdcff'], speed: 6, up: 3, life: 0.7, size: 0.55 });
          this.fx.ring(e.x, e.z, '#bff4ff', e.r + 0.4, 0.5, 0.5);
          this.fx.dome(e.x, e.z, '#bff4ff', e.r, 0.5);
        } else {
          this.fx.ring(e.x, e.z, '#ffd23f', e.r + 0.6, 0.4, 0.5);
          this.fx.crack(e.x, e.z, e.r * 1.4);
          this.fx.emit(e.x, 0.4, e.z, { n: 30, color: ['#ffd23f', '#ffffff'], speed: 8, up: 2, life: 0.4, size: 0.5 });
          this.fx.pillar(e.x, e.z, '#fff27a', 5, 0.3, 0.5);
          // thunder: jagged bolts radiate from the impact
          const gy = w.terrain.heightAt(e.x, e.z);
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2 + Math.random() * 0.5;
            this.fx.lightning(this.v.set(e.x, gy + 0.4, e.z).clone(), new THREE.Vector3(e.x + Math.sin(a) * e.r, gy + 0.3, e.z + Math.cos(a) * e.r), k % 2 ? '#fff6a8' : '#b9a0ff');
          }
        }
        const d = Math.hypot(e.x - w.players[LOCAL].x, e.z - w.players[LOCAL].z);
        if (d < 16) {
          this.sfx.boom();
          this.rig.shake(Math.max(0.1, 0.45 - d * 0.025));
        }
        break;
      }
      case 'hook':
        // teal energy cable (the colour of the spool) from the hook to where it caught (or hit a wall / flew out)
        this.fx.beam(this.pos(e.p, 1.1), new THREE.Vector3(e.x, w.terrain.heightAt(e.x, e.z) + 1.1, e.z), '#4ff3e6', e.target >= 0 ? 0.5 : 0.3);
        if (e.target >= 0) {
          this.fx.emit(e.x, w.terrain.heightAt(e.x, e.z) + 1.1, e.z, { n: 14, color: ['#4ff3e6', '#ffffff', '#ff5f7a'], speed: 4, up: 1, life: 0.3, size: 0.4 });
          this.fx.ring(e.x, e.z, '#4ff3e6', 1.4, 0.3, 0.3);
        } else this.fx.emit(e.x, w.terrain.heightAt(e.x, e.z) + 1.1, e.z, { n: 6, color: ['#bbbbbb', '#ffffff'], speed: 2, up: 1, life: 0.25, size: 0.3 });
        break;
      case 'slip':
        hv(e.p).knockSpin(2);
        this.fx.emit(w.players[e.p].x, w.players[e.p].y + 0.4, w.players[e.p].z, { n: 14, color: ['#ffe14a', '#ffffff'], speed: 4, up: 3, life: 0.4, size: 0.4 });
        this.fx.debris(w.players[e.p].x, w.players[e.p].y + 0.5, w.players[e.p].z, 4, ['#ffe14a', '#fff2a0'], 3, 4, 0.7); // peel bits fly
        this.fx.ring(w.players[e.p].x, w.players[e.p].z, '#ffe14a', 1.6, 0.3, 0.3);
        if (e.p === LOCAL) this.hud.banner('SLIPPED!', 'gold', true);
        break;
      case 'frozen': {
        hv(e.p).flash();
        hv(e.p).freeze(TUNING.weapons.freeze.freeze, this.time);
        const fp = w.players[e.p];
        this.fx.debris(fp.x, fp.y + 1, fp.z, 8, ['#dffaff', '#9fe8ff', '#ffffff'], 4, 4, 0.8);
        this.fx.emit(fp.x, fp.y + 1, fp.z, { n: 18, color: ['#c9f6ff', '#ffffff'], speed: 3, up: 2, life: 0.5, size: 0.4 });
        if (e.p === LOCAL) this.hud.banner('FROZEN!', 'teal', true);
        break;
      }
      case 'damage':
        this.hud.floater(this.pos(e.victim, 2.6), cam, `-${Math.round(e.n * TUNING.weapons.hitHp)}`, 'minus'); // health points, not "hits"
        if (e.victim === LOCAL && e.hp > 0 && e.hp <= TUNING.weapons.hitHp) this.hud.banner('ALMOST OUT!', 'red', true);
        break;
      case 'ko': {
        const P = w.players[e.victim];
        if (e.by === LOCAL) this.hud.hitMarker(true);
        const pop = e.by >= 0 ? item(this.looks[e.by]?.ko ?? '')?.colors : undefined;
        if (pop?.length) {
          this.fx.emit(e.x, 1.4, e.z, { n: 60, color: pop, speed: 8, up: 7, life: 0.9, size: 0.5, gravity: 7 });
          this.fx.ring(e.x, e.z, pop[0], 3.4, 0.55, 0.5);
        }
        this.fx.emit(e.x, 1.2, e.z, { n: 30, color: ['#ffffff', '#b38cff', '#bff8ff'], speed: 6, up: 3, life: 0.5, size: 0.5 });
        this.fx.ring(e.x, e.z, '#b38cff', 2.6, 0.4, 0.4);
        if (e.by === LOCAL) {
          this.sfx.win();
          // KO streaks: chain knockouts within 6 s for a bigger call-out
          this.koStreak = this.time - this.koStreakT < 6 ? this.koStreak + 1 : 1;
          this.koStreakT = this.time;
          const call = ['', 'KO!', 'DOUBLE KO!', 'TRIPLE KO!', 'MEGA KO!'][this.koStreak] ?? 'UNSTOPPABLE!';
          this.hud.skillBanner(`${call} +${TUNING.weapons.bubble.koPoints}`, this.koStreak > 1 ? '#ff5fd2' : '#ffd23f');
          if (this.koStreak > 1) {
            this.hud.banner(call, 'pink');
            this.hud.flash('#ff5fd255', 0.35);
            this.rig.punch(4);
            this.hud.feed(`🔥 <b>You</b> are on a ${this.koStreak}× KO streak!`);
          }
          this.hud.floater(this.pos(LOCAL, 2.8), cam, `+${TUNING.weapons.bubble.koPoints}`, 'plus');
          this.slowMo(0.35, 0.3);
          this.roundStats.steals++;
        } else if (e.victim === LOCAL) {
          this.sfx.lose();
          this.koStreak = 0;
          this.hud.banner(e.by >= 0 ? `${w.players[e.by].name} KO'd you — MASH to escape!` : 'KO! MASH to escape!', 'red');
          this.rig.shake(0.5);
        }
        if (e.by >= 0) this.hud.feed(`${this.who(e.by)} 🫧 ${this.who(e.victim)}`);
        if (e.by >= 0 && e.by !== LOCAL) this.say(e.by, 'youRobbed', false);
        void P;
        break;
      }
      case 'pop': {
        if (e.by === LOCAL) this.tally.pops = (this.tally.pops ?? 0) + 1;
        this.weapons?.popAt(e.x, w.players[e.victim].y, e.z);
        this.sfx.pop();
        if (e.by === LOCAL) {
          this.hud.skillBanner(`POP! +${TUNING.weapons.bubble.popPoints}`, '#b38cff');
          this.hud.floater(this.pos(LOCAL, 2.8), cam, `+${TUNING.weapons.bubble.popPoints}`, 'plus');
        } else if (e.victim === LOCAL) this.hud.banner(`${w.players[e.by].name} popped your bubble!`, 'red', true);
        if (e.by !== LOCAL) this.hud.feed(`${this.who(e.by)} popped ${this.who(e.victim)}'s bubble`);
        break;
      }
      case 'escape':
        this.weapons?.popAt(w.players[e.p].x, w.players[e.p].y, w.players[e.p].z);
        if (e.p === LOCAL) this.hud.banner('ESCAPED!', 'teal', true);
        break;
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
        this.hud.banner(`FINAL ${TUNING.finale.seconds} SECONDS!`, 'red');
        setTimeout(() => this.hud.banner(this.world.mode === 'weapons' ? 'Double points · the edges are crumbling' : 'Scores hidden · coins ×2', 'gold', true), 1100);
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
          if (this.mode === 'match') this.hud.roulette(w.mod, w.round, w.mode);
        }
        if (e.n <= 3) this.hud.countdown(e.n);
        this.sfx.count();
        break;
      case 'roundStart':
        if (this.mode === 'match') this.rig.faceBehind(w.players[LOCAL].facing);
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
    if (TUNING.match.rounds === 1) {
      if (won && this.firstMatch) {
        this.profile.coins += TUNING.rewards.firstRoundWinCoins;
        saveProfile(this.profile);
      }
      this.hud.prompt(null);
      this.hud.hintButton(null);
      this.tut = 'done';
      this.hud.banner('TIME!', 'gold');
      track('round_end', { round: e.round, banked: me.bankedRound, stolen: this.roundStats.stolen, steals: this.roundStats.steals, won, lostUnbanked: lost });
      return;
    }
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
    this.input.releaseMouse();
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
    if (rank === 1) platform.celebrate();
    this.profile.matches++;
    const rounds = TUNING.match.rounds;
    const R = TUNING.rewards;
    const coinsWon = R.perMatch + Math.floor(me.bankedTotal / R.pointsPerCoin) + (rank === 1 ? R.win : rank <= 3 ? R.podium : 0);
    const matchXp = 60 + me.bankedTotal * 4 + me.roundsWon * 20 + (rank === 1 ? 80 : rank <= 3 ? 40 : 0);
    const before = levelOf(this.profile.xp);
    const t = this.tally;
    t.kos = me.kos;
    t.hits = me.stats.hitsLanded;
    t.matches = 1;
    t.wins = rank === 1 ? 1 : 0;
    t.podiums = rank <= 3 ? 1 : 0;
    const missions = advanceMissions(this.profile.missions, t, before.level, this.profile.matches);
    const xpWon = matchXp + missions.xp;
    this.profile.missions = missions.board;
    this.profile.coins += coinsWon;
    this.profile.xp += xpWon;
    this.profile.form = nextForm(this.profile.form, rank, this.world.players.length);
    const after = levelOf(this.profile.xp);
    const unlocks = UNLOCK_TRACK.filter((u) => u.level > before.level && u.level <= after.level).map((u) => this.rewardCard(u));
    this.profile.lastSeen = new Date().toISOString().slice(0, 10);
    saveProfile(this.profile);
    track('match_end', { rank, rounds, level: after.level, banked: me.bankedTotal, seconds: Math.round((performance.now() - this.matchStart) / 1000) });
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
        unlocks,
        missions: missions.finished.map((m) => ({ text: missionText(m), xp: m.xp })),
        next: this.nextReward(after.level),
        coinsWon,
        xpWon,
        level: after.level,
        levelUp: after.level > before.level,
        xpFrac: after.frac,
        waitForHost: !!this.room && !this.room.isHost,
        double: platform.canReward()
          ? async () => {
              if (!(await this.withAd((h) => platform.rewarded('double_coins', h)))) return false;
              this.profile.coins += coinsWon;
              saveProfile(this.profile);
              track('ad_reward', { kind: 'double', coins: coinsWon });
              return true;
            }
          : null,
        onRematch: async () => {
          if (this.adBusy) return;
          this.sfx.click();
          // a short break between solo matches (never before a newcomer's second match, never mid-friends-session)
          if (!this.room && this.profile.matches >= 2) await this.withAd((h) => platform.breakAd('rematch', h));
          this.fillScreen();
          this.captureMouse();
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
          this.startMatch(this.world.players[LOCAL].hero);
        },
        onHome: () => {
          this.sfx.click();
          this.leaveRoom();
          this.firstMatch = false;
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
    else if (this.world.mode === 'weapons' && s === 'coins') this.hud.prompt('Grab a ❓ mystery box!');
    else if (this.world.mode === 'weapons' && s === 'bank') this.hud.prompt(this.touch ? 'Tap the BIG button to attack!' : `Press ${key('J')} or click to attack!`);
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
    } else if (w.mode === 'weapons') {
      // box → attack → done (KO bubbles explain themselves with "POP ME!")
      if (this.tut === 'coins' && me.weapon) this.tutAdvance('bank');
      else if (this.tut === 'bank' && (!me.weapon || this.tutT > 6)) {
        this.tutAdvance('done');
        this.hud.tip('KO rivals for a point · pop their bubble for another', 4);
      }
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

  /** Local input turned from screen directions into world directions for the current camera. */
  private readLocal(): Input {
    const i = this.input.read();
    const w = this.rig.toWorld(i.mx, i.mz);
    this.lastStickFwd = -i.mz;
    // the laser is automatic: hold fire, or (touch, optional) just keep the crosshair on a rival
    const me = this.world.players[LOCAL];
    const phoneAuto = this.touch && this.profile.autoFire && this.world.phase === 'playing' && this.autoAttack(me);
    const auto = phoneAuto || (me.weapon === 'blaster' && this.input.firing);
    return { ...i, grab: i.grab || auto, mx: w.x, mz: w.z, aim: this.aimInfo?.heading, aimD: this.aimInfo?.dist, aimY: this.aimInfo?.y };
  }
  private lastStickFwd = 0;
  private guest = new GuestNet();
  private matchId = 0;
  private shotWait = 0;
  private hostClock: Worker | null = null;
  /** What each seat wears. */
  private looks: Look[] = [];
  private adOpen = false;
  private adBusy = false;
  private shop: Shop | null = null;
  private superTold = false;

  /** Phones: should the held weapon (or fist) attack by itself right now? */
  private autoAttack(me: Player) {
    const T = TUNING.weapons;
    const near = (r: number) => this.world.players.some((q) => q !== me && targetable(q) && Math.hypot(q.x - me.x, q.z - me.z) < r);
    if (!me.weapon) return near(1.7);
    if (me.weapon === 'hammer') return near(T.hammer.radius * 0.85);
    if (me.weapon === 'banana') return false; // a trap is a choice
    if (!this.aimLocked) return false;
    return me.weapon === 'blaster' || me.weapon === 'rocket' ? true : near(11);
  }

  /** Phones: while attacking, the view drifts onto a rival who is almost under the crosshair. */
  private aimMagnet(dt: number) {
    if (!this.touch || !this.profile.aimAssist || !this.rig.turns || performance.now() - this.input.lookT < 140) return;
    const me = this.world.players[LOCAL];
    if (this.mode !== 'match' || !this.input.enabled || !me.weapon || me.weapon === 'banana' || me.weapon === 'hammer') return;
    this.stage.camera.getWorldDirection(this.v);
    const view = Math.atan2(this.v.x, this.v.z);
    const cam = this.stage.camera.position;
    let best = (11 * Math.PI) / 180;
    let turn = 0;
    for (const q of this.world.players) {
      if (q === me || !targetable(q) || Math.hypot(q.x - me.x, q.z - me.z) > 18) continue;
      let off = Math.atan2(q.x - cam.x, q.z - cam.z) - view;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      if (Math.abs(off) < best && this.canSee(me, q)) {
        best = Math.abs(off);
        turn = off;
      }
    }
    const step = Math.min(Math.abs(turn), dt * 1.1);
    if (step > 0.001) this.rig.addYaw(Math.sign(turn) * step);
  }
  /** Where the local player is pointing this frame (camera centre line in 3rd person, cursor on desktop top-down). */
  private aimInfo: { heading: number; dist: number; y?: number } | null = null;
  private aimLocked = false;
  private aimRay = new THREE.Raycaster();
  private aimNdc = new THREE.Vector2();

  private updateAim() {
    this.aimInfo = null;
    if (this.mode !== 'match' || this.world.mode !== 'weapons' || !this.input.enabled) return;
    const me = this.world.players[LOCAL];
    if (this.rig.turns) {
      // shooter aim: the shot goes to exactly what is under the crosshair (screen centre)
      const cam = this.stage.camera;
      cam.getWorldDirection(this.v);
      const d = this.v;
      const o = cam.position;
      const W = this.world;
      // start level with the hero, so something between the camera and you never catches the shot
      const t0 = Math.max(0, (me.x - o.x) * d.x + (me.y + 1.2 - o.y) * d.y + (me.z - o.z) * d.z - 0.3);
      let hit = castRay(W, o.x + d.x * t0, o.y + d.y * t0, o.z + d.z * t0, d.x, d.y, d.z, 45, me);
      this.aimLocked = !!hit.player;
      let px = hit.x;
      let py = hit.y;
      let pz = hit.z;
      if (hit.player) {
        // aim for the body's centre line at that height: the same shot from your gun, a hand's width off your eye line
        const h = Math.hypot(d.x, d.z) || 1;
        const along = ((hit.player.x - px) * d.x + (hit.player.z - pz) * d.z) / h;
        px += (d.x / h) * Math.max(0, along);
        pz += (d.z / h) * Math.max(0, along);
        py += (d.y / h) * Math.max(0, along);
      } else if (this.touch && this.profile.aimAssist) {
        // thumbs only: a rival within a few degrees of the crosshair takes the shot
        let best = Math.tan((4 * Math.PI) / 180);
        for (const q of W.players) {
          if (q === me || q.state === 'falling' || q.state === 'launched') continue;
          const cx = q.x - o.x;
          const cy = q.y + 1.05 - o.y;
          const cz = q.z - o.z;
          const along = cx * d.x + cy * d.y + cz * d.z;
          if (along <= t0 || along > 24) continue;
          const off = Math.sqrt(Math.max(0, cx * cx + cy * cy + cz * cz - along * along)) / along;
          if (off < best && this.canSee(me, q)) {
            best = off;
            px = q.x;
            py = q.y + 1.05;
            pz = q.z;
            this.aimLocked = true;
          }
        }
      }
      const tx = px - me.x;
      const tz = pz - me.z;
      const dd = Math.hypot(tx, tz);
      const heading = dd > 0.8 ? Math.atan2(tx, tz) : Math.atan2(d.x, d.z);
      this.aimInfo = { heading, dist: Math.max(0.8, dd), y: py };
      return;
    }
    // top-down views: the scope sits under the mouse pointer
    if (this.touch || performance.now() - this.input.mouse.t > 4000) return;
    this.aimNdc.set((this.input.mouse.x / innerWidth) * 2 - 1, -((this.input.mouse.y / innerHeight) * 2 - 1));
    this.aimRay.setFromCamera(this.aimNdc, this.stage.camera);
    const o = this.aimRay.ray.origin;
    const d = this.aimRay.ray.direction;
    if (d.y > -0.02) return;
    const t = (me.y - o.y) / d.y;
    const hx = o.x + d.x * t - me.x;
    const hz = o.z + d.z * t - me.z;
    if (Math.hypot(hx, hz) < 0.4) return;
    this.aimInfo = { heading: Math.atan2(hx, hz), dist: Math.hypot(hx, hz) };
  }

  /** Nothing solid between two heroes (aim assist must not drag the aim behind a wall). */
  private canSee(a: { x: number; z: number }, b: { x: number; z: number }) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    for (let s = 0.7; s < d - 0.7; s += 0.4) if (!this.world.clear(a.x + ((b.x - a.x) * s) / d, a.z + ((b.z - a.z) * s) / d, 0.05)) return false;
    return true;
  }

  /** Is (x, z) standing between the camera and the point (fx, fz)? (any camera direction) */
  private prevPos: { x: number; y: number; z: number }[] = [];
  private lerpA = 1;
  /** Position to draw a player at: blended between the previous and current sim step (null = draw as is). */
  private visPos(id: number) {
    const q = this.world.players[id];
    const a = this.prevPos[id];
    if (!a || this.lerpA >= 1) return null;
    if (q.state === 'falling' || q.state === 'launched' || Math.hypot(q.x - a.x, q.z - a.z) > 2) return null;
    const t = this.lerpA;
    return { x: a.x + (q.x - a.x) * t, y: a.y + (q.y - a.y) * t, z: a.z + (q.z - a.z) * t };
  }

  private blocksView(x: number, z: number, fx: number, fz: number, width: number) {
    const c = this.stage.camera.position;
    const vx = fx - c.x;
    const vz = fz - c.z;
    const L2 = vx * vx + vz * vz || 1;
    const t = ((x - c.x) * vx + (z - c.z) * vz) / L2;
    if (t < 0.05 || t > 0.97) return false;
    const px = c.x + vx * t - x;
    const pz = c.z + vz * t - z;
    return px * px + pz * pz < width * width;
  }

  private async previewModels(names: string[]) {
    const me = this.world.players[LOCAL];
    const fx = Math.sin(me.facing);
    const fz = Math.cos(me.facing);
    // &native: real-world size, laid out in a row ahead (judge scale and style next to the heroes)
    const native = PARAMS.has('native');
    let side = 0;
    for (let i = 0; i < names.length; i++) {
      const [name, x, z, rot] = names[i].split(':');
      const m = await loadModel(`assets/models/${name}.glb`, native ? {} : { height: 1 });
      if (x !== undefined) m.root.position.set(+x, 0, +(z ?? 0));
      else if (native) {
        side += m.size.x / 2;
        m.root.position.set(me.x + fx * 4 + fz * (side - 3), 0, me.z + fz * 4 - fx * (side - 3));
        side += m.size.x / 2 + 0.6;
      } else {
        const off = (i - (names.length - 1) / 2) * 1.8;
        m.root.position.set(me.x + fx * 3.2 + fz * off, 0, me.z + fz * 3.2 - fx * off);
      }
      if (rot) m.root.rotation.y = (+rot * Math.PI) / 180;
      this.stage.scene.add(m.root);
    }
  }

  /** Run something that may show an ad: the game stands still and silent, and nothing can be clicked meanwhile. */
  private async withAd<T>(run: (h: AdHooks) => Promise<T>): Promise<T | undefined> {
    if (this.adBusy) return undefined;
    this.adBusy = true;
    const cover = document.createElement('div');
    cover.className = 'ad-cover';
    document.body.append(cover);
    try {
      return await run({
        start: () => {
          this.adOpen = true;
          this.sfx.blocked = true;
          this.input.releaseMouse();
        },
        end: () => {
          this.adOpen = false;
          this.sfx.blocked = platform.muted();
        },
      });
    } finally {
      cover.remove();
      this.adOpen = this.adBusy = false;
      this.sfx.blocked = platform.muted();
    }
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private openShop() {
    if (this.shop) return;
    this.sfx.unlock();
    this.sfx.click();
    track('shop_open', { coins: this.profile.coins });
    let products: Product[] = [];
    const state = (): ShopState => ({
      wallet: this.profile,
      products,
      ads: platform.canReward() ? { left: adCoinsLeft(this.profile, this.today(), RELEASE.adCoinsPerDay), coins: RELEASE.adCoins } : null,
    });
    const shop = (this.shop = new Shop(state()));
    this.home?.show(false);
    const refresh = (note = '') => {
      saveProfile(this.profile);
      this.home?.setCoins(this.profile.coins);
      if (this.shop === shop) shop.update(state(), note);
    };
    shop.onItem = (id) => {
      const had = this.profile.coins;
      if (!buyOrWear(this.profile, id)) return refresh(`You need ${item(id)!.price - this.profile.coins} more coins`);
      if (had !== this.profile.coins) {
        track('shop_buy', { id });
        this.sfx.power();
      } else this.sfx.click();
      refresh();
    };
    shop.onAd = async () => {
      if (adCoinsLeft(this.profile, this.today(), RELEASE.adCoinsPerDay) <= 0) return;
      if (!(await this.withAd((h) => platform.rewarded('shop_coins', h)))) return refresh('No video available right now');
      countAd(this.profile, this.today());
      this.profile.coins += RELEASE.adCoins;
      track('ad_reward', { kind: 'shop', coins: RELEASE.adCoins });
      refresh();
    };
    shop.onPack = async (id) => {
      const bought = await platform.buy(id);
      if (!bought) return refresh('Nothing was charged');
      const done = await this.handOut(bought.id, bought.token);
      refresh(done ? '' : 'Payment received. Your coins arrive as soon as it is confirmed.');
    };
    shop.onClose = () => {
      this.sfx.click();
      shop.close();
      this.shop = null;
      this.home?.show(true);
    };
    void platform.products().then((p) => {
      products = p;
      if (this.shop === shop) shop.update(state());
    });
  }

  /** Confirm a paid pack, give its coins (once), save, then tell the store. False: left for the next start. */
  private async handOut(id: string, token: string) {
    const pack = RELEASE.coinPacks.find((p) => p.id === id);
    if (!pack) return false;
    // already handed out here: only the store still needs telling
    if (!this.profile.redeemed.includes(token) && !(await platform.confirm(id, token))) return false;
    if (redeem(this.profile, pack.coins, token)) {
      saveProfile(this.profile);
      track('iap', { id });
      this.sfx.crown();
    }
    await platform.consume(token).catch((e) => console.warn('store did not confirm yet', e));
    return true;
  }

  private async settlePurchases() {
    for (const p of await platform.pending()) await this.handOut(p.id, p.token);
    this.home?.setCoins(this.profile.coins);
  }

  private applyPhonePrefs() {
    document.body.dataset.buttons = this.profile.buttons;
    haptics.on = this.profile.vibrate;
  }

  /** Phones: fill the screen and hold landscape once the player starts a match (needs their tap). */
  private fillScreen() {
    if (!platform.canFullscreen || !this.touch || document.fullscreenElement || navigator.webdriver) return;
    void document.documentElement
      .requestFullscreen?.({ navigationUI: 'hide' })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => {});
  }

  private applyCamera(p: CamPreset) {
    if (!CAM_PRESETS[p]) p = 'close';
    this.rig.setPreset(p);
    this.input.mouseLook = this.rig.turns && this.mode === 'match';
    if (!this.rig.turns) this.input.releaseMouse();
    else if (this.world) this.rig.faceBehind(this.world.players[LOCAL].facing);
    document.body.classList.toggle('cam-third', this.rig.turns);
    this.stage.fovBase = this.rig.presetFov;
    this.stage.resize();
  }

  private hadMouse = false;
  private lockPausedAt = -1000;

  /** Desktop third person: take the mouse for aiming (call from a click). */
  private captureMouse() {
    if (this.touch || AUTOPLAY) return;
    const cam = (PARAMS.get('cam') as CamPreset) || this.profile.camera;
    if (cam !== 'third') return;
    this.input.mouseLook = true;
    this.input.lockMouse();
  }

  private applyAimSpeed() {
    this.input.sensitivity = { low: 0.6, normal: 1, high: 1.6 }[this.profile.aimSpeed] ?? 1;
  }

  private togglePause() {
    if (this.world.phase === 'matchEnd' && this.mode === 'match') return;
    this.setPaused(!this.paused);
  }

  private setPaused(p: boolean) {
    this.paused = p;
    if (p) this.input.releaseMouse();
    // the landing UI sits above the HUD layer: hide it while the settings panel is open
    this.home?.show(!p);
    if (p) {
      this.hud.showPause(
        {
          sound: this.profile.sound,
          shake: this.profile.shake,
          quality: this.autoQuality ? `auto (${this.stage.quality})` : this.stage.quality,
          inMatch: this.mode === 'match',
          camera: CAM_PRESETS[this.rig.preset].label,
          aimSpeed: this.profile.aimSpeed,
          autoFire: this.touch ? this.profile.autoFire : null,
          aimAssist: this.touch ? this.profile.aimAssist : null,
          buttons: this.touch ? this.profile.buttons : null,
          vibrate: this.touch ? this.profile.vibrate : null,
        },
        {
          resume: () => {
            this.setPaused(false);
            if (this.mode === 'match') this.captureMouse(); // never in the lobby: its buttons need the mouse
          },
          home: () => {
            this.sfx.click();
            track('quit_match', { round: this.world.round });
            if (this.mode === 'match' && !this.room && this.world.phase !== 'matchEnd') {
              const me = this.world.players[LOCAL];
              const done = Math.floor(this.world.roundTime / 60); // whole minutes played
              if (done > 0) {
                this.profile.xp += done * 20 + (me.bankedTotal + me.bankedRound) * 4;
                saveProfile(this.profile);
              }
            }
            this.paused = false;
            this.hud.closePanel();
            this.firstMatch = false;
            this.goHome();
          },
          toggle: (k) => {
            this.profile[k] = !this.profile[k];
            this.sfx.muted = !this.profile.sound;
            this.rig.shakeEnabled = this.profile.shake;
            saveProfile(this.profile);
            this.setPaused(true);
          },
          aimSpeed: () => {
            const order = ['low', 'normal', 'high'] as const;
            this.profile.aimSpeed = order[(order.indexOf(this.profile.aimSpeed) + 1) % 3];
            this.applyAimSpeed();
            saveProfile(this.profile);
            this.setPaused(true);
          },
          aimAssist: () => {
            this.profile.aimAssist = !this.profile.aimAssist;
            saveProfile(this.profile);
            this.setPaused(true);
          },
          autoFire: () => {
            this.profile.autoFire = !this.profile.autoFire;
            saveProfile(this.profile);
            this.setPaused(true);
          },
          credits: () => this.hud.showCredits(() => this.setPaused(true)),
          buttons: () => {
            const order = ['small', 'normal', 'large'] as const;
            this.profile.buttons = order[(order.indexOf(this.profile.buttons) + 1) % 3];
            this.applyPhonePrefs();
            saveProfile(this.profile);
            this.setPaused(true);
          },
          vibrate: () => {
            this.profile.vibrate = !this.profile.vibrate;
            this.applyPhonePrefs();
            haptics.buzz(30);
            saveProfile(this.profile);
            this.setPaused(true);
          },
          camera: () => {
            const order: PlayerCam[] = ['third', 'close', 'far', 'action'];
            const cur = order.indexOf(this.rig.preset as PlayerCam);
            const next = order[(cur + 1) % order.length];
            this.profile.camera = next;
            saveProfile(this.profile);
            this.applyCamera(next);
            track('camera_selected', { camera: next });
            this.setPaused(true);
          },
          quality: () => {
            const order: Quality[] = ['low', 'medium', 'high'];
            const next = order[(order.indexOf(this.stage.quality) + 1) % 3];
            this.autoQuality = false;
            this.profile.quality = next;
            saveProfile(this.profile);
            this.stage.scale = 1;
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

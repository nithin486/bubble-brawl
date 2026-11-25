import type { WeaponKind } from './types.ts';
// Coin Clash simulation. Pure TypeScript: no Three.js, no DOM.
// The client renders it; in Step 2 the Colyseus server runs this same file.
import { TUNING } from '../config/tuning.ts';
import { HEROES, type HeroId } from '../config/heroes.ts';
import { Arena } from './arena.ts';
import { clamp, dirX, dirZ, facingOf, inCone, len, angleDiff, Rng } from './math.ts';
import { Terrain } from './terrain.ts';
import { MAPS, type MapDef, type MapId, type Obstacle } from '../config/maps.ts';
import { Brawl } from './brawl.ts';
import { NO_INPUT, type GameMode, type Hazard, type RoundMod, type Bomb, type PowerKind, type PowerUp, type Bank, type BouncePad, type Coin, type Input, type Phase, type Player, type SimEvent, WEAPONS } from './types.ts';

const T = TUNING;

export interface PlayerSetup {
  name: string;
  hero: HeroId;
  isBot: boolean;
}

export class World {
  /** 'weapons' = mystery boxes + KO points; 'coins' = the original carry-and-bank game. */
  mode: GameMode = 'weapons';
  brawl: Brawl;
  /** How good the bots are, 0 (gentle) .. 1 (sharp). */
  skill = 0.5;
  /** Weapons the mystery boxes may hold (levels unlock more). Round twists can still hand out a locked one as a taster. */
  pool: readonly WeaponKind[] = WEAPONS;
  phase: Phase = 'countdown';
  phaseT = 0;
  round = 0;
  /** Seconds elapsed in the current round (while playing). */
  roundTime = 0;
  players: Player[] = [];
  coins: Coin[] = [];
  map: MapDef;
  arena: Arena;
  /** Walkable ramps and decks (flat for maps without any). */
  terrain!: Terrain;
  /** Solid obstacles of this map (decorations excluded). */
  obstacles: Obstacle[];
  bank: Bank;
  pads: BouncePad[] = [];
  waveT = 0;
  finale = false;
  powerups: PowerUp[] = [];
  /** Seconds this match has been ticking (the clock friends' devices follow). */
  time = 0;
  /** Host of a friends room: remember where everyone stood, to judge shots as the shooter saw them. */
  recordPositions = false;
  private past: { t: number; at: number[] }[] = [];
  /** Richest carrier wears the crown (-1 = nobody). */
  crownId = -1;
  /** This round's twist (Round Roulette). */
  mod: RoundMod = 'none';
  hazards: Hazard[] = [];
  private hazardT = 0;
  private hazardCount = 0;
  private modT = 0;
  bombs: Bomb[] = [];
  private powerT = 0;
  private jackpotT = 0;
  private jackpotWarned = false;
  private jackpotFired = false;
  private nextId = 1;
  events: SimEvent[] = [];
  rng: Rng;
  /** True for the player's very first match: bots go easy in round 1. */
  firstMatch: boolean;
  private nextCoinId = 1;
  private lastCount = -1;

  constructor(setups: PlayerSetup[], opts: { seed?: number; firstMatch?: boolean; map?: MapId; mode?: GameMode } = {}) {
    this.mode = opts.mode ?? 'weapons';
    this.brawl = new Brawl(this);
    this.rng = new Rng(opts.seed ?? (Math.random() * 2 ** 31) | 0);
    this.firstMatch = !!opts.firstMatch;
    this.map = MAPS[opts.map ?? 'candy'];
    this.arena = new Arena(this.map.shape);
    this.terrain = new Terrain(this.map.terrain);
    this.obstacles = this.map.obstacles.filter((o) => o.r > 0);
    this.players = setups.map((s, i) => newPlayer(i, s));
    for (const p of this.map.pads) {
      const t = this.arena.tileAt(p.x, p.z)!;
      this.pads.push({ x: t.x, z: t.z });
    }
    this.bank = { x: 0, z: 0, spot: 0, nextSpot: 1, moveT: 0, warned: false, glide: null };
    this.startRound(1);
  }

  get remaining() {
    return Math.max(0, T.match.roundSeconds - this.roundTime);
  }

  /** Bank spots sit at the end of each road (spoke). */
  bankSpot(i: number) {
    return this.map.bankSpots[i % this.map.bankSpots.length];
  }

  /** Obstacles whose tile is still standing. */
  activeObstacles() {
    return this.obstacles.filter((o) => this.arena.solid(o.x, o.z));
  }

  /** Push a circle out of every standing obstacle. Returns true if it moved. */
  pushOut(e: { x: number; z: number }, radius: number) {
    let moved = false;
    for (const o of this.obstacles) {
      const dx = e.x - o.x;
      const dz = e.z - o.z;
      const min = o.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || !this.arena.solid(o.x, o.z)) continue;
      const d = Math.sqrt(d2) || 0.001;
      e.x = o.x + (dx / d) * min;
      e.z = o.z + (dz / d) * min;
      moved = true;
    }
    return moved;
  }

  /** Free of obstacles with some clearance? */
  clear(x: number, z: number, clearance: number) {
    return this.obstacles.every((o) => (x - o.x) ** 2 + (z - o.z) ** 2 > (o.r + clearance) ** 2 || !this.arena.solid(o.x, o.z));
  }

  // ------------------------------------------------------------------ rounds

  startRound(round: number) {
    this.round = round;
    this.phase = 'countdown';
    this.phaseT = T.match.countdownSeconds;
    this.lastCount = -1;
    this.roundTime = 0;
    this.finale = false;
    this.coins = [];
    this.arena.reset();
    this.arena.safeRadius = this.map.shape.radius;
    const spot = this.rng.int(0, this.map.bankSpots.length - 1);
    const p = this.bankSpot(spot);
    this.bank = { x: p.x, z: p.z, spot, nextSpot: this.pickNextSpot(spot), moveT: 0, warned: false, glide: null };
    const n = this.players.length;
    const startA = this.rng.next() * Math.PI * 2;
    this.players.forEach((pl, i) => {
      if (pl.gone) return;
      const a = startA + (i / n) * Math.PI * 2;
      resetForRound(pl);
      void a;
      const st = this.map.starts[(i + Math.round(startA * 10)) % this.map.starts.length];
      pl.x = st.x;
      pl.z = st.z;
      pl.facing = facingOf(-pl.x, -pl.z);
    });
    this.waveT = 0;
    this.powerups = [];
    this.bombs = [];
    this.crownId = -1;
    this.hazards = [];
    this.hazardT = 0;
    this.hazardCount = 0;
    this.modT = 0;
    this.mod = this.pickMod(round);
    this.powerT = 0;
    this.jackpotT = 0;
    this.jackpotWarned = false;
    this.jackpotFired = false;
    if (this.mode === 'weapons') this.brawl.reset();
    else this.spawnWave(Math.round(T.coins.firstWaveSize * this.coinScale), true);
  }

  /** Round Roulette: a twist each round. First round of a first match is plain; the last round is double points. */
  private pickMod(round: number): RoundMod {
    if (this.mode === 'weapons') {
      // weapons-mode twists change how the fight plays (the coin twists mean nothing here)
      if (this.roundTime === 0) return this.firstMatch ? 'none' : this.rng.pick(['turbo', 'rapid', 'ammo'] as RoundMod[]);
      const wpool: RoundMod[] = ['turbo', 'bombs', 'rapid', 'ammo', 'rockets', 'blasters', 'frost', 'boxfest'];
      let wm = this.mod;
      while (wm === this.mod) wm = this.rng.pick(wpool);
      return wm;
    }
    if (round >= T.match.rounds) return 'double';
    if (round === 1) return this.firstMatch ? 'none' : this.rng.pick(['turbo', 'giant', 'magnet'] as RoundMod[]);
    const pool: RoundMod[] = ['giant', 'thieves', 'bombs', 'turbo', 'magnet', 'goldrush'];
    let m = this.mod;
    while (m === this.mod) m = this.rng.pick(pool);
    return m;
  }

  /** The rival a Grab would hit right now (used for aim assist and the target ring). */
  findTarget(p: Player, range = T.grab.range + T.grab.rangeForgiveness, coneDeg = T.grab.coneDeg + 50) {
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const o of this.players) {
      if (o === p || !targetable(o)) continue;
      if (!inCone(p, p.facing, o, range, coneDeg)) continue;
      const d = len(o.x - p.x, o.z - p.z);
      const score = o.carried * 0.3 - d - Math.abs(angleDiff(p.facing, facingOf(o.x - p.x, o.z - p.z))) + (o.id === this.crownId ? 3 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  /** What banking n coins is worth right now. */
  bankValue(n: number) {
    const tier = T.bankBonus.find((b) => n >= b.min);
    const mult = (tier?.mult ?? 1) * (this.mod === 'double' ? T.mods.double.bankMult : 1);
    return { total: Math.round(n * mult), mult, label: tier?.label ?? '' };
  }

  private pickNextSpot(cur: number) {
    let s = cur;
    while (s === cur) s = this.rng.int(0, this.map.bankSpots.length - 1);
    return s;
  }

  private endRound() {
    const lost = this.players.filter((p) => p.carried > 0).map((p) => ({ p: p.id, n: p.carried }));
    let winner = 0;
    for (const p of this.players) {
      p.carried = 0;
      p.bankedTotal += p.bankedRound;
      if (p.bankedRound > this.players[winner].bankedRound) winner = p.id;
    }
    this.players[winner].roundsWon++;
    this.events.push({ t: 'roundEnd', round: this.round, winner, lost });
    this.phase = 'roundEnd';
    this.phaseT = T.match.roundEndSeconds;
  }

  ranking() {
    return [...this.players]
      .sort((a, b) => Number(a.gone) - Number(b.gone) || b.bankedTotal - a.bankedTotal || b.roundsWon - a.roundsWon || a.id - b.id)
      .map((p) => p.id);
  }

  // ------------------------------------------------------------------ tick

  /** Advance the world by dt seconds. inputs[i] is player i's intent. */
  tick(dt: number, inputs: Input[]) {
    this.events.length = 0;
    this.time += dt;
    if (this.recordPositions) {
      this.past.push({ t: this.time, at: this.players.flatMap((p) => [p.x, p.z, p.y]) });
      while (this.past.length > 40) this.past.shift();
    }
    if (this.phase === 'countdown') {
      this.phaseT -= dt;
      const c = Math.ceil(this.phaseT);
      if (c !== this.lastCount && c > 0) {
        this.lastCount = c;
        this.events.push({ t: 'countdown', n: c });
      }
      // let players turn on the spot and idle animations play; no movement yet
      this.tickCoins(dt);
      if (this.phaseT <= 0) {
        this.phase = 'playing';
        this.events.push({ t: 'roundStart', round: this.round });
      }
      return;
    }
    if (this.phase === 'roundEnd') {
      this.phaseT -= dt;
      this.tickCoins(dt);
      if (this.phaseT <= 0) {
        if (this.round >= T.match.rounds) {
          this.phase = 'matchEnd';
          this.events.push({ t: 'matchEnd', ranking: this.ranking() });
        } else this.startRound(this.round + 1);
      }
      return;
    }
    if (this.phase === 'matchEnd') return;

    const before = this.roundTime;
    this.roundTime += dt;
    this.tickFinale();
    // one long match: a fresh twist every so often, and the last stretch is double points
    if (this.mode === 'weapons') {
      const every = T.match.twistEvery;
      const last = T.match.roundSeconds - T.finale.seconds;
      let next: RoundMod | null = null;
      if (before < last && this.roundTime >= last) next = 'double';
      else if (this.roundTime < last - 10 && Math.floor(before / every) !== Math.floor(this.roundTime / every)) next = this.pickMod(2);
      if (next) {
        this.mod = next;
        this.events.push({ t: 'twist', mod: next });
      }
    }
    if (this.mode === 'weapons') this.brawl.tick(dt);
    else {
      this.tickBank(dt);
      this.tickWaves(dt);
      this.tickPowerups(dt);
      this.tickJackpot(dt);
      this.tickCrown();
      this.tickMods(dt);
    }
    this.tickBombs(dt);
    this.tickHazards(dt);
    for (const p of this.players) this.tickPlayer(p, inputs[p.id] ?? NO_INPUT, dt);
    // shooter aim: with a weapon in hand you face where you point, however you are running
    if (this.mode === 'weapons')
      for (const p of this.players) {
        const aim = inputs[p.id]?.aim;
        if (p.weapon && !p.cast && p.state === 'normal' && aim !== undefined && Number.isFinite(aim)) p.facing = aim;
      }
    this.separate();
    this.tickCoins(dt);
    this.tickTiles();
    if (this.roundTime >= T.match.roundSeconds) this.endRound();
  }

  // ------------------------------------------------------------------ players

  private speedOf(p: Player) {
    const S = T.weapons.super;
    const boost = p.superT > 0 ? (p.hero === 'ranger' ? S.overdrive.speed : p.hero === 'pinch' ? S.rush.speed : 1) : 1;
    if (p.speedT > 0) return T.hero.walkSpeed * boost * T.powerups.speed.mult * (this.mod === 'turbo' ? T.mods.turbo.speedMult : 1); // speed boots ignore the carry slowdown
    const slow = Math.max(T.hero.carrySlowFloor, 1 - p.carried * T.hero.carrySlowPerCoin);
    return T.hero.walkSpeed * boost * slow * (this.mod === 'turbo' ? T.mods.turbo.speedMult : 1);
  }

  private tickPlayer(p: Player, inp: Input, dt: number) {
    if (p.gone) return;
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.grabCd = Math.max(0, p.grabCd - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.stickyT = Math.max(0, p.stickyT - dt);
    p.padCd = Math.max(0, p.padCd - dt);
    p.magnetT = Math.max(0, p.magnetT - dt);
    p.speedT = Math.max(0, p.speedT - dt);
    p.shieldT = Math.max(0, p.shieldT - dt);
    p.comboT = Math.max(0, p.comboT - dt);
    p.robbedT = Math.max(0, p.robbedT - dt);
    if (p.comboT <= 0) p.combo = 0;

    if (p.state === 'bubble') {
      this.brawl.tickBubble(p, inp.grab || inp.dash || inp.skill, dt);
      return;
    }

    switch (p.state) {
      case 'falling':
        p.vy -= 25 * dt;
        p.y += p.vy * dt;
        p.x += p.kx * dt;
        p.z += p.kz * dt;
        p.stateT -= dt;
        if (p.stateT <= 0) this.respawn(p);
        return;
      case 'launched': {
        const L = p.launch!;
        L.t += dt / T.arena.bounceSeconds;
        const t = Math.min(1, L.t);
        p.x = L.fx + (L.tx - L.fx) * t;
        p.z = L.fz + (L.tz - L.fz) * t;
        p.y = Math.sin(t * Math.PI) * T.arena.bounceHeight;
        if (t >= 1) {
          p.state = 'normal';
          p.y = 0;
          p.launch = null;
          p.padCd = 0.5;
          this.events.push({ t: 'land', p: p.id });
          if (!this.arena.solid(p.x, p.z)) this.startFall(p);
        }
        return;
      }
      case 'stunned':
      case 'stagger':
        p.stateT -= dt;
        if (p.stateT <= 0) p.state = 'normal';
        break;
      case 'dashing':
        p.stateT -= dt;
        if (p.stateT <= 0) {
          p.state = 'normal';
          p.vx = p.dashDx * this.speedOf(p);
          p.vz = p.dashDz * this.speedOf(p);
        }
        break;
    }

    const canAct = p.state === 'normal' || p.state === 'dashing';
    const live = this.phase === 'playing';

    // --- actions
    if (live && canAct && !p.cast) {
      if (inp.dash && p.dashCd <= 0 && p.state === 'normal') this.startDash(p, inp);
      else if (inp.ult && this.mode === 'weapons' && p.charge >= 1 && p.superT <= 0) this.brawl.activateSuper(p);
      else if (inp.skill && p.skillCd <= 0) this.startSkill(p);
      else if (inp.grab && p.weapon) {
        // turn to where the scope points; assist shrinks to a small cone so the shot goes where you aimed
        const aimed = inp.aim !== undefined && Number.isFinite(inp.aim);
        if (aimed) p.facing = inp.aim as number;
        this.brawl.fire(p, aimed ? { d: Number.isFinite(inp.aimD) ? (inp.aimD as number) : 8, y: Number.isFinite(inp.aimY) ? inp.aimY : undefined, rewind: inp.rewind } : undefined);
      }
      else if (inp.grab && p.grabCd <= 0) {
        // commit to a direction now (aim assist), then lunge — the target can see it coming and dash
        this.aimAt(p, T.grab.range + T.grab.rangeForgiveness + T.grab.lunge + 0.6, T.grab.coneDeg + 70);
        p.cast = { kind: 'grab', t: T.grab.windup, total: T.grab.windup };
        p.grabCd = T.grab.cooldown * (this.mod === 'thieves' ? T.mods.thieves.grabCdMult : 1);
        this.events.push({ t: 'grabStart', p: p.id, facing: p.facing });
      }
    }
    if (p.cast) {
      p.cast.t -= dt;
      if (p.cast.t <= 0) {
        const kind = p.cast.kind;
        const hammer = (p.cast as { hammer?: boolean }).hammer;
        p.cast = null;
        if (p.state !== 'stunned') {
          if (hammer) this.brawl.hammer(p);
          else if (kind === 'grab') this.resolveGrab(p);
          else this.fireSkill(p);
        }
      }
    }

    this.locomote(p, inp, dt, live);

    if (!this.arena.solid(p.x, p.z)) {
      this.startFall(p);
      return;
    }

    if (!live) return;

    // --- bounce pads
    if (p.padCd <= 0 && p.state !== 'stunned') {
      for (const pad of this.pads) {
        if (!this.arena.solid(pad.x, pad.z)) continue;
        if ((p.x - pad.x) ** 2 + (p.z - pad.z) ** 2 < T.arena.bouncePadSize ** 2) {
          const d = len(pad.x, pad.z);
          const tx = pad.x - (pad.x / d) * T.arena.bounceDistance;
          const tz = pad.z - (pad.z / d) * T.arena.bounceDistance;
          p.state = 'launched';
          p.launch = { fx: p.x, fz: p.z, tx, tz, t: 0 };
          p.facing = facingOf(-pad.x, -pad.z);
          p.kx = p.kz = 0;
          p.bankT = 0;
          p.cast = null;
          this.events.push({ t: 'bounce', p: p.id });
          return;
        }
      }
    }

    if (this.mode === 'weapons') return;

    // --- coins
    const r2 = T.coins.pickupRadius ** 2;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.delay > 0 || c.y > 1.2 || c.anyT > 0) continue;
      if (c.blockId === p.id && c.blockT > 0) continue;
      if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 < r2) {
        p.carried += c.v;
        p.combo = p.comboT > 0 ? p.combo + 1 : 1;
        p.comboT = T.combo.window;
        this.coins.splice(i, 1);
        this.events.push({ t: 'pickup', p: p.id, x: c.x, z: c.z, v: c.v, combo: p.combo });
      }
    }

    // magnet: loose coins nearby slide toward you
    const magR = p.magnetT > 0 ? T.powerups.magnet.radius : this.mod === 'magnet' ? T.mods.magnet.radius : 0;
    if (magR > 0) {
      const M = T.powerups.magnet;
      for (const c of this.coins) {
        if (!c.grounded || c.anyT > 0) continue;
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d > magR || d < 0.05) continue;
        const step = Math.min(d, M.pull * dt * (1.3 - d / magR));
        c.x += (dx / d) * step;
        c.z += (dz / d) * step;
      }
    }

    // power bubbles
    const pr2 = T.powerups.pickupRadius ** 2;
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const u = this.powerups[i];
      if (u.age < 0.6 || (u.x - p.x) ** 2 + (u.z - p.z) ** 2 > pr2) continue;
      this.powerups.splice(i, 1);
      this.givePower(p, u.kind, u.x, u.z);
    }

    // --- banking
    const inBank = (p.x - this.bank.x) ** 2 + (p.z - this.bank.z) ** 2 < T.bank.radius ** 2;
    if (inBank && p.carried > 0 && !inp.skipBank && (p.state === 'normal' || p.state === 'dashing')) {
      if (p.bankT === 0) this.events.push({ t: 'bankProgress', p: p.id });
      p.bankT += dt;
      if (p.bankT >= T.bank.bankSeconds) {
        const n = p.carried;
        const v = this.bankValue(n);
        p.bankedRound += v.total;
        p.carried = 0;
        p.bankT = 0;
        p.stats.banks++;
        p.stats.bestBank = Math.max(p.stats.bestBank, v.total);
        this.events.push({ t: 'bank', p: p.id, n, total: v.total, mult: v.mult, label: v.label, x: this.bank.x, z: this.bank.z });
        // a big deposit overloads the bubble: it pops and floats off to a new spot
        if (n >= T.bankPopAt && !this.bank.glide) {
          this.bank.moveT = Math.max(this.bank.moveT, T.bank.moveEvery - T.bank.warnSeconds);
          this.bank.warned = false;
        }
      }
    } else p.bankT = 0;
  }

  /**
   * One step of walking, dashing, being knocked about, obstacles and heights. The host runs it for everyone; a friend's
   * device runs the very same rules for its own hero, so it can move the moment a key goes down.
   */
  locomote(p: Player, inp: Input, dt: number, live: boolean) {
    // --- movement
    let moveX = 0;
    let moveZ = 0;
    if (p.state === 'dashing') {
      const v = T.dash.distance / T.dash.duration;
      moveX = p.dashDx * v;
      moveZ = p.dashDz * v;
    } else {
      let ix = live && p.state === 'normal' ? inp.mx : 0;
      let iz = live && p.state === 'normal' ? inp.mz : 0;
      const m = len(ix, iz);
      if (m > 1) {
        ix /= m;
        iz /= m;
      }
      let sp = this.speedOf(p);
      if (p.cast) sp *= 0.5;
      // grab lunge: a quick step forward during the wind-up
      if (p.cast?.kind === 'grab') {
        const lungeV = T.grab.lunge / T.grab.windup;
        ix = dirX(p.facing) * (lungeV / Math.max(0.1, sp));
        iz = dirZ(p.facing) * (lungeV / Math.max(0.1, sp));
      }
      const tx = ix * sp;
      const tz = iz * sp;
      const a = Math.min(1, T.hero.accel * dt);
      p.vx += (tx - p.vx) * a;
      p.vz += (tz - p.vz) * a;
      moveX = p.vx;
      moveZ = p.vz;
      if (m > 0.1 && !p.cast) {
        const want = facingOf(ix, iz);
        p.facing += angleDiff(p.facing, want) * Math.min(1, T.hero.turnSpeed * dt);
      }
    }

    const ox = p.x;
    const oz = p.z;
    // controlled movement never walks you off the island
    const nx = p.x + moveX * dt;
    const nz = p.z + moveZ * dt;
    if (this.arena.solid(nx, nz)) {
      p.x = nx;
      p.z = nz;
    } else if (this.arena.solid(nx, p.z)) {
      p.x = nx;
      p.vz = 0;
    } else if (this.arena.solid(p.x, nz)) {
      p.z = nz;
      p.vx = 0;
    } else {
      p.vx = 0;
      p.vz = 0;
    }

    // knockback can push you off
    const k = len(p.kx, p.kz);
    if (k > 0.05) {
      p.x += p.kx * dt;
      p.z += p.kz * dt;
      const f = Math.exp(-T.hit.knockDecay * dt);
      p.kx *= f;
      p.kz *= f;
      if (k < 0.3) p.kx = p.kz = 0;
    }

    // obstacles: slide around them (also stops knockback dead)
    if (this.pushOut(p, T.hero.radius) && k > 0.05) {
      p.kx *= 0.3;
      p.kz *= 0.3;
    }

    // height: cliffs block you (slide along them); ramps and dropping down are free
    const T3 = this.terrain;
    if (!T3.flat) {
      const from = T3.heightAt(ox, oz);
      const R = T.hero.radius;
      // the whole body must stay out of cliffs (not just the centre point); never worse than before, so nobody gets stuck
      const was = T3.breach(from, ox, oz, R);
      const ok = (x: number, z: number) => T3.canStep(from, x, z) && T3.breach(from, x, z, R) <= was;
      if (!ok(p.x, p.z)) {
        if (ok(p.x, oz)) {
          p.z = oz;
          p.vz = 0;
          p.kz = 0;
        } else if (ok(ox, p.z)) {
          p.x = ox;
          p.vx = 0;
          p.kx = 0;
        } else {
          p.x = ox;
          p.z = oz;
          p.vx = p.vz = p.kx = p.kz = 0;
        }
      }
      const h = T3.heightAt(p.x, p.z);
      p.y = h > p.y ? Math.min(h, p.y + 9 * dt) : Math.max(h, p.y - 16 * dt);
    }
  }

  private startDash(p: Player, inp: Input) {
    let dx = inp.mx;
    let dz = inp.mz;
    const m = len(dx, dz);
    if (m < 0.2) {
      dx = dirX(p.facing);
      dz = dirZ(p.facing);
    } else {
      dx /= m;
      dz /= m;
    }
    p.state = 'dashing';
    p.stateT = T.dash.duration;
    p.dashDx = dx;
    p.dashDz = dz;
    p.facing = facingOf(dx, dz);
    p.dashCd = T.dash.cooldown;
    p.invuln = Math.max(p.invuln, T.dash.invulnerable);
    p.bankT = 0;
    this.events.push({ t: 'dash', p: p.id });
  }

  private startSkill(p: Player) {
    const ab = HEROES[p.hero].ability;
    const cfg = T.abilities[ab];
    p.skillCd = cfg.cooldown;
    p.cast = { kind: 'skill', t: cfg.castDelay, total: cfg.castDelay };
    // face the best target for aimed abilities
    if (ab === 'groundSlam') this.aimAt(p, T.abilities.groundSlam.range + 1, 100);
    this.events.push({ t: 'skill', p: p.id, ability: ab });
  }

  /** Aim assist: turn toward the richest rival within range and a wide cone. */
  aimAt(p: Player, range: number, coneDeg: number) {
    const best = this.findTarget(p, range, coneDeg);
    if (best) p.facing = facingOf(best.x - p.x, best.z - p.z);
    return best;
  }

  /** Anyone dashing through this attack's reach gets a DODGED! and some dash back. */
  dodges(p: Player, inReach: (o: Player) => boolean) {
    for (const o of this.players) {
      if (o === p || o.state !== 'dashing' || !inReach(o)) continue;
      o.dashCd *= 1 - T.dodge.dashRefund;
      this.events.push({ t: 'dodge', p: o.id, from: p.id });
    }
  }

  private resolveGrab(p: Player) {
    const range = T.grab.range + T.grab.rangeForgiveness;
    // direction was committed at the start of the wind-up: no re-aiming, so a dash really dodges
    const target = this.findTarget(p, range, T.grab.coneDeg + 20);
    if (!target) {
      this.dodges(p, (o) => inCone(p, p.facing, o, range + 0.4, T.grab.coneDeg + 30));
      this.events.push({ t: 'grab', p: p.id, hit: false });
      // a whiff leaves you stumbling: missing has a cost, so mashing doesn't pay
      p.state = 'stagger';
      p.stateT = T.grab.missRecover;
      return;
    }
    {
      const dx0 = target.x - p.x;
      const dz0 = target.z - p.z;
      const d0 = Math.hypot(dx0, dz0) || 1;
      if (this.shielded(target, dx0 / d0, dz0 / d0)) {
        this.events.push({ t: 'grab', p: p.id, hit: false });
        return;
      }
    }
    if (this.mode === 'weapons') {
      // punch: damage + shove (a bubble gets popped)
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const d = len(dx, dz) || 1;
      const sticky = p.stickyT > 0;
      if (sticky) p.stickyT = 0;
      // Sticky Fingers: take the rival's weapon (and its ammo) for yourself and yank them in
      if (sticky && target.state !== 'bubble' && target.weapon) {
        const stolen = target.weapon;
        const ammo = target.ammo;
        target.weapon = null;
        target.ammo = 0;
        p.weapon = stolen;
        p.ammo = Math.max(ammo, 2);
        p.fireCd = 0.15;
        this.events.push({ t: 'weaponSteal', from: target.id, to: p.id, weapon: stolen });
      }
      // sticky: the rival is yanked TOWARD you (opposite shove), never through you
      const pull = Math.min(T.abilities.stickyFingers.pull, Math.max(0, d - 0.9));
      this.brawl.damage(target, p, 'grab', T.weapons.punchDamage, sticky ? -dx / d : dx / d, sticky ? -dz / d : dz / d, sticky ? pull : T.grab.shove);
      this.events.push({ t: 'grab', p: p.id, hit: true });
      return;
    }
    const sticky = p.stickyT > 0;
    let want = sticky ? T.abilities.stickyFingers.steal : T.grab.steal;
    if (this.mod === 'thieves') want *= T.mods.thieves.stealMult;
    const crowned = target.id === this.crownId;
    if (crowned) want += T.crown.stealBonus;
    const n = Math.min(target.carried, want);
    target.carried -= n;
    p.carried += n;
    this.payBack(p, target);
    if (n > 0) {
      p.stats.steals++;
      p.stats.stolen += n;
      target.stats.lostToSteals += n;
    }
    p.stats.hitsLanded++;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = len(dx, dz) || 1;
    if (sticky) {
      p.stickyT = 0;
      // pull the target toward the thief
      const pull = Math.min(T.abilities.stickyFingers.pull, Math.max(0, d - 0.9));
      this.knock(target, -dx / d, -dz / d, pull);
    } else this.knock(target, dx / d, dz / d, T.grab.shove);
    target.state = 'stagger';
    target.stateT = T.hit.staggerSeconds;
    target.bankT = 0;
    target.cast = null;
    this.events.push({ t: 'grab', p: p.id, hit: true });
    this.events.push({ t: 'steal', from: target.id, to: p.id, n, sticky });
    this.events.push({ t: 'hit', victim: target.id, by: p.id, kind: 'grab', drop: 0, x: target.x, z: target.z });
  }

  private fireSkill(p: Player) {
    const ab = HEROES[p.hero].ability;
    let hits = 0;
    if (ab === 'rattleBurst') {
      const c = T.abilities.rattleBurst;
      this.dodges(p, (o) => len(o.x - p.x, o.z - p.z) < c.radius + T.hero.radius);
      for (const o of this.players) {
        if (o === p || !targetable(o)) continue;
        const dx = o.x - p.x;
        const dz = o.z - p.z;
        const d = len(dx, dz);
        if (d > c.radius + T.hero.radius) continue;
        hits++;
        this.hitPlayer(o, p, ab, d > 0.01 ? dx / d : 1, d > 0.01 ? dz / d : 0, c.knockback, c.extraDrop);
      }
    } else if (ab === 'groundSlam') {
      const c = T.abilities.groundSlam;
      this.dodges(p, (o) => inCone(p, p.facing, o, c.range + T.hero.radius, c.coneDeg));
      for (const o of this.players) {
        if (o === p || !targetable(o)) continue;
        if (!inCone(p, p.facing, o, c.range + T.hero.radius, c.coneDeg)) continue;
        hits++;
        const dx = o.x - p.x;
        const dz = o.z - p.z;
        const d = len(dx, dz) || 1;
        if (!this.hitPlayer(o, p, ab, dx / d, dz / d, c.knockback, 0)) continue;
        o.state = 'stunned';
        o.stateT = c.stun;
        this.events.push({ t: 'stun', p: o.id });
      }
    } else if (ab === 'stickyFingers') {
      p.stickyT = T.abilities.stickyFingers.buffSeconds;
      p.grabCd = Math.min(p.grabCd, 0.15);
    }
    this.events.push({ t: 'skillFire', p: p.id, ability: ab, x: p.x, z: p.z, facing: p.facing, hits });
  }

  /** Bubble Shield soaks one hit. Returns true if it did. */
  shielded(o: Player, nx: number, nz: number) {
    if (o.shieldT <= 0) return false;
    o.shieldT = 0;
    this.knock(o, nx, nz, 1.2);
    this.events.push({ t: 'shieldBlock', p: o.id });
    return true;
  }

  private givePower(p: Player, kind: PowerKind, x: number, z: number) {
    const P = T.powerups;
    if (kind === 'magnet') p.magnetT = P.magnet.seconds;
    else if (kind === 'speed') p.speedT = P.speed.seconds;
    else if (kind === 'shield') p.shieldT = P.shield.seconds;
    else {
      const b: Bomb = { id: this.nextId++, owner: p.id, x: p.x, z: p.z, fuse: P.bomb.fuse };
      this.bombs.push(b);
      this.events.push({ t: 'bombPlant', id: b.id, owner: p.id, x: b.x, z: b.z });
    }
    this.events.push({ t: 'power', p: p.id, kind, x, z });
  }

  private tickPowerups(dt: number) {
    for (const u of this.powerups) u.age += dt;
    // power bubbles on crumbling tiles pop
    this.powerups = this.powerups.filter((u) => this.arena.safe(u.x, u.z));
    this.powerT += dt;
    const P = T.powerups;
    const due = this.powerT >= (this.roundTime < P.first + 0.5 ? P.first : P.every);
    if (!due) return;
    this.powerT = 0;
    if (this.powerups.length >= Math.round(P.max * this.coinScale)) return;
    const w = P.weights;
    const total = w.magnet + w.speed + w.shield + w.bomb;
    let r = this.rng.next() * total;
    let kind: PowerKind = 'bomb';
    for (const k of ['magnet', 'speed', 'shield', 'bomb'] as const) {
      r -= w[k];
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    for (let tries = 0; tries < 30; tries++) {
      const a = this.rng.next() * Math.PI * 2;
      const d = 2.5 + this.rng.next() * (Math.min(this.arena.safeRadius, 12) - 4);
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      const nearBank = (x - this.bank.x) ** 2 + (z - this.bank.z) ** 2 < 9;
      if (!this.arena.safe(x, z) || !this.clear(x, z, 0.8) || nearBank) continue;
      const u: PowerUp = { id: this.nextId++, kind, x, z, age: 0 };
      this.powerups.push(u);
      this.events.push({ t: 'powerSpawn', id: u.id, kind, x, z });
      return;
    }
  }

  private tickBombs(dt: number) {
    const B = T.powerups.bomb;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.fuse -= dt;
      if (b.fuse > 0) continue;
      this.bombs.splice(i, 1);
      let hits = 0;
      const owner = this.players[b.owner] ?? null; // owner -1 = bomb rain
      for (const o of this.players) {
        if (o === owner || !targetable(o)) continue;
        const dx = o.x - b.x;
        const dz = o.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d > B.radius + T.hero.radius) continue;
        hits++;
        const nx = d > 0.01 ? dx / d : 1;
        const nz = d > 0.01 ? dz / d : 0;
        this.hitPlayer(o, owner, 'bomb', nx, nz, B.knockback * (1 - (d / B.radius) * 0.4), B.extraDrop);
      }
      this.events.push({ t: 'bombBoom', owner: b.owner, x: b.x, z: b.z, hits });
    }
  }

  private tickCrown() {
    let best: Player | null = null;
    for (const p of this.players) if (p.state !== 'falling' && (!best || p.carried > best.carried)) best = p;
    const cur = this.crownId >= 0 ? this.players[this.crownId] : null;
    let next = this.crownId;
    if (cur && (cur.carried < T.crown.keep || cur.state === 'falling')) next = -1;
    // a challenger needs a clear lead before the crown changes hands (no flickering)
    if (best && best.carried >= T.crown.min && (next === -1 || best.carried >= this.players[next].carried + 5)) next = best.id;
    if (next !== this.crownId) {
      this.crownId = next;
      this.events.push({ t: 'crown', p: next });
    }
  }

  private tickMods(dt: number) {
    if (this.mod !== 'bombs') return;
    this.modT += dt;
    if (this.modT < T.mods.bombs.every) return;
    this.modT = 0;
    for (let tries = 0; tries < 20; tries++) {
      const a = this.rng.next() * Math.PI * 2;
      const d = this.rng.next() * (this.arena.safeRadius - 2);
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      if (!this.arena.safe(x, z)) continue;
      const b: Bomb = { id: this.nextId++, owner: -1, x, z, fuse: T.mods.bombs.fuse };
      this.bombs.push(b);
      this.events.push({ t: 'bombPlant', id: b.id, owner: -1, x, z });
      return;
    }
  }

  /** Map events: City traffic rushes through a street; the graveyard bell wakes grabbing hands. */
  private tickHazards(dt: number) {
    const ev = this.map.event;
    if (!ev) return;
    const H = T.hazards[ev];
    this.hazardT += dt;
    const due = this.hazardCount === 0 ? H.first : H.every;
    if (this.hazardT >= due) {
      this.hazardT = 0;
      this.hazardCount++;
      if (ev === 'traffic') {
        const alongX = this.rng.next() < 0.5;
        const dir = this.rng.next() < 0.5 ? 1 : -1;
        const L = this.map.shape.radius + 4;
        this.hazards.push({ id: this.nextId++, kind: 'traffic', warn: H.warn, x: alongX ? -dir * L : 0, z: alongX ? 0 : -dir * L, dx: alongX ? dir : 0, dz: alongX ? 0 : dir, zones: [], life: 10, hit: [] });
      } else {
        const zones = this.obstacles
          .filter((o) => /grave|coffin/.test(o.kind) && !o.hidden && this.arena.safe(o.x, o.z))
          .map((o) => ({ x: o.x, z: o.z, r: T.hazards.bell.radius }));
        this.hazards.push({ id: this.nextId++, kind: 'bell', warn: H.warn, x: 0, z: 0, dx: 0, dz: 0, zones, life: 0.6, hit: [] });
      }
      this.events.push({ t: 'hazardWarn', kind: ev });
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.warn > 0) {
        h.warn -= dt;
        continue;
      }
      h.life -= dt;
      if (h.kind === 'traffic') {
        const S = T.hazards.traffic;
        h.x += h.dx * S.speed * dt;
        h.z += h.dz * S.speed * dt;
        for (const p of this.players) {
          if (!targetable(p) || h.hit.includes(p.id)) continue;
          // the car is long along its direction, narrow across it
          const along = (p.x - h.x) * h.dx + (p.z - h.z) * h.dz;
          const across = (p.x - h.x) * -h.dz + (p.z - h.z) * h.dx;
          if (Math.abs(along) > 1.5 || Math.abs(across) > S.halfWidth + T.hero.radius) continue;
          h.hit.push(p.id);
          const side = across >= 0 ? 1 : -1;
          const nx = -h.dz * side * 0.8 + h.dx * 0.6;
          const nz = h.dx * side * 0.8 + h.dz * 0.6;
          if (this.hitPlayer(p, null, 'traffic', nx, nz, S.knock, 2)) this.events.push({ t: 'hazardHit', kind: 'traffic', p: p.id });
        }
        if (Math.abs(h.x) > this.map.shape.radius + 6 || Math.abs(h.z) > this.map.shape.radius + 6) h.life = 0;
      } else if (h.hit.length === 0) {
        h.hit.push(-1);
        for (const p of this.players) {
          if (!targetable(p)) continue;
          if (!h.zones.some((z) => (p.x - z.x) ** 2 + (p.z - z.z) ** 2 < z.r * z.r)) continue;
          if (this.hitPlayer(p, null, 'bell', 0, 0, 0.1, 1)) {
            p.state = 'stunned';
            p.stateT = T.hazards.bell.stun;
            this.events.push({ t: 'hazardHit', kind: 'bell', p: p.id });
          }
        }
      }
      if (h.life <= 0) this.hazards.splice(i, 1);
    }
  }

  /** The Wishing Well erupts a fountain of coins (and one golden coin) every so often. */
  private tickJackpot(dt: number) {
    const J = T.jackpot;
    this.jackpotT += dt;
    const next = this.jackpotFired ? (this.mod === 'goldrush' ? T.mods.goldrush.jackpotEvery : J.every) : this.mod === 'goldrush' ? 6 : J.first;
    if (!this.jackpotWarned && this.jackpotT >= next - J.warn) {
      this.jackpotWarned = true;
      this.events.push({ t: 'jackpotWarn' });
    }
    if (this.jackpotT < next) return;
    this.jackpotT = 0;
    this.jackpotWarned = false;
    this.jackpotFired = true;
    const n = Math.round(J.coins * (this.finale ? J.finaleMult : 1));
    for (let i = 0; i <= n; i++) {
      const golden = i === n;
      const a = this.rng.next() * Math.PI * 2;
      const d = J.minDist + this.rng.next() * (J.maxDist - J.minDist);
      const flight = 0.9 + this.rng.next() * 0.4;
      const J0 = this.map.jackpot;
      const tx = Math.sin(a) * d;
      const tz = Math.cos(a) * d;
      this.coins.push({
        id: this.nextCoinId++,
        x: J0.x,
        z: J0.z,
        y: 2.2,
        vx: tx / flight,
        vz: tz / flight,
        vy: 11 * (flight / 1.1),
        grounded: false,
        delay: i * 0.04,
        blockId: -1,
        blockT: 0,
        anyT: 0.2,
        v: golden ? J.goldenValue : 1,
      });
    }
    this.events.push({ t: 'jackpot', n });
  }

  /** Revenge bonus + crown bounty when `by` lands a hit or steal on `o`. */
  private payBack(by: Player, o: Player) {
    if (by.robbedBy === o.id && by.robbedT > 0) {
      by.carried += T.revenge.bonus;
      by.robbedT = 0;
      this.events.push({ t: 'revenge', p: by.id, from: o.id, n: T.revenge.bonus });
    }
    if (o.id === this.crownId) {
      by.carried += T.crown.bounty;
      this.events.push({ t: 'bounty', p: by.id, from: o.id, n: T.crown.bounty });
    }
    o.robbedBy = by.id;
    o.robbedT = T.revenge.window;
  }

  private hitPlayer(o: Player, by: Player | null, kind: 'grab' | 'rattleBurst' | 'groundSlam' | 'stickyFingers' | 'bomb' | 'traffic' | 'bell', nx: number, nz: number, knock: number, extra: number) {
    if (this.mode === 'weapons') return this.brawl.damage(o, by, kind, T.weapons.skillDamage[kind as keyof typeof T.weapons.skillDamage] ?? 1, nx, nz, knock);
    if (this.shielded(o, nx, nz)) return false;
    const mult = o.id === this.crownId ? T.crown.dropMult : 1;
    const base = clamp(Math.round(o.carried * T.hit.dropFraction), T.hit.dropMin, T.hit.dropMax) * mult;
    const drop = o.carried > 0 ? Math.min(o.carried, base + extra) : 0;
    if (by) this.payBack(by, o);
    o.carried -= drop;
    this.scatter(o, drop);
    this.knock(o, nx, nz, knock);
    o.state = 'stagger';
    o.stateT = T.hit.staggerSeconds;
    o.bankT = 0;
    o.cast = null;
    if (by) by.stats.hitsLanded++;
    this.events.push({ t: 'hit', victim: o.id, by: by?.id ?? -1, kind, drop, x: o.x, z: o.z });
    return true;
  }

  /** Push a player `dist` metres along (nx,nz) using decaying velocity. */
  knock(o: Player, nx: number, nz: number, dist: number) {
    o.kx = nx * dist * T.hit.knockDecay;
    o.kz = nz * dist * T.hit.knockDecay;
    o.vx = o.vz = 0;
  }

  /** Throw n coins out of a player; they land within scatterRadius. */
  private scatter(o: Player, n: number) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = 0.8 + this.rng.next() * (T.hit.scatterRadius - 0.8);
      const flight = 0.55;
      let tx = o.x + Math.sin(a) * r;
      let tz = o.z + Math.cos(a) * r;
      if (!this.arena.safe(tx, tz)) {
        // pull toward the centre so dropped coins stay in play
        const d = len(o.x, o.z) || 1;
        tx = o.x - (o.x / d) * r * 1.2;
        tz = o.z - (o.z / d) * r * 1.2;
      }
      this.coins.push({
        id: this.nextCoinId++,
        x: o.x,
        z: o.z,
        y: 1.1,
        vx: (tx - o.x) / flight,
        vz: (tz - o.z) / flight,
        vy: 6,
        grounded: false,
        delay: 0,
        blockId: o.id,
        blockT: T.hit.ownPickupDelay,
        anyT: T.hit.otherPickupDelay,
        v: 1,
      });
    }
  }

  private startFall(p: Player) {
    if (this.mode === 'weapons') this.brawl.fell(p);
    const lost = p.carried;
    // carried coins spill back onto the island near where you fell
    if (lost > 0) {
      const d = len(p.x, p.z) || 1;
      const ghost = { ...p, x: p.x, z: p.z };
      // walk inward until on safe ground
      for (let s = 0; s < 30 && !this.arena.safe(ghost.x, ghost.z); s++) {
        ghost.x -= (p.x / d) * 0.5;
        ghost.z -= (p.z / d) * 0.5;
      }
      this.scatter(ghost, lost);
      p.carried = 0;
    }
    p.state = 'falling';
    p.stateT = T.arena.fallRespawnSeconds;
    p.vy = 2;
    p.kx *= 0.3;
    p.kz *= 0.3;
    p.bankT = 0;
    p.cast = null;
    p.stats.falls++;
    this.events.push({ t: 'fall', p: p.id, lost });
  }

  respawn(p: Player) {
    let x = 0;
    let z = 0;
    for (let i = 0; i < 20; i++) {
      if (this.map.terrain) {
        // big maps: come back at one of the start spots (always flat ground)
        const st = this.map.starts[Math.floor(this.rng.next() * this.map.starts.length)];
        x = st.x + (this.rng.next() - 0.5) * 3;
        z = st.z + (this.rng.next() - 0.5) * 3;
      } else {
        const a = this.rng.next() * Math.PI * 2;
        const r = this.rng.next() * Math.min(4, this.arena.safeRadius - 3);
        x = Math.sin(a) * r;
        z = Math.cos(a) * r;
      }
      if (this.arena.safe(x, z) && this.clear(x, z, 0.6) && this.players.every((o) => o === p || (o.x - x) ** 2 + (o.z - z) ** 2 > 2)) break;
    }
    p.x = x;
    p.z = z;
    p.y = 0;
    p.vx = p.vz = p.kx = p.kz = p.vy = 0;
    p.state = 'normal';
    p.invuln = T.arena.respawnInvulnerable;
    this.events.push({ t: 'respawn', p: p.id });
  }

  /** Soft body separation so heroes don't overlap. */
  /** Run `fn` with everyone but the shooter standing where they were `seconds` ago, then put them back. */
  rewound<T>(shooter: number, seconds: number, fn: () => T): T {
    const when = this.time - seconds;
    const past = seconds > 0.02 ? [...this.past].reverse().find((s) => s.t <= when) ?? this.past[0] : undefined;
    if (!past) return fn();
    const now = this.players.map((p) => [p.x, p.z, p.y]);
    this.players.forEach((p, i) => {
      if (i !== shooter && !p.gone) [p.x, p.z, p.y] = past.at.slice(i * 3, i * 3 + 3);
    });
    try {
      return fn();
    } finally {
      this.players.forEach((p, i) => ([p.x, p.z, p.y] = now[i]));
    }
  }

  /** A friend left: take them off the map for good (their score stays on the board). */
  remove(id: number) {
    const p = this.players[id];
    if (!p || p.gone) return;
    p.gone = true;
    p.x = p.z = 1000;
    p.y = p.vx = p.vz = p.kx = p.kz = p.vy = 0;
    p.state = 'normal';
    p.stateT = 0;
    p.cast = null;
    p.weapon = null;
    p.ammo = 0;
    p.superT = p.rageT = p.speedT = p.shieldT = p.magnetT = 0;
    p.carried = 0;
  }

  private separate() {
    const min = T.hero.personalSpace;
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (a.state === 'falling' || a.state === 'launched' || a.state === 'bubble') continue;
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (b.state === 'falling' || b.state === 'launched' || b.state === 'bubble') continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        if (this.arena.solid(a.x - nx * push, a.z - nz * push)) {
          a.x -= nx * push;
          a.z -= nz * push;
        }
        if (this.arena.solid(b.x + nx * push, b.z + nz * push)) {
          b.x += nx * push;
          b.z += nz * push;
        }
      }
    }
  }

  /** Bigger maps get proportionally more coins and power-ups. */
  get coinScale() {
    return this.map.coinScale ?? 1;
  }

  // ------------------------------------------------------------------ coins

  private tickWaves(dt: number) {
    this.waveT += dt;
    if (this.waveT >= T.coins.waveEvery) {
      this.waveT = 0;
      const giant = this.mod === 'giant' ? T.mods.giant.waveScale : 1;
      this.spawnWave(Math.round(T.coins.waveSize * this.coinScale * giant * (this.finale ? T.finale.waveMultiplier : 1)), false);
    }
  }

  spawnWave(size: number, instant: boolean) {
    const room = T.coins.maxLoose * this.coinScale * (this.finale ? T.finale.waveMultiplier : 1) - this.coins.length;
    let n = Math.min(size, room);
    if (n <= 0) return;
    const total = n;
    const maxR = Math.min(this.arena.safeRadius, this.map.shape.radius) - 1.2;
    while (n > 0) {
      // clusters of 4–8 coins make "go to the pile" decisions readable
      const size = Math.min(n, this.rng.int(4, 8));
      let cx = 0;
      let cz = 0;
      for (let tries = 0; tries < 30; tries++) {
        const a = this.rng.next() * Math.PI * 2;
        const r = Math.sqrt(this.rng.next()) * maxR;
        cx = Math.sin(a) * r;
        cz = Math.cos(a) * r;
        const nearBank = (cx - this.bank.x) ** 2 + (cz - this.bank.z) ** 2 < (T.coins.bankClearance + 1) ** 2;
        if (this.arena.safe(cx, cz) && !nearBank && this.clear(cx, cz, 1.2)) break;
      }
      for (let i = 0; i < size; i++) {
        const a = this.rng.next() * Math.PI * 2;
        const r = Math.sqrt(this.rng.next()) * 1.4;
        let x = cx + Math.sin(a) * r;
        let z = cz + Math.cos(a) * r;
        if (!this.arena.safe(x, z) || !this.clear(x, z, 0.3)) {
          x = cx;
          z = cz;
        }
        this.coins.push({
          id: this.nextCoinId++,
          x,
          z,
          y: instant ? 0.35 + this.rng.next() * 3 : T.coins.spawnHeight + this.rng.next() * 3,
          vx: 0,
          vz: 0,
          vy: 0,
          grounded: false,
          delay: instant ? 0 : this.rng.next() * 0.8,
          blockId: -1,
          blockT: 0,
          anyT: 0,
          v: this.mod === 'giant' ? T.mods.giant.value : 1,
        });
      }
      n -= size;
    }
    this.events.push({ t: 'wave', n: total });
  }

  private tickCoins(dt: number) {
    const ground = 0.35;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.delay > 0) {
        c.delay -= dt;
        continue;
      }
      c.blockT = Math.max(0, c.blockT - dt);
      c.anyT = Math.max(0, c.anyT - dt);
      if (!c.grounded) {
        c.vy -= 22 * dt;
        c.x += c.vx * dt;
        c.z += c.vz * dt;
        c.y += c.vy * dt;
        if (c.y <= ground) {
          if (this.arena.solid(c.x, c.z)) {
            c.y = ground;
            if (Math.abs(c.vy) > 4) {
              c.vy = -c.vy * 0.3;
              c.vx *= 0.5;
              c.vz *= 0.5;
            } else {
              c.grounded = true;
              c.vx = c.vz = c.vy = 0;
              this.pushOut(c, 0.35); // never rest inside a rock or tree
            }
          } else if (c.y < -6) this.coins.splice(i, 1);
        }
      } else if (!this.arena.solid(c.x, c.z)) {
        c.grounded = false;
      }
    }
  }

  // ------------------------------------------------------------------ bank

  private tickBank(dt: number) {
    const b = this.bank;
    b.moveT += dt;
    if (!b.warned && b.moveT >= T.bank.moveEvery - T.bank.warnSeconds) {
      b.warned = true;
      const s = this.bankSpot(b.nextSpot);
      this.events.push({ t: 'bankWarn', x: s.x, z: s.z });
    }
    if (b.moveT >= T.bank.moveEvery) {
      b.moveT = 0;
      b.warned = false;
      b.glide = { fx: b.x, fz: b.z, t: 0 };
      b.spot = b.nextSpot;
      b.nextSpot = this.pickNextSpot(b.spot);
      const s = this.bankSpot(b.spot);
      this.events.push({ t: 'bankMove', x: s.x, z: s.z });
    }
    if (b.glide) {
      b.glide.t += dt / 1.0;
      const t = Math.min(1, b.glide.t);
      const e = t * t * (3 - 2 * t);
      const s = this.bankSpot(b.spot);
      b.x = b.glide.fx + (s.x - b.glide.fx) * e;
      b.z = b.glide.fz + (s.z - b.glide.fz) * e;
      if (t >= 1) b.glide = null;
    }
  }

  // ------------------------------------------------------------------ finale

  private tickFinale() {
    const start = T.match.roundSeconds - T.finale.seconds;
    if (!this.finale && this.roundTime >= start) {
      this.finale = true;
      this.events.push({ t: 'finale' });
      const R = Math.max(...this.arena.tiles.map((t) => t.d));
      const keep = this.map.keepRadius;
      for (const tile of this.arena.tiles) {
        if (tile.d <= keep) continue;
        const outer = (tile.d - keep) / (R - keep); // 1 = outermost
        tile.fallAt = start + T.finale.telegraph + (1 - outer) * T.finale.crumbleSpread;
      }
      this.arena.safeRadius = keep;
      // spawn a big wave right away so the finale feels like a jackpot
      this.waveT = T.coins.waveEvery;
    }
  }

  private tickTiles() {
    if (!this.finale) return;
    let fell = 0;
    for (const t of this.arena.tiles) {
      if (t.fallAt <= 0 || t.state === 2) continue;
      if (t.state === 0 && this.roundTime >= t.fallAt - T.finale.telegraph) t.state = 1;
      if (t.state === 1 && this.roundTime >= t.fallAt) {
        t.state = 2;
        fell++;
      }
    }
    if (fell) this.events.push({ t: 'tilesFall', n: fell });
  }
}

export function targetable(o: Player) {
  // (a Shadow Rush hides you from aim assist and from bots)
  return !o.gone && o.state !== 'falling' && o.state !== 'launched' && o.invuln <= 0 && !(o.superT > 0 && o.hero === 'pinch');
}

function newPlayer(id: number, s: PlayerSetup): Player {
  return {
    id,
    name: s.name,
    hero: s.hero,
    isBot: s.isBot,
    x: 0,
    z: 0,
    y: 0,
    vx: 0,
    vz: 0,
    kx: 0,
    kz: 0,
    vy: 0,
    facing: 0,
    state: 'normal',
    stateT: 0,
    carried: 0,
    bankedRound: 0,
    bankedTotal: 0,
    roundsWon: 0,
    dashCd: 0,
    grabCd: 0,
    skillCd: 0,
    invuln: 0,
    cast: null,
    stickyT: 0,
    bankT: 0,
    launch: null,
    dashDx: 0,
    dashDz: 1,
    padCd: 0,
    stats: { steals: 0, stolen: 0, lostToSteals: 0, hitsLanded: 0, falls: 0, banks: 0, bestBank: 0 },
    magnetT: 0,
    speedT: 0,
    shieldT: 0,
    combo: 0,
    comboT: 0,
    robbedBy: -1,
    robbedT: 0,
    hp: T.weapons.hp,
    weapon: null,
    ammo: 0,
    fireCd: 0,
    bubbleT: 0,
    lastHitBy: -1,
    lastHitT: 0,
    kos: 0,
    gone: false,
    charge: 0,
    superT: 0,
    rageT: 0,
    streak: 0,
  };
}

function resetForRound(p: Player) {
  p.y = p.vx = p.vz = p.kx = p.kz = p.vy = 0;
  p.state = 'normal';
  p.stateT = 0;
  p.carried = 0;
  p.bankedRound = 0;
  p.dashCd = 0;
  p.grabCd = 0;
  p.skillCd = Math.min(p.skillCd, 3);
  p.invuln = 0;
  p.cast = null;
  p.stickyT = 0;
  p.bankT = 0;
  p.launch = null;
  p.padCd = 0;
  p.magnetT = p.speedT = p.shieldT = 0;
  p.superT = p.rageT = p.streak = 0;
  p.combo = p.comboT = 0;
  p.robbedBy = -1;
  p.robbedT = 0;
}


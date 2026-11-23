// Coin Clash simulation. Pure TypeScript: no Three.js, no DOM.
// The client renders it; in Step 2 the Colyseus server runs this same file.
import { TUNING } from '../config/tuning.ts';
import { HEROES, type HeroId } from '../config/heroes.ts';
import { Arena } from './arena.ts';
import { clamp, dirX, dirZ, facingOf, inCone, len, angleDiff, Rng } from './math.ts';
import { OBSTACLES, SPOKES } from './layout.ts';
import { NO_INPUT, type Bank, type BouncePad, type Coin, type Input, type Phase, type Player, type SimEvent } from './types.ts';

const T = TUNING;

export interface PlayerSetup {
  name: string;
  hero: HeroId;
  isBot: boolean;
}

export class World {
  phase: Phase = 'countdown';
  phaseT = 0;
  round = 0;
  /** Seconds elapsed in the current round (while playing). */
  roundTime = 0;
  players: Player[] = [];
  coins: Coin[] = [];
  arena = new Arena();
  bank: Bank;
  pads: BouncePad[] = [];
  waveT = 0;
  finale = false;
  events: SimEvent[] = [];
  rng: Rng;
  /** True for the player's very first match: bots go easy in round 1. */
  firstMatch: boolean;
  private nextCoinId = 1;
  private lastCount = -1;

  constructor(setups: PlayerSetup[], opts: { seed?: number; firstMatch?: boolean } = {}) {
    this.rng = new Rng(opts.seed ?? (Math.random() * 2 ** 31) | 0);
    this.firstMatch = !!opts.firstMatch;
    this.players = setups.map((s, i) => newPlayer(i, s));
    const n = T.arena.bouncePadCount;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 4;
      const t = this.arena.tileAt(Math.sin(a) * T.arena.bouncePadRadius, Math.cos(a) * T.arena.bouncePadRadius)!;
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
    const a = SPOKES[i % SPOKES.length];
    return { x: Math.sin(a) * T.bank.ringRadius, z: Math.cos(a) * T.bank.ringRadius };
  }

  /** Obstacles whose tile is still standing. */
  activeObstacles() {
    return OBSTACLES.filter((o) => this.arena.solid(o.x, o.z));
  }

  /** Push a circle out of every standing obstacle. Returns true if it moved. */
  pushOut(e: { x: number; z: number }, radius: number) {
    let moved = false;
    for (const o of OBSTACLES) {
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
    return OBSTACLES.every((o) => (x - o.x) ** 2 + (z - o.z) ** 2 > (o.r + clearance) ** 2 || !this.arena.solid(o.x, o.z));
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
    this.arena.safeRadius = T.arena.radius;
    const spot = this.rng.int(0, T.bank.spots - 1);
    const p = this.bankSpot(spot);
    this.bank = { x: p.x, z: p.z, spot, nextSpot: this.pickNextSpot(spot), moveT: 0, warned: false, glide: null };
    const n = this.players.length;
    const startA = this.rng.next() * Math.PI * 2;
    this.players.forEach((pl, i) => {
      const a = startA + (i / n) * Math.PI * 2;
      resetForRound(pl);
      // start on the roads, facing the well
      const s = SPOKES[(i + Math.round(startA)) % SPOKES.length];
      void a;
      pl.x = Math.sin(s) * 3.6;
      pl.z = Math.cos(s) * 3.6;
      pl.facing = facingOf(-pl.x, -pl.z);
    });
    this.waveT = 0;
    this.spawnWave(T.coins.firstWaveSize, true);
  }

  private pickNextSpot(cur: number) {
    let s = cur;
    while (s === cur) s = this.rng.int(0, T.bank.spots - 1);
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
      .sort((a, b) => b.bankedTotal - a.bankedTotal || b.roundsWon - a.roundsWon || a.id - b.id)
      .map((p) => p.id);
  }

  // ------------------------------------------------------------------ tick

  /** Advance the world by dt seconds. inputs[i] is player i's intent. */
  tick(dt: number, inputs: Input[]) {
    this.events.length = 0;
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

    this.roundTime += dt;
    this.tickFinale();
    this.tickBank(dt);
    this.tickWaves(dt);
    for (const p of this.players) this.tickPlayer(p, inputs[p.id] ?? NO_INPUT, dt);
    this.separate();
    this.tickCoins(dt);
    this.tickTiles();
    if (this.roundTime >= T.match.roundSeconds) this.endRound();
  }

  // ------------------------------------------------------------------ players

  private speedOf(p: Player) {
    const slow = Math.max(T.hero.carrySlowFloor, 1 - p.carried * T.hero.carrySlowPerCoin);
    return T.hero.walkSpeed * slow;
  }

  private tickPlayer(p: Player, inp: Input, dt: number) {
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.grabCd = Math.max(0, p.grabCd - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.stickyT = Math.max(0, p.stickyT - dt);
    p.padCd = Math.max(0, p.padCd - dt);

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
      else if (inp.skill && p.skillCd <= 0) this.startSkill(p);
      else if (inp.grab && p.grabCd <= 0) {
        p.cast = { kind: 'grab', t: T.grab.windup };
        p.grabCd = T.grab.cooldown;
      }
    }
    if (p.cast) {
      p.cast.t -= dt;
      if (p.cast.t <= 0) {
        const kind = p.cast.kind;
        p.cast = null;
        if (p.state !== 'stunned') {
          if (kind === 'grab') this.resolveGrab(p);
          else this.fireSkill(p);
        }
      }
    }

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

    // --- coins
    const r2 = T.coins.pickupRadius ** 2;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.delay > 0 || c.y > 1.2 || c.anyT > 0) continue;
      if (c.blockId === p.id && c.blockT > 0) continue;
      if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 < r2) {
        p.carried++;
        this.coins.splice(i, 1);
        this.events.push({ t: 'pickup', p: p.id, x: c.x, z: c.z });
      }
    }

    // --- banking
    const inBank = (p.x - this.bank.x) ** 2 + (p.z - this.bank.z) ** 2 < T.bank.radius ** 2;
    if (inBank && p.carried > 0 && !inp.skipBank && (p.state === 'normal' || p.state === 'dashing')) {
      if (p.bankT === 0) this.events.push({ t: 'bankProgress', p: p.id });
      p.bankT += dt;
      if (p.bankT >= T.bank.bankSeconds) {
        const n = p.carried;
        p.bankedRound += n;
        p.carried = 0;
        p.bankT = 0;
        p.stats.banks++;
        p.stats.bestBank = Math.max(p.stats.bestBank, n);
        this.events.push({ t: 'bank', p: p.id, n, x: this.bank.x, z: this.bank.z });
      }
    } else p.bankT = 0;
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
    p.cast = { kind: 'skill', t: cfg.castDelay };
    // face the best target for aimed abilities
    if (ab === 'groundSlam') this.aimAt(p, T.abilities.groundSlam.range + 1, 100);
    this.events.push({ t: 'skill', p: p.id, ability: ab });
  }

  /** Aim assist: turn toward the richest rival within range and a wide cone. */
  private aimAt(p: Player, range: number, coneDeg: number) {
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const o of this.players) {
      if (o === p || !targetable(o)) continue;
      if (!inCone(p, p.facing, o, range, coneDeg)) continue;
      const d = len(o.x - p.x, o.z - p.z);
      const score = o.carried * 0.3 - d - Math.abs(angleDiff(p.facing, facingOf(o.x - p.x, o.z - p.z)));
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    }
    if (best) p.facing = facingOf(best.x - p.x, best.z - p.z);
    return best;
  }

  private resolveGrab(p: Player) {
    const range = T.grab.range + T.grab.rangeForgiveness;
    const target = this.aimAt(p, range, T.grab.coneDeg + 50);
    if (!target || !inCone(p, p.facing, target, range, T.grab.coneDeg)) {
      this.events.push({ t: 'grab', p: p.id, hit: false });
      return;
    }
    const sticky = p.stickyT > 0;
    const want = sticky ? T.abilities.stickyFingers.steal : T.grab.steal;
    const n = Math.min(target.carried, want);
    target.carried -= n;
    p.carried += n;
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
      for (const o of this.players) {
        if (o === p || !targetable(o)) continue;
        if (!inCone(p, p.facing, o, c.range + T.hero.radius, c.coneDeg)) continue;
        hits++;
        const dx = o.x - p.x;
        const dz = o.z - p.z;
        const d = len(dx, dz) || 1;
        this.hitPlayer(o, p, ab, dx / d, dz / d, c.knockback, 0);
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

  private hitPlayer(o: Player, by: Player, kind: 'grab' | 'rattleBurst' | 'groundSlam' | 'stickyFingers', nx: number, nz: number, knock: number, extra: number) {
    const drop = o.carried > 0 ? Math.min(o.carried, clamp(Math.round(o.carried * T.hit.dropFraction), T.hit.dropMin, T.hit.dropMax) + extra) : 0;
    o.carried -= drop;
    this.scatter(o, drop);
    this.knock(o, nx, nz, knock);
    o.state = 'stagger';
    o.stateT = T.hit.staggerSeconds;
    o.bankT = 0;
    o.cast = null;
    by.stats.hitsLanded++;
    this.events.push({ t: 'hit', victim: o.id, by: by.id, kind, drop, x: o.x, z: o.z });
  }

  /** Push a player `dist` metres along (nx,nz) using decaying velocity. */
  private knock(o: Player, nx: number, nz: number, dist: number) {
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
      });
    }
  }

  private startFall(p: Player) {
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

  private respawn(p: Player) {
    let x = 0;
    let z = 0;
    for (let i = 0; i < 20; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = this.rng.next() * Math.min(4, this.arena.safeRadius - 3);
      x = Math.sin(a) * r;
      z = Math.cos(a) * r;
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
  private separate() {
    const min = T.hero.radius * 2;
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (a.state === 'falling' || a.state === 'launched') continue;
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (b.state === 'falling' || b.state === 'launched') continue;
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

  // ------------------------------------------------------------------ coins

  private tickWaves(dt: number) {
    this.waveT += dt;
    if (this.waveT >= T.coins.waveEvery) {
      this.waveT = 0;
      this.spawnWave(T.coins.waveSize * (this.finale ? T.finale.waveMultiplier : 1), false);
    }
  }

  spawnWave(size: number, instant: boolean) {
    const room = T.coins.maxLoose * (this.finale ? T.finale.waveMultiplier : 1) - this.coins.length;
    let n = Math.min(size, room);
    if (n <= 0) return;
    const total = n;
    const maxR = Math.min(this.arena.safeRadius, T.arena.radius) - 1.2;
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
      const R = T.arena.radius;
      const keep = T.finale.shrinkToRadius + 0.6;
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
  return o.state !== 'falling' && o.state !== 'launched' && o.invuln <= 0;
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
}


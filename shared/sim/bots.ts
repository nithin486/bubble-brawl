// Bot brains: a small state machine per bot that produces the same Input a human does.
// Re-thinks at TUNING.bots.thinkHz; decisions take effect after a reaction delay.
import { TUNING } from '../config/tuning.ts';
import { HEROES } from '../config/heroes.ts';
import { DEG, inCone, len, Rng } from './math.ts';
import { NO_INPUT, type Input, type Player } from './types.ts';
import { targetable, type World } from './world.ts';

const B = TUNING.bots;

type Mode = 'collect' | 'bank' | 'steal' | 'flee' | 'idle';

/** Who is hunting whom, shared by all bots of one world — so they don't all gang up on one target. */
const HUNTS = new WeakMap<World, Map<number, number>>();
function huntersOf(w: World, target: number, except: number) {
  let n = 0;
  const m = HUNTS.get(w);
  if (m) for (const [bot, t] of m) if (t === target && bot !== except) n++;
  return n;
}

/** Bot personalities: they change decisions AND what the bot says (speech bubbles). */
export type Personality = 'greedy' | 'thief' | 'coward' | 'bully';
const PERSONALITY: Record<Personality, { bankAdd: number; stealRange: number; stealMin: number; fleeAt: number; human: number }> = {
  greedy: { bankAdd: 9, stealRange: 4, stealMin: 3, fleeAt: 99, human: 1 },
  thief: { bankAdd: 0, stealRange: 9, stealMin: 1, fleeAt: 14, human: 1 },
  coward: { bankAdd: -4, stealRange: 3, stealMin: 4, fleeAt: 5, human: 0.8 },
  bully: { bankAdd: 2, stealRange: 7, stealMin: 1, fleeAt: 99, human: 2.2 },
};

interface Intent {
  mode: Mode;
  tx: number;
  tz: number;
  dash: boolean;
  grab: boolean;
  skill: boolean;
  due: number;
}

export class BotBrain {
  readonly id: number;
  mode: Mode = 'idle';
  /** Rival this bot is currently hunting (-1 = none) — shown as a red "!" over its head. */
  targetId = -1;
  private avoidSide = 1;
  /** Wedged against something big (a fountain, a run of bridge rails)? Sidestep for a moment. */
  private lastX = 0;
  private lastZ = 0;
  private stuckT = 0;
  private escapeT = 0;
  private escapeSide = 1;
  private wpCache: { age: number; tx: number; tz: number; mx: number; mz: number; wp: { x: number; z: number } } | null = null;
  readonly personality: Personality;
  private reaction: number;
  private speed: number;
  private aimErr: number;
  private threshold: number;
  private thinkT = 0;
  private clock = 0;
  private queue: Intent[] = [];
  private cur: Intent;
  private rng: Rng;
  private wander = 0;
  /** Casts this bot already decided whether to dodge (each attack gets one roll). */
  private seenCasts = new WeakSet<object>();
  private dodgeSkill: number;
  /** Index of the human player; first-match bots go easy on them. */
  private humanId: number;

  constructor(id: number, rng: Rng, humanId = 0) {
    this.id = id;
    this.rng = rng;
    this.humanId = humanId;
    this.reaction = rng.range(B.reactionMin, B.reactionMax);
    this.speed = rng.range(B.speedMin, B.speedMax);
    this.aimErr = rng.range(-B.aimErrorDeg, B.aimErrorDeg) * DEG;
    this.threshold = rng.int(B.bankThresholdMin, B.bankThresholdMax);
    this.thinkT = rng.next() / B.thinkHz;
    this.cur = { mode: 'idle', tx: 0, tz: 0, dash: false, grab: false, skill: false, due: 0 };
    this.personality = (['greedy', 'thief', 'coward', 'bully'] as Personality[])[(id + 3) % 4];
    this.dodgeSkill = rng.range(0.2, 0.5) + (this.personality === 'coward' ? 0.2 : 0);
  }

  /** Easy mode is active in round 1 of the player's first match. */
  private easy(w: World) {
    return w.firstMatch && w.round === 1 && this.id !== this.humanId;
  }

  newRound() {
    this.threshold = this.rng.int(B.bankThresholdMin, B.bankThresholdMax);
    this.queue.length = 0;
  }

  update(w: World, dt: number): Input {
    this.clock += dt;
    const me = w.players[this.id];
    if (w.phase !== 'playing' || me.state === 'falling' || me.state === 'launched') return NO_INPUT;
    // trapped in a KO bubble: mash to break out
    if (me.state === 'bubble') return { ...NO_INPUT, grab: this.rng.next() < (this.easy(w) ? 0.05 : 0.15) };
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT += 1 / B.thinkHz;
      const reaction = this.easy(w) ? B.firstMatch.reaction : this.reaction * (1.45 - 0.75 * w.skill);
      this.queue.push({ ...this.think(w, me), due: this.clock + reaction });
    }
    // reflex: see an attack winding up at me → maybe dash out (one roll per attack)
    if (me.state === 'normal' && me.dashCd <= 0 && !this.easy(w)) {
      for (const r of w.players) {
        if (r === me || !r.cast || this.seenCasts.has(r.cast)) continue;
        const dx = me.x - r.x;
        const dz = me.z - r.z;
        const d = Math.hypot(dx, dz);
        const ab = HEROES[r.hero].ability;
        const reach = r.cast.kind === 'grab' ? 3 : ab === 'rattleBurst' ? TUNING.abilities.rattleBurst.radius + 0.6 : ab === 'groundSlam' ? TUNING.abilities.groundSlam.range + 0.6 : 0;
        if (d > reach) continue;
        this.seenCasts.add(r.cast);
        if (this.rng.next() > this.dodgeSkill) continue;
        // dash sideways-away from the attacker
        const side = this.rng.next() < 0.5 ? 1 : -1;
        const ax = dx / (d || 1);
        const az = dz / (d || 1);
        return { mx: ax * 0.6 - az * side * 0.8, mz: az * 0.6 + ax * side * 0.8, dash: true, grab: false, skill: false };
      }
    }
    let hm = HUNTS.get(w);
    if (!hm) HUNTS.set(w, (hm = new Map()));
    hm.set(this.id, this.targetId);
    while (this.queue.length && this.queue[0].due <= this.clock) {
      const next = this.queue.shift()!;
      // buttons fire once; movement target persists
      this.cur = next;
    }
    const c = this.cur;
    this.mode = c.mode;
    // cliffs: go via a ramp when the straight line would climb one
    let wp = { x: c.tx, z: c.tz };
    if (!w.terrain.flat) {
      const k = this.wpCache;
      if (k && k.age < 5 && Math.hypot(k.tx - c.tx, k.tz - c.tz) < 1 && Math.hypot(k.mx - me.x, k.mz - me.z) < 2) {
        k.age++;
        wp = k.wp;
      } else {
        wp = w.terrain.waypoint(me.x, me.z, c.tx, c.tz);
        this.wpCache = { age: 0, tx: c.tx, tz: c.tz, mx: me.x, mz: me.z, wp };
      }
    }
    wp = w.arena.route(me.x, me.z, wp.x, wp.z); // islands joined by bridges: stay on the ground
    let dx = wp.x - me.x;
    let dz = wp.z - me.z;
    const d = len(dx, dz);
    const speed = this.easy(w) ? B.firstMatch.speed : this.speed * (0.9 + 0.14 * w.skill);
    let mx = 0;
    let mz = 0;
    if (d > 0.25) {
      // aim error rotates the heading a little; it shrinks as the bot gets close
      const err = this.aimErr * Math.min(1, d / 6);
      const cs = Math.cos(err);
      const sn = Math.sin(err);
      dx /= d;
      dz /= d;
      // give other heroes room: crowds become a readable ring, not a pile
      for (const o of w.players) {
        if (o === me || o.id === this.targetId || o.state === 'falling') continue;
        const ox = me.x - o.x;
        const oz = me.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od > 2.2 || od < 0.01) continue;
        const k = (1 - od / 2.2) * 1.4;
        dx += (ox / od) * k;
        dz += (oz / od) * k;
        const n = Math.hypot(dx, dz) || 1;
        dx /= n;
        dz /= n;
      }
      // steer around rocks, trees and the well instead of pushing into them
      for (const o of w.obstacles) {
        const ox = o.x - me.x;
        const oz = o.z - me.z;
        const od = Math.hypot(ox, oz);
        const reach = o.r + TUNING.hero.radius + 1.4;
        if (od > reach || od > d + o.r || !w.arena.solid(o.x, o.z)) continue;
        const ahead = (ox * dx + oz * dz) / od;
        if (ahead < 0.2) continue;
        // steer to the side away from the obstacle; when it is dead ahead keep the side we already chose (no flip-flopping)
        const cross = (ox * dz - oz * dx) / od;
        if (Math.abs(cross) > 0.3) this.avoidSide = cross > 0 ? 1 : -1;
        const side = this.avoidSide;
        const k = (1 - od / reach) * 2.2 * ahead;
        const px = -oz / od;
        const pz = ox / od;
        dx += px * side * k;
        dz += pz * side * k;
        const n = Math.hypot(dx, dz) || 1;
        dx /= n;
        dz /= n;
      }
      mx = (dx * cs + dz * sn) * speed;
      mz = (-dx * sn + dz * cs) * speed;
      // ease into stops to avoid jitter
      if (d < 1) {
        mx *= d;
        mz *= d;
      }
    }
    const moved = Math.hypot(me.x - this.lastX, me.z - this.lastZ);
    this.lastX = me.x;
    this.lastZ = me.z;
    if (me.state === 'normal' && (mx !== 0 || mz !== 0) && moved / dt < 0.8) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.45 && this.escapeT <= 0) {
      this.escapeT = 0.9;
      this.escapeSide = this.rng.next() < 0.5 ? 1 : -1;
      this.stuckT = 0;
    }
    if (this.escapeT > 0 && (mx !== 0 || mz !== 0)) {
      this.escapeT -= dt;
      const m = Math.hypot(mx, mz);
      const ex = ((mx / m) * 0.3 - (mz / m) * this.escapeSide) * speed;
      const ez = ((mz / m) * 0.3 + (mx / m) * this.escapeSide) * speed;
      mx = ex;
      mz = ez;
    }
    const skipBank = this.easy(w) && !mayBankSoon(true, me, w.players[this.humanId], w);
    // never dash off an island edge or bridge
    let dash = c.dash;
    if (dash && w.arena.shape.mask) {
      const m = Math.hypot(mx, mz) || 1;
      for (const k of [2.5, 5]) if (!w.arena.safe(me.x + (mx / m) * k, me.z + (mz / m) * k)) dash = false;
    }
    const out: Input = { mx, mz, dash, grab: c.grab, skill: c.skill, skipBank };
    c.dash = c.grab = c.skill = false;
    return out;
  }

  private think(w: World, me: Player): Omit<Intent, 'due'> {
    if (w.mode === 'weapons') return this.thinkWeapons(w, me);
    const easy = this.easy(w);
    const P = PERSONALITY[this.personality];
    const threshold = easy ? B.firstMatch.bankThreshold : Math.max(4, this.threshold + P.bankAdd);
    this.targetId = -1;
    const rivals = w.players.filter((o) => o !== me && targetable(o));
    const human = w.players[this.humanId];
    const canTarget = (o: Player) => !(easy && o === human && !o.isBot);

    // standing on a crumbling tile → get to the middle
    if (!w.arena.safe(me.x, me.z)) {
      return { mode: 'flee', tx: me.x * 0.3, tz: me.z * 0.3, dash: me.dashCd <= 0, grab: false, skill: false };
    }
    // a rival's bubble bomb is about to go off next to me → run
    const bomb = w.bombs.find((bb) => bb.owner !== me.id && Math.hypot(bb.x - me.x, bb.z - me.z) < TUNING.powerups.bomb.radius + 0.6);
    if (bomb) {
      const dx = me.x - bomb.x || 0.1;
      const dz = me.z - bomb.z;
      const d = Math.hypot(dx, dz);
      return { mode: 'flee', tx: me.x + (dx / d) * 4, tz: me.z + (dz / d) * 4, dash: me.dashCd <= 0 && d < 2.5, grab: false, skill: false };
    }

    // map events: get off the street when traffic is coming, away from graves when the bell tolls
    for (const h of w.hazards) {
      if (h.kind === 'traffic') {
        const across = (me.x - h.x) * -h.dz + (me.z - h.z) * h.dx;
        const along = (me.x - h.x) * h.dx + (me.z - h.z) * h.dz;
        if (Math.abs(across) < 2.6 && along > -2) {
          const side = across >= 0 ? 1 : -1;
          return { mode: 'flee', tx: me.x - h.dz * side * 4, tz: me.z + h.dx * side * 4, dash: h.warn <= 0.4 && me.dashCd <= 0, grab: false, skill: false };
        }
      } else if (h.warn > 0) {
        const z = h.zones.find((zz) => Math.hypot(me.x - zz.x, me.z - zz.z) < zz.r + 0.6);
        if (z) {
          const dx = me.x - z.x || 0.1;
          const dz = me.z - z.z;
          const d = Math.hypot(dx, dz);
          return { mode: 'flee', tx: z.x + (dx / d) * (z.r + 1.5), tz: z.z + (dz / d) * (z.r + 1.5), dash: false, grab: false, skill: false };
        }
      }
    }

    let skill = false;
    if (me.skillCd <= 0 && me.state === 'normal') skill = this.wantSkill(w, me, rivals.filter(canTarget));

    // 4. flee: rich and someone is closing in
    if (me.carried >= Math.min(B.fleeCarry, P.fleeAt) && mayBankSoon(easy, me, human, w)) {
      const threat = rivals.find((o) => len(o.x - me.x, o.z - me.z) < B.fleeRange && o.grabCd < 0.4);
      if (threat) {
        // run AWAY into open space; only use the bank as the escape when it's quiet
        const bankCrowd = w.players.filter((o) => o !== me && Math.hypot(o.x - w.bank.x, o.z - w.bank.z) < TUNING.bank.radius + 1).length;
        const ax = me.x - threat.x;
        const az = me.z - threat.z;
        const ad = Math.hypot(ax, az) || 1;
        let tx = me.x + (ax / ad) * 5;
        let tz = me.z + (az / ad) * 5;
        if (bankCrowd === 0) {
          tx = (tx + w.bank.x) / 2;
          tz = (tz + w.bank.z) / 2;
        }
        // stay on the island: pull escape points inward when near the edge
        const r = Math.hypot(tx, tz);
        const lim = w.arena.safeRadius - 2.5;
        if (r > lim) {
          tx *= lim / r;
          tz *= lim / r;
        }
        return { mode: 'flee', tx, tz, dash: me.dashCd <= 0 && !easy, grab: false, skill };
      }
    }

    // 2. bank when carrying enough (or when the round is ending)
    const late = w.remaining < 9 && me.carried > 0;
    // First match, round 1: never bank past the player, so the new player wins the round.
    // These bots keep carrying instead, which makes them juicy targets to learn Grab on.
    const mayBank = !easy || me.bankedRound + w.bankValue(me.carried).total < human.bankedRound;
    // a busy bank is skipped unless I'm loaded or time is running out — no six-hero piles
    const inBank = w.players.filter((o) => o !== me && Math.hypot(o.x - w.bank.x, o.z - w.bank.z) < TUNING.bank.radius + 0.8).length;
    const bankBusy = inBank >= 2 && !late && me.carried < threshold + 10;
    if ((me.carried >= threshold || late) && mayBank && !bankBusy) {
      const d = len(w.bank.x - me.x, w.bank.z - me.z);
      const dash = !easy && d > 6 && me.dashCd <= 0 && me.carried >= threshold + 6;
      return { mode: 'bank', tx: w.bank.x + (this.rng.next() - 0.5), tz: w.bank.z + (this.rng.next() - 0.5), dash, grab: false, skill };
    }

    // 3. steal from a richer rival nearby
    if (me.grabCd <= 0.3) {
      let best: Player | null = null;
      let bestScore = 0;
      for (const o of rivals) {
        if (!canTarget(o) && this.rng.next() > B.firstMatch.grabPlayerChance) continue;
        const d = len(o.x - me.x, o.z - me.z);
        const crown = o.id === w.crownId;
        const range = (easy ? B.stealRange : P.stealRange) + (crown ? 4 : 0);
        if (d > range || o.carried < P.stealMin || (!crown && this.personality !== 'thief' && this.personality !== 'bully' && o.carried <= Math.max(2, me.carried))) continue;
        if (huntersOf(w, o.id, this.id) >= (crown ? 2 : 1)) continue;
        // don't dive after someone into a crowded bank
        const oBank = Math.hypot(o.x - w.bank.x, o.z - w.bank.z) < TUNING.bank.radius + 0.6;
        if (oBank && w.players.filter((q) => q !== o && q !== me && Math.hypot(q.x - w.bank.x, q.z - w.bank.z) < TUNING.bank.radius + 1).length >= 1) continue;
        let score = (o.carried + (crown ? 8 : 0)) / (d + 1);
        if (!o.isBot && !easy) score *= P.human;
        // grudges: go after whoever robbed me
        if (me.robbedBy === o.id && me.robbedT > 0) score *= 1.6;
        if (score > bestScore) {
          bestScore = score;
          best = o;
        }
      }
      if (best) {
        const d = len(best.x - me.x, best.z - me.z);
        // lead the target slightly
        const tx = best.x + best.vx * 0.25;
        const tz = best.z + best.vz * 0.25;
        const grab = d < TUNING.grab.range + 0.2 && inCone(me, me.facing, best, TUNING.grab.range + 0.3, 90);
        const dash = !easy && d > 2.5 && d < 5 && me.dashCd <= 0 && best.carried >= 8;
        // Pinch: arm Sticky Fingers before the grab
        if (HEROES[me.hero].ability === 'stickyFingers' && me.skillCd <= 0 && d < 4 && best.carried >= 5) skill = true;
        this.targetId = best.id;
        return { mode: 'steal', tx, tz, dash, grab, skill };
      }
    }

    // power bubbles are worth a short detour
    const pu = w.powerups.filter((u) => u.age > 0.6).sort((a, c) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(c.x - me.x, c.z - me.z))[0];
    if (pu && Math.hypot(pu.x - me.x, pu.z - me.z) < (easy ? 4 : 7)) return { mode: 'collect', tx: pu.x, tz: pu.z, dash: false, grab: false, skill };

    // 1. collect: go to the best cluster of loose coins
    const target = this.bestCoinSpot(w, me);
    if (target) return { mode: 'collect', tx: target.x, tz: target.z, dash: false, grab: false, skill };

    // nothing to do: wander to a quiet spot (away from everyone else)
    this.wander += 0.7;
    let bx = 0;
    let bz = 0;
    let best = -1;
    for (let k = 0; k < 6; k++) {
      const a = this.wander + k * 1.05;
      const r = 3 + ((this.id * 7 + k * 3) % 5);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (!w.arena.safe(x, z)) continue;
      const room = Math.min(...w.players.filter((o) => o !== me).map((o) => Math.hypot(o.x - x, o.z - z)));
      if (room > best) {
        best = room;
        bx = x;
        bz = z;
      }
    }
    return { mode: 'idle', tx: bx, tz: bz, dash: false, grab: false, skill };
  }

  private bestCoinSpot(w: World, me: Player) {
    let best: { x: number; z: number } | null = null;
    let bestScore = -Infinity;
    const coins = w.coins;
    // sample a subset of coins for speed
    const step = coins.length > 60 ? 2 : 1;
    for (let i = 0; i < coins.length; i += step) {
      const c = coins[i];
      if (c.y > 4 || (c.blockId === me.id && c.blockT > 0.3)) continue;
      if (!w.arena.safe(c.x, c.z)) continue;
      let n = 0;
      for (const o of coins) if ((o.x - c.x) ** 2 + (o.z - c.z) ** 2 < 4) n += o.v;
      const d = len(c.x - me.x, c.z - me.z);
      let crowd = 0;
      for (const p of w.players) if (p !== me && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < 9) crowd++;
      if (crowd >= 2) continue;
      const score = n / (d + 3) - crowd * 0.9;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  /** Weapons mode: grab a box, pick a fight at the right range for your weapon, pop bubbles. */
  private thinkWeapons(w: World, me: Player): Omit<Intent, 'due'> {
    const easy = this.easy(w);
    const WP = TUNING.weapons;
    const human = w.players[this.humanId];
    this.targetId = -1;
    const idle = { mode: 'idle' as Mode, dash: false, grab: false, skill: false };
    if (!w.arena.safe(me.x, me.z)) return { ...idle, mode: 'flee', tx: me.x * 0.3, tz: me.z * 0.3, dash: me.dashCd <= 0 };
    const dist = (o: { x: number; z: number }) => Math.hypot(o.x - me.x, o.z - me.z);
    const canHit = (o: Player) => !(easy && o === human && !o.isBot);
    // a bubble nearby = a free point
    const bubble = w.players.filter((o) => o !== me && o.state === 'bubble' && dist(o) < 9).sort((a, b) => dist(a) - dist(b))[0];
    if (bubble && !easy) {
      const d = dist(bubble);
      const shoot = me.weapon === 'blaster' || me.weapon === 'rocket';
      return { mode: 'steal', tx: bubble.x, tz: bubble.z, dash: d > 3 && me.dashCd <= 0 && this.rng.next() < 0.3, grab: shoot ? d < 9 : d < 2.2, skill: false };
    }
    const rivals = w.players.filter((o) => o !== me && targetable(o) && o.state !== 'bubble' && canHit(o));
    // no weapon: nearest box (or punch whoever is right here)
    if (!me.weapon) {
      const close = rivals.find((o) => dist(o) < 1.8);
      if (close && me.grabCd <= 0 && this.rng.next() < (easy ? 0.2 : 0.6)) {
        this.targetId = close.id;
        return { ...idle, mode: 'steal', tx: close.x, tz: close.z, grab: true };
      }
      const boxes = w.brawl.boxes.filter((b) => b.respawn <= 0 && w.arena.solid(b.x, b.z));
      const box = boxes.sort((a, b) => dist(a) - dist(b))[0];
      if (box) return { ...idle, mode: 'collect', tx: box.x, tz: box.z, dash: dist(box) > 6 && me.dashCd <= 0 && this.rng.next() < 0.15, skill: this.wantSkill(w, me, rivals) };
      this.wander += 0.4;
      return { ...idle, tx: Math.sin(this.wander + this.id) * 5, tz: Math.cos(this.wander * 0.7 + this.id) * 5 };
    }
    // armed: hunt (spread targets out between bots, prefer the hurt and the leaders)
    const score = (o: Player) => dist(o) - ((WP.hp - o.hp) / WP.hitHp) * 1.5 - o.bankedRound * 0.4 + huntersOf(w, o.id, this.id) * 3 + (o === human && !o.isBot ? -1 : 0);
    const t = rivals.sort((a, b) => score(a) - score(b))[0];
    if (!t) return { ...idle, tx: me.x, tz: me.z };
    this.targetId = t.id;
    const d = dist(t);
    const k = me.weapon;
    const want = k === 'blaster' ? 6 : k === 'rocket' ? 7 : k === 'hook' ? 6 : k === 'freeze' ? 6 : k === 'hammer' ? 1.6 : 4;
    const inRange = k === 'blaster' ? d < 11 : k === 'rocket' ? d < 12 : k === 'hook' ? d < WP.hook.range - 1 : k === 'freeze' ? d < 8.5 : k === 'hammer' ? d < WP.hammer.radius : d < 5;
    // keep the preferred distance: close in, or back off a little
    const ux = (t.x - me.x) / (d || 1);
    const uz = (t.z - me.z) / (d || 1);
    let tx = t.x - ux * want;
    let tz = t.z - uz * want;
    // strafe a bit so they're harder to hit
    const side = Math.sin(this.clock * 1.3 + this.id) * 1.6;
    tx += -uz * side;
    tz += ux * side;
    // banana: drop it when someone is chasing right behind
    const chaser = k === 'banana' && rivals.some((o) => dist(o) < 4 && (me.x - o.x) * Math.sin(me.facing) + (me.z - o.z) * Math.cos(me.facing) > 0);
    const fire = (inRange || chaser) && me.fireCd <= 0 && this.rng.next() < (easy ? 0.2 : 0.28 + 0.55 * w.skill);
    return { mode: 'steal', tx, tz, dash: d > 9 && me.dashCd <= 0 && this.rng.next() < 0.2, grab: fire, skill: this.wantSkill(w, me, rivals) };
  }

  private wantSkill(w: World, me: Player, rivals: Player[]) {
    const ab = HEROES[me.hero].ability;
    if (ab === 'rattleBurst') {
      const r = TUNING.abilities.rattleBurst.radius;
      const near = rivals.filter((o) => len(o.x - me.x, o.z - me.z) < r - 0.3);
      return near.length >= 2 || near.some((o) => o.carried >= 8) || (w.mode === 'weapons' && near.length >= 1 && this.rng.next() < 0.4);
    }
    if (ab === 'groundSlam') {
      const c = TUNING.abilities.groundSlam;
      const hit = rivals.filter((o) => inCone(me, me.facing, o, c.range - 0.3, c.coneDeg + 30));
      return hit.length >= 2 || hit.some((o) => o.carried >= 8) || (w.mode === 'weapons' && hit.length >= 1 && this.rng.next() < 0.4);
    }
    if (ab === 'stickyFingers' && w.mode === 'weapons') return !me.weapon && rivals.some((o) => o.weapon && len(o.x - me.x, o.z - me.z) < 3.5); // unarmed and an armed rival is right here: take it
    return false;
  }
}

function mayBankSoon(easy: boolean, me: Player, human: Player, w: World) {
  return !easy || me.bankedRound + w.bankValue(me.carried).total < human.bankedRound;
}

/** Build brains for every bot seat. */
export function makeBrains(w: World, humanId = 0) {
  return w.players.filter((p) => p.isBot).map((p) => new BotBrain(p.id, new Rng(w.rng.int(1, 1e9)), humanId));
}


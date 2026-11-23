// Bot brains: a small state machine per bot that produces the same Input a human does.
// Re-thinks at TUNING.bots.thinkHz; decisions take effect after a reaction delay.
import { TUNING } from '../config/tuning.ts';
import { HEROES } from '../config/heroes.ts';
import { DEG, inCone, len, Rng } from './math.ts';
import { NO_INPUT, type Input, type Player } from './types.ts';
import { targetable, type World } from './world.ts';

const B = TUNING.bots;

type Mode = 'collect' | 'bank' | 'steal' | 'flee' | 'idle';

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
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT += 1 / B.thinkHz;
      const reaction = this.easy(w) ? B.firstMatch.reaction : this.reaction;
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
    while (this.queue.length && this.queue[0].due <= this.clock) {
      const next = this.queue.shift()!;
      // buttons fire once; movement target persists
      this.cur = next;
    }
    const c = this.cur;
    this.mode = c.mode;
    let dx = c.tx - me.x;
    let dz = c.tz - me.z;
    const d = len(dx, dz);
    const speed = this.easy(w) ? B.firstMatch.speed : this.speed;
    let mx = 0;
    let mz = 0;
    if (d > 0.25) {
      // aim error rotates the heading a little; it shrinks as the bot gets close
      const err = this.aimErr * Math.min(1, d / 6);
      const cs = Math.cos(err);
      const sn = Math.sin(err);
      dx /= d;
      dz /= d;
      // steer around rocks, trees and the well instead of pushing into them
      for (const o of w.obstacles) {
        const ox = o.x - me.x;
        const oz = o.z - me.z;
        const od = Math.hypot(ox, oz);
        const reach = o.r + TUNING.hero.radius + 1.4;
        if (od > reach || od > d + o.r || !w.arena.solid(o.x, o.z)) continue;
        const ahead = (ox * dx + oz * dz) / od;
        if (ahead < 0.2) continue;
        const side = ox * dz - oz * dx > 0 ? 1 : -1; // steer to the side away from the obstacle
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
    const skipBank = this.easy(w) && !mayBankSoon(true, me, w.players[this.humanId], w);
    const out: Input = { mx, mz, dash: c.dash, grab: c.grab, skill: c.skill, skipBank };
    c.dash = c.grab = c.skill = false;
    return out;
  }

  private think(w: World, me: Player): Omit<Intent, 'due'> {
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
        return { mode: 'flee', tx: w.bank.x, tz: w.bank.z, dash: me.dashCd <= 0 && !easy, grab: false, skill };
      }
    }

    // 2. bank when carrying enough (or when the round is ending)
    const late = w.remaining < 9 && me.carried > 0;
    // First match, round 1: never bank past the player, so the new player wins the round.
    // These bots keep carrying instead, which makes them juicy targets to learn Grab on.
    const mayBank = !easy || me.bankedRound + w.bankValue(me.carried).total < human.bankedRound;
    if ((me.carried >= threshold || late) && mayBank) {
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

    // nothing to do: drift toward the bank area
    this.wander += 1;
    return { mode: 'idle', tx: w.bank.x * 0.5 + Math.sin(this.wander) * 2, tz: w.bank.z * 0.5 + Math.cos(this.wander) * 2, dash: false, grab: false, skill };
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
      for (const p of w.players) if (p !== me && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < 4) crowd++;
      const score = n / (d + 3) - crowd * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  private wantSkill(w: World, me: Player, rivals: Player[]) {
    const ab = HEROES[me.hero].ability;
    if (ab === 'rattleBurst') {
      const r = TUNING.abilities.rattleBurst.radius;
      const near = rivals.filter((o) => len(o.x - me.x, o.z - me.z) < r - 0.3);
      return near.length >= 2 || near.some((o) => o.carried >= 8);
    }
    if (ab === 'groundSlam') {
      const c = TUNING.abilities.groundSlam;
      const hit = rivals.filter((o) => inCone(me, me.facing, o, c.range - 0.3, c.coneDeg + 30));
      return hit.length >= 2 || hit.some((o) => o.carried >= 8);
    }
    return false; // stickyFingers is handled in steal mode
  }
}

function mayBankSoon(easy: boolean, me: Player, human: Player, w: World) {
  return !easy || me.bankedRound + w.bankValue(me.carried).total < human.bankedRound;
}

/** Build brains for every bot seat. */
export function makeBrains(w: World, humanId = 0) {
  return w.players.filter((p) => p.isBot).map((p) => new BotBrain(p.id, new Rng(w.rng.int(1, 1e9)), humanId));
}


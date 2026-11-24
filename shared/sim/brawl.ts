// Weapons mode: mystery boxes, six weapons, health and Bubble KO.
// Lives next to World and uses its movement, knockback, aim assist and events.
import { TUNING } from '../config/tuning.ts';
import { dirX, dirZ, facingOf, len } from './math.ts';
import { WEAPONS, type MysteryBox, type Mine, type Player, type Projectile, type Throw, type WeaponKind } from './types.ts';
import type { World } from './world.ts';

const W = TUNING.weapons;
const HERO_R = TUNING.hero.radius;
/** Assist cone (degrees, total) when you aim with the scope: only a rival almost under it pulls the shot. */
export const AIMED_CONE = 24;
/** Assist cone without the scope: shots go where you face, with only a small snap onto a rival (was 150°, felt random). */
export const AIM_CONE = 50;

export type HitKind = 'grab' | 'rattleBurst' | 'groundSlam' | 'stickyFingers' | 'bomb' | 'traffic' | 'bell' | WeaponKind;

export class Brawl {
  boxes: MysteryBox[] = [];
  projectiles: Projectile[] = [];
  mines: Mine[] = [];
  throws: Throw[] = [];
  private w: World;
  private nextId = 1;

  constructor(w: World) {
    this.w = w;
  }

  /** Box spots: spread over safe, open ground (same every match for a map). */
  private spots() {
    const w = this.w;
    const n = Math.round(W.boxes.count * w.coinScale);
    const cands = w.arena.tiles
      .filter((t) => t.d < w.map.shape.radius - 2.5 && t.d > 2 && w.clear(t.x, t.z, 1.2) && w.terrain.flatAround(t.x, t.z, 3.2))
      .map((t) => ({ x: t.x, z: t.z }));
    // farthest-point sampling: boxes far from each other
    const out: { x: number; z: number }[] = [];
    if (!cands.length) return out;
    out.push(cands[Math.floor(cands.length / 2)]);
    while (out.length < n && out.length < cands.length) {
      let best = cands[0];
      let bd = -1;
      for (const c of cands) {
        const d = Math.min(...out.map((o) => (o.x - c.x) ** 2 + (o.z - c.z) ** 2));
        if (d > bd) {
          bd = d;
          best = c;
        }
      }
      out.push(best);
    }
    return out;
  }

  reset() {
    this.boxes = this.spots().map((s) => ({ id: this.nextId++, x: s.x, z: s.z, respawn: 0 }));
    this.projectiles = [];
    this.mines = [];
    this.throws = [];
    for (const p of this.w.players) {
      p.hp = W.hp;
      p.weapon = null;
      p.ammo = 0;
      p.fireCd = 0;
      p.bubbleT = 0;
      p.lastHitBy = -1;
      p.lastHitT = 0;
    }
  }

  /** Final round: every KO and pop counts double. */
  private pointMult() {
    return this.w.mod === 'double' ? 2 : 1;
  }

  private roll(p: Player): WeaponKind {
    const w = this.w;
    // the very first box of a first match: the easy, satisfying one
    if (w.firstMatch && w.round === 1 && !p.isBot && p.kos === 0 && p.stats.hitsLanded === 0) return 'blaster';
    // round twists that decide the box
    if (w.mod === 'rockets') return 'rocket';
    if (w.mod === 'blasters') return 'blaster';
    if (w.mod === 'frost') return 'freeze';
    const total = WEAPONS.reduce((a, k) => a + W.odds[k], 0);
    let r = w.rng.next() * total;
    for (const k of WEAPONS) {
      r -= W.odds[k];
      if (r <= 0) return k;
    }
    return 'blaster';
  }

  // ------------------------------------------------------------------ per tick

  tick(dt: number) {
    const w = this.w;
    for (const p of w.players) {
      p.fireCd = Math.max(0, p.fireCd - dt);
      p.lastHitT = Math.max(0, p.lastHitT - dt);
    }
    // boxes
    for (const b of this.boxes) {
      if (b.respawn > 0) {
        b.respawn = Math.max(0, b.respawn - dt);
        continue;
      }
      if (!w.arena.solid(b.x, b.z)) continue;
      for (const p of w.players) {
        if (p.weapon || p.state === 'bubble' || p.state === 'falling' || p.state === 'launched') continue;
        if ((p.x - b.x) ** 2 + (p.z - b.z) ** 2 > W.boxes.pickupRadius ** 2) continue;
        const k = this.roll(p);
        p.weapon = k;
        p.ammo = W[k].ammo * (w.mod === 'ammo' ? TUNING.mods.ammo.mult : 1);
        p.fireCd = 0.15;
        b.respawn = W.boxes.respawn * (w.mod === 'boxfest' ? TUNING.mods.boxfest.respawnMult : 1);
        w.events.push({ t: 'boxPick', p: p.id, weapon: k, x: b.x, z: b.z });
        break;
      }
    }
    this.tickProjectiles(dt);
    this.tickMines(dt);
    this.tickThrows(dt);
  }

  private tickProjectiles(dt: number) {
    const w = this.w;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const s = this.projectiles[i];
      const step = Math.hypot(s.vx, s.vz) * dt;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.left -= step;
      let done = s.left <= 0 || !w.clear(s.x, s.z, 0.15) || !w.arena.solid(s.x, s.z);
      if (!done)
        for (const o of w.players) {
          if (o.id === s.owner || o.state === 'falling' || o.state === 'launched') continue;
          const r = o.state === 'bubble' ? W.bubble.popRadius : HERO_R + 0.35;
          if ((o.x - s.x) ** 2 + (o.z - s.z) ** 2 > r * r) continue;
          done = true;
          const sp = Math.hypot(s.vx, s.vz) || 1;
          if (s.kind === 'blaster') this.damage(o, w.players[s.owner], 'blaster', W.blaster.damage, s.vx / sp, s.vz / sp, W.blaster.knock);
          break;
        }
      if (done) {
        if (s.kind === 'rocket') this.blast(s.x, s.z, w.players[s.owner]);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private blast(x: number, z: number, by: Player) {
    const w = this.w;
    const c = W.rocket;
    let hits = 0;
    for (const o of w.players) {
      if (o === by) continue;
      const dx = o.x - x;
      const dz = o.z - z;
      const d = Math.hypot(dx, dz);
      if (d > c.blast + HERO_R + (o.state === 'bubble' ? 0.6 : 0)) continue;
      hits++;
      this.damage(o, by, 'rocket', c.damage, d > 0.01 ? dx / d : dirX(by.facing), d > 0.01 ? dz / d : dirZ(by.facing), c.knock);
    }
    w.events.push({ t: 'boom', kind: 'rocket', x, z, r: c.blast, hits });
  }

  private tickMines(dt: number) {
    const w = this.w;
    const c = W.banana;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.arm = Math.max(0, m.arm - dt);
      m.life -= dt;
      if (m.life <= 0 || !w.arena.solid(m.x, m.z)) {
        this.mines.splice(i, 1);
        continue;
      }
      if (m.arm > 0) continue;
      for (const o of w.players) {
        if (o.state === 'bubble' || o.state === 'falling' || o.state === 'launched' || o.invuln > 0) continue;
        if ((o.x - m.x) ** 2 + (o.z - m.z) ** 2 > c.trigger ** 2) continue;
        this.mines.splice(i, 1);
        const by = w.players[m.owner];
        // slip: spin out in the direction you were running
        const sp = Math.hypot(o.vx, o.vz);
        const nx = sp > 0.5 ? o.vx / sp : dirX(o.facing);
        const nz = sp > 0.5 ? o.vz / sp : dirZ(o.facing);
        if (this.damage(o, by.id === o.id ? null : by, 'banana', c.damage, nx, nz, 1.8) && (o.state as string) !== 'bubble') {
          o.state = 'stunned';
          o.stateT = c.slip;
          w.events.push({ t: 'slip', p: o.id });
        }
        break;
      }
    }
  }

  private tickThrows(dt: number) {
    const w = this.w;
    const c = W.freeze;
    for (let i = this.throws.length - 1; i >= 0; i--) {
      const t = this.throws[i];
      t.t += dt;
      if (t.t < t.total) continue;
      this.throws.splice(i, 1);
      const by = w.players[t.owner];
      let hits = 0;
      for (const o of w.players) {
        if (o === by) continue;
        if ((o.x - t.tx) ** 2 + (o.z - t.tz) ** 2 > (c.radius + HERO_R) ** 2) continue;
        hits++;
        const dx = o.x - t.tx;
        const dz = o.z - t.tz;
        const d = Math.hypot(dx, dz) || 1;
        if (this.damage(o, by, 'freeze', c.damage, dx / d, dz / d, 0.3) && (o.state as string) !== 'bubble') {
          o.state = 'stunned';
          o.stateT = c.freeze;
          w.events.push({ t: 'frozen', p: o.id });
        }
      }
      w.events.push({ t: 'boom', kind: 'freeze', x: t.tx, z: t.tz, r: c.radius, hits });
    }
  }

  // ------------------------------------------------------------------ firing

  /** The action button with a weapon in hand. Returns false if it didn't fire (cooldown). */
  fire(p: Player, aimed?: { d: number }): boolean {
    const w = this.w;
    const k = p.weapon;
    if (!k || p.fireCd > 0) return false;
    const c = W[k];
    p.fireCd = c.cooldown * (w.mod === 'rapid' ? TUNING.mods.rapid.cooldownMult : 1);
    // aim assist toward the best rival in front (a small cone when the player is aiming with the scope)
    // bots keep a wider snap (they can't fine-aim a stick), players get precise shots
    const aim = (range: number, cone: number) => w.aimAt(p, range, aimed ? Math.min(cone, AIMED_CONE) : p.isBot ? 110 : cone);
    if (k === 'blaster' || k === 'rocket') {
      const g = W[k];
      aim(g.range * 0.8, AIM_CONE);
      const sp = g.speed;
      this.projectiles.push({
        id: this.nextId++, kind: k, owner: p.id,
        x: p.x + dirX(p.facing) * 0.7, z: p.z + dirZ(p.facing) * 0.7,
        vx: dirX(p.facing) * sp, vz: dirZ(p.facing) * sp, left: k === 'rocket' && aimed ? Math.min(g.range, Math.max(3, aimed.d)) : g.range,
      });
    } else if (k === 'banana') {
      // dropped behind you
      const bx = p.x - dirX(p.facing) * 1.0;
      const bz = p.z - dirZ(p.facing) * 1.0;
      if (w.arena.solid(bx, bz)) this.mines.push({ id: this.nextId++, owner: p.id, x: bx, z: bz, arm: W.banana.arm, life: W.banana.life });
    } else if (k === 'freeze') {
      const t = aim(W.freeze.throw + 2, AIM_CONE);
      const reach = aimed ? Math.min(W.freeze.throw + 3, Math.max(3, aimed.d)) : W.freeze.throw;
      let tx = p.x + dirX(p.facing) * reach;
      let tz = p.z + dirZ(p.facing) * reach;
      if (t) {
        tx = t.x + t.vx * W.freeze.flight * 0.6;
        tz = t.z + t.vz * W.freeze.flight * 0.6;
      }
      this.throws.push({ id: this.nextId++, owner: p.id, fx: p.x, fz: p.z, tx, tz, t: 0, total: W.freeze.flight });
    } else if (k === 'hook') {
      const t = w.findTarget(p, W.hook.range, W.hook.coneDeg * 2);
      if (t) {
        p.facing = facingOf(t.x - p.x, t.z - p.z);
        const dx = t.x - p.x;
        const dz = t.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        // yank to just in front of you
        const tx = p.x + (dx / d) * W.hook.pullTo;
        const tz = p.z + (dz / d) * W.hook.pullTo;
        if (w.arena.solid(tx, tz) && w.clear(tx, tz, HERO_R)) {
          t.x = tx;
          t.z = tz;
        }
        w.events.push({ t: 'hook', p: p.id, target: t.id, x: t.x, z: t.z });
        this.damage(t, p, 'hook', W.hook.damage, -dx / d, -dz / d, 0.2);
      } else w.events.push({ t: 'hook', p: p.id, target: -1, x: p.x + dirX(p.facing) * W.hook.range, z: p.z + dirZ(p.facing) * W.hook.range });
    } else if (k === 'hammer') {
      p.cast = { kind: 'skill', t: W.hammer.windup, total: W.hammer.windup };
      (p.cast as { hammer?: boolean }).hammer = true;
    }
    w.events.push({ t: 'fire', p: p.id, weapon: k, x: p.x, z: p.z, facing: p.facing });
    p.ammo--;
    if (p.ammo <= 0) {
      p.weapon = null;
      p.ammo = 0;
    }
    return true;
  }

  /** Thunder Hammer lands (after its wind-up). */
  hammer(p: Player) {
    const w = this.w;
    const c = W.hammer;
    let hits = 0;
    w.dodges(p, (o) => len(o.x - p.x, o.z - p.z) < c.radius + HERO_R);
    for (const o of w.players) {
      if (o === p) continue;
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      const d = len(dx, dz);
      if (d > c.radius + HERO_R + (o.state === 'bubble' ? 0.5 : 0)) continue;
      hits++;
      this.damage(o, p, 'hammer', c.damage, d > 0.01 ? dx / d : 1, d > 0.01 ? dz / d : 0, c.knock);
    }
    w.events.push({ t: 'boom', kind: 'hammer', x: p.x, z: p.z, r: c.radius, hits });
  }

  // ------------------------------------------------------------------ damage, KO, bubble

  /**
   * Hit a player. Bubbles get popped instead. Returns true if the victim took the hit
   * (false: shielded, invulnerable, or it was a bubble pop).
   */
  damage(o: Player, by: Player | null, kind: HitKind, n: number, nx: number, nz: number, knock: number): boolean {
    const w = this.w;
    if (o.state === 'bubble') {
      if (by && by.id !== o.id) this.pop(o, by);
      return false;
    }
    if (o.state === 'falling' || o.state === 'launched' || o.invuln > 0) return false;
    if (w.shielded(o, nx, nz)) return false;
    o.hp = Math.max(0, o.hp - n * W.hitHp);
    if (by && by.id !== o.id) {
      o.lastHitBy = by.id;
      o.lastHitT = W.bubble.creditWindow;
      by.stats.hitsLanded++;
    }
    w.knock(o, nx, nz, knock);
    o.state = 'stagger';
    o.stateT = TUNING.hit.staggerSeconds;
    o.cast = null;
    w.events.push({ t: 'hit', victim: o.id, by: by?.id ?? -1, kind, drop: 0, x: o.x, z: o.z });
    w.events.push({ t: 'damage', victim: o.id, by: by?.id ?? -1, n, hp: o.hp });
    if (o.hp <= 0) this.ko(o);
    return true;
  }

  /** Who gets the point for this player's KO (last hitter, if recent). */
  private killer(o: Player) {
    return o.lastHitT > 0 && o.lastHitBy >= 0 ? this.w.players[o.lastHitBy] : null;
  }

  private ko(o: Player) {
    const w = this.w;
    const by = this.killer(o);
    if (by) {
      by.bankedRound += W.bubble.koPoints * this.pointMult();
      by.kos++;
    }
    o.state = 'bubble';
    o.bubbleT = W.bubble.seconds;
    o.stateT = 0;
    o.weapon = null;
    o.ammo = 0;
    o.kx *= 0.4;
    o.kz *= 0.4;
    o.vx = o.vz = 0;
    o.cast = null;
    w.events.push({ t: 'ko', victim: o.id, by: by?.id ?? -1, x: o.x, z: o.z });
  }

  /** Falling off the island also counts as a KO for whoever knocked you. */
  fell(o: Player) {
    const by = this.killer(o);
    if (by) {
      by.bankedRound += W.bubble.koPoints * this.pointMult();
      by.kos++;
      this.w.events.push({ t: 'ko', victim: o.id, by: by.id, x: o.x, z: o.z });
    }
    o.weapon = null;
    o.ammo = 0;
  }

  private pop(o: Player, by: Player) {
    const w = this.w;
    by.bankedRound += W.bubble.popPoints * this.pointMult();
    w.events.push({ t: 'pop', victim: o.id, by: by.id, x: o.x, z: o.z });
    this.free(o);
  }

  /** Out of the bubble: back in the fight somewhere else, full health. */
  private free(o: Player) {
    const w = this.w;
    o.bubbleT = 0;
    o.y = 0;
    o.hp = W.hp;
    o.lastHitBy = -1;
    o.lastHitT = 0;
    w.respawn(o);
    o.invuln = W.respawnInvulnerable;
  }

  /** Trapped player: float, drift, mash to break out. */
  tickBubble(p: Player, mash: boolean, dt: number) {
    // mashing helps, but only up to ~7 presses a second (no instant escapes)
    p.stateT -= dt;
    let cut = 0;
    if (mash && p.stateT <= 0) {
      cut = W.bubble.mash;
      p.stateT = 1 / 7;
    }
    p.bubbleT -= dt + cut;
    p.y = Math.min(W.bubble.rise, p.y + dt * 1.6);
    p.x += p.kx * dt;
    p.z += p.kz * dt;
    p.kx *= Math.exp(-3 * dt);
    p.kz *= Math.exp(-3 * dt);
    if (p.bubbleT <= 0) {
      this.w.events.push({ t: 'escape', p: p.id });
      this.free(p);
    }
  }
}

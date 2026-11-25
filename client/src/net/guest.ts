// The joining player's side of a friends match. The host decides everything; this makes it look and feel local:
//  - your own hero moves and shoots the moment you press, and is quietly steered back if the host disagrees
//  - everyone else is drawn a fraction of a second in the past, gliding between the states that arrived
import type { World } from '../../../shared/sim/world.ts';
import type { Input } from '../../../shared/sim/types.ts';
import type { Snapshot } from '../../../shared/sim/snapshot.ts';
import { TUNING } from '../../../shared/config/tuning.ts';

interface Sample {
  t: number;
  x: number;
  z: number;
  y: number;
  f: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const STEP = TUNING.sim.dt;
/** Snapshot spacing (the host sends 15 a second). */
const EVERY = 1 / 15;

export class GuestNet {
  /** Host clock this device is currently drawing others at (sent with inputs so shots are judged fairly). */
  viewTime = 0;
  /** Round trip in ms, smoothed (-1 until measured). */
  ping = -1;
  /** When the last message arrived (performance clock, seconds). */
  heardAt = 0;
  private seq = 0;
  private sent = new Map<number, number>();
  private samples: Sample[][] = [];
  private latest = -1;
  /** host clock − local clock, from the fastest messages */
  private offset: number | null = null;
  private jitter = 0.02;
  // own hero
  private trail: { at: number; x: number; z: number }[] = [];
  private fix = { x: 0, z: 0 };
  private dashT = 0;
  private dashWait = 0;
  private dashDir = { x: 0, z: 1 };
  private predicting = false;

  reset() {
    this.seq = 0;
    this.sent.clear();
    this.ping = -1;
    this.samples = [];
    this.latest = -1;
    this.offset = null;
    this.viewTime = 0;
    this.heardAt = performance.now() / 1000;
    this.trail = [];
    this.fix = { x: 0, z: 0 };
    this.dashT = this.dashWait = 0;
    this.predicting = false;
  }

  /** A number for the next input message. */
  stamp() {
    const now = performance.now() / 1000;
    this.sent.set(++this.seq, now);
    if (this.seq > 120) this.sent.delete(this.seq - 120);
    return this.seq;
  }

  /**
   * A message from the host. False when it is older than one already applied (messages can overtake each other):
   * its events still count, its positions must not be applied.
   */
  arrive(s: Snapshot) {
    const now = performance.now() / 1000;
    this.heardAt = now;
    const gap = s.t - now;
    if (this.offset === null || gap > this.offset) this.offset = gap;
    else {
      this.jitter += (Math.min(0.4, this.offset - gap) - this.jitter) * 0.08;
      this.offset += (gap - this.offset) * 0.004; // follow slow clock drift
    }
    if (s.t <= this.latest) return false;
    this.latest = s.t;
    s.p.forEach((a, i) => {
      const list = (this.samples[i] ??= []);
      list.push({ t: s.t, x: a[0], z: a[1], y: a[2], f: a[5] });
      if (list.length > 20) list.shift();
    });
    return true;
  }

  /** The host's word about my own hero: compare with where I was when it saw the same input. */
  correct(s: Snapshot, w: World, me: number) {
    const [seq, age] = s.ack?.[me] ?? [0, 0];
    const p = w.players[me];
    const server = s.p[me];
    if (!p || !server) return;
    const at = this.sent.get(seq);
    const now = performance.now() / 1000;
    if (at !== undefined) {
      const rtt = Math.max(0, (now - at - age) * 1000);
      this.ping = this.ping < 0 ? rtt : this.ping + (rtt - this.ping) * 0.1;
    }
    if (!this.predicting) return;
    const mine = at === undefined ? undefined : this.where(at + age);
    if (!mine) return;
    const ex = server[0] - mine.x;
    const ez = server[1] - mine.z;
    if (Math.hypot(ex, ez) > 2.5) {
      // thrown, teleported or far off: take the host's position at once
      p.x = server[0];
      p.z = server[1];
      p.y = server[2];
      this.trail = [];
      this.fix = { x: 0, z: 0 };
    } else this.fix = Math.hypot(ex, ez) < 0.06 ? { x: 0, z: 0 } : { x: ex, z: ez };
  }

  private where(at: number) {
    const t = this.trail;
    for (let i = t.length - 1; i > 0; i--) {
      if (t[i - 1].at <= at) {
        const k = clamp((at - t[i - 1].at) / (t[i].at - t[i - 1].at || 1), 0, 1);
        return { x: t[i - 1].x + (t[i].x - t[i - 1].x) * k, z: t[i - 1].z + (t[i].z - t[i - 1].z) * k };
      }
    }
    return t[0];
  }

  /** Draw one frame: move my own hero from my input, and glide everyone else between what arrived. */
  frame(w: World, me: number, inp: Input, dt: number) {
    const now = performance.now() / 1000;
    if (this.offset !== null) {
      const delay = clamp(EVERY + this.jitter * 2 + 0.015, 0.09, 0.32);
      const want = now + this.offset - delay;
      if (!this.viewTime || Math.abs(want - this.viewTime) > 0.6) this.viewTime = want;
      else this.viewTime += dt + (want - this.viewTime - dt) * Math.min(1, dt * 1.5);
    }
    // my own hero is predicted only while it is mine to steer
    const p = w.players[me];
    const free = !!p && w.phase === 'playing' && (p.state === 'normal' || p.state === 'dashing') && !p.gone;
    if (free && !this.predicting) this.trail = [];
    this.predicting = free;
    w.players.forEach((q, i) => {
      if (i === me && free) return;
      this.glide(q, i, i === me ? this.latest : this.viewTime);
    });
    if (free) this.predict(w, me, inp, dt, now);
    // things in flight keep flying between messages
    for (const s of w.brawl.projectiles) {
      s.x += s.vx * dt;
      s.z += s.vz * dt;
    }
    for (const t of w.brawl.throws) t.t = Math.min(t.total, t.t + dt);
  }

  private glide(q: World['players'][number], i: number, t: number) {
    const list = this.samples[i];
    if (!list?.length) return;
    let a = list[0];
    let b = list[0];
    for (let k = list.length - 1; k >= 0; k--) {
      if (list[k].t <= t) {
        a = list[k];
        b = list[k + 1] ?? list[k];
        // nothing newer yet: carry on along the last step for a moment
        if (b === a && k > 0) {
          a = list[k - 1];
          b = list[k];
        }
        break;
      }
    }
    const span = b.t - a.t;
    let k = span > 0 ? (t - a.t) / span : 1;
    k = clamp(k, 0, 1 + 0.12 / (span || 1));
    if (Math.hypot(b.x - a.x, b.z - a.z) > 3) k = 1; // a respawn or a swap: no sliding across the map
    q.x = a.x + (b.x - a.x) * k;
    q.z = a.z + (b.z - a.z) * k;
    q.y = a.y + (b.y - a.y) * Math.min(1, k);
    const turn = Math.atan2(Math.sin(b.f - a.f), Math.cos(b.f - a.f));
    q.facing = a.f + turn * Math.min(1, k);
  }

  private predict(w: World, me: number, inp: Input, dt: number, now: number) {
    const p = w.players[me];
    const D = TUNING.dash;
    this.dashWait = Math.max(0, this.dashWait - dt);
    if (inp.dash && this.dashWait <= 0 && p.dashCd <= 0.1 && this.dashT <= 0) {
      const m = Math.hypot(inp.mx, inp.mz);
      this.dashDir = m < 0.2 ? { x: Math.sin(p.facing), z: Math.cos(p.facing) } : { x: inp.mx / m, z: inp.mz / m };
      this.dashT = D.duration;
      this.dashWait = D.cooldown;
    }
    const hostState = p.state;
    // the whole frame's movement, in slices no longer than the host's step (whole host steps would judder on screen)
    const slices = Math.max(1, Math.ceil(dt / STEP - 0.01));
    for (let i = 0; i < slices; i++) {
      const h = dt / slices;
      this.dashT -= h;
      p.state = this.dashT > 0 ? 'dashing' : 'normal';
      p.dashDx = this.dashDir.x;
      p.dashDz = this.dashDir.z;
      w.locomote(p, inp, h, true);
    }
    p.state = this.dashT > 0 ? 'dashing' : hostState === 'dashing' ? 'normal' : hostState;
    if (p.weapon && !p.cast && inp.aim !== undefined) p.facing = inp.aim;
    // ease toward the host's view without a visible jump
    const k = Math.min(1, dt * 7);
    const dx = this.fix.x * k;
    const dz = this.fix.z * k;
    p.x += dx;
    p.z += dz;
    this.fix.x -= dx;
    this.fix.z -= dz;
    for (const s of this.trail) {
      s.x += dx;
      s.z += dz;
    }
    this.trail.push({ at: now, x: p.x, z: p.z });
    while (this.trail.length > 2 && this.trail[0].at < now - 1.5) this.trail.shift();
  }
}

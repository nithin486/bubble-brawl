// Network snapshots: the host encodes what clients need to draw the world; clients apply them
// onto a local World that they never tick. Coins are sent as deltas to keep mobile data low.
import type { World } from './world.ts';
import type { Coin, Hazard, PState, PowerKind, RoundMod, SimEvent, Phase } from './types.ts';

const STATES: PState[] = ['normal', 'dashing', 'stagger', 'stunned', 'launched', 'falling'];
const PHASES: Phase[] = ['countdown', 'playing', 'roundEnd', 'matchEnd'];
const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

export interface Snapshot {
  k: 0 | 1; // 1 = keyframe (full coin list)
  ph: number;
  pt: number;
  r: number;
  rt: number;
  fin: 0 | 1;
  mod: RoundMod;
  cr: number;
  p: number[][];
  ca: (string | number)[][]; // casts: [player, kind, t, total]
  cu: number[][]; // coin updates [id, x, y, z, v, grounded]
  cx: number[]; // removed coin ids
  b: number[];
  pu: (number | string)[][];
  bo: number[][];
  hz: Hazard[];
  ts: string; // tile states, one char per tile
  tf: number[]; // fallAt for warned tiles [index, fallAt, ...]
  ev: SimEvent[];
}

/** Host side: remembers what it already sent so coins go out as deltas. */
export class SnapshotEncoder {
  private sent = new Map<number, number[]>();
  private sinceKey = 99;

  encode(w: World, events: SimEvent[]): Snapshot {
    const key = this.sinceKey++ >= 45; // a full coin list every ~3 s (and on the first send)
    if (key) this.sinceKey = 0;
    const cu: number[][] = [];
    const live = new Set<number>();
    for (const c of w.coins) {
      live.add(c.id);
      const row = [c.id, r2(c.x), r2(c.y), r2(c.z), c.v, c.grounded ? 1 : 0];
      const prev = this.sent.get(c.id);
      if (key || !prev || Math.abs(prev[1] - row[1]) + Math.abs(prev[2] - row[2]) + Math.abs(prev[3] - row[3]) > 0.04 || prev[5] !== row[5]) {
        cu.push(row);
        this.sent.set(c.id, row);
      }
    }
    const cx: number[] = [];
    for (const id of this.sent.keys())
      if (!live.has(id)) {
        cx.push(id);
        this.sent.delete(id);
      }
    let ts = '';
    const tf: number[] = [];
    w.arena.tiles.forEach((t, i) => {
      ts += String(t.state);
      if (t.state === 1) tf.push(i, r2(t.fallAt));
    });
    return {
      k: key ? 1 : 0,
      ph: PHASES.indexOf(w.phase),
      pt: r2(w.phaseT),
      r: w.round,
      rt: r2(w.roundTime),
      fin: w.finale ? 1 : 0,
      mod: w.mod,
      cr: w.crownId,
      p: w.players.map((p) => [
        r2(p.x), r2(p.z), r2(p.y), r1(p.vx), r1(p.vz), r2(p.facing), STATES.indexOf(p.state), r1(p.stateT),
        p.carried, p.bankedRound, p.bankedTotal, p.roundsWon,
        r1(p.dashCd), r1(p.grabCd), r1(p.skillCd), r1(p.invuln), r1(p.stickyT), r2(p.bankT),
        r1(p.magnetT), r1(p.speedT), r1(p.shieldT), p.combo, p.isBot ? 1 : 0,
        p.stats.steals, p.stats.stolen, p.stats.falls, p.stats.bestBank, p.stats.banks,
      ]),
      ca: w.players.filter((p) => p.cast).map((p) => [p.id, p.cast!.kind, r2(p.cast!.t), r2(p.cast!.total)]),
      cu,
      cx,
      b: [r2(w.bank.x), r2(w.bank.z), w.bank.spot, w.bank.nextSpot, r1(w.bank.moveT), w.bank.warned ? 1 : 0],
      pu: w.powerups.map((u) => [u.id, u.kind, r2(u.x), r2(u.z), r1(u.age)]),
      bo: w.bombs.map((b) => [b.id, b.owner, r2(b.x), r2(b.z), r2(b.fuse)]),
      hz: w.hazards.map((h) => ({ ...h, x: r2(h.x), z: r2(h.z), warn: r2(h.warn), life: r2(h.life) })),
      ts,
      tf,
      ev: events,
    };
  }
}

/** Client side: write a snapshot into a local World (positions go to `targets` for smoothing). */
export function applySnapshot(w: World, s: Snapshot, targets: { x: number; z: number; y: number }[], localId: number) {
  w.phase = PHASES[s.ph];
  w.phaseT = s.pt;
  w.round = s.r;
  w.roundTime = s.rt;
  w.finale = !!s.fin;
  w.mod = s.mod;
  w.crownId = s.cr;
  s.p.forEach((a, i) => {
    const p = w.players[i];
    if (!p) return;
    targets[i] = { x: a[0], z: a[1], y: a[2] };
    // the local player is predicted on this device; everyone else is smoothed toward the target
    if (i !== localId) {
      p.vx = a[3];
      p.vz = a[4];
      p.facing = a[5];
    }
    p.y = a[2];
    p.state = STATES[a[6]];
    p.stateT = a[7];
    p.carried = a[8];
    p.bankedRound = a[9];
    p.bankedTotal = a[10];
    p.roundsWon = a[11];
    p.dashCd = a[12];
    p.grabCd = a[13];
    p.skillCd = a[14];
    p.invuln = a[15];
    p.stickyT = a[16];
    p.bankT = a[17];
    p.magnetT = a[18];
    p.speedT = a[19];
    p.shieldT = a[20];
    p.combo = a[21];
    p.isBot = !!a[22];
    p.stats.steals = a[23];
    p.stats.stolen = a[24];
    p.stats.falls = a[25];
    p.stats.bestBank = a[26];
    p.stats.banks = a[27];
    p.cast = null;
  });
  for (const c of s.ca) {
    const p = w.players[c[0] as number];
    if (p) p.cast = { kind: c[1] as 'grab' | 'skill', t: c[2] as number, total: c[3] as number };
  }
  // coins
  if (s.k) w.coins = [];
  const byId = new Map(w.coins.map((c) => [c.id, c]));
  for (const id of s.cx) byId.delete(id);
  for (const u of s.cu) {
    const c: Coin = byId.get(u[0]) ?? { id: u[0], x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: false, delay: 0, blockId: -1, blockT: 0, anyT: 0, v: 1 };
    c.x = u[1];
    c.y = u[2];
    c.z = u[3];
    c.v = u[4];
    c.grounded = !!u[5];
    byId.set(c.id, c);
  }
  w.coins = [...byId.values()];
  const b = s.b;
  w.bank.x = b[0];
  w.bank.z = b[1];
  w.bank.spot = b[2];
  w.bank.nextSpot = b[3];
  w.bank.moveT = b[4];
  w.bank.warned = !!b[5];
  w.bank.glide = null;
  w.powerups = s.pu.map((u) => ({ id: u[0] as number, kind: u[1] as PowerKind, x: u[2] as number, z: u[3] as number, age: u[4] as number }));
  w.bombs = s.bo.map((x) => ({ id: x[0], owner: x[1], x: x[2], z: x[3], fuse: x[4] }));
  w.hazards = s.hz;
  w.arena.tiles.forEach((t, i) => {
    t.state = Number(s.ts[i] ?? 0) as 0 | 1 | 2;
  });
  for (let i = 0; i < s.tf.length; i += 2) {
    const t = w.arena.tiles[s.tf[i]];
    if (t) t.fallAt = s.tf[i + 1];
  }
  w.arena.safeRadius = w.finale ? w.map.keepRadius : w.map.shape.radius;
}

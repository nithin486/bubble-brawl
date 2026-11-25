// Walkable height: raised decks and ramps (no gravity mechanics: you simply walk up a ramp).
// Everything is a rotated rectangle; the ground height at a point is the max over all features.

export interface Deck {
  x: number;
  z: number;
  /** Width along x and depth along z (before rotation), metres. */
  w: number;
  d: number;
  h: number;
  rot?: number;
}
export interface Ramp {
  x: number;
  z: number;
  /** Direction of ascent: forward = (sin rot, cos rot). Height 0 at the back edge, h at the front edge. */
  rot: number;
  /** Width across the slope. */
  w: number;
  /** Length along the slope. */
  len: number;
  h: number;
}
export interface TerrainDef {
  decks: Deck[];
  ramps: Ramp[];
}

/** Largest height a controlled step may climb (ramps rise gently; deck sides are cliffs). */
export const STEP_MAX = 0.55;

export class Terrain {
  readonly decks: Deck[];
  readonly ramps: Ramp[];
  readonly flat: boolean;

  /** Tallest raised surface, and each ramp's heading (computed once). */
  readonly top: number;
  private readonly turn: { s: number; c: number; reach: number }[];

  constructor(def?: TerrainDef) {
    this.decks = def?.decks ?? [];
    this.ramps = def?.ramps ?? [];
    this.flat = this.decks.length + this.ramps.length === 0;
    this.top = Math.max(0, ...this.decks.map((d) => d.h), ...this.ramps.map((r) => r.h));
    this.turn = this.ramps.map((r) => ({ s: Math.sin(r.rot), c: Math.cos(r.rot), reach: (r.w + r.len) / 2 }));
  }

  heightAt(x: number, z: number): number {
    if (this.flat) return 0;
    let h = 0;
    for (const d of this.decks) {
      const dx = x - d.x;
      const dz = z - d.z;
      const c = Math.cos(d.rot ?? 0);
      const s = Math.sin(d.rot ?? 0);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) <= d.w / 2 && Math.abs(lz) <= d.d / 2 && d.h > h) h = d.h;
    }
    for (let i = 0; i < this.ramps.length; i++) {
      const r = this.ramps[i];
      const dx = x - r.x;
      const dz = z - r.z;
      const t = this.turn[i];
      if (Math.abs(dx) > t.reach || Math.abs(dz) > t.reach) continue;
      // local frame: u across, v along the ascent
      const sn = t.s;
      const cs = t.c;
      const v = dx * sn + dz * cs;
      const u = dx * cs - dz * sn;
      if (Math.abs(u) > r.w / 2 || Math.abs(v) > r.len / 2) continue;
      const hh = r.h * (v / r.len + 0.5);
      if (hh > h) h = hh;
    }
    return h;
  }

  /** Flat ground (height 0) in a square around the point — for chests, spawns. */
  flatAround(x: number, z: number, r: number): boolean {
    if (this.flat) return true;
    for (const [a, b] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) if (this.heightAt(x + a, z + b) > 0.01) return false;
    return true;
  }

  /** Can a walker standing at ground height `from` step onto (x, z)? Dropping down is always allowed. */
  canStep(from: number, x: number, z: number): boolean {
    return this.flat || this.heightAt(x, z) - from <= STEP_MAX;
  }

  /** How many of 8 points around a body of radius r (centred at x, z) are inside a cliff higher than a step from `from`. 0 = clear. */
  breach(from: number, x: number, z: number, r: number): number {
    if (this.flat) return 0;
    let n = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (this.heightAt(x + Math.sin(a) * r, z + Math.cos(a) * r) - from > STEP_MAX) n++;
    }
    return n;
  }

  /** Walking a→b would climb a cliff somewhere along the line? (dropping down is fine) */
  blocked(ax: number, az: number, bx: number, bz: number): boolean {
    if (this.flat) return false;
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / 0.5));
    let prev = this.heightAt(ax, az);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const h = this.heightAt(ax + (bx - ax) * t, az + (bz - az) * t);
      if (h - prev > STEP_MAX) return true;
      prev = h;
    }
    return false;
  }

  private nodes: { x: number; z: number }[] | null = null;
  private routeNodes() {
    if (this.nodes) return this.nodes;
    const out: { x: number; z: number }[] = [];
    for (const r of this.ramps) {
      const sx = Math.sin(r.rot);
      const cz = Math.cos(r.rot);
      out.push({ x: r.x - sx * (r.len / 2 + 1.2), z: r.z - cz * (r.len / 2 + 1.2) }); // foot
      out.push({ x: r.x + sx * (r.len / 2 + 1.2), z: r.z + cz * (r.len / 2 + 1.2) }); // top
    }
    for (const d of this.decks) {
      const c = Math.cos(d.rot ?? 0);
      const s = Math.sin(d.rot ?? 0);
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const lx = a * (d.w / 2 + 2.4);
        const lz = b * (d.d / 2 + 2.4);
        out.push({ x: d.x + lx * c + lz * s, z: d.z - lx * s + lz * c });
      }
    }
    return (this.nodes = out);
  }

  private graph: { pts: { x: number; z: number }[]; adj: number[][] } | null = null;
  /** Static route graph: ramp feet/tops and deck corners, with directed edges that are walkable. */
  private routeGraph() {
    if (this.graph) return this.graph;
    const pts = this.routeNodes();
    const adj = pts.map((a, i) => pts.map((b, j) => (i !== j && !this.blocked(a.x, a.z, b.x, b.z) ? j : -1)).filter((j) => j >= 0));
    return (this.graph = { pts, adj });
  }

  /** Next point for a walker heading for (tx, tz): the target itself, or a ramp foot / deck corner when a cliff is in the way. */
  waypoint(x: number, z: number, tx: number, tz: number): { x: number; z: number } {
    if (this.flat || !this.blocked(x, z, tx, tz)) return { x: tx, z: tz };
    const { pts, adj } = this.routeGraph();
    const n = pts.length;
    const dist = new Array<number>(n).fill(Infinity);
    const prev = new Array<number>(n).fill(-1);
    const done = new Array<boolean>(n).fill(false);
    // start edges from the walker (skip nodes it is standing on)
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(pts[i].x - x, pts[i].z - z);
      if (d > 0.9 && !this.blocked(x, z, pts[i].x, pts[i].z)) dist[i] = d;
    }
    // end edges to the target
    const toT = pts.map((p) => (!this.blocked(p.x, p.z, tx, tz) ? Math.hypot(tx - p.x, tz - p.z) : Infinity));
    let best = Infinity;
    let bestNode = -1;
    for (let it = 0; it < n; it++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity) break;
      done[u] = true;
      if (dist[u] + toT[u] < best) {
        best = dist[u] + toT[u];
        bestNode = u;
      }
      for (const v of adj[u]) {
        const w = dist[u] + Math.hypot(pts[v].x - pts[u].x, pts[v].z - pts[u].z);
        if (w < dist[v]) {
          dist[v] = w;
          prev[v] = u;
        }
      }
    }
    if (bestNode < 0) return { x: tx, z: tz };
    let k = bestNode;
    while (prev[k] >= 0) k = prev[k];
    return pts[k];
  }
}

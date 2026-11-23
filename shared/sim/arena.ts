// Hex-tile island. The ground is a set of KayKit hex tiles; you stand on a tile or you fall.
import { TUNING } from '../config/tuning.ts';
import { len, type V2 } from './math.ts';

export type TileState = 0 | 1 | 2; // 0 solid, 1 warning (shaking), 2 gone

export interface Tile {
  q: number;
  r: number;
  x: number;
  z: number;
  d: number; // distance of centre from island centre
  state: TileState;
  fallAt: number; // round time when it falls (if warned)
}

const S = TUNING.arena.hexSize;
const SQ3 = Math.sqrt(3);

export const hexToWorld = (q: number, r: number): V2 => ({ x: S * SQ3 * (q + r / 2), z: S * 1.5 * r });

export function worldToHex(x: number, z: number) {
  const qf = ((SQ3 / 3) * x - z / 3) / S;
  const rf = ((2 / 3) * z) / S;
  // cube round
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

export const key = (q: number, r: number) => (q + 64) * 256 + (r + 64);

export class Arena {
  tiles: Tile[] = [];
  private map = new Map<number, Tile>();

  constructor() {
    const R = TUNING.arena.radius;
    const n = Math.ceil(R / (S * 1.5)) + 2;
    for (let q = -n; q <= n; q++) {
      for (let r = -n; r <= n; r++) {
        const p = hexToWorld(q, r);
        const d = len(p.x, p.z);
        if (d <= R - 0.6) {
          const t: Tile = { q, r, x: p.x, z: p.z, d, state: 0, fallAt: 0 };
          this.tiles.push(t);
          this.map.set(key(q, r), t);
        }
      }
    }
  }

  reset() {
    for (const t of this.tiles) {
      t.state = 0;
      t.fallAt = 0;
    }
  }

  tileAt(x: number, z: number): Tile | undefined {
    const h = worldToHex(x, z);
    return this.map.get(key(h.q, h.r));
  }

  /** Solid ground under a point? (warned tiles still hold you until they fall) */
  solid(x: number, z: number) {
    const t = this.tileAt(x, z);
    return !!t && t.state !== 2;
  }

  /** Safe for AI targets and spawns: solid and not about to fall. */
  safe(x: number, z: number) {
    const t = this.tileAt(x, z);
    return !!t && t.state === 0;
  }

  /** Radius of the safe disc — shrinks during the finale. */
  safeRadius: number = TUNING.arena.radius;
}

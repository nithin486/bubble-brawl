// Static arena layout: obstacles you collide with (and can hide behind).
// Positions are generated from the hex grid so props sit on tile centres.
import { TUNING } from '../config/tuning.ts';
import { hexToWorld } from './arena.ts';

export type ObstacleKind = 'well' | 'trees' | 'rock' | 'crates' | 'barrels' | 'cart';

export interface Obstacle {
  x: number;
  z: number;
  r: number;
  kind: ObstacleKind;
  /** Visual yaw, radians. */
  rot: number;
}

/** Spoke directions (road axes): 30° + 60°·k in facing convention (atan2(x, z)). */
export const SPOKES = [0, 1, 2, 3, 4, 5].map((k) => ((30 + 60 * k) * Math.PI) / 180);

/** Axial step for each spoke so roads follow tile centres exactly. */
const SPOKE_AXIAL: [number, number][] = [
  [0, 1], // 30°
  [1, 0], // 90°
  [1, -1], // 150°
  [0, -1], // 210°
  [-1, 0], // 270°
  [-1, 1], // 330°
];

export function spokeTile(k: number, steps: number) {
  const [dq, dr] = SPOKE_AXIAL[k];
  return { q: dq * steps, r: dr * steps };
}

/** Tile halfway between spoke k and k+1 at a given ring distance (in tiles). */
function wedgeTile(k: number, ring: number) {
  const a = SPOKE_AXIAL[k];
  const b = SPOKE_AXIAL[(k + 1) % 6];
  const h = Math.floor(ring / 2);
  return { q: a[0] * (ring - h) + b[0] * h, r: a[1] * (ring - h) + b[1] * h };
}

function build(): Obstacle[] {
  const out: Obstacle[] = [{ x: 0, z: 0, r: TUNING.layout.wellRadius, kind: 'well', rot: 0.4 }];
  const outer: ObstacleKind[] = ['trees', 'rock', 'crates', 'trees', 'cart', 'rock'];
  for (let k = 0; k < 6; k++) {
    // outer cover between bank roads (falls away in the finale)
    const t = wedgeTile(k, 5);
    const p = hexToWorld(t.q, t.r);
    const kind = outer[k];
    out.push({ x: p.x, z: p.z, r: TUNING.layout.radius[kind], kind, rot: k * 1.7 });
    // small inner props on every other wedge, near the well
    if (k % 2 === 0) {
      const t2 = wedgeTile(k, 2);
      const p2 = hexToWorld(t2.q, t2.r);
      out.push({ x: p2.x, z: p2.z, r: TUNING.layout.radius.barrels, kind: 'barrels', rot: k });
    }
  }
  return out;
}

export const OBSTACLES: Obstacle[] = build();

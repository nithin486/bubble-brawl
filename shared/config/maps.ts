// Map definitions shared by the sim and the renderer.
// Each map: ground grid, solid obstacles (circles), bank spots, bounce pads, start spots, jackpot source.
import { TUNING } from './tuning.ts';
import { hexToWorld, type ArenaShape } from '../sim/arena.ts';

export type MapId = 'city' | 'spooky' | 'village';

export interface Obstacle {
  x: number;
  z: number;
  /** Collision radius; 0 = decoration only (rides its tile, no collision). */
  r: number;
  /** Visual piece / recipe name the renderer understands. */
  kind: string;
  rot: number;
  /** Extra collision circle that belongs to the previous visual (long things like cars). */
  hidden?: boolean;
}

export interface MapDef {
  id: MapId;
  name: string;
  blurb: string;
  shape: ArenaShape;
  /** Finale shrinks the island to tiles whose centre is within this radius. */
  keepRadius: number;
  bankSpots: { x: number; z: number }[];
  starts: { x: number; z: number }[];
  pads: { x: number; z: number }[];
  /** Where the jackpot fountain erupts from. */
  jackpot: { x: number; z: number; name: string };
  obstacles: Obstacle[];
  /** Live map event. */
  event?: 'traffic' | 'bell';
}

const ring = (n: number, r: number, off = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = off + (i / n) * Math.PI * 2;
    return { x: Math.sin(a) * r, z: Math.cos(a) * r };
  });

/** A long object as a row of circles along its yaw (rot 0 = along +z). */
function long(out: Obstacle[], kind: string, x: number, z: number, rot: number, length: number, r: number) {
  const n = Math.max(2, Math.round(length / (r * 1.6)));
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * (length - r * 2);
    out.push({ kind, x: x + Math.sin(rot) * t, z: z + Math.cos(rot) * t, r, rot, hidden: i > 0 });
  }
}

// ------------------------------------------------------------------ City Streets

function city(): MapDef {
  const S = 4.8; // tile edge: KayKit city tiles (2 units) at ×2.4
  const o: Obstacle[] = [];
  const P = (kind: string, x: number, z: number, r: number, rot = 0) => o.push({ kind, x, z, r, rot });
  // the coin hydrant in the middle of the crossroads
  P('hydrant_gold', 0, 0, 0.45);
  // parked cars along the four streets (two circles each)
  long(o, 'car_taxi', 2 * S, 1.25, Math.PI / 2, 2.3, 0.55);
  long(o, 'car_police', -2 * S, -1.25, -Math.PI / 2, 2.3, 0.55);
  long(o, 'car_sedan', 1.25, -2 * S, Math.PI, 2.3, 0.55);
  long(o, 'car_stationwagon', -1.25, 2 * S, 0, 2.3, 0.55);
  // street furniture around the plazas
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    P('streetlight', sx * (S * 0.5 + 0.35), sz * (S * 0.5 + 0.35), 0.25, Math.atan2(-sx, -sz));
    P('dumpster', sx * (S * 2 - 0.4), sz * (S + 0.2), 0.62, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    P('bench', sx * (S + 1.6), sz * (S * 2 - 1.2), 0.45, 0);
    P('boxes', sx * (S * 1.55), sz * (S * 1.55), 0.6, sx * sz);
    P('bush', sx * (S * 2 - 1.4), sz * (S * 2 - 1.4), 0.45);
  }
  P('trafficlight', S * 0.5 + 0.35, -(S * 1.5), 0.22, 0);
  P('trafficlight', -(S * 0.5 + 0.35), S * 1.5, 0.22, Math.PI);
  P('hydrant', S * 1.5, S * 0.5 + 0.4, 0.3);
  P('hydrant', -S * 1.5, -(S * 0.5 + 0.4), 0.3);
  return {
    id: 'city',
    name: 'City Streets',
    blurb: 'A floating city block at sunset. Hide behind cars!',
    shape: { grid: 'square', tileSize: S, radius: 15.2 },
    keepRadius: 7.2,
    bankSpots: [
      { x: S, z: S },
      { x: -S, z: S },
      { x: S, z: -S },
      { x: -S, z: -S },
      { x: S, z: 0 },
      { x: -S, z: 0 },
    ],
    starts: ring(6, 3.6, Math.PI / 6),
    pads: [
      { x: 2 * S, z: 2 * S },
      { x: -2 * S, z: 2 * S },
      { x: 2 * S, z: -2 * S },
      { x: -2 * S, z: -2 * S },
    ],
    jackpot: { x: 0, z: 0, name: 'Coin Hydrant' },
    obstacles: o,
    event: 'traffic',
  };
}

// ------------------------------------------------------------------ Spooky Graveyard

function spooky(): MapDef {
  const S = 4; // KayKit Halloween floor tiles are 4 m
  const o: Obstacle[] = [];
  const P = (kind: string, x: number, z: number, r: number, rot = 0) => o.push({ kind, x, z, r, rot });
  P('shrine', 0, 0, 0.65);
  // graves in little rows
  for (const [x, z, rot] of [
    [-S * 1.5, S * 2, 0],
    [-S * 0.5, S * 2.1, 0.1],
    [S * 1.5, -S * 2, Math.PI],
    [S * 0.5, -S * 2.1, Math.PI + 0.1],
  ] as const)
    long(o, 'grave', x, z, rot + Math.PI / 2, 2, 0.55);
  for (const [x, z, rot] of [
    [S * 2, S * 1.4, -1.6],
    [S * 2.2, S * 0.6, -1.4],
    [-S * 2, -S * 1.4, 1.6],
    [-S * 2.2, -S * 0.6, 1.5],
    [S * 1.1, S * 2.6, 0.2],
    [-S * 1.1, -S * 2.6, 3.3],
  ] as const)
    P('gravestone', x, z, 0.5, rot);
  long(o, 'coffin', -S * 2.2, S * 1.3, 0.5, 2.6, 0.62);
  long(o, 'coffin', S * 2.2, -S * 1.3, 0.5 + Math.PI, 2.6, 0.62);
  for (const [x, z] of [
    [S * 1.2, S * 1.2],
    [-S * 1.2, -S * 1.2],
    [S * 2.6, 0],
    [-S * 2.6, 0],
  ])
    P('pumpkin', x * 0.92, z * 0.92, 0.65, Math.atan2(-x, -z));
  for (const [x, z] of [
    [-S * 1.3, S * 1.25],
    [S * 1.3, -S * 1.25],
  ])
    P('deadtree', x, z, 0.45, x);
  for (const [x, z] of [
    [S * 0.55, S * 0.55],
    [-S * 0.55, -S * 0.55],
    [S * 0.55, -S * 0.55],
    [-S * 0.55, S * 0.55],
  ])
    P('lantern', x * 1.6, z * 1.6, 0.25);
  // stepping-stone paths (decoration)
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    P('path', i * S * 0.5 * 1.35, 0, 0, i);
    P('path', 0, i * S * 0.5 * 1.35, 0, i * 2);
  }
  return {
    id: 'spooky',
    name: 'Spooky Graveyard',
    blurb: 'Pumpkins, graves and a ghost shrine under a big moon.',
    shape: { grid: 'square', tileSize: S, radius: 14.4 },
    keepRadius: 8.6,
    bankSpots: [
      { x: S, z: S },
      { x: -S, z: S },
      { x: S, z: -S },
      { x: -S, z: -S },
      { x: 2 * S, z: 0 },
      { x: -2 * S, z: 0 },
    ],
    starts: ring(6, 3.4, Math.PI / 6),
    pads: [
      { x: 2 * S, z: 2 * S },
      { x: -2 * S, z: 2 * S },
      { x: 2 * S, z: -2 * S },
      { x: -2 * S, z: -2 * S },
    ],
    jackpot: { x: 0, z: 0, name: 'Ghost Shrine' },
    obstacles: o,
    event: 'bell',
  };
}

// ------------------------------------------------------------------ Village (the first map)

/** Spoke directions (road axes): 30° + 60°·k in facing convention (atan2(x, z)). */
export const SPOKES = [0, 1, 2, 3, 4, 5].map((k) => ((30 + 60 * k) * Math.PI) / 180);
const SPOKE_AXIAL: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
];
export function spokeTile(k: number, steps: number) {
  const [dq, dr] = SPOKE_AXIAL[k];
  return { q: dq * steps, r: dr * steps };
}
function wedgeTile(k: number, ringN: number) {
  const a = SPOKE_AXIAL[k];
  const b = SPOKE_AXIAL[(k + 1) % 6];
  const h = Math.floor(ringN / 2);
  return { q: a[0] * (ringN - h) + b[0] * h, r: a[1] * (ringN - h) + b[1] * h };
}

function village(): MapDef {
  const L = TUNING.layout.radius;
  const o: Obstacle[] = [{ x: 0, z: 0, r: L.well, kind: 'well', rot: 0.4 }];
  const outer = ['trees', 'rock', 'crates', 'trees', 'cart', 'rock'] as const;
  for (let k = 0; k < 6; k++) {
    const t = wedgeTile(k, 5);
    const p = hexToWorld(t.q, t.r);
    o.push({ x: p.x, z: p.z, r: L[outer[k]], kind: outer[k], rot: k * 1.7 });
    if (k % 2 === 0) {
      const t2 = wedgeTile(k, 2);
      const p2 = hexToWorld(t2.q, t2.r);
      o.push({ x: p2.x, z: p2.z, r: L.barrels, kind: 'barrels', rot: k });
    }
  }
  const pads = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    return { x: Math.sin(a) * TUNING.arena.bouncePadRadius, z: Math.cos(a) * TUNING.arena.bouncePadRadius };
  });
  return {
    id: 'village',
    name: 'Hex Village',
    blurb: 'Roads, a wishing well and a sandy beach.',
    shape: { grid: 'hex', tileSize: 2, radius: TUNING.arena.radius },
    keepRadius: TUNING.finale.shrinkToRadius + 0.6,
    bankSpots: SPOKES.map((a) => ({ x: Math.sin(a) * TUNING.bank.ringRadius, z: Math.cos(a) * TUNING.bank.ringRadius })),
    starts: SPOKES.map((a) => ({ x: Math.sin(a) * 3.6, z: Math.cos(a) * 3.6 })),
    pads,
    jackpot: { x: 0, z: 0, name: 'Wishing Well' },
    obstacles: o,
  };
}

export const MAPS: Record<MapId, MapDef> = { city: city(), spooky: spooky(), village: village() };
/** Maps offered to players (the village was replaced after playtest feedback). */
export const MAP_ROTATION: MapId[] = ['city', 'spooky'];

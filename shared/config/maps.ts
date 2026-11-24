// Map definitions shared by the sim and the renderer.
// Each map: ground grid, solid obstacles (circles), bank spots, bounce pads, start spots, jackpot source.
import { TUNING } from './tuning.ts';
import { hexToWorld, type ArenaShape } from '../sim/arena.ts';
import type { TerrainDef } from '../sim/terrain.ts';

export type MapId = 'candy' | 'downtown' | 'city' | 'spooky' | 'village';

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
  /** Bigger maps get more coins and power-ups (1 = the original island size). */
  coinScale?: number;
  /** Live map event. */
  event?: 'traffic' | 'bell';
  /** Walkable ramps and raised decks (optional; flat when absent). */
  terrain?: TerrainDef;
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

// ------------------------------------------------------------------ helpers

/** Stable pseudo-random 0..1 from integers (layouts are the same every match). */
const hash = (a: number, b: number, c = 0) => {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

// ------------------------------------------------------------------ City Streets (7×7 blocks)

function city(): MapDef {
  const S = 4.8; // tile edge: KayKit city tiles (2 units) at ×2.4
  const N = 3; // tiles from the centre to the edge
  const o: Obstacle[] = [];
  const P = (kind: string, x: number, z: number, r: number, rot = 0) => o.push({ kind, x, z, r, rot });
  P('hydrant_gold', 0, 0, 0.45);
  const cars = ['car_taxi', 'car_police', 'car_sedan', 'car_stationwagon'];
  // parked cars on the outer road tiles, alternating sides
  let ci = 0;
  for (const along of [2, 3])
    for (const sgn of [1, -1]) {
      const lane = (along + (sgn > 0 ? 0 : 1)) % 2 ? 1.25 : -1.25;
      long(o, cars[ci++ % 4], sgn * along * S, lane, sgn > 0 ? Math.PI / 2 : -Math.PI / 2, 2.3, 0.55); // x-road
      long(o, cars[ci++ % 4], -lane, sgn * along * S, sgn > 0 ? 0 : Math.PI, 2.3, 0.55); // z-road
    }
  // traffic lights at the crossroads, streetlights along the streets
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    P('trafficlight', sx * (S * 0.5 + 0.35), sz * (S * 0.5 + 0.35), 0.22, Math.atan2(-sx, -sz));
    for (const along of [2, 3]) {
      P('streetlight', sx * (S * 0.5 + 0.4), sz * along * S - sz * 1.2, 0.25, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      P('streetlight', sx * along * S - sx * 1.2, sz * (S * 0.5 + 0.4), 0.25, sz > 0 ? Math.PI : 0);
    }
  }
  // plazas: each 3×3 quadrant gets a mix of street furniture (bank and pad tiles stay clear)
  const furniture = ['boxes', 'dumpster', 'bench', 'bush', 'boxes', 'bush', 'hydrant', 'dumpster'];
  for (const sx of [1, -1])
    for (const sz of [1, -1])
      for (let a = 1; a <= N; a++)
        for (let b = 1; b <= N; b++) {
          if ((a === 1 && b === 1) || (a === 2 && b === 2) || (a === N && b === N)) continue;
          const h = hash(a * sx, b * sz);
          const kind = furniture[Math.floor(h * furniture.length)];
          const r = kind === 'dumpster' ? 0.62 : kind === 'boxes' ? 0.6 : kind === 'bench' ? 0.45 : kind === 'hydrant' ? 0.3 : 0.45;
          const ox = (hash(a, b, 1) - 0.5) * 2.2;
          const oz = (hash(a, b, 2) - 0.5) * 2.2;
          P(kind, sx * a * S + ox, sz * b * S + oz, r, Math.floor(h * 4) * (Math.PI / 2));
          if (hash(a, b, 3) > 0.55) {
            const k2 = furniture[Math.floor(hash(b, a, 4) * furniture.length)];
            P(k2, sx * a * S - ox * 0.9, sz * b * S - oz * 0.9, k2 === 'dumpster' ? 0.62 : 0.45, hash(a, b, 5) * 6);
          }
        }
  // ground detail (r = 0: looks only, no collision)
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    if (Math.abs(i) % 2) P('manhole', i * S + 0.6, i % 3 ? 0.9 : -0.9, 0);
    else P('manhole', i % 4 ? 0.9 : -0.9, i * S - 0.6, 0);
  }
  for (let k = 0; k < 34; k++) {
    const x = (hash(k, 1, 9) - 0.5) * 38;
    const z = (hash(k, 2, 9) - 0.5) * 38;
    if (Math.hypot(x, z) > 19.5) continue;
    const kind = ['puddle', 'crack', 'litter', 'tufts', 'tufts', 'crack'][k % 6];
    P(kind, x, z, 0, hash(k, 3, 9) * 6.28);
  }
  const spots = [
    [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 2], [-2, -2], [2, -2], [-2, 2],
  ].map(([i, j]) => ({ x: i * S, z: j * S }));
  return {
    id: 'city',
    name: 'City Streets',
    blurb: 'A big floating city block at sunset. Hide behind cars!',
    shape: { grid: 'square', tileSize: S, radius: 22.2 },
    keepRadius: 14,
    coinScale: 2,
    bankSpots: spots,
    starts: ring(6, 4, Math.PI / 6),
    pads: [
      { x: N * S, z: N * S },
      { x: -N * S, z: N * S },
      { x: N * S, z: -N * S },
      { x: -N * S, z: -N * S },
    ],
    jackpot: { x: 0, z: 0, name: 'Coin Hydrant' },
    obstacles: o,
    event: 'traffic',
  };
}

// ------------------------------------------------------------------ Candy Town (the one big map)

/**
 * 15×15 frosted candy tiles (~72 m). Original layout, built for routes and choices:
 *  - a raised cake plaza in the middle (14 m square, 2.4 m up) with four narrow ramps = the hill to fight over
 *  - four corner "castle" decks with two ramps each = flanking routes and sniper nests
 *  - ground cover everywhere else: gumdrops, cupcakes, ice-cream cones, cakes, chocolate walls, peppermint pillars
 * Collision circles match the visual footprints of assets/models/candy_*.glb. Everything symmetric so no side is better.
 */
function candy(): MapDef {
  const S = 4.8;
  const R = 37.2;
  const H = 2.4; // deck height = candy_block height
  const o: Obstacle[] = [];
  const P = (kind: string, x: number, z: number, r: number, rot = 0, hidden = false) => o.push({ kind, x, z, r, rot, hidden });
  const decks: TerrainDef['decks'] = [];
  const ramps: TerrainDef['ramps'] = [];
  const quad = (x: number, z: number) => [[x, z], [-x, z], [x, -z], [-x, -z]];
  const ascend = (dx: number, dz: number) => Math.atan2(dx, dz);

  // ---- central plaza: 3×3 blocks, ramps on all four sides (4.8 m wide: a choke point on purpose)
  decks.push({ x: 0, z: 0, w: 3 * S, d: 3 * S, h: H });
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) P('deckcell', i * S, j * S, 0);
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const x = -dx * 10.8;
    const z = -dz * 10.8;
    ramps.push({ x, z, rot: ascend(dx, dz), w: S, len: 7.2, h: H });
    P('ramp', x, z, 0, ascend(dx, dz));
  }
  P('fountain', 0, 0, 0.9);
  for (const [x, z] of quad(5, 5)) P('deckpillar', x, z, 0.9);

  // ---- four corner castles: 2×2 blocks, one ramp from each side
  for (const [cx, cz] of quad(24, 24)) {
    const sx = Math.sign(cx);
    const sz = Math.sign(cz);
    decks.push({ x: cx, z: cz, w: 2 * S, d: 2 * S, h: H });
    for (const [i, j] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) P('deckcell', cx + i * S, cz + j * S, 0);
    // ramp A comes in along x, ramp B along z
    ramps.push({ x: sx * 15.6, z: cz, rot: ascend(sx, 0), w: S, len: 7.2, h: H });
    P('ramp', sx * 15.6, cz, 0, ascend(sx, 0));
    ramps.push({ x: cx, z: sz * 15.6, rot: ascend(0, sz), w: S, len: 7.2, h: H });
    P('ramp', cx, sz * 15.6, 0, ascend(0, sz));
    P('decksundae', cx, cz, 0.8, (sx + sz) * 0.8);
  }

  // ---- ground cover (all big; nothing small)
  const gum = [[18, 8], [8, 18]];
  for (const [gx, gz] of gum) for (const [x, z] of quad(gx, gz)) P('gumdrop', x, z, 1.6, 0);
  for (const [x, z] of quad(12, 12)) P('cupcake', x, z, 1.7, (x + z) * 0.3);
  for (const [x, z] of quad(17, 17)) P('cake', x, z, 2.2, (x - z) * 0.2);
  for (const [gx, gz] of [[30, 9], [9, 30]]) for (const [x, z] of quad(gx, gz)) P('icecream', x, z, 1.9, (x * z) * 0.05);
  for (const [x, z] of quad(16.8, 11)) long(o, 'choco', x, z, 0, 2.9, 0.55);
  for (const [x, z] of quad(26, 3)) P('pillar', x, z, 0.9);
  for (const [x, z] of quad(3, 26)) P('pillar', x, z, 0.9);
  for (const [x, z] of quad(33, 12)) P('swirl', x, z, 0.7, x * 0.2);
  for (const [x, z] of quad(12, 33)) P('swirl', x, z, 0.7, z * 0.2);

  return {
    id: 'candy',
    name: 'Candy Town',
    blurb: 'A giant sweet shop in the sky: climb the cake plaza, flank through the castles, hide behind gumdrops.',
    shape: { grid: 'square', tileSize: S, radius: R },
    keepRadius: 22,
    coinScale: 3,
    bankSpots: [[20.5, 4.5], [-20.5, -4.5], [4.5, -20.5], [-4.5, 20.5], [14, -14], [-14, 14], [22, -12], [-22, 12]].map(([x, z]) => ({ x, z })),
    starts: ring(6, 16, 0),
    pads: [
      { x: 30, z: 0 },
      { x: -30, z: 0 },
      { x: 0, z: 30 },
      { x: 0, z: -30 },
    ],
    jackpot: { x: 0, z: 0, name: 'Sugar Fountain' },
    obstacles: o,
    terrain: { decks, ramps },
  };
}

// ------------------------------------------------------------------ Downtown (big, clean)

/**
 * The big map: 11×11 city tiles (~53 m across). A cross road + a ring road, 12 real buildings as
 * cover (they break lines of fire, so fights are about routes and corners), open plazas, and only a
 * handful of parked cars. Deliberately no small clutter.
 */
function downtown(): MapDef {
  const S = 4.8;
  const R = 26.5;
  const o: Obstacle[] = [];
  const P = (kind: string, x: number, z: number, r: number, rot = 0, hidden = false) => o.push({ kind, x, z, r, rot, hidden });
  // a building fills its whole tile: one visible piece + hidden circles that make the footprint square
  const building = (i: number, j: number, kind: string, rot: number) => {
    const x = i * S;
    const z = j * S;
    P(kind, x, z, 2.05, rot);
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) P(kind, x + a * 1.55, z + b * 1.55, 0.85, rot, true);
  };
  const letters = 'ABCDEFGH';
  const faceRoad = (i: number, j: number) => Math.round(Math.atan2(-i, -j) / (Math.PI / 2)) * (Math.PI / 2);
  // inner ring: one tower per quadrant, on the corner nearest the ring road
  [[2, 2], [-2, 2], [2, -2], [-2, -2]].forEach(([i, j], k) => building(i, j, `building_${letters[(k * 3) % 8]}`, faceRoad(i, j)));
  // outer ring: buildings in pairs with alleys between them
  [[4, 2], [4, -2], [-4, 2], [-4, -2], [2, 4], [-2, 4], [2, -4], [-2, -4]].forEach(([i, j], k) => building(i, j, `building_${letters[(k * 5 + 1) % 8]}`, faceRoad(i, j)));
  P('hydrant_gold', 0, 0, 0.45);
  // a few parked cars on the ring road (cover in the open)
  const cars = ['car_taxi', 'car_sedan', 'car_police', 'car_stationwagon'];
  [[3, 1.1, 0], [-3, -1.1, 0], [1.1, -3, 1], [-1.1, 3, 1]].forEach(([a, b, alongX], k) => {
    const x = alongX ? a * S : a * S + 1.25 * Math.sign(b);
    const z = alongX ? b * S + 1.25 * Math.sign(a) : b * S;
    long(o, cars[k], x, z, alongX ? Math.PI / 2 : 0, 2.3, 0.55);
  });
  // streetlights only at the four inner corners of the cross (light, not clutter)
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) P('streetlight', sx * (S * 0.5 + 0.4), sz * (S * 0.5 + 0.4), 0.25, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
  // small green islands in the open plazas (low: never block the view)
  for (const [i, j] of [[1, 2], [2, 1], [-1, -2], [-2, -1], [1, -2], [-2, 1]]) P('bush', i * S, j * S, 0.45);
  return {
    id: 'downtown',
    name: 'Downtown',
    blurb: 'A big city block: towers for cover, wide roads to fight on.',
    shape: { grid: 'square', tileSize: S, radius: R },
    keepRadius: 15,
    coinScale: 2.4,
    bankSpots: [[1, 1], [-1, -1], [1, -1], [-1, 1], [3, 0], [-3, 0], [0, 3], [0, -3]].map(([i, j]) => ({ x: i * S, z: j * S })),
    starts: ring(6, 6, Math.PI / 6),
    pads: [
      { x: 5 * S, z: 0 },
      { x: -5 * S, z: 0 },
      { x: 0, z: 5 * S },
      { x: 0, z: -5 * S },
    ],
    jackpot: { x: 0, z: 0, name: 'Coin Hydrant' },
    obstacles: o,
    event: 'traffic',
  };
}

// ------------------------------------------------------------------ Spooky Graveyard (bigger)

function spooky(): MapDef {
  const S = 4; // KayKit Halloween floor tiles are 4 m
  const R = 19;
  const o: Obstacle[] = [];
  const P = (kind: string, x: number, z: number, r: number, rot = 0) => o.push({ kind, x, z, r, rot });
  P('shrine', 0, 0, 0.65);
  // stepping-stone paths along the two axes (decoration)
  for (let i = -6; i <= 6; i++) {
    if (i === 0) continue;
    P('path', i * 2.7, 0, 0, i);
    P('path', 0, i * 2.7, 0, i * 2);
  }
  // lanterns light the paths
  for (const d of [5.5, 11.5])
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) P('lantern', sx * d + sz * 1.6, sz * d - sx * 1.6, 0.25);
  // every quadrant tile gets one "scene": a grave row, gravestones, a coffin, pumpkins or a dead tree
  const bankish = new Set(['1,1', '2,2', '3,3']);
  for (const sx of [1, -1])
    for (const sz of [1, -1])
      for (let a = 1; a <= 4; a++)
        for (let b = 1; b <= 4; b++) {
          const x = sx * a * S;
          const z = sz * b * S;
          if (Math.hypot(x, z) > R - 3 || bankish.has(`${a},${b}`)) continue;
          const h = hash(a * sx, b * sz, 7);
          const rot = Math.floor(hash(a, b, 8) * 4) * (Math.PI / 2);
          if (h < 0.28) long(o, 'grave', x, z, rot + Math.PI / 2, 2, 0.55);
          else if (h < 0.5) {
            P('gravestone', x - 0.9, z, 0.5, rot);
            P('gravestone', x + 0.9, z + 0.4, 0.5, rot + 0.2);
          } else if (h < 0.62) long(o, 'coffin', x, z, rot + 0.4, 2.6, 0.62);
          else if (h < 0.8) P('pumpkin', x, z, 0.65, rot);
          else P('deadtree', x, z, 0.45, rot);
        }
  // ground detail (r = 0: looks only, no collision)
  for (let k = 0; k < 40; k++) {
    const x = (hash(k, 5, 11) - 0.5) * 34;
    const z = (hash(k, 6, 11) - 0.5) * 34;
    if (Math.hypot(x, z) > R - 2 || Math.hypot(x, z) < 2) continue;
    const kind = ['tufts', 'bones', 'tufts', 'candles', 'smallpumpkin', 'tufts', 'bones'][k % 7];
    P(kind, x, z, 0, Math.floor(hash(k, 7, 11) * 3) + hash(k, 8, 11));
  }
  const spots = [
    [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 2], [-2, -2], [2, -2], [-2, 2],
  ].map(([i, j]) => ({ x: i * S, z: j * S }));
  return {
    id: 'spooky',
    name: 'Spooky Graveyard',
    blurb: 'A big moonlit graveyard full of pumpkins and graves.',
    shape: { grid: 'square', tileSize: S, radius: R },
    keepRadius: 12,
    coinScale: 1.7,
    bankSpots: spots,
    starts: ring(6, 4, Math.PI / 6),
    pads: [
      { x: 3 * S, z: 3 * S },
      { x: -3 * S, z: 3 * S },
      { x: 3 * S, z: -3 * S },
      { x: -3 * S, z: -3 * S },
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

export const MAPS: Record<MapId, MapDef> = { candy: candy(), downtown: downtown(), city: city(), spooky: spooky(), village: village() };
/** Maps offered to players: Candy Town is the one premium map (older maps stay defined for tests/replays). */
export const MAP_ROTATION: MapId[] = ['candy'];

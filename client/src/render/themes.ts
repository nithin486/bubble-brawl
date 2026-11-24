import * as THREE from 'three';
import type { World } from '../../../shared/sim/world.ts';
import type { MapId, Obstacle } from '../../../shared/config/maps.ts';
import { SPOKES, spokeTile } from '../../../shared/config/maps.ts';
import { hexToWorld, key } from '../../../shared/sim/arena.ts';
import type { Rng } from '../../../shared/sim/math.ts';

const DEG = Math.PI / 180;

/** What a theme can ask the arena view to build. */
export interface ThemeCtx {
  world: World;
  env: Map<string, THREE.Object3D>;
  rng: Rng;
  /** Clone a piece into the backdrop (no collision, no tile). */
  place(name: string, x: number, y: number, z: number, s: number, ry?: number): THREE.Object3D | null;
  /** Additive glow sprite. */
  glow(color: string, size: number, x: number, y: number, z: number, parent?: THREE.Object3D): THREE.Sprite;
  /** A floating chunk of ground with a stepped rocky underside. */
  chunk(cells: { x: number; z: number }[], y: number, piece: string, scale: number, under: { sx: number; sy: number; sz: number }): void;
  add(o: THREE.Object3D): void;
  spin(o: THREE.Object3D): void;
}

/** Builds one obstacle's visual into group g (centred on the obstacle). */
/** Flat ground detail (and grass tufts) drawn by the arena view. */
export type Decal = (kind: 'manhole' | 'puddle' | 'crack' | 'leaves' | 'grass' | 'moss', size: number, x?: number, z?: number, rot?: number) => void;

export type PropAdd = (name: string, s: number, x?: number, z?: number, ry?: number, y?: number) => THREE.Object3D | null;

export interface TilePlan {
  piece: string;
  rot: number;
  scale: [number, number, number];
  y: number;
  color?: THREE.Color;
}

export interface Theme {
  id: MapId;
  sky: { top: string; mid: string; horizon: string; bottom: string };
  fog: { color: string; near: number; far: number };
  hemi: { sky: string; ground: string; intensity: number };
  sun: { color: string; intensity: number; pos: [number, number, number] };
  exposure: number;
  /** Glow filter: only really bright things (lamps, effects) should glow. */
  bloom?: { strength: number; threshold: number };
  clouds: { color: string; emissive: string; intensity: number };
  waterfalls: boolean;
  bubbles: boolean;
  /** Underside piece that falls with each tile. */
  under: { piece: string; sx: number; sy: number; sz: number; y: number; /** backdrop chunks: underside y relative to the chunk top (default -0.4) */ chunkY?: number };
  /** Permanent stepped core layers under the middle. */
  core: { y: number; r: number; s: number }[];
  tiles(world: World): TilePlan[];
  prop(o: Obstacle, add: PropAdd, glow: (color: string, size: number, x: number, y: number, z: number) => void, decal: Decal): void;
  backdrop(ctx: ThemeCtx): void;
  /** Extra things on the arena (not obstacles), e.g. the well plaza. */
  extras?(ctx: ThemeCtx): void;
}

// =================================================================== Candy Town (the one big map)

const CANDY_TILE_Y = -1; // candy tiles are 1 m thick, grounded at y = 0: top surface at world y = 0
const candy: Theme = {
  id: 'candy',
  sky: { top: '#6fd0ff', mid: '#ffb3e6', horizon: '#fff2c9', bottom: '#ffd0ee' },
  fog: { color: '#ffd9f0', near: 110, far: 300 },
  bloom: { strength: 0.32, threshold: 0.97 },
  hemi: { sky: '#fff3fb', ground: '#d79ac2', intensity: 0.8 },
  sun: { color: '#fff0d4', intensity: 1.7, pos: [-14, 24, 12] },
  exposure: 0.82,
  clouds: { color: '#ffffff', emissive: '#ffd6f0', intensity: 0.5 },
  waterfalls: false,
  bubbles: true,
  under: { piece: 'candy_under', sx: 1, sy: 1, sz: 1, y: -3.2, chunkY: -3.2 },
  core: [
    { y: -4.4, r: 22, s: 0.95 },
    { y: -5.6, r: 16, s: 0.9 },
    { y: -6.8, r: 10, s: 0.85 },
    { y: -8.0, r: 5, s: 0.8 },
  ],
  tiles(world) {
    return world.arena.tiles.map((t) => ({
      piece: (t.q + t.r) % 2 === 0 ? 'candy_tile_pink' : 'candy_tile_cream',
      rot: 0,
      scale: [1, 1, 1] as [number, number, number],
      y: CANDY_TILE_Y,
    }));
  },
  prop(o, add, glow) {
    switch (o.kind) {
      case 'fountain':
        add('candy_sundae', 1.35);
        glow('#ffd23f', 2.4, 0, 2.6, 0);
        break;
      case 'cupcake':
        add('candy_cupcake', 1);
        break;
      case 'icecream':
        add('candy_icecream', 1);
        break;
      case 'cake':
        add('candy_cake', 1);
        break;
      case 'choco':
        add('candy_choco', 1, 0, 0, o.rot);
        break;
      case 'sundae':
        add('candy_sundae', 1);
        break;
      case 'swirl':
        add('candy_swirl', 1);
        break;
    }
  },
  backdrop(ctx) {
    const S = 4.8;
    const blocks = [
      { a: -0.2, d: 52, y: -1, w: 3, h: 2, main: 'candy_icecream' },
      { a: 0.75, d: 50, y: -5, w: 2, h: 2, main: 'candy_cupcake' },
      { a: -1.0, d: 48, y: -4, w: 2, h: 2, main: 'candy_cake' },
      { a: 1.6, d: 48, y: -9, w: 2, h: 1, main: 'candy_swirl' },
      { a: -1.75, d: 46, y: -8, w: 1, h: 2, main: 'candy_sundae' },
      { a: 0.25, d: 72, y: 8, w: 2, h: 2, main: 'candy_icecream' },
      { a: 2.7, d: 50, y: -6, w: 2, h: 2, main: 'candy_cupcake' },
      { a: -2.6, d: 51, y: -7, w: 2, h: 2, main: 'candy_cake' },
    ];
    for (const b of blocks) {
      const cx = Math.sin(b.a) * b.d;
      const cz = -Math.cos(b.a) * b.d;
      const cells: { x: number; z: number }[] = [];
      for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) cells.push({ x: cx + (i - (b.w - 1) / 2) * S, z: cz + (j - (b.h - 1) / 2) * S });
      ctx.chunk(cells, b.y, 'candy_tile_pink', 1, { sx: 1, sy: 1, sz: 1 });
      ctx.place(b.main, cx, b.y, cz, ctx.rng.range(1.1, 1.5), ctx.rng.range(0, 6.28));
      for (const c of cells.slice(0, 2)) ctx.place(ctx.rng.pick(['candy_swirl', 'candy_sundae', 'candy_cupcake']), c.x + ctx.rng.range(-1, 1), b.y, c.z + ctx.rng.range(-1, 1), 1, ctx.rng.range(0, 6.28));
    }
  },
};

// =================================================================== City Streets

const CITY_S = 2.4; // KayKit city scale (tile 2 → 4.8 m)

const city: Theme = {
  id: 'city',
  sky: { top: '#2a3c9e', mid: '#9a6fd6', horizon: '#ffb48a', bottom: '#ff9fb4' },
  fog: { color: '#f0a8bc', near: 70, far: 200 },
  hemi: { sky: '#ffe2cf', ground: '#5c4a7c', intensity: 1.15 },
  sun: { color: '#ffd2a1', intensity: 2.5, pos: [-16, 22, 10] },
  exposure: 1.02,
  clouds: { color: '#ffe0ea', emissive: '#ffb3c8', intensity: 0.45 },
  waterfalls: false,
  bubbles: true,
  under: { piece: 'hex_grass_bottom', sx: 2.75, sy: 1.5, sz: 2.4, y: -0.24 },
  core: [
    { y: -1.9, r: 19.2, s: 0.95 },
    { y: -3.3, r: 14.4, s: 0.9 },
    { y: -4.7, r: 9.6, s: 0.85 },
    { y: -6.1, r: 5.6, s: 0.8 },
  ],
  tiles(world) {
    return world.arena.tiles.map((t) => {
      const i = t.q;
      const j = t.r;
      let piece = 'base';
      let rot = 0;
      if (i === 0 && j === 0) piece = 'road_junction';
      else if (i === 0 || j === 0) {
        const along = Math.abs(i === 0 ? j : i);
        piece = along === 1 ? 'road_straight_crossing' : 'road_straight';
        rot = i === 0 ? 0 : Math.PI / 2; // KayKit straight road runs along z
      } else rot = ((i * 7 + j * 3) % 4) * (Math.PI / 2);
      return { piece, rot, scale: [CITY_S, CITY_S, CITY_S], y: -0.24 };
    });
  },
  prop(o, add, glow, decal) {
    const S = CITY_S;
    switch (o.kind) {
      case 'hydrant_gold': {
        const h = add('firehydrant', 5.2);
        h?.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (mesh.isMesh) mesh.material = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ff9d00', emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.25 });
        });
        glow('#ffd23f', 3, 0, 0.8, 0);
        break;
      }
      case 'car_taxi':
      case 'car_police':
      case 'car_sedan':
      case 'car_stationwagon':
        add(o.kind, S);
        if (o.kind === 'car_police') {
          glow('#ff3a5a', 1.2, -0.25, 1.15, 0);
          glow('#3aa0ff', 1.2, 0.25, 1.15, 0);
        }
        break;
      case 'streetlight':
        add('streetlight', 3.2);
        glow('#ffd9a0', 2.2, -0.62, 3.0, 0);
        break;
      case 'dumpster':
        add('dumpster', S);
        add('trash_A', S, 0.9, 0.5, 0.4);
        break;
      case 'bench':
        add('bench', 2.8);
        break;
      case 'boxes':
        add('box_A', S, -0.2, 0, 0.3);
        add('box_B', S, 0.35, 0.3, 1.1);
        add('box_A', S * 0.8, 0.05, 0.1, 0.8, 0.62);
        break;
      case 'bush':
        add('bush', 3.4);
        break;
      case 'trafficlight':
        add('trafficlight_A', 3.4);
        glow('#7dff6a', 0.9, -0.05, 2.15, 0.25);
        break;
      case 'hydrant':
        add('firehydrant', 3.4);
        break;
      default:
        // Downtown's towers: a whole tile each
        if (o.kind.startsWith('building_')) add(o.kind, S * 1.0);
        break;
      // ---- ground detail (no collision)
      case 'manhole':
        decal('manhole', 1.3);
        break;
      case 'puddle':
        decal('puddle', 2.2, 0, 0, o.rot);
        break;
      case 'crack':
        decal('crack', 2.4, 0, 0, o.rot);
        break;
      case 'litter':
        add(o.rot > 3 ? 'trash_A' : 'trash_B', S * 0.9, 0, 0, o.rot);
        decal('leaves', 1.6, 0.4, 0.3, o.rot);
        break;
      case 'tufts':
        decal('grass', 0.9, 0, 0, o.rot);
        decal('grass', 0.7, 0.55, 0.3, o.rot + 1);
        decal('grass', 0.6, -0.4, 0.45, o.rot + 2);
        break;
    }
  },
  backdrop(ctx) {
    const S = 4.8;
    const blocks = [
      { a: -0.2, d: 51, y: -1, w: 3, h: 2 },
      { a: 0.75, d: 49, y: -5, w: 2, h: 2 },
      { a: -1.0, d: 47, y: -4, w: 2, h: 2 },
      { a: 1.6, d: 47, y: -9, w: 2, h: 1 },
      { a: -1.75, d: 45, y: -8, w: 1, h: 2 },
      { a: 0.25, d: 71, y: 8, w: 2, h: 2 },
      { a: -0.7, d: 73, y: 5, w: 2, h: 1 },
      { a: 2.7, d: 49, y: -6, w: 2, h: 2 },
      { a: -2.6, d: 50, y: -7, w: 2, h: 2 },
    ];
    const buildings = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'];
    for (const b of blocks) {
      const cx = Math.sin(b.a) * b.d;
      const cz = -Math.cos(b.a) * b.d;
      const cells: { x: number; z: number }[] = [];
      for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) cells.push({ x: cx + (i - (b.w - 1) / 2) * S, z: cz + (j - (b.h - 1) / 2) * S });
      ctx.chunk(cells, b.y, 'base', CITY_S, { sx: 2.75, sy: 1.5, sz: 2.4 });
      for (const c of cells) {
        const bld = ctx.rng.pick(buildings);
        ctx.place(bld, c.x, b.y, c.z, CITY_S * ctx.rng.range(0.95, 1.15), Math.round(ctx.rng.range(0, 4)) * (Math.PI / 2));
      }
      if (ctx.rng.next() < 0.6) ctx.place('watertower', cells[0].x + 1.2, b.y + 7.5, cells[0].z, CITY_S);
    }
  },
};

// =================================================================== Downtown (big, clean)

const DT_RING = 3;
const downtown: Theme = {
  ...city,
  id: 'downtown',
  fog: { color: '#f0a8bc', near: 85, far: 240 },
  core: [
    { y: -1.9, r: 23, s: 0.95 },
    { y: -3.3, r: 17, s: 0.9 },
    { y: -4.7, r: 11, s: 0.85 },
    { y: -6.1, r: 6, s: 0.8 },
  ],
  tiles(world) {
    return world.arena.tiles.map((t) => {
      const i = t.q;
      const j = t.r;
      const vert = i === 0 || Math.abs(i) === DT_RING; // road running along z
      const horz = j === 0 || Math.abs(j) === DT_RING; // road running along x
      let piece = 'base';
      let rot = ((i * 7 + j * 3) % 4) * (Math.PI / 2);
      const inside = Math.abs(i) <= DT_RING && Math.abs(j) <= DT_RING;
      if (vert && horz && inside) {
        piece = 'road_junction';
        rot = 0;
      } else if (vert && (inside || i === 0)) {
        // crossings right next to a junction
        const nearJ = [0, DT_RING, -DT_RING].some((v) => Math.abs(j - v) === 1);
        piece = nearJ ? 'road_straight_crossing' : 'road_straight';
        rot = 0;
      } else if (horz && (inside || j === 0)) {
        const nearJ = [0, DT_RING, -DT_RING].some((v) => Math.abs(i - v) === 1);
        piece = nearJ ? 'road_straight_crossing' : 'road_straight';
        rot = Math.PI / 2;
      }
      return { piece, rot, scale: [CITY_S, CITY_S, CITY_S], y: -0.24 };
    });
  },
};

// =================================================================== Spooky Graveyard

const spooky: Theme = {
  id: 'spooky',
  sky: { top: '#0b0628', mid: '#2c1560', horizon: '#ff8a5c', bottom: '#3a1a6a' },
  fog: { color: '#3d2470', near: 50, far: 160 },
  hemi: { sky: '#8f7dff', ground: '#2a1840', intensity: 1.25 },
  sun: { color: '#c9d4ff', intensity: 1.9, pos: [12, 24, 8] },
  exposure: 1.12,
  clouds: { color: '#5a3d9a', emissive: '#3a1f7a', intensity: 0.6 },
  waterfalls: false,
  bubbles: true,
  under: { piece: 'hex_grass_bottom', sx: 2.3, sy: 1.3, sz: 2.0, y: -0.5 },
  core: [
    { y: -2.0, r: 18.4, s: 0.95 },
    { y: -3.3, r: 13.6, s: 0.9 },
    { y: -4.6, r: 8.8, s: 0.85 },
    { y: -5.9, r: 4.8, s: 0.8 },
  ],
  tiles(world) {
    return world.arena.tiles.map((t) => {
      const h = Math.sin(t.q * 12.9 + t.r * 78.2) * 43758.5;
      const r = h - Math.floor(h);
      // mossy graveyard ground: sage-green tint with gentle variation
      const k = 0.9 + r * 0.18;
      return {
        piece: 'floor_dirt',
        rot: Math.floor(r * 4) * (Math.PI / 2),
        scale: [1.002, 1, 1.002],
        y: 0,
        color: new THREE.Color().setRGB(0.74 * k, 0.98 * k, 0.66 * k),
      };
    });
  },
  prop(o, add, glow, decal) {
    switch (o.kind) {
      case 'shrine':
        add('shrine_candles', 1.25);
        glow('#ffb347', 2.6, 0, 1.4, 0.2);
        glow('#9dff7a', 3.4, 0, 2.2, 0);
        break;
      case 'grave':
        add('grave_A', 1, 0, 0, Math.PI / 2);
        break;
      case 'gravestone':
        add(['gravestone', 'gravemarker_A', 'gravemarker_B'][Math.abs(Math.round(o.x * 3)) % 3], 1.05);
        break;
      case 'coffin':
        add('coffin_decorated', 1, 0, 0, 0);
        break;
      case 'pumpkin':
        add('pumpkin_orange_jackolantern', 1);
        add('pumpkin_orange_small', 1, 0.75, 0.35, 0.6);
        glow('#ff9a2a', 2.6, 0, 0.6, 0.2);
        break;
      case 'deadtree':
        add('tree_dead_medium', 1.1);
        break;
      case 'lantern':
        add('lantern_standing', 1.3);
        glow('#ffcf6a', 1.8, 0, 0.85, 0);
        break;
      case 'path':
        add(['path_A', 'path_B', 'path_C', 'path_D'][Math.abs(Math.round(o.rot)) % 4], 0.85, 0, 0, o.rot, 0.02);
        break;
      // ---- ground detail (no collision)
      case 'bones':
        add(['bone_A', 'skull', 'ribcage'][Math.floor(o.rot) % 3], 0.9, 0, 0, o.rot);
        decal('moss', 1.8, 0, 0, o.rot);
        break;
      case 'candles':
        add('skull_candle', 0.9, 0, 0, o.rot);
        add('skull_candle', 0.7, 0.45, 0.3, o.rot + 1);
        glow('#ffb347', 1.4, 0.2, 0.55, 0.15);
        break;
      case 'tufts':
        decal('grass', 0.8, 0, 0, o.rot);
        decal('grass', 0.65, 0.5, 0.35, o.rot + 1);
        decal('moss', 1.6, 0.2, 0.1, o.rot);
        break;
      case 'smallpumpkin':
        add('pumpkin_orange_small', 1, 0, 0, o.rot);
        break;
    }
  },
  backdrop(ctx) {
    const S = 4;
    const isles = [
      { a: -0.1, d: 53, y: -2, w: 3, h: 2, main: 'crypt', ms: 1 },
      { a: 0.8, d: 47, y: -6, w: 2, h: 2, main: 'arch_gate', ms: 1.2 },
      { a: -0.9, d: 47, y: -5, w: 2, h: 2, main: 'tree_pine_orange_large', ms: 1 },
      { a: 1.7, d: 46, y: -9, w: 2, h: 1, main: 'tree_dead_large_decorated', ms: 1 },
      { a: -1.8, d: 45, y: -8, w: 1, h: 2, main: 'tree_pine_yellow_large', ms: 1 },
      { a: 2.7, d: 49, y: -7, w: 2, h: 2, main: 'tree_pine_orange_medium', ms: 1.2 },
      { a: -2.6, d: 49, y: -7, w: 2, h: 2, main: 'tree_dead_large', ms: 1.2 },
      { a: 0.35, d: 71, y: 6, w: 2, h: 1, main: 'tree_pine_orange_large', ms: 1.3 },
    ];
    const extras = ['gravestone', 'grave_B', 'pumpkin_orange', 'tree_pine_orange_small', 'tree_dead_small', 'fence', 'post_lantern', 'pumpkin_yellow_jackolantern'];
    for (const b of isles) {
      const cx = Math.sin(b.a) * b.d;
      const cz = -Math.cos(b.a) * b.d;
      const cells: { x: number; z: number }[] = [];
      for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) cells.push({ x: cx + (i - (b.w - 1) / 2) * S, z: cz + (j - (b.h - 1) / 2) * S });
      ctx.chunk(cells, b.y, 'floor_dirt', 1, { sx: 2.3, sy: 1.3, sz: 2.0 });
      ctx.place(b.main, cx, b.y, cz, b.ms, Math.PI + ctx.rng.range(-0.3, 0.3));
      for (const c of cells) {
        for (let k = 0; k < 2; k++) {
          const name = ctx.rng.pick(extras);
          const x = c.x + ctx.rng.range(-1.4, 1.4);
          const z = c.z + ctx.rng.range(-1.4, 1.4);
          if (Math.hypot(x - cx, z - cz) < 2.5 && b.main === 'crypt') continue;
          ctx.place(name, x, b.y, z, 1, ctx.rng.range(0, 6.28));
          if (name.includes('jackolantern') || name === 'post_lantern') ctx.glow('#ff9a2a', 2.2, x, b.y + (name === 'post_lantern' ? 3 : 0.6), z);
        }
      }
    }
    // the moon
    const moon = ctx.glow('#fff4d6', 26, -40, 40, -90);
    moon.material.opacity = 0.9;
    moon.material.blending = THREE.NormalBlending;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.MeshBasicMaterial({ color: '#fff6dc', fog: false, toneMapped: false }));
    disc.position.set(-40, 40, -92);
    disc.lookAt(0, 10, 0);
    ctx.add(disc);
  },
};

// =================================================================== Hex Village (original)

function meadow(x: number, z: number) {
  const n = Math.sin(x * 0.35 + 1.3) * Math.cos(z * 0.31 - 0.7) + 0.5 * Math.sin((x + z) * 0.6);
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  const r = (h - Math.floor(h)) * 0.06;
  const k = 0.5 + 0.35 * n;
  return new THREE.Color().setRGB(0.86 + k * 0.12 + r, 0.92 + k * 0.08 + r, 0.8 + k * 0.08 + r);
}

const village: Theme = {
  id: 'village',
  sky: { top: '#3f7dff', mid: '#9b8cff', horizon: '#ffc4ec', bottom: '#8f7bff' },
  fog: { color: '#c9b4ff', near: 60, far: 160 },
  hemi: { sky: '#dfe6ff', ground: '#6a5a8c', intensity: 1.1 },
  sun: { color: '#fff0d4', intensity: 2.2, pos: [-12, 26, 14] },
  exposure: 1.0,
  clouds: { color: '#ffffff', emissive: '#e8deff', intensity: 0.45 },
  waterfalls: true,
  bubbles: true,
  under: { piece: 'hex_grass_bottom', sx: 1, sy: 1, sz: 1, y: 0 },
  core: [
    { y: -2, r: 11.5, s: 0.97 },
    { y: -3, r: 9, s: 0.94 },
    { y: -4, r: 6.5, s: 0.9 },
    { y: -5, r: 4.2, s: 0.86 },
    { y: -6, r: 2.2, s: 0.8 },
  ],
  tiles(world) {
    const arena = world.arena;
    const plan: TilePlan[] = arena.tiles.map((t) => ({ piece: 'hex_grass', rot: 0, scale: [1, 1, 1], y: 0, color: meadow(t.x, t.z) }));
    const idx = new Map<number, number>();
    arena.tiles.forEach((t, i) => idx.set(key(t.q, t.r), i));
    for (let k = 0; k < 6; k++)
      for (let s = 1; s <= 3; s++) {
        const h = spokeTile(k, s);
        const i = idx.get(key(h.q, h.r));
        if (i !== undefined) plan[i] = { ...plan[i], piece: 'hex_road_A', rot: SPOKES[k] - 90 * DEG };
      }
    const dirs = [30, 90, 150, 210, 270, 330].map((a) => a * DEG);
    const nb: [number, number][] = [[0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1]];
    arena.tiles.forEach((t, i) => {
      if (plan[i].piece !== 'hex_grass') return;
      const open = nb.map(([dq, dr]) => !arena.has(t.q + dq, t.r + dr));
      if (!open.some(Boolean)) return;
      const radial = Math.atan2(t.x, t.z);
      let best = 0;
      let bestD = 9;
      open.forEach((o, d) => {
        if (!o) return;
        const diff = Math.abs(Math.atan2(Math.sin(dirs[d] - radial), Math.cos(dirs[d] - radial)));
        if (diff < bestD) {
          bestD = diff;
          best = d;
        }
      });
      plan[i] = { ...plan[i], piece: 'hex_coast_A_waterless', rot: dirs[best] - 30 * DEG };
    });
    return plan;
  },
  prop(o, add) {
    switch (o.kind) {
      case 'well':
        add('building_well_green', 3.3);
        add('barrel', 3.6, 1.35, 0.5, 0.3);
        add('sack', 4, -1.1, 0.9, 1);
        break;
      case 'trees':
        add('tree_single_A', 2.3, -0.35, 0.2, 0.3);
        add('tree_single_B', 1.9, 0.45, -0.3, 1.2);
        add('rock_single_C', 3, 0.5, 0.6);
        break;
      case 'rock':
        add('rock_single_E', 4.2, 0, 0, 0.4);
        add('rock_single_C', 3.4, 0.55, 0.45, 1.3, 0.25);
        add('rock_single_D', 3, -0.6, 0.4, 2);
        break;
      case 'crates':
        add('crate_A_big', 4.2, -0.3, 0, 0.2);
        add('crate_B_small', 4.2, 0.55, 0.35, 0.7);
        add('crate_A_small', 3.8, -0.25, 0.05, 1.1, 0.88);
        add('barrel', 4, 0.45, -0.55);
        break;
      case 'barrels':
        add('barrel', 3.6, -0.18, 0);
        add('barrel', 3.6, 0.3, 0.2, 1);
        add('sack', 4, 0.1, -0.45, 0.6);
        break;
      case 'cart':
        add('wheelbarrow', 3.8, 0, 0, 0);
        add('resource_lumber', 2.4, 0.7, 0.1, 1.4);
        break;
    }
  },
  extras(ctx) {
    const dirt = ctx.place('building_dirt', 0, 0.01, 0, 1);
    dirt?.scale.set(1.12, 1, 1.12);
  },
  backdrop(ctx) {
    const props = ['tree_single_A', 'tree_single_B', 'trees_A_small', 'trees_B_small', 'tree_single_A', 'rock_single_E'];
    const spots = [
      { a: -0.15, d: 40, y: 1, r: 3, b: 'building_castle_blue', s: 4.2 },
      { a: -0.75, d: 33, y: -3, r: 2, b: 'building_windmill_yellow', s: 3.2 },
      { a: 0.62, d: 34, y: -2, r: 2, b: 'building_market_red', s: 3 },
      { a: 1.25, d: 30, y: -6, r: 1, b: 'building_tavern_green', s: 2.6 },
      { a: -1.35, d: 30, y: -5, r: 1, b: 'building_church_red', s: 2.6 },
      { a: 2.2, d: 34, y: -8, r: 2, b: 'building_tower_A_blue', s: 3 },
      { a: -2.3, d: 33, y: -7, r: 2, b: 'building_home_B_blue', s: 3 },
      { a: 3.1, d: 36, y: -4, r: 1, b: 'tent', s: 3 },
    ];
    for (const s of spots) {
      const cx = Math.sin(s.a) * s.d;
      const cz = -Math.cos(s.a) * s.d;
      const cells: { x: number; z: number }[] = [];
      for (let q = -s.r; q <= s.r; q++)
        for (let r = -s.r; r <= s.r; r++) {
          if (Math.abs(q + r) > s.r) continue;
          const p = hexToWorld(q, r);
          cells.push({ x: cx + p.x, z: cz + p.z });
        }
      ctx.chunk(cells, s.y, 'hex_grass', 1, { sx: 1, sy: 1, sz: 1 });
      ctx.place(s.b, cx, s.y, cz, s.s, ctx.rng.range(-0.4, 0.4) + Math.PI);
      for (const c of cells.slice(1)) if (ctx.rng.next() < 0.5) ctx.place(ctx.rng.pick(props), c.x, s.y, c.z, ctx.rng.range(1.8, 2.4), ctx.rng.range(0, 6.28));
    }
  },
};

export const THEMES: Record<MapId, Theme> = { candy, downtown, city, spooky, village };

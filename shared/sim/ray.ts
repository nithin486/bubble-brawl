// Shooting geometry shared by the game rules and the crosshair: what a straight line in the world hits first.
// Heroes are upright cylinders, props are cylinders with their real height, ground and decks come from the terrain.
import { TUNING } from '../config/tuning.ts';
import type { Obstacle } from '../config/maps.ts';
import type { Player } from './types.ts';
import type { World } from './world.ts';

/** Height of each prop in metres (measured from the models). Anything not listed counts as tall. */
const PROP_HEIGHT: Record<string, number> = {
  // Bubblegum Islands
  bgfountain: 9.4, bggumball: 3.5, bgmush_pink: 3.7, bgmush_aqua: 3.7, bgmush_lilac: 3.7, bgcry_aqua: 2.7, bgcry_pink: 2.7, bgcry_lilac: 2.7, bgpillar: 3.6, bgboulder: 1.75, bglamp: 3.0,
  // Candy Town
  fountain: 4.6, deckpillar: 4.5, decksundae: 4.3, gumdrop: 1.6, cupcake: 2.7, cake: 1.85, icecream: 4.3, choco: 2.7, pillar: 4.5, swirl: 4.5,
  // Desert Outpost
  dcar: 1.85, dstove: 1.2, dcrate: 0.8, dbarrier: 0.82, dboulder: 2.3, dcliff: 2.65, dbarrel: 1.2, dquiverA: 3.5, dquiverB: 1.4, ddead: 3.8,
};
export const propHeight = (kind: string) => PROP_HEIGHT[kind] ?? 3;

/** Height of the gun above the ground a hero stands on. */
export const GUN_HEIGHT = 1.25;
/** A hero's hit shape: radius and height of the body, and the radius of a knock-out bubble. */
export const BODY = { r: 0.55, h: 1.95, bubbleR: 1.15, bubbleY: 1.05 };

export interface RayHit {
  /** Distance along the ray (the maximum when nothing was hit). */
  t: number;
  x: number;
  y: number;
  z: number;
  /** The hero hit, or null. */
  player: Player | null;
  /** True when the ground, a deck or a prop stopped it. */
  solid: boolean;
}

/** Entry distance of a ray into an upright cylinder (base y0, top y1), or Infinity. */
function cylinder(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cz: number, r: number, y0: number, y1: number) {
  const px = ox - cx;
  const pz = oz - cz;
  const a = dx * dx + dz * dz;
  let t0 = 0;
  let t1 = Infinity;
  if (a > 1e-9) {
    const b = px * dx + pz * dz;
    const disc = b * b - a * (px * px + pz * pz - r * r);
    if (disc < 0) return Infinity;
    const q = Math.sqrt(disc);
    t0 = (-b - q) / a;
    t1 = (-b + q) / a;
  } else if (px * px + pz * pz > r * r) return Infinity;
  // clip to the height slab
  if (Math.abs(dy) > 1e-9) {
    const u = (y0 - oy) / dy;
    const v = (y1 - oy) / dy;
    t0 = Math.max(t0, Math.min(u, v));
    t1 = Math.min(t1, Math.max(u, v));
  } else if (oy < y0 || oy > y1) return Infinity;
  t0 = Math.max(0, t0);
  return t0 <= t1 ? t0 : Infinity;
}

/** First thing along the ray from (o) in unit direction (d). `shooter` is never hit. */
export function castRay(w: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, shooter: Player | null): RayHit {
  let best = max;
  let player: Player | null = null;
  let solid = false;
  for (const o of w.obstacles as Obstacle[]) {
    if (o.r <= 0 || !w.arena.solid(o.x, o.z)) continue;
    // cheap reject: farther from the ray's start than the best hit so far
    if (Math.hypot(o.x - ox, o.z - oz) - o.r > best) continue;
    const base = w.terrain.heightAt(o.x, o.z);
    const t = cylinder(ox, oy, oz, dx, dy, dz, o.x, o.z, o.r, base, base + propHeight(o.kind));
    if (t < best) {
      best = t;
      solid = true;
    }
  }
  // ground, ramps and decks: walk the ray (the void between islands stops nothing)
  for (let t = 0.2; t < best; t += 0.2) {
    const x = ox + dx * t;
    const z = oz + dz * t;
    const y = oy + dy * t;
    if (y > 4) continue;
    if (y <= w.terrain.heightAt(x, z) && w.arena.solid(x, z)) {
      best = t;
      solid = true;
      break;
    }
  }
  for (const p of w.players) {
    if (p === shooter || p.state === 'falling' || p.state === 'launched') continue;
    const base = p.y; // a hero's y is already its height in the world (ground, ramp or deck)
    const bubble = p.state === 'bubble';
    const t = bubble
      ? cylinder(ox, oy, oz, dx, dy, dz, p.x, p.z, BODY.bubbleR, base + BODY.bubbleY - BODY.bubbleR, base + BODY.bubbleY + BODY.bubbleR + 1)
      : cylinder(ox, oy, oz, dx, dy, dz, p.x, p.z, Math.max(BODY.r, TUNING.hero.radius), base, base + BODY.h);
    if (t < best) {
      best = t;
      player = p;
      solid = false;
    }
  }
  return { t: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, player, solid };
}

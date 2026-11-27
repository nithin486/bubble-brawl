// Small math helpers for the simulation (pure, no Three.js).

export interface V2 {
  x: number;
  z: number;
}

export const len = (x: number, z: number) => Math.sqrt(x * x + z * z);
export const dist = (a: V2, b: V2) => len(a.x - b.x, a.z - b.z);
export const dist2 = (a: V2, b: V2) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const DEG = Math.PI / 180;

/** Signed smallest difference between two angles. */
export function angleDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Facing angle convention: 0 = +z, angle grows toward +x (matches Three.js rotation.y). */
export const facingOf = (dx: number, dz: number) => Math.atan2(dx, dz);
export const dirX = (a: number) => Math.sin(a);
export const dirZ = (a: number) => Math.cos(a);

/** Is target inside a cone in front of (x,z) facing `facing`? */
export function inCone(from: V2, facing: number, to: V2, range: number, coneDeg: number) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = len(dx, dz);
  if (d > range) return false;
  if (d < 0.6) return true; // overlapping: always counts
  return Math.abs(angleDiff(facing, facingOf(dx, dz))) <= (coneDeg * DEG) / 2;
}

/** Deterministic RNG (mulberry32) so the server can replay the same match. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/**
 * Mark number fields as decimals up front. JS engines store a field that starts as a whole 0 differently from one holding
 * 0.37; the first decimal later in a match changes the object's layout, throws away the optimized code that uses it and
 * runs slow, garbage-making code until it is rebuilt (small stutters on phones). Doing it at creation keeps one layout.
 */
export function floats<T extends object>(o: T, keys: readonly (keyof T)[]): T {
  const r = o as Record<keyof T, unknown>;
  for (const k of keys) {
    const v = r[k];
    r[k] = 0.5;
    r[k] = v;
  }
  return o;
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TUNING } from '../../../shared/config/tuning.ts';
import type { World } from '../../../shared/sim/world.ts';
import { Rng } from '../../../shared/sim/math.ts';
import { hexToWorld } from '../../../shared/sim/arena.ts';

/** Bake a multi-mesh env piece into one geometry + material (pieces share one atlas). */
export function bakePiece(piece: THREE.Object3D): { geo: THREE.BufferGeometry; mat: THREE.Material } {
  piece.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(piece.matrixWorld).invert();
  const geos: THREE.BufferGeometry[] = [];
  let mat: THREE.Material | null = null;
  piece.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    // meshopt quantized attributes → plain float for merging
    for (const name of Object.keys(g.attributes)) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      if (a.normalized || !(a.array instanceof Float32Array)) {
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
        g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
      }
    }
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    geos.push(g.index ? g : g);
    mat ??= m.material as THREE.Material;
  });
  const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  return { geo, mat: mat! };
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpE = new THREE.Euler();
const WARN = new THREE.Color('#ff9a7a');

interface FallAnim {
  t: number;
  spin: THREE.Vector3;
}

export class IslandView {
  group = new THREE.Group();
  private top: THREE.InstancedMesh;
  private under: THREE.InstancedMesh; // first layer under each tile (falls with it)
  private pads: THREE.Group[] = [];
  private padMats: THREE.MeshBasicMaterial[] = [];
  private falls = new Map<number, FallAnim>();
  private clouds: THREE.Object3D[] = [];
  private lastStates: number[] = [];
  private world: World;

  constructor(world: World, env: Map<string, THREE.Object3D>, scene: THREE.Scene) {
    this.world = world;
    const tiles = world.arena.tiles;
    const grass = bakePiece(env.get('hex_grass')!);
    const bottom = bakePiece(env.get('hex_grass_bottom')!);
    const gm = grass.mat as THREE.MeshStandardMaterial;
    gm.roughness = 0.9;
    // KayKit's grass swatch is a pale yellow-green; push it to a richer green
    gm.color.set('#b6ee8a');

    this.top = new THREE.InstancedMesh(grass.geo, grass.mat, tiles.length);
    this.top.receiveShadow = true;
    this.top.castShadow = true;
    this.under = new THREE.InstancedMesh(bottom.geo, bottom.mat, tiles.length);
    this.under.receiveShadow = true;
    tiles.forEach((t, i) => {
      // tiny height variation so the ground doesn't look machine-flat
      this.top.setMatrixAt(i, tmpM.makeTranslation(t.x, 0, t.z));
      this.top.setColorAt(i, tileTint(i));
      this.under.setMatrixAt(i, tmpM.makeTranslation(t.x, -1, t.z));
      this.lastStates.push(0);
    });
    this.group.add(this.top, this.under);

    // permanent core under the centre: stepped layers make it read as a floating island
    const core: THREE.Matrix4[] = [];
    const layers = [
      { y: -2, r: 11.5, s: 0.97 },
      { y: -3, r: 9, s: 0.94 },
      { y: -4, r: 6.5, s: 0.9 },
      { y: -5, r: 4.2, s: 0.86 },
      { y: -6, r: 2.2, s: 0.8 },
    ];
    for (const L of layers) for (const t of tiles) if (t.d <= L.r) core.push(new THREE.Matrix4().compose(tmpP.set(t.x, L.y, t.z), tmpQ.identity(), tmpS.set(L.s, 1, L.s)));
    const coreMesh = new THREE.InstancedMesh(bottom.geo, bottom.mat, core.length);
    core.forEach((m, i) => coreMesh.setMatrixAt(i, m));
    this.group.add(coreMesh);

    this.buildPads();
    this.buildBackdrop(env);
    scene.add(this.group);
  }

  private buildPads() {
    const tex = padTexture();
    for (const pad of this.world.pads) {
      const g = new THREE.Group();
      const s = TUNING.arena.bouncePadSize;
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(s, s * 1.08, 0.22, 28),
        new THREE.MeshStandardMaterial({ color: '#5b3cc4', roughness: 0.5 }),
      );
      base.position.y = 0.11;
      base.castShadow = true;
      base.receiveShadow = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
      const top = new THREE.Mesh(new THREE.CircleGeometry(s * 0.95, 32), mat);
      top.rotation.x = -Math.PI / 2;
      top.position.y = 0.23;
      // chevrons point toward the island centre
      top.rotation.z = Math.atan2(pad.x, pad.z);
      g.add(base, top);
      g.position.set(pad.x, 0, pad.z);
      this.pads.push(g);
      this.padMats.push(mat);
      this.group.add(g);
    }
  }

  private buildBackdrop(env: Map<string, THREE.Object3D>) {
    const rng = new Rng(7);
    const grass = bakePiece(env.get('hex_grass')!);
    const bottom = bakePiece(env.get('hex_grass_bottom')!);
    const props = ['tree_single_A', 'tree_single_B', 'trees_A_small', 'trees_B_small', 'trees_A_medium', 'rock_single_A', 'rock_single_C'];
    const spots = [
      { a: -0.5, d: 31, y: -3, r: 2, b: 'building_windmill_yellow' },
      { a: 0.35, d: 34, y: -1, r: 2, b: 'building_home_A_red' },
      { a: 1.2, d: 30, y: -6, r: 1, b: 'tent' },
      { a: -1.35, d: 29, y: -5, r: 1, b: 'building_well_green' },
      { a: 2.3, d: 33, y: -8, r: 2, b: 'building_tower_A_blue' },
      { a: -2.4, d: 32, y: -7, r: 2, b: 'building_home_B_blue' },
      { a: 3.1, d: 36, y: -2, r: 1, b: 'trees' },
      { a: 0.9, d: 44, y: 3, r: 1, b: 'trees' },
      { a: -0.95, d: 45, y: 2, r: 1, b: 'trees' },
    ];
    const tops: THREE.Matrix4[] = [];
    const unders: THREE.Matrix4[] = [];
    for (const s of spots) {
      const cx = Math.sin(s.a) * s.d;
      const cz = -Math.cos(s.a) * s.d; // mostly behind the arena (camera looks toward -z)
      const cells: { x: number; z: number }[] = [];
      for (let q = -s.r; q <= s.r; q++)
        for (let r = -s.r; r <= s.r; r++) {
          if (Math.abs(q + r) > s.r) continue;
          const p = hexToWorld(q, r);
          cells.push({ x: cx + p.x, z: cz + p.z });
        }
      for (const c of cells) {
        tops.push(new THREE.Matrix4().makeTranslation(c.x, s.y, c.z));
        unders.push(new THREE.Matrix4().makeTranslation(c.x, s.y - 1, c.z));
      }
      if (s.r >= 2) for (const c of cells.slice(0, 7)) unders.push(new THREE.Matrix4().compose(tmpP.set(c.x - cx, s.y - 2, c.z - cz).add(new THREE.Vector3(cx, 0, cz)), tmpQ.identity(), tmpS.set(0.9, 1, 0.9)));
      // centre piece
      const center = s.b === 'trees' ? 'trees_A_medium' : s.b;
      this.place(env, center, cx, s.y, cz, 2.2, rng.range(0, Math.PI * 2));
      // ring of props
      for (const c of cells.slice(1)) {
        if (rng.next() < 0.55) this.place(env, rng.pick(props), c.x + rng.range(-0.3, 0.3), s.y, c.z + rng.range(-0.3, 0.3), rng.range(1.8, 2.4), rng.range(0, 6.28));
      }
    }
    const topMesh = new THREE.InstancedMesh(grass.geo, grass.mat, tops.length);
    tops.forEach((m, i) => topMesh.setMatrixAt(i, m));
    const underMesh = new THREE.InstancedMesh(bottom.geo, bottom.mat, unders.length);
    unders.forEach((m, i) => underMesh.setMatrixAt(i, m));
    topMesh.receiveShadow = true;
    this.group.add(topMesh, underMesh);

    // clouds: drifting around and below the island
    for (let i = 0; i < 14; i++) {
      const name = i % 3 === 0 ? 'cloud_small' : 'cloud_big';
      const c = env.get(name)!.clone();
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(20, 60);
      const below = i < 8;
      c.position.set(Math.sin(a) * d, below ? rng.range(-16, -9) : rng.range(-4, 6), Math.cos(a) * d - (below ? 0 : 20));
      c.scale.setScalar(rng.range(3, 5.5));
      c.rotation.y = rng.range(0, 6.28);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = false;
          m.receiveShadow = false;
          m.material = new THREE.MeshStandardMaterial({ color: '#fff4ff', emissive: '#d9c2ff', emissiveIntensity: 0.35, roughness: 1 });
        }
      });
      c.userData.speed = rng.range(0.2, 0.6);
      this.clouds.push(c);
      this.group.add(c);
    }
  }

  private place(env: Map<string, THREE.Object3D>, name: string, x: number, y: number, z: number, s: number, ry: number) {
    const src = env.get(name);
    if (!src) return;
    const o = src.clone();
    o.position.set(x, y, z);
    o.scale.setScalar(s);
    o.rotation.y = ry;
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) m.castShadow = false;
    });
    this.group.add(o);
  }

  update(dt: number, time: number) {
    const tiles = this.world.arena.tiles;
    let dirty = false;
    tiles.forEach((t, i) => {
      const prev = this.lastStates[i];
      if (t.state === 1) {
        // shake + glow warning
        const k = 1 - Math.max(0, t.fallAt - this.world.roundTime) / TUNING.finale.telegraph;
        const sh = 0.04 + k * 0.08;
        tmpP.set(t.x + Math.sin(time * 47 + i) * sh, Math.sin(time * 31 + i * 3) * sh * 0.6, t.z + Math.cos(time * 53 + i) * sh);
        tmpM.compose(tmpP, tmpQ.identity(), tmpS.set(1, 1, 1));
        this.top.setMatrixAt(i, tmpM);
        tmpP.y -= 1;
        this.under.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
        this.top.setColorAt(i, tmpColor.copy(tileTint(i)).lerp(WARN, 0.5 + 0.5 * Math.sin(time * (8 + k * 14))));
        dirty = true;
      } else if (t.state === 2 && prev !== 2) {
        this.falls.set(i, { t: 0, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2) });
      } else if (t.state === 0 && prev !== 0) {
        this.top.setMatrixAt(i, tmpM.makeTranslation(t.x, 0, t.z));
        this.under.setMatrixAt(i, tmpM.makeTranslation(t.x, -1, t.z));
        this.top.setColorAt(i, tileTint(i));
        this.falls.delete(i);
        dirty = true;
      }
      this.lastStates[i] = t.state;
    });
    for (const [i, f] of this.falls) {
      const t = tiles[i];
      f.t += dt;
      const y = -4.5 * f.t * f.t * 3;
      const gone = f.t > 2.2;
      tmpE.set(f.spin.x * f.t, f.spin.y * f.t, f.spin.z * f.t);
      tmpQ.setFromEuler(tmpE);
      tmpS.setScalar(gone ? 0 : 1);
      this.top.setMatrixAt(i, tmpM.compose(tmpP.set(t.x, y, t.z), tmpQ, tmpS));
      this.under.setMatrixAt(i, tmpM.compose(tmpP.set(t.x, y - 1, t.z), tmpQ, tmpS));
      dirty = true;
      if (gone) this.falls.delete(i);
    }
    if (dirty) {
      this.top.instanceMatrix.needsUpdate = true;
      this.under.instanceMatrix.needsUpdate = true;
      if (this.top.instanceColor) this.top.instanceColor.needsUpdate = true;
    }
    // pads: pulse, hide when their tile is gone
    this.pads.forEach((g, i) => {
      const pad = this.world.pads[i];
      const tile = this.world.arena.tileAt(pad.x, pad.z);
      const idx = tile ? tiles.indexOf(tile) : -1;
      const fall = this.falls.get(idx);
      g.visible = !!tile && (tile.state !== 2 || !!fall);
      if (fall) g.position.y = -4.5 * fall.t * fall.t * 3;
      else g.position.y = tile?.state === 1 ? Math.sin(time * 40) * 0.05 : 0;
      this.padMats[i].opacity = 0.75 + 0.25 * Math.sin(time * 5 + i);
    });
    for (const c of this.clouds) {
      c.rotation.y += dt * 0.02;
      c.position.x += dt * c.userData.speed;
      if (c.position.x > 70) c.position.x = -70;
    }
  }
}

const tmpColor = new THREE.Color();
const tints: THREE.Color[] = [];
/** Stable per-tile colour variation so the ground doesn't look machine-made. */
function tileTint(i: number) {
  if (!tints[i]) {
    const h = Math.sin(i * 12.9898) * 43758.5453;
    const r = h - Math.floor(h);
    tints[i] = new THREE.Color().setRGB(0.9 + r * 0.12, 0.93 + r * 0.09, 0.86 + r * 0.1);
  }
  return tints[i];
}

function padTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grd.addColorStop(0, '#fff7a8');
  grd.addColorStop(0.45, '#ffd23f');
  grd.addColorStop(0.8, '#ff8a3d');
  grd.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(64, 64, 64, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  for (let k = 0; k < 2; k++) {
    const y = 30 + k * 30;
    g.beginPath();
    g.moveTo(64, y);
    g.lineTo(94, y + 24);
    g.lineTo(82, y + 24);
    g.lineTo(64, y + 10);
    g.lineTo(46, y + 24);
    g.lineTo(34, y + 24);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

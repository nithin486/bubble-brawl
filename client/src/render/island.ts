import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TUNING } from '../../../shared/config/tuning.ts';
import type { World } from '../../../shared/sim/world.ts';
import { Rng } from '../../../shared/sim/math.ts';
import { hexToWorld, key } from '../../../shared/sim/arena.ts';
import { OBSTACLES, SPOKES, spokeTile, type Obstacle } from '../../../shared/sim/layout.ts';

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
    geos.push(g);
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
const tmpColor = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const WARN = new THREE.Color('#ff8a6a');
const DEG = Math.PI / 180;

/** Meadow colour: soft noise patches of lighter / darker green, stable per position. */
function meadow(x: number, z: number) {
  const n = Math.sin(x * 0.35 + 1.3) * Math.cos(z * 0.31 - 0.7) + 0.5 * Math.sin((x + z) * 0.6);
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  const r = (h - Math.floor(h)) * 0.06;
  const k = 0.5 + 0.35 * n;
  return new THREE.Color().setRGB(0.86 + k * 0.12 + r, 0.92 + k * 0.08 + r, 0.8 + k * 0.08 + r);
}

type TileKind = 'grass' | 'road' | 'coast' | 'plaza';
interface TileView {
  mesh: THREE.InstancedMesh;
  idx: number;
  rot: number;
  color: THREE.Color;
}
interface FallAnim {
  t: number;
  spin: THREE.Vector3;
}

export class IslandView {
  group = new THREE.Group();
  private kinds = new Map<TileKind, THREE.InstancedMesh>();
  private views: TileView[] = [];
  private under: THREE.InstancedMesh;
  private pads: THREE.Group[] = [];
  private padMats: THREE.MeshBasicMaterial[] = [];
  private props: { obj: THREE.Object3D; tile: number; base: THREE.Vector3; mats: THREE.MeshStandardMaterial[]; fade: number }[] = [];
  /** Set each frame: props between the camera and this point fade out so you never lose your hero. */
  focus: THREE.Vector3 | null = null;
  private falls = new Map<number, FallAnim>();
  private clouds: THREE.Object3D[] = [];
  private spinners: THREE.Object3D[] = [];
  private waterMats: THREE.ShaderMaterial[] = [];
  private bubbles: THREE.Sprite[] = [];
  private lastStates: number[] = [];
  private world: World;
  private tileIndex = new Map<number, number>();

  constructor(world: World, env: Map<string, THREE.Object3D>, scene: THREE.Scene) {
    this.world = world;
    const tiles = world.arena.tiles;
    tiles.forEach((t, i) => this.tileIndex.set(key(t.q, t.r), i));

    // ---- choose a tile type for every hex
    const kindOf: { kind: TileKind; rot: number }[] = tiles.map(() => ({ kind: 'grass', rot: 0 }));
    for (let k = 0; k < 6; k++)
      for (let s = 1; s <= 3; s++) {
        const h = spokeTile(k, s);
        const i = this.tileIndex.get(key(h.q, h.r));
        // KayKit's straight road runs along +x (90°)
        if (i !== undefined) kindOf[i] = { kind: 'road', rot: SPOKES[k] - 90 * DEG };
      }
    const c0 = this.tileIndex.get(key(0, 0));
    if (c0 !== undefined) kindOf[c0] = { kind: 'plaza', rot: 0 };
    // beach on the rim: face the coast tile's sand edge (30° at rest) toward open sky
    const dirs = [30, 90, 150, 210, 270, 330].map((a) => a * DEG);
    const nb: [number, number][] = [[0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1]];
    tiles.forEach((t, i) => {
      if (kindOf[i].kind !== 'grass') return;
      const open = nb.map(([dq, dr]) => !this.tileIndex.has(key(t.q + dq, t.r + dr)));
      if (!open.some(Boolean)) return;
      const radial = Math.atan2(t.x, t.z);
      let best = -1;
      let bestD = 9;
      open.forEach((o, d) => {
        if (!o) return;
        const diff = Math.abs(Math.atan2(Math.sin(dirs[d] - radial), Math.cos(dirs[d] - radial)));
        if (diff < bestD) {
          bestD = diff;
          best = d;
        }
      });
      kindOf[i] = { kind: 'coast', rot: dirs[best] - 30 * DEG };
    });

    const pieces: Record<TileKind, string> = { grass: 'hex_grass', road: 'hex_road_A', coast: 'hex_coast_A_waterless', plaza: 'hex_grass' };
    const counts = new Map<TileKind, number>();
    kindOf.forEach((k) => counts.set(k.kind, (counts.get(k.kind) ?? 0) + 1));
    for (const [kind, n] of counts) {
      const { geo, mat } = bakePiece(env.get(pieces[kind])!);
      const m = (mat as THREE.MeshStandardMaterial).clone();
      m.roughness = 0.92;
      const im = new THREE.InstancedMesh(geo, m, n);
      im.receiveShadow = true;
      im.castShadow = true;
      this.kinds.set(kind, im);
      this.group.add(im);
    }
    const used = new Map<TileKind, number>();
    tiles.forEach((t, i) => {
      const { kind, rot } = kindOf[i];
      const mesh = this.kinds.get(kind)!;
      const idx = used.get(kind) ?? 0;
      used.set(kind, idx + 1);
      const color = meadow(t.x, t.z);
      this.views.push({ mesh, idx, rot, color });
      this.setTile(i, t.x, 0, t.z, rot, 1);
      mesh.setColorAt(idx, color);
      this.lastStates.push(0);
    });

    // dirt plaza under the well
    const dirt = env.get('building_dirt')!.clone();
    dirt.position.set(0, 0.01, 0);
    dirt.scale.set(1.12, 1, 1.12);
    this.group.add(dirt);

    // first layer under each tile (falls with it) + permanent stepped core
    const bottom = bakePiece(env.get('hex_grass_bottom')!);
    this.under = new THREE.InstancedMesh(bottom.geo, bottom.mat, tiles.length);
    this.under.receiveShadow = true;
    tiles.forEach((t, i) => this.under.setMatrixAt(i, tmpM.makeTranslation(t.x, -1, t.z)));
    this.group.add(this.under);
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

    for (const o of OBSTACLES) this.buildProp(o, env);
    this.buildPads(env);
    this.buildBackdrop(env);
    this.buildWaterfalls();
    this.buildBubbles();
    scene.add(this.group);
  }

  private setTile(i: number, x: number, y: number, z: number, extraRot: number, scale: number, spin?: THREE.Euler) {
    const v = this.views[i];
    tmpQ.setFromAxisAngle(UP, v.rot);
    if (spin) tmpQ.multiply(new THREE.Quaternion().setFromEuler(spin));
    void extraRot;
    v.mesh.setMatrixAt(v.idx, tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.setScalar(scale)));
  }

  /** Obstacle visuals — sized to match their collision circles in shared/sim/layout.ts. */
  private buildProp(o: Obstacle, env: Map<string, THREE.Object3D>) {
    const g = new THREE.Group();
    const add = (name: string, s: number, x = 0, z = 0, ry = 0, y = 0) => {
      const src = env.get(name);
      if (!src) return;
      const c = src.clone();
      c.scale.setScalar(s);
      c.position.set(x, y, z);
      c.rotation.y = ry;
      g.add(c);
    };
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
    g.position.set(o.x, 0, o.z);
    g.rotation.y = o.rot;
    const mats: THREE.MeshStandardMaterial[] = [];
    g.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.transparent = true;
        mesh.material = mat;
        mats.push(mat);
      }
    });
    const tile = this.world.arena.tileAt(o.x, o.z);
    this.props.push({ obj: g, tile: tile ? this.world.arena.tiles.indexOf(tile) : -1, base: g.position.clone(), mats, fade: 1 });
    this.group.add(g);
  }

  private buildPads(env: Map<string, THREE.Object3D>) {
    const tex = padTexture();
    for (const pad of this.world.pads) {
      const g = new THREE.Group();
      const s = TUNING.arena.bouncePadSize;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 1.12, 0.26, 32), new THREE.MeshStandardMaterial({ color: '#6b4cff', roughness: 0.45 }));
      base.position.y = 0.13;
      base.castShadow = true;
      base.receiveShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(s * 0.98, 0.07, 8, 40), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#c9b8ff', emissiveIntensity: 0.4 }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.27;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
      const top = new THREE.Mesh(new THREE.CircleGeometry(s * 0.93, 32), mat);
      top.rotation.x = -Math.PI / 2;
      top.position.y = 0.275;
      top.rotation.z = Math.atan2(pad.x, pad.z); // chevrons point at the island centre
      g.add(base, rim, top);
      // a pair of lit torches marks each pad from afar
      const torch = env.get('torch_lit');
      if (torch) {
        const d = Math.hypot(pad.x, pad.z);
        const tx = -pad.z / d;
        const tz = pad.x / d;
        for (const sgn of [-1, 1]) {
          const t = torch.clone();
          t.scale.setScalar(1.3);
          t.position.set(tx * sgn * (s + 0.45), 0, tz * sgn * (s + 0.45));
          g.add(t);
        }
      }
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
    const gmat = grass.mat;
    const props = ['tree_single_A', 'tree_single_B', 'trees_A_small', 'trees_B_small', 'tree_single_A', 'rock_single_E'];
    // floating islands around the arena (mostly behind it, where the camera looks)
    const spots = [
      { a: -0.15, d: 40, y: 1, r: 3, b: 'building_castle_blue', s: 4.2 },
      { a: -0.75, d: 33, y: -3, r: 2, b: 'building_windmill_yellow', s: 3.2 },
      { a: 0.62, d: 34, y: -2, r: 2, b: 'building_market_red', s: 3 },
      { a: 1.25, d: 30, y: -6, r: 1, b: 'building_tavern_green', s: 2.6 },
      { a: -1.35, d: 30, y: -5, r: 1, b: 'building_church_red', s: 2.6 },
      { a: 2.2, d: 34, y: -8, r: 2, b: 'building_tower_A_blue', s: 3 },
      { a: -2.3, d: 33, y: -7, r: 2, b: 'building_home_B_blue', s: 3 },
      { a: 3.1, d: 36, y: -4, r: 1, b: 'tent', s: 3 },
      { a: 0.25, d: 52, y: 6, r: 1, b: 'trees_A_medium', s: 1.6 },
      { a: -0.55, d: 54, y: 4, r: 1, b: 'trees_A_medium', s: 1.6 },
      { a: 1.0, d: 50, y: 2, r: 1, b: 'building_home_A_red', s: 2.6 },
    ];
    const tops: THREE.Matrix4[] = [];
    const unders: THREE.Matrix4[] = [];
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
      cells.sort((a, b) => (a.x - cx) ** 2 + (a.z - cz) ** 2 - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
      for (const c of cells) {
        const dy = (c.x - cx) ** 2 + (c.z - cz) ** 2 < 1 ? 0 : rng.next() < 0.3 ? -0.25 : 0;
        tops.push(new THREE.Matrix4().makeTranslation(c.x, s.y + dy, c.z));
        unders.push(new THREE.Matrix4().makeTranslation(c.x, s.y + dy - 1, c.z));
      }
      // stepped rock under each island
      for (let L = 1; L <= s.r + 1; L++)
        for (const c of cells) {
          const dd = Math.hypot(c.x - cx, c.z - cz);
          if (dd > (s.r + 1 - L) * 2 + 0.5) continue;
          unders.push(new THREE.Matrix4().compose(tmpP.set(c.x, s.y - 1 - L, c.z), tmpQ.identity(), tmpS.set(0.92, 1, 0.92)));
        }
      this.place(env, s.b, cx, s.y, cz, s.s, rng.range(-0.4, 0.4) + Math.PI);
      for (const c of cells.slice(1)) {
        if (rng.next() < 0.5) this.place(env, rng.pick(props), c.x + rng.range(-0.3, 0.3), s.y, c.z + rng.range(-0.3, 0.3), rng.range(1.8, 2.4), rng.range(0, 6.28));
      }
    }
    const topMesh = new THREE.InstancedMesh(grass.geo, gmat, tops.length);
    tops.forEach((m, i) => topMesh.setMatrixAt(i, m));
    const underMesh = new THREE.InstancedMesh(bottom.geo, bottom.mat, unders.length);
    unders.forEach((m, i) => underMesh.setMatrixAt(i, m));
    topMesh.receiveShadow = true;
    this.group.add(topMesh, underMesh);

    // sea of clouds below + a few drifting at island height
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e8deff', emissiveIntensity: 0.45, roughness: 1 });
    for (let i = 0; i < 26; i++) {
      const c = env.get(i % 3 === 0 ? 'cloud_small' : 'cloud_big')!.clone();
      const a = rng.range(0, Math.PI * 2);
      const below = i < 18;
      // upper clouds only far behind the arena (camera looks toward -z), never over the play area
      const ua = rng.range(-1.2, 1.2);
      const d = below ? rng.range(16, 70) : rng.range(42, 70);
      if (below) c.position.set(Math.sin(a) * d, rng.range(-21, -17), Math.cos(a) * d);
      else c.position.set(Math.sin(ua) * d, rng.range(-4, 6), -Math.cos(ua) * d);
      c.scale.setScalar(below ? rng.range(5, 7) : rng.range(3, 5));
      c.rotation.y = rng.range(0, 6.28);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = false;
          m.receiveShadow = false;
          m.material = cloudMat;
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
      if (/windmill_top_fan|lumbermill_saw/.test(m.name)) this.spinners.push(m);
    });
    this.group.add(o);
  }

  /** Water gushing out of the island's rocky underside on the sides the camera sees. */
  private buildWaterfalls() {
    const angles = [-0.9, -0.25, 0.5, 1.25, 2.6, -2.5];
    for (const a of angles) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { time: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: `varying vec2 vUv; uniform float time;
          float h(float x){ return fract(sin(x*91.7)*437.5); }
          void main(){
            float y = vUv.y*7.0 + time*3.2;
            float stripe = smoothstep(0.55, 1.0, sin((vUv.x*13.0 + h(floor(y))*6.0)) * 0.5 + 0.5);
            vec3 c = mix(vec3(0.35,0.75,1.0), vec3(0.95,1.0,1.0), stripe*0.8 + (1.0-vUv.y)*0.0);
            float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
            float fade = smoothstep(0.0, 0.5, vUv.y);
            gl_FragColor = vec4(c, 0.78 * edge * fade);
          }`,
      });
      this.waterMats.push(mat);
      const R = 12.9;
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 22, 1, 1), mat);
      sheet.position.set(Math.sin(a) * (R + 0.15), -12.5, Math.cos(a) * (R + 0.15));
      sheet.rotation.y = a;
      this.group.add(sheet);
      // foam where it bursts out of the rock
      const foam = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#bfefff', emissiveIntensity: 0.5, roughness: 1 }));
      foam.scale.set(1.3, 0.6, 0.8);
      foam.position.set(Math.sin(a) * (R + 0.2), -1.6, Math.cos(a) * (R + 0.2));
      foam.userData.foam = true;
      this.spinners.push(foam);
      this.group.add(foam);
    }
  }

  /** Iridescent bubbles drifting up around the arena — it's Bubble Brawl after all. */
  private buildBubbles() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 20, 32, 32, 31);
    grd.addColorStop(0, 'rgba(180,240,255,0.05)');
    grd.addColorStop(0.8, 'rgba(200,180,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(32, 32, 31, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.ellipse(22, 20, 7, 4, -0.7, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    for (let k = 0; k < 36; k++) {
      const s = new THREE.Sprite(mat);
      this.resetBubble(s, true);
      this.bubbles.push(s);
      this.group.add(s);
    }
  }

  private resetBubble(s: THREE.Sprite, anyY: boolean) {
    const a = Math.random() * Math.PI * 2;
    const d = 6 + Math.random() * 22;
    s.position.set(Math.sin(a) * d, anyY ? -8 + Math.random() * 18 : -10, Math.cos(a) * d);
    s.scale.setScalar(0.25 + Math.random() * 0.6);
    s.userData.v = 0.6 + Math.random() * 0.8;
    s.userData.ph = Math.random() * 6;
  }

  update(dt: number, time: number) {
    const tiles = this.world.arena.tiles;
    const dirty = new Set<THREE.InstancedMesh>();
    tiles.forEach((t, i) => {
      const prev = this.lastStates[i];
      const v = this.views[i];
      if (t.state === 1) {
        const k = 1 - Math.max(0, t.fallAt - this.world.roundTime) / TUNING.finale.telegraph;
        const sh = 0.04 + k * 0.08;
        const x = t.x + Math.sin(time * 47 + i) * sh;
        const y = Math.sin(time * 31 + i * 3) * sh * 0.6;
        const z = t.z + Math.cos(time * 53 + i) * sh;
        this.setTile(i, x, y, z, 0, 1);
        this.under.setMatrixAt(i, tmpM.makeTranslation(x, y - 1, z));
        v.mesh.setColorAt(v.idx, tmpColor.copy(v.color).lerp(WARN, 0.5 + 0.5 * Math.sin(time * (8 + k * 14))));
        dirty.add(v.mesh);
      } else if (t.state === 2 && prev !== 2) {
        this.falls.set(i, { t: 0, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2) });
      } else if (t.state === 0 && prev !== 0) {
        this.setTile(i, t.x, 0, t.z, 0, 1);
        this.under.setMatrixAt(i, tmpM.makeTranslation(t.x, -1, t.z));
        v.mesh.setColorAt(v.idx, v.color);
        this.falls.delete(i);
        dirty.add(v.mesh);
      }
      this.lastStates[i] = t.state;
    });
    for (const [i, f] of this.falls) {
      const t = tiles[i];
      const v = this.views[i];
      f.t += dt;
      const y = -13.5 * f.t * f.t;
      const gone = f.t > 2.2;
      tmpE.set(f.spin.x * f.t, f.spin.y * f.t, f.spin.z * f.t);
      this.setTile(i, t.x, y, t.z, 0, gone ? 0 : 1, tmpE);
      tmpQ.setFromEuler(tmpE);
      this.under.setMatrixAt(i, tmpM.compose(tmpP.set(t.x, y - 1, t.z), tmpQ, tmpS.setScalar(gone ? 0 : 1)));
      v.mesh.setColorAt(v.idx, v.color);
      dirty.add(v.mesh);
      if (gone) this.falls.delete(i);
    }
    // props ride their tile: shake, fall, come back next round
    for (const p of this.props) {
      const t = tiles[p.tile];
      if (!t) continue;
      const f = this.falls.get(p.tile);
      if (f) {
        p.obj.position.set(p.base.x, -13.5 * f.t * f.t, p.base.z);
        p.obj.visible = f.t < 2.2;
      } else if (t.state === 2) p.obj.visible = false;
      else {
        p.obj.visible = true;
        p.obj.position.copy(p.base);
        if (t.state === 1) p.obj.position.x += Math.sin(time * 47) * 0.06;
      }
      // camera looks toward -z: tall props just "below" the hero on screen hide it
      const fc = this.focus;
      const hide = !!fc && p.base.z > fc.z - 0.3 && p.base.z < fc.z + 5 && Math.abs(p.base.x - fc.x) < 2.6;
      const target = hide ? 0.3 : 1;
      p.fade += (target - p.fade) * Math.min(1, dt * 8);
      for (const m of p.mats) {
        m.opacity = p.fade;
        m.depthWrite = p.fade > 0.95;
      }
    }
    for (const m of dirty) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (dirty.size) this.under.instanceMatrix.needsUpdate = true;
    // pads: pulse, ride their tile
    this.pads.forEach((g, i) => {
      const pad = this.world.pads[i];
      const tile = this.world.arena.tileAt(pad.x, pad.z);
      const idx = tile ? tiles.indexOf(tile) : -1;
      const fall = this.falls.get(idx);
      g.visible = !!tile && (tile.state !== 2 || !!fall);
      if (fall) g.position.y = -13.5 * fall.t * fall.t;
      else g.position.y = tile?.state === 1 ? Math.sin(time * 40) * 0.05 : 0;
      this.padMats[i].opacity = 0.75 + 0.25 * Math.sin(time * 5 + i);
    });
    for (const sp of this.spinners) {
      if (sp.userData.foam) sp.scale.set(1.3 + Math.sin(time * 9 + sp.position.x) * 0.12, 0.6 + Math.sin(time * 7) * 0.08, 0.8);
      else sp.rotation.z += dt * 1.6;
    }
    for (const m of this.waterMats) m.uniforms.time.value = time;
    for (const b of this.bubbles) {
      b.position.y += b.userData.v * dt;
      b.position.x += Math.sin(time * 1.3 + b.userData.ph) * dt * 0.3;
      if (b.position.y > 12) this.resetBubble(b, false);
    }
    for (const c of this.clouds) {
      c.rotation.y += dt * 0.02;
      c.position.x += dt * c.userData.speed;
      if (c.position.x > 75) c.position.x = -75;
      // keep drifting clouds out of the play area
      if (c.position.y > -9 && Math.hypot(c.position.x, c.position.z) < 36) c.position.x = -75;
    }
  }
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

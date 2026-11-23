import * as THREE from 'three';
import { addOutlines } from './style.ts';
import { makeDecal } from './decals.ts';
import type { Decal } from './themes.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TUNING } from '../../../shared/config/tuning.ts';
import type { World } from '../../../shared/sim/world.ts';
import { Rng } from '../../../shared/sim/math.ts';
import { THEMES, type Theme, type ThemeCtx, type TilePlan } from './themes.ts';

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
const WHITE = new THREE.Color('#ffffff');

interface TileView {
  mesh: THREE.InstancedMesh;
  idx: number;
  plan: TilePlan;
  color: THREE.Color;
}
interface FallAnim {
  t: number;
  spin: THREE.Vector3;
}
interface PropView {
  obj: THREE.Object3D;
  tile: number;
  base: THREE.Vector3;
  mats: THREE.MeshStandardMaterial[];
  fade: number;
  tall: boolean;
  ink: THREE.Material[];
}

/** Renders any map: themed tiles that shake and fall, props that ride their tile, pads, backdrop and ambience. */
export class ArenaView {
  group = new THREE.Group();
  readonly theme: Theme;
  private views: TileView[] = [];
  private under: THREE.InstancedMesh;
  private pads: THREE.Group[] = [];
  private padMats: THREE.MeshBasicMaterial[] = [];
  private props: PropView[] = [];
  /** Set each frame: props between the camera and this point fade out so you never lose your hero. */
  focus: THREE.Vector3 | null = null;
  /** Set by the game: does a prop at (x, z) hide the focus point from the camera? */
  blocks: ((x: number, z: number, fx: number, fz: number) => boolean) | null = null;
  private falls = new Map<number, FallAnim>();
  private clouds: THREE.Object3D[] = [];
  private spinners: THREE.Object3D[] = [];
  private waterMats: THREE.ShaderMaterial[] = [];
  private bubbles: THREE.Sprite[] = [];
  private lastStates: number[] = [];
  private world: World;
  private env: Map<string, THREE.Object3D>;
  private glowTex: THREE.Texture;
  private baked = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material }>();
  private chunkMats = new Map<string, THREE.Matrix4[]>();

  constructor(world: World, env: Map<string, THREE.Object3D>, scene: THREE.Scene, glowTex: THREE.Texture) {
    this.world = world;
    this.env = env;
    this.glowTex = glowTex;
    this.theme = THEMES[world.map.id];
    const th = this.theme;
    const tiles = world.arena.tiles;

    // ---- ground tiles, instanced per piece
    const plans = th.tiles(world);
    const counts = new Map<string, number>();
    plans.forEach((p) => counts.set(p.piece, (counts.get(p.piece) ?? 0) + 1));
    const meshes = new Map<string, THREE.InstancedMesh>();
    for (const [piece, n] of counts) {
      const { geo, mat } = this.bake(piece);
      // ground keeps smooth PBR light (cel bands on big flat tiles look washed out)
      const m = ((mat.userData.pbr as THREE.Material) ?? mat).clone() as THREE.MeshStandardMaterial;
      m.roughness = 0.9;
      const im = new THREE.InstancedMesh(geo, m, n);
      im.receiveShadow = true;
      im.castShadow = true;
      meshes.set(piece, im);
      this.group.add(im);
    }
    const used = new Map<string, number>();
    tiles.forEach((t, i) => {
      const plan = plans[i];
      const mesh = meshes.get(plan.piece)!;
      const idx = used.get(plan.piece) ?? 0;
      used.set(plan.piece, idx + 1);
      const color = plan.color ?? WHITE;
      this.views.push({ mesh, idx, plan, color });
      this.setTile(i, t.x, 0, t.z, 1);
      mesh.setColorAt(idx, color);
      this.lastStates.push(0);
    });

    // ---- underside: one piece per tile (falls with it) + a permanent stepped core
    const U = th.under;
    const bottom = this.bake(U.piece);
    this.under = new THREE.InstancedMesh(bottom.geo, bottom.mat, tiles.length);
    this.under.receiveShadow = true;
    tiles.forEach((t, i) => this.setUnder(i, t.x, 0, t.z, 1));
    this.group.add(this.under);
    const core: THREE.Matrix4[] = [];
    for (const L of th.core)
      for (const t of tiles) if (t.d <= L.r) core.push(new THREE.Matrix4().compose(tmpP.set(t.x, L.y, t.z), tmpQ.identity(), tmpS.set(U.sx * L.s, U.sy, U.sz * L.s)));
    const coreMesh = new THREE.InstancedMesh(bottom.geo, bottom.mat, core.length);
    core.forEach((m, i) => coreMesh.setMatrixAt(i, m));
    this.group.add(coreMesh);

    // ---- props, pads, backdrop, ambience
    for (const o of world.map.obstacles) if (!o.hidden) this.buildProp(o);
    this.buildPads();
    const ctx = this.ctx();
    th.extras?.(ctx);
    th.backdrop(ctx);
    this.flushChunks();
    this.buildClouds();
    if (th.waterfalls) this.buildWaterfalls();
    if (th.bubbles) this.buildBubbles();
    scene.add(this.group);
  }

  private bake(piece: string) {
    let b = this.baked.get(piece);
    if (!b) {
      const src = this.env.get(piece);
      if (!src) throw new Error(`missing env piece ${piece}`);
      b = bakePiece(src);
      this.baked.set(piece, b);
    }
    return b;
  }

  private ctx(): ThemeCtx {
    const rng = new Rng(7);
    return {
      world: this.world,
      env: this.env,
      rng,
      place: (name, x, y, z, s, ry = 0) => this.place(name, x, y, z, s, ry),
      glow: (color, size, x, y, z, parent) => {
        const g = this.makeGlow(color, size);
        g.position.set(x, y, z);
        (parent ?? this.group).add(g);
        return g;
      },
      chunk: (cells, y, piece, scale, under) => this.chunk(cells, y, piece, scale, under),
      add: (o) => this.group.add(o),
      spin: (o) => this.spinners.push(o),
    };
  }

  private makeGlow(color: string, size: number) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(size);
    // the low third-person camera can pass right next to a lamp: fade glows up close so they don't fog the screen
    const wp = new THREE.Vector3();
    s.onBeforeRender = (_r, _s, cam) => {
      s.getWorldPosition(wp);
      const d = wp.distanceTo(cam.position);
      s.material.opacity = 0.85 * Math.min(1, Math.max(0, (d - size * 0.6) / (size * 1.2 + 2)));
    };
    return s;
  }

  private setTile(i: number, x: number, dy: number, z: number, scale: number, spin?: THREE.Euler) {
    const v = this.views[i];
    const p = v.plan;
    tmpQ.setFromAxisAngle(UP, p.rot);
    if (spin) tmpQ.premultiply(new THREE.Quaternion().setFromEuler(spin));
    v.mesh.setMatrixAt(v.idx, tmpM.compose(tmpP.set(x, p.y + dy, z), tmpQ, tmpS.set(p.scale[0] * scale, p.scale[1] * scale, p.scale[2] * scale)));
  }

  private setUnder(i: number, x: number, dy: number, z: number, scale: number, q?: THREE.Quaternion) {
    const U = this.theme.under;
    this.under.setMatrixAt(i, tmpM.compose(tmpP.set(x, U.y - (this.theme.id === 'village' ? 1 : 0) + dy, z), q ?? tmpQ.identity(), tmpS.set(U.sx * scale, U.sy * scale, U.sz * scale)));
  }

  /** Floating ground chunk for the backdrop (top tiles + stepped rock below). */
  private chunk(cells: { x: number; z: number }[], y: number, piece: string, scale: number, under: { sx: number; sy: number; sz: number }) {
    const push = (name: string, m: THREE.Matrix4) => {
      let list = this.chunkMats.get(name);
      if (!list) this.chunkMats.set(name, (list = []));
      list.push(m);
    };
    const cx = cells.reduce((a, c) => a + c.x, 0) / cells.length;
    const cz = cells.reduce((a, c) => a + c.z, 0) / cells.length;
    const R = Math.max(1, ...cells.map((c) => Math.hypot(c.x - cx, c.z - cz)));
    const topY = this.theme.id === 'village' ? y : y + this.theme.tiles(this.world)[0].y;
    for (const c of cells) {
      push(piece, new THREE.Matrix4().compose(tmpP.set(c.x, topY, c.z), tmpQ.identity(), tmpS.setScalar(scale)));
      push('__under', new THREE.Matrix4().compose(tmpP.set(c.x, y - (this.theme.id === 'village' ? 1 : 0.4), c.z), tmpQ.identity(), tmpS.set(under.sx, under.sy, under.sz)));
    }
    for (let L = 1; L <= 3; L++)
      for (const c of cells) {
        if (Math.hypot(c.x - cx, c.z - cz) > R * (1 - L * 0.3) + 0.6) continue;
        const s = 1 - L * 0.1;
        push('__under', new THREE.Matrix4().compose(tmpP.set(c.x, y - 0.4 - L * under.sy, c.z), tmpQ.identity(), tmpS.set(under.sx * s, under.sy, under.sz * s)));
      }
  }

  private flushChunks() {
    for (const [name, list] of this.chunkMats) {
      const b = this.bake(name === '__under' ? this.theme.under.piece : name);
      const im = new THREE.InstancedMesh(b.geo, b.mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.receiveShadow = name !== '__under';
      this.group.add(im);
    }
    this.chunkMats.clear();
  }

  private place(name: string, x: number, y: number, z: number, s: number, ry: number) {
    const src = this.env.get(name);
    if (!src) return null;
    const o = src.clone();
    o.position.set(x, y, z);
    o.scale.setScalar(s);
    o.rotation.y = ry;
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) m.castShadow = false;
      if (/windmill_top_fan|lumbermill_saw/.test(m.name)) this.spinners.push(m);
    });
    this.group.add(o);
    return o;
  }

  /** Obstacle visuals — sized to match their collision circles in shared/config/maps.ts. */
  private buildProp(o: { x: number; z: number; r: number; kind: string; rot: number }) {
    const g = new THREE.Group();
    const add = (name: string, s: number, x = 0, z = 0, ry = 0, y = 0) => {
      const src = this.env.get(name);
      if (!src) return null;
      const c = src.clone();
      c.scale.setScalar(s);
      c.position.set(x, y, z);
      c.rotation.y = ry;
      g.add(c);
      return c;
    };
    const glow = (color: string, size: number, x: number, y: number, z: number) => {
      const s = this.makeGlow(color, size);
      s.position.set(x, y, z);
      g.add(s);
    };
    const decal: Decal = (kind, size, x = 0, z = 0, rot = 0) => {
      g.add(makeDecal(kind, size, x, z, rot));
    };
    this.theme.prop(o as never, add, glow, decal);
    g.position.set(o.x, 0, o.z);
    g.rotation.y = o.rot;
    const mats: THREE.MeshStandardMaterial[] = [];
    g.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = o.r > 0;
        mesh.receiveShadow = true;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.transparent = true;
        mesh.material = mat;
        mats.push(mat);
      }
    });
    const box = new THREE.Box3().setFromObject(g);
    // ink outline on solid obstacles: they pop out of the ground and read as "can't walk here"
    const ink: THREE.Material[] = [];
    if (o.r > 0) for (const c of [...g.children]) if (!(c as THREE.Sprite).isSprite) ink.push(...addOutlines(c, 0.03 / Math.max(0.3, c.scale.x)));
    const tile = this.world.arena.tileAt(o.x, o.z);
    this.props.push({ obj: g, tile: tile ? this.world.arena.tiles.indexOf(tile) : -1, base: g.position.clone(), mats, ink, fade: 1, tall: box.max.y > 0.7 });
    this.group.add(g);
  }

  private buildPads() {
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
      const glow = this.makeGlow('#ffd23f', 3.2);
      glow.position.y = 0.4;
      g.add(glow);
      g.position.set(pad.x, 0, pad.z);
      this.pads.push(g);
      this.padMats.push(mat);
      this.group.add(g);
    }
  }

  private buildClouds() {
    const rng = new Rng(11);
    const C = this.theme.clouds;
    const cloudMat = new THREE.MeshStandardMaterial({ color: C.color, emissive: C.emissive, emissiveIntensity: C.intensity, roughness: 1 });
    for (let i = 0; i < 26; i++) {
      const c = this.env.get(i % 3 === 0 ? 'cloud_small' : 'cloud_big')!.clone();
      const a = rng.range(0, Math.PI * 2);
      const below = i < 18;
      const ua = rng.range(-1.2, 1.2);
      const d = below ? rng.range(18, 70) : rng.range(45, 72);
      if (below) c.position.set(Math.sin(a) * d, rng.range(-22, -18), Math.cos(a) * d);
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

  /** Water gushing out of the island's rocky underside (village). */
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
            vec3 c = mix(vec3(0.35,0.75,1.0), vec3(0.95,1.0,1.0), stripe*0.8);
            float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
            gl_FragColor = vec4(c, 0.78 * edge * smoothstep(0.0, 0.5, vUv.y));
          }`,
      });
      this.waterMats.push(mat);
      const R = 12.9;
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 22, 1, 1), mat);
      sheet.position.set(Math.sin(a) * (R + 0.15), -12.5, Math.cos(a) * (R + 0.15));
      sheet.rotation.y = a;
      this.group.add(sheet);
      const foam = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#bfefff', emissiveIntensity: 0.5, roughness: 1 }));
      foam.scale.set(1.3, 0.6, 0.8);
      foam.position.set(Math.sin(a) * (R + 0.2), -1.6, Math.cos(a) * (R + 0.2));
      foam.userData.foam = true;
      this.spinners.push(foam);
      this.group.add(foam);
    }
  }

  /** Iridescent bubbles drifting up around the arena. */
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
    const d = 18 + Math.random() * 18; // outside the play area, never in front of the camera
    s.position.set(Math.sin(a) * d, anyY ? -8 + Math.random() * 18 : -10, Math.cos(a) * d);
    s.scale.setScalar(0.25 + Math.random() * 0.6);
    s.userData.v = 0.6 + Math.random() * 0.8;
    s.userData.ph = Math.random() * 6;
  }

  update(dt: number, time: number) {
    const tiles = this.world.arena.tiles;
    const dirty = new Set<THREE.InstancedMesh>();
    let underDirty = false;
    tiles.forEach((t, i) => {
      const prev = this.lastStates[i];
      const v = this.views[i];
      if (t.state === 1) {
        const k = 1 - Math.max(0, t.fallAt - this.world.roundTime) / TUNING.finale.telegraph;
        const sh = 0.04 + k * 0.08;
        const x = t.x + Math.sin(time * 47 + i) * sh;
        const y = Math.sin(time * 31 + i * 3) * sh * 0.6;
        const z = t.z + Math.cos(time * 53 + i) * sh;
        this.setTile(i, x, y, z, 1);
        this.setUnder(i, x, y, z, 1);
        v.mesh.setColorAt(v.idx, tmpColor.copy(v.color).lerp(WARN, 0.5 + 0.5 * Math.sin(time * (8 + k * 14))));
        dirty.add(v.mesh);
        underDirty = true;
      } else if (t.state === 2 && prev !== 2) {
        this.falls.set(i, { t: 0, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.6) });
      } else if (t.state === 0 && prev !== 0) {
        this.setTile(i, t.x, 0, t.z, 1);
        this.setUnder(i, t.x, 0, t.z, 1);
        v.mesh.setColorAt(v.idx, v.color);
        this.falls.delete(i);
        dirty.add(v.mesh);
        underDirty = true;
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
      this.setTile(i, t.x, y, t.z, gone ? 0 : 1, tmpE);
      this.setUnder(i, t.x, y, t.z, gone ? 0 : 1, new THREE.Quaternion().setFromEuler(tmpE));
      v.mesh.setColorAt(v.idx, v.color);
      dirty.add(v.mesh);
      underDirty = true;
      if (gone) this.falls.delete(i);
    }
    // props ride their tile: shake, fall, come back next round; tall ones fade in front of you
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
      const fc = this.focus;
      const hide = p.tall && !!fc && !!this.blocks && this.blocks(p.base.x, p.base.z, fc.x, fc.z);
      const target = hide ? 0.3 : 1;
      if (Math.abs(p.fade - target) > 0.01) {
        p.fade += (target - p.fade) * Math.min(1, dt * 8);
        for (const m of p.ink) m.visible = p.fade > 0.95;
        for (const m of p.mats) {
          m.opacity = p.fade;
          m.depthWrite = p.fade > 0.95;
        }
      }
    }
    for (const m of dirty) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (underDirty) this.under.instanceMatrix.needsUpdate = true;
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
      if (c.position.y > -9 && Math.hypot(c.position.x, c.position.z) < 40) c.position.x = -75;
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

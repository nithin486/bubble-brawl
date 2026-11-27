import * as THREE from 'three';
import { len as hyp } from '../../../shared/sim/math.ts';

const MAX = 900;

export function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Wave {
  key?: string;
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  from: number;
  to: number;
}

/** GPU point particles + expanding shockwave meshes. One draw call for all particles. */
const SHARED = new Map<string, THREE.BufferGeometry>();
/** One geometry per shape, reused by every effect (flagged so the clean-up never disposes it). */
function shared(key: string, make: () => THREE.BufferGeometry) {
  let g = SHARED.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    SHARED.set(key, g);
  }
  return g;
}
const COLORS = new Map<string, THREE.Color>();
/** Parsed colours are cached: effects fire every few frames and must not allocate. */
function col(c: THREE.ColorRepresentation) {
  if (typeof c !== 'string') return new THREE.Color(c);
  let v = COLORS.get(c);
  if (!v) COLORS.set(c, (v = new THREE.Color(c)));
  return v;
}
const disposeMesh = (mesh: THREE.Mesh) => {
  if (!mesh.geometry.userData.shared) mesh.geometry.dispose();
  // (the material is left to the garbage collector: disposing it would delete its shader and stall the next effect)
};

export class Fx {
  /** Height of the walkable ground at (x, z): raised plazas and ramps lift ground effects with them. Set by the game. */
  ground: (x: number, z: number) => number = () => 0;
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private next = 0;
  private waves: Wave[] = [];
  private scene: THREE.Scene;
  // chunky 3D debris (bone shards, rocks, bomb bits)
  private chunks: THREE.InstancedMesh;
  private ch: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; life: number; s: number }[] = [];
  private timed: { obj: THREE.Object3D; t: number; dur: number; tick: (k: number) => void; key?: string }[] = [];
  /** Finished effect meshes wait here to be reused: no new materials, geometry or GPU buffers in the middle of a fight. */
  private pool = new Map<string, THREE.Object3D[]>();
  private take<T extends THREE.Object3D>(key: string, make: () => T): T {
    const o = this.pool.get(key)?.pop() as T | undefined;
    return o ?? make();
  }
  private recycle(key: string | undefined, obj: THREE.Object3D) {
    this.scene.remove(obj);
    if (!key) {
      obj.traverse((m) => (m as THREE.Mesh).isMesh && disposeMesh(m as THREE.Mesh));
      return;
    }
    let a = this.pool.get(key);
    if (!a) this.pool.set(key, (a = []));
    if (a.length < 24) a.push(obj);
    else obj.traverse((m) => (m as THREE.Mesh).isMesh && disposeMesh(m as THREE.Mesh));
  }
  private M = new THREE.Matrix4();
  private Q = new THREE.Quaternion();
  private S = new THREE.Vector3();
  private crackTex: THREE.Texture | null = null;

  constructor(scene: THREE.Scene, tex: THREE.Texture) {
    this.scene = scene;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: { map: { value: tex }, scale: { value: window.innerHeight / 2 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*scale/-mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA); if (gl_FragColor.a < 0.01) discard; }`,
    });
    const pts = new THREE.Points(this.geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 10;
    scene.add(pts);
    window.addEventListener('resize', () => (mat.uniforms.scale.value = window.innerHeight / 2));
    this.chunks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), 140);
    this.chunks.count = 0;
    this.chunks.castShadow = true;
    this.chunks.frustumCulled = false;
    scene.add(this.chunks);
  }

  /** Chunky debris that bounces on the ground. */
  debris(x: number, y: number, z: number, n: number, colors: string[], speed: number, up: number, size = 1) {
    for (let i = 0; i < n; i++) {
      if (this.ch.length >= 140) this.ch.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.5 + Math.random() * 0.6);
      this.ch.push({
        p: new THREE.Vector3(x, y, z),
        v: new THREE.Vector3(Math.sin(a) * sp, up * (0.6 + Math.random() * 0.6), Math.cos(a) * sp),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        w: new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, 0),
        life: 0.8 + Math.random() * 0.4,
        s: size * (0.6 + Math.random() * 0.9),
      });
      this.chunks.setColorAt(this.ch.length - 1, col(colors[i % colors.length]));
    }
    if (this.chunks.instanceColor) this.chunks.instanceColor.needsUpdate = true;
  }

  private timedObj(obj: THREE.Object3D, dur: number, tick: (k: number) => void, key?: string) {
    tick(0);
    this.scene.add(obj);
    this.timed.push({ obj, t: 0, dur, tick, key });
  }
  private basic(key: string, geo: () => THREE.BufferGeometry, params: THREE.MeshBasicMaterialParameters) {
    const m = this.take(key, () => new THREE.Mesh(geo(), new THREE.MeshBasicMaterial(params)));
    return { m, mat: m.material as THREE.MeshBasicMaterial };
  }

  /** One of every effect, so its shader is built behind the loading screen (they recycle themselves right after). */
  warm() {
    const a = new THREE.Vector3(0, -60, 0), b = new THREE.Vector3(1, -60, 0);
    this.dome(0, 0, '#ffffff', 1, 0.05);
    this.pillar(0, 0, '#ffffff', 1, 0.05);
    this.crack(0, 0, 1);
    this.beam(a, b, '#ffffff', 0.05);
    this.lightning(a, b, '#ffffff', 0.05);
    this.debris(0, -60, 0, 1, ['#ffffff'], 0, 0);
  }

  /** Expanding translucent half-dome shockwave. */
  dome(x: number, z: number, color: string, radius: number, dur = 0.4) {
    const { m, mat } = this.basic('dome', () => shared('dome', () => new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2)), { transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending });
    mat.color.copy(col(color));
    m.position.set(x, this.ground(x, z), z);
    this.timedObj(m, dur, (k) => {
      const e = Math.max(0.001, 1 - (1 - k) ** 3);
      m.scale.set(radius * e, radius * e * 0.7, radius * e);
      mat.opacity = 0.55 * (1 - k);
    }, 'dome');
  }

  /** Vertical light column (jackpot, power pickup). */
  pillar(x: number, z: number, color: string, height = 8, dur = 0.9, width = 0.9) {
    const { m, mat } = this.basic('pillar', () => shared('pillar', () => new THREE.CylinderGeometry(1, 1.3, 1, 24, 1, true)), { transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.color.copy(col(color));
    m.position.set(x, this.ground(x, z) + height / 2, z);
    this.timedObj(m, dur, (k) => {
      m.scale.set(width * (1 - k * 0.7), height, width * (1 - k * 0.7));
      mat.opacity = 0.6 * (1 - k);
    }, 'pillar');
  }

  /** Cracked-ground decal that fades out. */
  crack(x: number, z: number, size: number, rot = Math.random() * 6) {
    if (!this.crackTex) this.crackTex = crackTexture();
    const { m, mat } = this.basic('crack', () => shared('crack', () => new THREE.PlaneGeometry(1, 1)), { map: this.crackTex, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, this.ground(x, z) + 0.05, z);
    m.renderOrder = 1;
    this.timedObj(m, 2.6, (k) => {
      m.scale.setScalar(Math.max(0.001, size * Math.min(1, k * 12)));
      mat.opacity = k < 0.7 ? 0.9 : 0.9 * (1 - (k - 0.7) / 0.3);
    }, 'crack');
  }

  /** Glowing tendril between two points (Sticky Fingers pull). */
  beam(a: THREE.Vector3, b: THREE.Vector3, color: string, dur = 0.35) {
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 0.8;
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    const m = this.tube('beam', curve, 20, 0.09, 6);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.copy(col(color));
    this.timedObj(m, dur, (k) => (mat.opacity = 0.9 * (1 - k)), 'beam');
    for (let i = 0; i <= 8; i++) {
      const p = curve.getPoint(i / 8);
      this.emit(p.x, p.y, p.z, { n: 2, color: [color, '#ffffff'], speed: 1, up: 1, life: 0.4, size: 0.3 });
    }
  }

  emit(x: number, y: number, z: number, opts: { n: number; color: THREE.ColorRepresentation | THREE.ColorRepresentation[]; speed: number; up?: number; life?: number; size?: number; gravity?: number; spread?: number; drag?: number }) {
    const many = Array.isArray(opts.color);
    for (let k = 0; k < opts.n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const sp = opts.speed * (0.4 + Math.random() * 0.6);
      const sprd = opts.spread ?? 0.2;
      this.pos[i * 3] = x + (Math.random() - 0.5) * sprd;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * sprd;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * sprd;
      this.vel[i * 3] = Math.sin(a) * sp;
      this.vel[i * 3 + 1] = (opts.up ?? 0) * (0.5 + Math.random() * 0.7);
      this.vel[i * 3 + 2] = Math.cos(a) * sp;
      const c = many ? col((opts.color as THREE.ColorRepresentation[])[k % (opts.color as THREE.ColorRepresentation[]).length]) : col(opts.color as THREE.ColorRepresentation);
      this.col[i * 3] = c.r;
      this.col[i * 3 + 1] = c.g;
      this.col[i * 3 + 2] = c.b;
      const life = (opts.life ?? 0.6) * (0.7 + Math.random() * 0.5);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.grav[i] = opts.gravity ?? 0;
      this.baseSize[i] = (opts.size ?? 0.3) * (0.7 + Math.random() * 0.6);
      this.drag[i] = opts.drag ?? 2;
    }
  }

  coinBurst(x: number, y: number, z: number, n = 10) {
    this.emit(x, y, z, { n, color: ['#ffe27a', '#ffb400', '#fff6c9'], speed: 4, up: 6, gravity: 16, life: 0.6, size: 0.28 });
  }

  dust(x: number, z: number, big = false) {
    this.emit(x, this.ground(x, z) + 0.15, z, { n: big ? 14 : 3, color: ['#f2e6ff', '#d9c8f0'], speed: big ? 3.5 : 0.9, up: big ? 1.5 : 0.8, life: big ? 0.6 : 0.45, size: big ? 0.9 : 0.55, drag: 4 });
  }

  confetti(x: number, y: number, z: number, n = 120) {
    this.emit(x, y, z, { n, color: ['#ff5fd2', '#ffd84a', '#5ff0ff', '#9dff7a', '#ffffff', '#b38cff'], speed: 7, up: 11, gravity: 7, life: 2.4, size: 0.32, drag: 1.2, spread: 1 });
  }

  sparkle(x: number, y: number, z: number, color: THREE.ColorRepresentation, n = 16) {
    this.emit(x, y, z, { n, color, speed: 2.5, up: 3, life: 0.7, size: 0.35, gravity: 2, spread: 0.6 });
  }

  /** Expanding ring on the ground (Rattle Burst, banking, landing). */
  ring(x: number, z: number, color: THREE.ColorRepresentation, to = 3, dur = 0.45, from = 0.3) {
    const { m: mesh, mat } = this.basic('ring', () => shared('ring', () => new THREE.RingGeometry(0.82, 1, 48)), { transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    mat.color.copy(col(color));
    mat.opacity = 0.95;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, this.ground(x, z) + 0.08, z);
    mesh.scale.setScalar(Math.max(0.001, from));
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.waves.push({ mesh, t: 0, dur, from, to, key: 'ring' });
  }

  /** Forward cone wedge on the ground (Ground Slam). */
  cone(x: number, z: number, facing: number, range: number, deg: number, color: THREE.ColorRepresentation, dur = 0.4, from = 0.5) {
    const half = (deg * Math.PI) / 360;
    // sector centred on +x in the XY plane → lay flat (+x stays +x) → yaw so +x points along `facing`
    const key = `cone${deg}`;
    const holder = this.take(key, () => {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(
        shared(key, () => new THREE.CircleGeometry(1, 24, -half, half * 2)),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2;
      g.add(mesh);
      return g;
    });
    ((holder.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(col(color));
    holder.rotation.y = facing - Math.PI / 2;
    holder.position.set(x, this.ground(x, z) + 0.09, z);
    holder.scale.setScalar(Math.max(0.001, from));
    this.scene.add(holder);
    this.waves.push({ mesh: holder as unknown as THREE.Mesh, t: 0, dur, from, to: range, key });
  }

  /** A jagged lightning bolt between two points (Thunder Hammer). One short-lived tube. */
  lightning(a: THREE.Vector3, b: THREE.Vector3, color: string, dur = 0.28, width = 0.075) {
    const pts: THREE.Vector3[] = [];
    const n = 7;
    const dir = b.clone().sub(a);
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      const j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 0.9 * Math.sin(t * Math.PI);
      p.addScaledVector(side, j).y += i === 0 || i === n ? 0 : (Math.random() - 0.3) * 0.5;
      pts.push(p);
    }
    const m = this.tube('bolt', new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 18, width, 4);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.copy(col(color));
    this.timedObj(m, dur, (k) => (mat.opacity = k < 0.5 ? 1 : 2 * (1 - k)), 'bolt');
  }

  /** A pooled tube: same segment counts every time, so the new shape is copied into the existing GPU buffers. */
  private tube(key: string, curve: THREE.Curve<THREE.Vector3>, seg: number, r: number, radial: number) {
    const fresh = new THREE.TubeGeometry(curve, seg, r, radial);
    const pooled = this.pool.get(key)?.pop() as THREE.Mesh | undefined;
    if (!pooled) {
      const m = new THREE.Mesh(fresh, new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.frustumCulled = false;
      return m;
    }
    const g = pooled.geometry;
    for (const a of ['position', 'normal'] as const) {
      (g.attributes[a].array as Float32Array).set(fresh.attributes[a].array as Float32Array);
      g.attributes[a].needsUpdate = true;
    }
    fresh.dispose(); // never drawn: nothing on the GPU to free
    return pooled;
  }

  update(dt: number) {
    // debris
    const { M, Q, S } = this;
    for (let i = this.ch.length - 1; i >= 0; i--) {
      const c = this.ch[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.ch.splice(i, 1);
        continue;
      }
      c.v.y -= 22 * dt;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.08 && hyp(c.p.x, c.p.z) < 14) {
        c.p.y = 0.08;
        c.v.y = Math.abs(c.v.y) * 0.35;
        c.v.x *= 0.6;
        c.v.z *= 0.6;
        c.w.multiplyScalar(0.6);
      }
      c.r.x += c.w.x * dt;
      c.r.y += c.w.y * dt;
    }
    for (let i = 0; i < this.ch.length; i++) {
      const c = this.ch[i];
      Q.setFromEuler(c.r);
      S.setScalar(c.s * Math.min(1, c.life * 3));
      this.chunks.setMatrixAt(i, M.compose(c.p, Q, S));
    }
    this.chunks.count = this.ch.length;
    this.chunks.instanceMatrix.needsUpdate = true;
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const o = this.timed[i];
      o.t += dt;
      const k = Math.min(1, o.t / o.dur);
      o.tick(k);
      if (k >= 1) {
        this.recycle(o.key, o.obj);
        this.timed.splice(i, 1);
      }
    }

    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, k * 2.5);
      this.size[i] = this.baseSize[i] * (0.5 + 0.5 * k);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt / w.dur;
      const t = Math.min(1, w.t);
      const e = 1 - (1 - t) ** 3;
      w.mesh.scale.setScalar(w.from + (w.to - w.from) * e);
      const wm = (w.mesh.isMesh ? w.mesh : w.mesh.children[0]) as THREE.Mesh;
      (wm.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - t);
      if (t >= 1) {
        this.recycle(w.key, w.mesh);
        this.waves.splice(i, 1);
      }
    }
  }
}

function crackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, 'rgba(60,35,20,0.55)');
  grd.addColorStop(0.6, 'rgba(60,35,20,0.2)');
  grd.addColorStop(1, 'rgba(60,35,20,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(40,20,10,0.9)';
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    let a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
    let x = 128;
    let y = 128;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      a += (Math.random() - 0.5) * 0.7;
      const len = 14 + Math.random() * 10;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      g.lineTo(x, y);
      g.lineWidth = Math.max(1.5, 7 - s * 1.1);
      g.stroke();
      g.beginPath();
      g.moveTo(x, y);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

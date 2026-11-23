import * as THREE from 'three';

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
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  from: number;
  to: number;
}

/** GPU point particles + expanding shockwave meshes. One draw call for all particles. */
export class Fx {
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
  private timed: { obj: THREE.Object3D; t: number; dur: number; tick: (k: number) => void }[] = [];
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
      this.chunks.setColorAt(this.ch.length - 1, new THREE.Color(colors[i % colors.length]));
    }
    if (this.chunks.instanceColor) this.chunks.instanceColor.needsUpdate = true;
  }

  private timedObj(obj: THREE.Object3D, dur: number, tick: (k: number) => void) {
    this.scene.add(obj);
    this.timed.push({ obj, t: 0, dur, tick });
  }

  /** Expanding translucent half-dome shockwave. */
  dome(x: number, z: number, color: string, radius: number, dur = 0.4) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    m.position.set(x, 0, z);
    this.timedObj(m, dur, (k) => {
      const e = 1 - (1 - k) ** 3;
      m.scale.set(radius * e, radius * e * 0.7, radius * e);
      mat.opacity = 0.55 * (1 - k);
    });
  }

  /** Vertical light column (jackpot, power pickup). */
  pillar(x: number, z: number, color: string, height = 8, dur = 0.9, width = 0.9) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(width, width * 1.3, height, 24, 1, true), mat);
    m.position.set(x, height / 2, z);
    this.timedObj(m, dur, (k) => {
      m.scale.set(1 - k * 0.7, 1, 1 - k * 0.7);
      mat.opacity = 0.6 * (1 - k);
    });
  }

  /** Cracked-ground decal that fades out. */
  crack(x: number, z: number, size: number, rot = Math.random() * 6) {
    if (!this.crackTex) this.crackTex = crackTexture();
    const mat = new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, 0.05, z);
    m.renderOrder = 1;
    this.timedObj(m, 2.6, (k) => {
      m.scale.setScalar(Math.min(1, k * 12));
      mat.opacity = k < 0.7 ? 0.9 : 0.9 * (1 - (k - 0.7) / 0.3);
    });
  }

  /** Glowing tendril between two points (Sticky Fingers pull). */
  beam(a: THREE.Vector3, b: THREE.Vector3, color: string, dur = 0.35) {
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 0.8;
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.09, 6), mat);
    this.timedObj(m, dur, (k) => (mat.opacity = 0.9 * (1 - k)));
    for (let i = 0; i <= 8; i++) {
      const p = curve.getPoint(i / 8);
      this.emit(p.x, p.y, p.z, { n: 2, color: [color, '#ffffff'], speed: 1, up: 1, life: 0.4, size: 0.3 });
    }
  }

  emit(x: number, y: number, z: number, opts: { n: number; color: THREE.ColorRepresentation | THREE.ColorRepresentation[]; speed: number; up?: number; life?: number; size?: number; gravity?: number; spread?: number; drag?: number }) {
    const colors = Array.isArray(opts.color) ? opts.color.map((c) => new THREE.Color(c)) : [new THREE.Color(opts.color)];
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
      const c = colors[k % colors.length];
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
    this.emit(x, 0.15, z, { n: big ? 14 : 3, color: ['#f2e6ff', '#d9c8f0'], speed: big ? 3.5 : 0.9, up: big ? 1.5 : 0.8, life: big ? 0.6 : 0.45, size: big ? 0.9 : 0.55, drag: 4 });
  }

  confetti(x: number, y: number, z: number, n = 120) {
    this.emit(x, y, z, { n, color: ['#ff5fd2', '#ffd84a', '#5ff0ff', '#9dff7a', '#ffffff', '#b38cff'], speed: 7, up: 11, gravity: 7, life: 2.4, size: 0.32, drag: 1.2, spread: 1 });
  }

  sparkle(x: number, y: number, z: number, color: THREE.ColorRepresentation, n = 16) {
    this.emit(x, y, z, { n, color, speed: 2.5, up: 3, life: 0.7, size: 0.35, gravity: 2, spread: 0.6 });
  }

  /** Expanding ring on the ground (Rattle Burst, banking, landing). */
  ring(x: number, z: number, color: THREE.ColorRepresentation, to = 3, dur = 0.45, from = 0.3) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.08, z);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.waves.push({ mesh, t: 0, dur, from, to });
  }

  /** Forward cone wedge on the ground (Ground Slam). */
  cone(x: number, z: number, facing: number, range: number, deg: number, color: THREE.ColorRepresentation) {
    const half = (deg * Math.PI) / 360;
    // sector centred on +x in the XY plane → lay flat (+x stays +x) → yaw so +x points along `facing`
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24, -half, half * 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.rotation.y = facing - Math.PI / 2;
    holder.position.set(x, 0.09, z);
    this.scene.add(holder);
    this.waves.push({ mesh: holder as unknown as THREE.Mesh, t: 0, dur: 0.4, from: 0.5, to: range });
  }

  update(dt: number) {
    // debris
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3();
    for (let i = this.ch.length - 1; i >= 0; i--) {
      const c = this.ch[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.ch.splice(i, 1);
        continue;
      }
      c.v.y -= 22 * dt;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.08 && Math.hypot(c.p.x, c.p.z) < 14) {
        c.p.y = 0.08;
        c.v.y = Math.abs(c.v.y) * 0.35;
        c.v.x *= 0.6;
        c.v.z *= 0.6;
        c.w.multiplyScalar(0.6);
      }
      c.r.x += c.w.x * dt;
      c.r.y += c.w.y * dt;
    }
    this.ch.forEach((c, i) => {
      Q.setFromEuler(c.r);
      S.setScalar(c.s * Math.min(1, c.life * 3));
      this.chunks.setMatrixAt(i, M.compose(c.p, Q, S));
    });
    this.chunks.count = this.ch.length;
    this.chunks.instanceMatrix.needsUpdate = true;
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const o = this.timed[i];
      o.t += dt;
      const k = Math.min(1, o.t / o.dur);
      o.tick(k);
      if (k >= 1) {
        this.scene.remove(o.obj);
        o.obj.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
          }
        });
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
      w.mesh.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m) m.opacity = 0.95 * (1 - t);
      });
      if (t >= 1) {
        this.scene.remove(w.mesh);
        w.mesh.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          }
        });
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

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

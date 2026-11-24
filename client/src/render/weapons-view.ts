import * as THREE from 'three';
import { TUNING } from '../../../shared/config/tuning.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { WeaponKind } from '../../../shared/sim/types.ts';
import { loadModel, type Model } from './models.ts';
import { addOutlines } from './style.ts';
import type { Fx } from './fx.ts';

/** Names, colours and icons for the six weapons (HUD, banners, pickups). */
export const WEAPON_INFO: Record<WeaponKind, { name: string; icon: string; color: string; tip: string }> = {
  blaster: { name: 'BUBBLE BLASTER', icon: '🫧', color: '#5fe3ff', tip: 'Rapid shots' },
  rocket: { name: 'ROCKET GLOVE', icon: '🥊', color: '#ff7a3d', tip: 'Big boom, 2 damage' },
  banana: { name: 'BANANA TRAP', icon: '🍌', color: '#ffe14a', tip: 'Drops behind you' },
  freeze: { name: 'FREEZE BOMB', icon: '❄️', color: '#9fe8ff', tip: 'Freezes a crowd' },
  hook: { name: 'MAGNET HOOK', icon: '🧲', color: '#ff5f7a', tip: 'Yank them to you' },
  hammer: { name: 'THUNDER HAMMER', icon: '🔨', color: '#ffd23f', tip: 'Smash around you' },
};

const W = TUNING.weapons;

const iconCache = new Map<string, HTMLCanvasElement>();
/** Hand-drawn weapon icon (thick outline, bright fill) — no emoji fonts needed. */
export function weaponIcon(kind: WeaponKind, size = 128, badge = false): HTMLCanvasElement {
  const key = kind + size + badge;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.scale(size / 100, size / 100);
  const INK = '#1d0d52';
  if (badge) {
    g.fillStyle = WEAPON_INFO[kind].color;
    g.strokeStyle = INK;
    g.lineWidth = 7;
    g.beginPath();
    g.arc(50, 50, 45, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.translate(50, 50);
    g.scale(0.72, 0.72);
    g.translate(-50, -50);
  }
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const shape = (fill: string, draw: () => void, lw = 7) => {
    g.beginPath();
    draw();
    g.fillStyle = fill;
    g.strokeStyle = INK;
    g.lineWidth = lw;
    g.stroke();
    g.fill();
  };
  const circle = (x: number, y: number, r: number) => g.arc(x, y, r, 0, Math.PI * 2);
  switch (kind) {
    case 'blaster':
      shape('#4fd8ff', () => g.roundRect(12, 40, 52, 24, 9));
      shape('#2a8fd6', () => g.roundRect(22, 58, 16, 28, 6));
      shape('#ffd23f', () => g.roundRect(60, 44, 14, 16, 4));
      shape('#c9fbff', () => circle(80, 34, 10), 5);
      shape('#c9fbff', () => circle(70, 16, 6), 4);
      break;
    case 'rocket':
      shape('#ff5a3d', () => {
        g.moveTo(20, 58);
        g.bezierCurveTo(14, 26, 44, 12, 66, 22);
        g.bezierCurveTo(88, 30, 90, 62, 70, 72);
        g.lineTo(34, 74);
        g.closePath();
      });
      shape('#ffffff', () => g.roundRect(14, 66, 30, 20, 6));
      shape('#ffd23f', () => {
        g.moveTo(74, 80);
        g.lineTo(94, 90);
        g.lineTo(80, 72);
      }, 5);
      break;
    case 'banana':
      shape('#ffe14a', () => {
        g.moveTo(18, 30);
        g.bezierCurveTo(14, 70, 48, 92, 84, 76);
        g.bezierCurveTo(56, 74, 34, 58, 30, 26);
        g.closePath();
      });
      shape('#6b4a1f', () => g.roundRect(20, 16, 12, 14, 3), 5);
      break;
    case 'freeze':
      g.strokeStyle = INK;
      for (let i = 0; i < 3; i++) {
        g.save();
        g.translate(50, 50);
        g.rotate((i * Math.PI) / 3);
        g.lineWidth = 15;
        g.strokeStyle = INK;
        g.beginPath();
        g.moveTo(0, -38);
        g.lineTo(0, 38);
        g.stroke();
        g.lineWidth = 7;
        g.strokeStyle = '#bff4ff';
        g.stroke();
        g.restore();
      }
      shape('#7fdcff', () => circle(50, 50, 12), 6);
      break;
    case 'hook':
      g.lineWidth = 26;
      g.strokeStyle = INK;
      g.beginPath();
      g.arc(50, 46, 26, Math.PI, 0, true);
      g.stroke();
      g.lineWidth = 15;
      g.strokeStyle = '#ff4d6d';
      g.stroke();
      shape('#e6e6f0', () => g.roundRect(17, 34, 16, 18, 3), 6);
      shape('#e6e6f0', () => g.roundRect(67, 34, 16, 18, 3), 6);
      break;
    case 'hammer':
      shape('#a8642a', () => g.roundRect(44, 34, 13, 56, 5));
      shape('#ffd23f', () => g.roundRect(18, 12, 64, 30, 8));
      shape('#fff27a', () => {
        g.moveTo(54, 18);
        g.lineTo(44, 28);
        g.lineTo(52, 28);
        g.lineTo(46, 38);
      }, 3);
      break;
  }
  iconCache.set(key, c);
  return c;
}

/** Soap-bubble shader (same family as the Bubble Bank). */
function bubbleMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, warn: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float time;
      void main(){ vec3 p = position; p += normal * (sin(p.y*5.0+time*4.0)*0.03 + sin(p.x*6.0+time*3.0)*0.03);
        vec4 mv = modelViewMatrix*vec4(p,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = p; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float time; uniform float warn;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0);
        vec3 irid = 0.5 + 0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + f*1.4 + vP.y*0.4 + time*0.2));
        vec3 col = mix(vec3(0.6,0.95,1.0), irid, 0.6) + warn*vec3(1.0,0.3,0.3);
        float s = pow(max(0.0, dot(reflect(-vV, vN), normalize(vec3(-0.4,0.8,0.4)))), 30.0);
        gl_FragColor = vec4(col + s, clamp(0.1 + f*0.8 + s, 0.0, 1.0)); }`,
  });
}

interface BoxView {
  root: THREE.Group;
  model: THREE.Object3D;
  beam: THREE.Mesh;
  glow: THREE.Sprite;
  shown: boolean;
  pop: number;
}

/** Draws mystery boxes, shots, banana traps, freeze bombs, KO bubbles and what each hero holds. */
export class WeaponsView {
  group = new THREE.Group();
  private world: World;
  private fx: Fx;
  private boxes = new Map<number, BoxView>();
  private shots = new Map<number, THREE.Mesh>();
  private mines = new Map<number, THREE.Object3D>();
  private throws = new Map<number, { ball: THREE.Mesh; ring: THREE.Mesh }>();
  private bubbles: THREE.Mesh[] = [];
  private held: THREE.Sprite[] = [];
  private bubbleMat = bubbleMaterial();
  private iconTex = new Map<string, THREE.Texture>();
  private glowTex: THREE.Texture;
  private env: Map<string, THREE.Object3D>;
  private beamMat: THREE.ShaderMaterial;
  private bananaReady: Promise<Model> | null = null;
  private shotGeo = new THREE.SphereGeometry(1, 14, 10);
  private shotMats = {
    blaster: new THREE.MeshBasicMaterial({ color: '#8ff4ff', transparent: true, opacity: 0.85, toneMapped: false }),
    rocket: new THREE.MeshBasicMaterial({ color: '#ff8a3d', toneMapped: false }),
  };
  private iceMat = new THREE.MeshBasicMaterial({ color: '#c9f6ff', toneMapped: false });
  private ringMat = new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });

  constructor(world: World, scene: THREE.Scene, fx: Fx, glowTex: THREE.Texture, env: Map<string, THREE.Object3D>) {
    this.env = env;
    // soft golden light column over every chest: you can spot loot from across the map
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix*mv; }',
      // fades out up close: a column next to the camera must never wash the screen out
      fragmentShader: 'varying vec2 vUv; varying float vD; uniform float time; void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.75 + 0.25*sin(vUv.y*18.0 - time*5.0)); a *= smoothstep(5.0, 14.0, vD); gl_FragColor = vec4(1.0, 0.82, 0.35, a * 0.4); }',
    });
    this.world = world;
    this.fx = fx;
    this.glowTex = glowTex;
    scene.add(this.group);
    this.bananaReady = loadModel('assets/models/banana.glb', { fit: 0.75, outline: 0.02 });
    this.setWorld(world);
  }

  setWorld(world: World) {
    this.world = world;
    for (const b of this.boxes.values()) this.group.remove(b.root);
    for (const m of this.shots.values()) this.group.remove(m);
    for (const m of this.mines.values()) this.group.remove(m);
    for (const t of this.throws.values()) this.group.remove(t.ball, t.ring);
    this.boxes.clear();
    this.shots.clear();
    this.mines.clear();
    this.throws.clear();
    for (const b of this.bubbles) this.group.remove(b);
    for (const h of this.held) this.group.remove(h);
    this.bubbles = world.players.map(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), this.bubbleMat);
      m.visible = false;
      m.renderOrder = 6;
      this.group.add(m);
      return m;
    });
    this.held = world.players.map(() => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      s.scale.setScalar(0.62);
      s.visible = false;
      s.renderOrder = 7;
      this.group.add(s);
      return s;
    });
    this.group.visible = world.mode === 'weapons';
  }

  private weaponTex(k: WeaponKind) {
    const key = 'w:' + k;
    let t = this.iconTex.get(key);
    if (!t) {
      t = new THREE.CanvasTexture(weaponIcon(k, 128, true));
      t.colorSpace = THREE.SRGBColorSpace;
      this.iconTex.set(key, t);
    }
    return t;
  }

  private glowSprite(color: string, size: number) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(size);
    return s;
  }

  update(dt: number, time: number) {
    const w = this.world;
    if (w.mode !== 'weapons') return;
    const br = w.brawl;
    this.bubbleMat.uniforms.time.value = time;
    this.beamMat.uniforms.time.value = time;

    // ---- mystery boxes: float, spin, glow; pop back in when they respawn
    const seenBox = new Set<number>();
    for (const b of br.boxes) {
      seenBox.add(b.id);
      let v = this.boxes.get(b.id);
      if (!v) {
        const root = new THREE.Group();
        const glow = this.glowSprite('#ffd84a', 2.8);
        glow.position.y = 0.8;
        // KayKit golden chest: same art family as the heroes
        const model = new THREE.Group();
        const src = this.env.get('chest_gold');
        if (src) {
          const c = src.clone();
          c.scale.setScalar(0.85);
          model.add(c);
          addOutlines(c, 0.03 / 0.85);
        }
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 7, 20, 1, true), this.beamMat);
        beam.position.y = 3.5;
        root.add(glow, model, beam);
        root.position.set(b.x, 0, b.z);
        const view: BoxView = { root, model, beam, glow, shown: true, pop: 1 };
        this.group.add(root);
        this.boxes.set(b.id, (v = view));
      }
      const tile = w.arena.tileAt(b.x, b.z);
      const show = b.respawn <= 0 && !!tile && tile.state !== 2;
      if (show && !v.shown) v.pop = 0;
      v.shown = show;
      v.root.visible = show;
      if (!show) continue;
      v.pop = Math.min(1, v.pop + dt * 3);
      const s = v.pop < 1 ? Math.sin(v.pop * Math.PI * 0.5) * (1 + Math.sin(v.pop * Math.PI) * 0.3) : 1;
      v.root.scale.setScalar(s);
      const bob = Math.sin(time * 2.4 + b.id) * 0.12;
      v.model.position.y = 0.3 + bob;
      v.model.rotation.y = time * 1.2 + b.id;
      v.glow.material.opacity = 0.55 + Math.sin(time * 4 + b.id) * 0.15;
      if (Math.random() < dt * 3) this.fx.sparkle(b.x + (Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.6, b.z + (Math.random() - 0.5) * 0.8, '#ffe27a', 2);
    }
    for (const [id, v] of this.boxes) if (!seenBox.has(id)) (this.group.remove(v.root), this.boxes.delete(id));

    // ---- shots
    const seenShot = new Set<number>();
    for (const s of br.projectiles) {
      seenShot.add(s.id);
      let m = this.shots.get(s.id);
      if (!m) {
        m = new THREE.Mesh(this.shotGeo, this.shotMats[s.kind]);
        m.scale.setScalar(s.kind === 'rocket' ? 0.32 : 0.2);
        this.group.add(m);
        this.shots.set(s.id, m);
      }
      m.position.set(s.x, 1.05, s.z);
      if (s.kind === 'rocket') this.fx.emit(s.x, 1.05, s.z, { n: 2, color: ['#ff8a3d', '#ffd23f', '#aaaaaa'], speed: 1, up: 0.5, life: 0.35, size: 0.5 });
      else if (Math.random() < 0.4) this.fx.emit(s.x, 1.05, s.z, { n: 1, color: '#bff8ff', speed: 0.4, up: 0.2, life: 0.25, size: 0.25 });
    }
    for (const [id, m] of this.shots)
      if (!seenShot.has(id)) {
        this.group.remove(m);
        this.shots.delete(id);
        // blaster shots burst into droplets where they stop
        if (m.material === this.shotMats.blaster) this.fx.emit(m.position.x, 1.05, m.position.z, { n: 8, color: ['#bff8ff', '#ffffff'], speed: 3, up: 1, life: 0.3, size: 0.3 });
      }

    // ---- banana traps
    const seenMine = new Set<number>();
    for (const n of br.mines) {
      seenMine.add(n.id);
      if (this.mines.has(n.id)) continue;
      const g = new THREE.Group();
      g.position.set(n.x, 0.02, n.z);
      g.rotation.y = n.id * 2.3;
      void this.bananaReady?.then((m) => g.add(m.root.clone(true)));
      this.group.add(g);
      this.mines.set(n.id, g);
    }
    for (const [id, g] of this.mines) if (!seenMine.has(id)) (this.group.remove(g), this.mines.delete(id));

    // ---- freeze bombs in the air + where they'll land
    const seenThrow = new Set<number>();
    for (const t of br.throws) {
      seenThrow.add(t.id);
      let v = this.throws.get(t.id);
      if (!v) {
        const ball = new THREE.Mesh(this.shotGeo, this.iceMat);
        ball.scale.setScalar(0.3);
        const ring = new THREE.Mesh(new THREE.RingGeometry(W.freeze.radius - 0.15, W.freeze.radius, 48), this.ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(t.tx, 0.06, t.tz);
        this.group.add(ball, ring);
        this.throws.set(t.id, (v = { ball, ring }));
      }
      const k = Math.min(1, t.t / t.total);
      v.ball.position.set(t.fx + (t.tx - t.fx) * k, 1 + Math.sin(k * Math.PI) * 3, t.fz + (t.tz - t.fz) * k);
      v.ring.scale.setScalar(0.4 + k * 0.6);
    }
    for (const [id, v] of this.throws) if (!seenThrow.has(id)) (this.group.remove(v.ball, v.ring), this.throws.delete(id));

    // ---- KO bubbles + held weapon icons
    w.players.forEach((p, i) => {
      const b = this.bubbles[i];
      const inBubble = p.state === 'bubble';
      b.visible = inBubble;
      if (inBubble) {
        b.position.set(p.x, p.y + 0.95, p.z);
        const wob = 1 + Math.sin(time * 9 + i) * 0.04;
        b.scale.set(1.15 * wob, 1.15 / wob, 1.15 * wob);
      }
      const h = this.held[i];
      h.visible = !!p.weapon && !inBubble && p.state !== 'falling';
      if (h.visible) {
        const tex = this.weaponTex(p.weapon!);
        if (h.material.map !== tex) {
          h.material.map = tex;
          h.material.needsUpdate = true;
        }
        h.position.set(p.x + 0.55, p.y + 2.05, p.z);
      }
    });
  }

  /** Big "POP!" when a bubble is burst. */
  popAt(x: number, y: number, z: number) {
    this.fx.emit(x, y + 1, z, { n: 36, color: ['#bff8ff', '#ffffff', '#ffb3ec', '#b38cff'], speed: 7, up: 3, life: 0.6, size: 0.5 });
    this.fx.ring(x, z, '#bff8ff', 3, 0.4, 0.5);
  }
}

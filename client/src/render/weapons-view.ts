import * as THREE from 'three';
import { TUNING } from '../../../shared/config/tuning.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { WeaponKind } from '../../../shared/sim/types.ts';
import { loadModel, type Model } from './models.ts';
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

function iconTexture(text: string, bg?: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  if (bg) {
    g.fillStyle = bg;
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#1d0d52';
    g.stroke();
  }
  g.font = '900 78px "Lilita One", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#1d0d52';
  if (!bg) g.strokeText(text, 64, 70);
  g.fillStyle = '#ffffff';
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  model: Model | null;
  q: THREE.Sprite;
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
  private boxModel: Promise<Model> | null = null;
  private bananaReady: Promise<Model> | null = null;
  private shotGeo = new THREE.SphereGeometry(1, 14, 10);
  private shotMats = {
    blaster: new THREE.MeshBasicMaterial({ color: '#8ff4ff', transparent: true, opacity: 0.85, toneMapped: false }),
    rocket: new THREE.MeshBasicMaterial({ color: '#ff8a3d', toneMapped: false }),
  };
  private iceMat = new THREE.MeshBasicMaterial({ color: '#c9f6ff', toneMapped: false });
  private ringMat = new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });

  constructor(world: World, scene: THREE.Scene, fx: Fx, glowTex: THREE.Texture) {
    this.world = world;
    this.fx = fx;
    this.glowTex = glowTex;
    scene.add(this.group);
    this.boxModel = loadModel('assets/models/mystery_box.glb', { height: 0.95 });
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

  private icon(text: string, bg?: string) {
    const k = text + (bg ?? '');
    let t = this.iconTex.get(k);
    if (!t) this.iconTex.set(k, (t = iconTexture(text, bg)));
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

    // ---- mystery boxes: float, spin, glow; pop back in when they respawn
    const seenBox = new Set<number>();
    for (const b of br.boxes) {
      seenBox.add(b.id);
      let v = this.boxes.get(b.id);
      if (!v) {
        const root = new THREE.Group();
        const glow = this.glowSprite('#ffd84a', 2.6);
        glow.position.y = 0.7;
        const q = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.icon('?'), transparent: true, depthWrite: false, toneMapped: false }));
        q.scale.setScalar(0.7);
        q.position.y = 1.85;
        root.add(glow, q);
        root.position.set(b.x, 0, b.z);
        const view: BoxView = { root, model: null, q, glow, shown: true, pop: 1 };
        void this.boxModel?.then((m) => {
          const inst = m.root.clone(true);
          inst.position.y = 0.35;
          view.model = { ...m, root: inst };
          root.add(inst);
        });
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
      if (v.model) {
        v.model.root.position.y = 0.35 + bob;
        v.model.root.rotation.y = time * 1.4 + b.id;
      }
      v.q.position.y = 1.85 + bob * 1.4;
      v.glow.material.opacity = 0.55 + Math.sin(time * 4 + b.id) * 0.15;
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
        const info = WEAPON_INFO[p.weapon!];
        const tex = this.icon(info.icon, info.color);
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

import { release } from './dispose.ts';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TUNING } from '../../../shared/config/tuning.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { WeaponKind } from '../../../shared/sim/types.ts';
import { loadModel, type Model } from './models.ts';
import type { Fx } from './fx.ts';

/** Names, colours and icons for the six weapons (HUD, banners, pickups). */
export const WEAPON_INFO: Record<WeaponKind, { name: string; icon: string; color: string; tip: string }> = {
  blaster: { name: 'BUBBLE LASER', icon: '🫧', color: '#5fe3ff', tip: 'Hold fire for a rapid beam' },
  rocket: { name: 'ROCKET LAUNCHER', icon: '🚀', color: '#ff7a3d', tip: 'Big boom, 2 damage' },
  banana: { name: 'BANANA TRAP', icon: '🍌', color: '#ffe14a', tip: 'Drop it behind you: chasers slip' },
  freeze: { name: 'FREEZE BOMB', icon: '❄️', color: '#9fe8ff', tip: 'Throw it: freezes everyone it hits' },
  hook: { name: 'GRAPPLE HOOK', icon: '🪝', color: '#ff5f7a', tip: 'Hook a rival and yank them to you' },
  hammer: { name: 'THUNDER HAMMER', icon: '🔨', color: '#ffd23f', tip: 'Smash the ground around you' },
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
      // grappling hook: rope coming in from the top, a shank and two curved prongs
      g.lineCap = 'round';
      g.lineWidth = 12;
      g.strokeStyle = INK;
      g.beginPath();
      g.moveTo(50, 8);
      g.lineTo(50, 60);
      g.stroke();
      g.lineWidth = 6;
      g.strokeStyle = '#d9a066';
      g.stroke();
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(50, 62);
        g.quadraticCurveTo(50 + sx * 34, 70, 50 + sx * 30, 40);
        g.lineWidth = 16;
        g.strokeStyle = INK;
        g.stroke();
        g.lineWidth = 9;
        g.strokeStyle = '#e6e6f0';
        g.stroke();
      }
      shape('#ff4d6d', () => circle(50, 64, 10), 6);
      break;
    case 'hammer':
      shape('#a8642a', () => g.roundRect(44, 34, 12, 60, 5)); // handle
      shape('#ffd23f', () => g.roundRect(16, 12, 68, 30, 9)); // hammer head
      shape('#fff27a', () => g.roundRect(22, 16, 56, 6, 3), 3);
      // lightning bolt
      shape('#5fe3ff', () => {
        g.moveTo(54, 18);
        g.lineTo(44, 30);
        g.lineTo(52, 30);
        g.lineTo(46, 40);
        g.lineTo(60, 26);
        g.lineTo(52, 26);
        g.closePath();
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
  q: THREE.Sprite;
  ring: THREE.Group;
  ringMat: THREE.MeshBasicMaterial;
  fill: THREE.Mesh;
  orbit: THREE.Sprite[];
  shown: boolean;
  pop: number;
}

/** A glossy purple "?" badge (drawn, no fonts needed): tells players what the box is at a glance. */
function questionTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(46, 40, 6, 64, 64, 60);
  grad.addColorStop(0, '#b48cff');
  grad.addColorStop(1, '#5a2fe0');
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.font = '900 84px "Lilita One", "Nunito", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#2a1580';
  g.strokeText('?', 64, 70);
  g.fillStyle = '#ffe14a';
  g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tint a bomb model frosty blue (the Freeze Bomb). */
export function icy(o: THREE.Object3D) {
  o.traverse((x) => {
    const mesh = x as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = (mesh.material as THREE.MeshStandardMaterial).clone();
    m.color.multiply(new THREE.Color('#9fe6ff')).lerp(new THREE.Color('#bff4ff'), 0.35);
    m.emissive = new THREE.Color('#3fb8ff');
    m.emissiveIntensity = 0.35;
    mesh.material = m;
  });
}

/** Iridescent soap-bubble film: clear in the middle, rainbow thin-film rim, a hot specular glint. */
function soapBubbleMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        vW = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
      vec3 film(float t){ return 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t)); }
      void main(){
        float f = 1.0 - max(dot(vN, vV), 0.0);
        float rim = pow(f, 2.2);
        vec3 col = film(f * 1.6 + vW.y * 0.6) * 0.85 + vec3(0.25, 0.55, 0.65);
        // key light glint (upper left) + small secondary
        vec3 L = normalize(vec3(-0.5, 0.7, 0.6));
        float spec = pow(max(dot(reflect(-L, vN), vV), 0.0), 60.0);
        float spec2 = pow(max(dot(reflect(-normalize(vec3(0.6, -0.3, 0.7)), vN), vV), 0.0), 30.0) * 0.4;
        float a = 0.12 + rim * 0.85 + spec + spec2;
        gl_FragColor = vec4(col * (0.75 + rim * 0.9) + vec3(spec * 2.2 + spec2), clamp(a, 0.0, 1.0));
      }`,
  });
}

/** Draws mystery boxes, shots, banana traps, freeze bombs, KO bubbles and what each hero holds. */
export class WeaponsView {
  group = new THREE.Group();
  /** The seat you play (set by the game each match). */
  localId = 0;
  private world: World;
  private fx: Fx;
  private boxes = new Map<number, BoxView>();
  private shots = new Map<number, THREE.Mesh>();
  private mines = new Map<number, { g: THREE.Group; lamp: { mat: THREE.MeshStandardMaterial | null }; armed: boolean; born: number }>();
  private throws = new Map<number, { ball: THREE.Object3D; ring: THREE.Mesh }>();
  private bubbles: THREE.Mesh[] = [];
  private held: THREE.Sprite[] = [];
  private bubbleMat = bubbleMaterial();
  private iconTex = new Map<string, THREE.Texture>();
  private glowTex: THREE.Texture;
  private env: Map<string, THREE.Object3D>;
  private beamMat: THREE.ShaderMaterial;
  private bananaReady: Promise<Model> | null = null;
  private qTex = questionTexture();
  private ringGeo: THREE.BufferGeometry | null = null;
  /** Camera position (set by the game): boxes right in front of the lens hide so they never block the view. */
  camPos: THREE.Vector3 | null = null;
  private pops: { s: THREE.Sprite; t: number; x: number; z: number }[] = [];
  private shotGeo = new THREE.SphereGeometry(1, 20, 14);
  private shotMats = {
    blaster: soapBubbleMaterial(),
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
      fragmentShader: 'varying vec2 vUv; varying float vD; uniform float time; void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.75 + 0.25*sin(vUv.y*18.0 - time*5.0)); a *= smoothstep(5.0, 14.0, vD); gl_FragColor = vec4(1.0, 0.82, 0.35, a * 0.22); }',
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
    for (const b of this.boxes.values()) release(b.root);
    for (const m of this.shots.values()) release(m);
    for (const m of this.mines.values()) release(m.g);
    for (const t of this.throws.values()) {
      release(t.ball);
      release(t.ring);
    }
    this.boxes.clear();
    this.shots.clear();
    this.mines.clear();
    this.throws.clear();
    for (const b of this.bubbles) release(b);
    for (const h of this.held) release(h);
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

  // ---- Bubble Laser beams: a white core in a cyan glow, gone in a blink (pooled, nothing allocated per shot)
  private beams: { g: THREE.Group; core: THREE.MeshBasicMaterial; halo: THREE.MeshBasicMaterial; t: number }[] = [];
  private beamNext = 0;
  private static beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);

  laser(from: THREE.Vector3, to: THREE.Vector3, hit: boolean) {
    if (this.beams.length < 14) {
      const mk = (color: string, r: number) => {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
        const mesh = new THREE.Mesh(WeaponsView.beamGeo, mat);
        mesh.scale.set(r, r, 1);
        mesh.renderOrder = 8;
        mesh.frustumCulled = false;
        return mesh;
      };
      const core = mk('#eaffff', 0.045);
      const halo = mk('#2fd8ff', 0.15);
      const g = new THREE.Group();
      g.add(core, halo);
      this.group.add(g);
      this.beams.push({ g, core: core.material, halo: halo.material, t: 0 });
      this.beamNext = this.beams.length - 1;
    } else this.beamNext = (this.beamNext + 1) % this.beams.length;
    const b = this.beams[this.beamNext];
    b.g.position.copy(from);
    b.g.lookAt(to);
    b.g.scale.set(1, 1, from.distanceTo(to));
    b.g.visible = true;
    b.t = 0.13;
    // muzzle flash, bubbles shed along the beam, and a pop where it lands
    this.fx.emit(from.x, from.y, from.z, { n: 3, color: ['#ffffff', '#8ff0ff'], speed: 1.4, up: 0.4, life: 0.14, size: 0.34 });
    for (let k = 1; k <= 3; k++) {
      const u = (k - Math.random()) / 3.2;
      this.fx.emit(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u, from.z + (to.z - from.z) * u, { n: 1, color: ['#bff8ff', '#ffc6f0'], speed: 0.5, up: 0.5, life: 0.3, size: 0.22 });
    }
    this.fx.emit(to.x, to.y, to.z, { n: hit ? 12 : 5, color: hit ? ['#ffffff', '#ff7ac8', '#8ff0ff'] : ['#bff8ff', '#ffffff'], speed: hit ? 4 : 2.4, up: 1.2, life: 0.28, size: hit ? 0.34 : 0.22 });
  }

  private tickBeams(dt: number) {
    for (const b of this.beams) {
      if (!b.g.visible) continue;
      b.t -= dt;
      const k = Math.max(0, b.t / 0.13);
      b.core.opacity = k;
      b.halo.opacity = k * 0.6;
      if (b.t <= 0) b.g.visible = false;
    }
  }

  /** A box was opened: its weapon icon pops up out of it (called by the game on 'boxPick'). */
  pickup(x: number, z: number, k: WeaponKind) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.weaponTex(k), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    sp.position.set(x, 0.9, z);
    sp.renderOrder = 9;
    this.group.add(sp);
    this.pops.push({ s: sp, t: 0, x, z });
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
    this.tickBeams(dt);
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
        const glow = this.glowSprite('#a98cff', 2.1); // small warm halo only: a big one bleaches the chest on a bright map
        glow.material.blending = THREE.NormalBlending;
        glow.position.y = 0.7;
        // Mystery box (Subway Surfers style): glossy purple-blue cube with gold question marks, floating and spinning
        const model = new THREE.Group();
        const src = this.env.get('mystery_cube') ?? this.env.get('chest_gold');
        if (src) {
          const c = src.clone();
          const isCube = this.env.has('mystery_cube');
          c.scale.setScalar(isCube ? 0.95 : 0.85);
          if (isCube) {
            c.position.y = -0.05;
            c.traverse((m) => {
              const mesh = m as THREE.Mesh;
              if (!mesh.isMesh) return;
              mesh.castShadow = true;
              const base = mesh.material as THREE.MeshStandardMaterial;
              const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05, envMapIntensity: 1.2, flatShading: true }); // light mesh (no normals): flat facets
              // the model's gold body becomes the purple box; its white question marks become glowing gold
              const isBody = base.color.b < 0.5;
              if (isBody) {
                mat.color.set('#5b3bff');
                mat.emissive.set('#2a12a8');
                mat.emissiveIntensity = 0.35;
              } else {
                mat.color.set('#ffd23f');
                mat.emissive.set('#ffb000');
                mat.emissiveIntensity = 0.9;
                mat.metalness = 0.4;
                mat.roughness = 0.22;
              }
              mesh.material = mat;
            });
          }
          model.add(c);
        }
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 5.5, 20, 1, true), this.beamMat);
        beam.position.y = 2.75;
        // floating "?" badge
        const q = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.qTex, transparent: true, depthWrite: false, toneMapped: false }));
        q.scale.setScalar(0.95);
        q.position.y = 2.0;
        q.renderOrder = 7;
        // pickup zone on the floor: dashed gold ring + soft fill (this is where you must stand)
        const ring = new THREE.Group();
        const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
        {
          // the dashed ring as ONE mesh (10 separate arcs were 10 draw calls per box)
          this.ringGeo ??= mergeGeometries(
            Array.from({ length: 10 }, (_, i) => new THREE.RingGeometry(0.98, 1.1, 8, 1, (i / 10) * Math.PI * 2, (Math.PI * 2) / 10 - 0.28).rotateX(-Math.PI / 2)),
          );
          ring.add(new THREE.Mesh(this.ringGeo, ringMat));
        }
        ring.position.y = 0.07;
        const fill = new THREE.Mesh(new THREE.CircleGeometry(0.98, 32), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
        fill.rotation.x = -Math.PI / 2;
        fill.position.y = 0.06;
        const orbit: THREE.Sprite[] = []; // (orbiting stars dropped: 3 extra draw calls per box)
        void fill;
        root.add(glow, model, beam, q, ring);
        root.position.set(b.x, 0, b.z);
        const view: BoxView = { root, model, beam, glow, q, ring, ringMat, fill, orbit, shown: true, pop: 1 };
        this.group.add(root);
        this.boxes.set(b.id, (v = view));
      }
      const tile = w.arena.tileAt(b.x, b.z);
      const show = b.respawn <= 0 && !!tile && tile.state !== 2;
      if (show && !v.shown) {
        v.pop = 0;
        this.fx.ring(b.x, b.z, '#ffd84a', 1.9, 0.45, 0.45); // it lands with a ripple
      }
      v.shown = show;
      const nearCam = !!this.camPos && (this.camPos.x - b.x) ** 2 + (this.camPos.z - b.z) ** 2 < 3.2 * 3.2;
      v.root.visible = show && !nearCam;
      if (!show || nearCam) continue;
      v.pop = Math.min(1, v.pop + dt * 2.6);
      // drops in from above with a little overshoot
      const e = v.pop < 1 ? 1 - Math.pow(1 - v.pop, 3) : 1;
      const s = v.pop < 1 ? e * (1 + Math.sin(v.pop * Math.PI) * 0.25) : 1;
      v.root.scale.setScalar(s);
      const ph = time * 2.2 + b.id * 1.7;
      v.model.position.y = 0.42 + Math.sin(ph) * 0.14 + (1 - e) * 2.2;
      v.model.rotation.y = time * 0.9 + b.id;
      v.model.rotation.z = Math.sin(ph * 0.8) * 0.07;
      v.model.scale.set(1 + Math.sin(ph * 2) * 0.025, 1 - Math.sin(ph * 2) * 0.025, 1 + Math.sin(ph * 2) * 0.025);
      v.glow.position.y = v.model.position.y + 0.3;
      v.glow.material.opacity = 0.3 + Math.sin(time * 3 + b.id) * 0.08;
      v.q.position.y = 1.95 + Math.sin(ph + 1) * 0.12;
      v.q.scale.setScalar(0.9 + Math.sin(time * 3 + b.id) * 0.05);
      v.ring.rotation.y = time * 0.5;
      v.ringMat.opacity = 0.55 + Math.sin(time * 3 + b.id) * 0.18;
      v.orbit.forEach((o, i) => {
        const a2 = time * 1.8 + (i / 3) * Math.PI * 2 + b.id;
        o.position.set(Math.cos(a2) * 0.85, 0.9 + Math.sin(a2 * 1.5) * 0.35, Math.sin(a2) * 0.85);
        o.material.opacity = 0.6 + Math.sin(a2 * 2) * 0.35;
      });
    }
    for (const [id, v] of this.boxes) if (!seenBox.has(id)) (this.group.remove(v.root), this.boxes.delete(id));

    // ---- weapon icons rising out of an opened box
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const u = p.t / 1.1;
      if (u >= 1) {
        this.group.remove(p.s);
        p.s.material.dispose();
        this.pops.splice(i, 1);
        continue;
      }
      const k = Math.min(1, u * 2.5);
      const back = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); // easeOutBack: overshoots, then settles
      p.s.position.set(p.x, 0.9 + (1 - Math.pow(1 - u, 2)) * 1.9, p.z);
      p.s.scale.setScalar(1.25 * back);
      p.s.material.opacity = u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35;
    }

    // ---- shots
    const seenShot = new Set<number>();
    const terrain = w.terrain;
    for (const s of br.projectiles) {
      seenShot.add(s.id);
      const gy = terrain.heightAt(s.x, s.z) + 1.05; // shots fly at chest height over plazas and ramps too
      let m = this.shots.get(s.id);
      if (!m) {
        if (s.kind === 'rocket' && this.env.has('weap_missile')) {
          // the Blender missile (same one the launcher is loaded with), flying nose-first
          const holder = new THREE.Group();
          const model = this.env.get('weap_missile')!.clone(true);
          model.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = false) : 0));
          holder.add(model);
          holder.scale.setScalar(1.15);
          holder.rotation.y = Math.atan2(-s.vz, s.vx);
          m = holder as unknown as THREE.Mesh;
        } else {
          m = new THREE.Mesh(this.shotGeo, this.shotMats[s.kind]);
          m.scale.setScalar(s.kind === 'rocket' ? 0.32 : 0.34);
        }
        m.userData.born = performance.now();
        this.group.add(m);
        this.shots.set(s.id, m);
      }
      m.position.set(s.x, gy, s.z);
      if (s.kind !== 'rocket') {
        // wobbly soap film: squash and stretch a little as it flies, grows in from the muzzle
        const t = (performance.now() - m.userData.born) / 1000;
        const k = 0.34 * Math.min(1, 0.45 + t * 6);
        m.scale.set(k * (1 + Math.sin(t * 19) * 0.07), k * (1 - Math.sin(t * 19) * 0.06), k * (1 + Math.cos(t * 23) * 0.06));
      }
      if (s.kind === 'rocket') {
        const back = 0.35 / (Math.hypot(s.vx, s.vz) || 1);
        this.fx.emit(s.x - s.vx * back, gy, s.z - s.vz * back, { n: 2, color: ['#ff8a3d', '#ffd23f', '#aaaaaa'], speed: 1, up: 0.5, life: 0.35, size: 0.5 });
      } else if (Math.random() < 0.4) this.fx.emit(s.x, gy, s.z, { n: 1, color: '#bff8ff', speed: 0.4, up: 0.2, life: 0.25, size: 0.25 });
    }
    for (const [id, m] of this.shots)
      if (!seenShot.has(id)) {
        this.group.remove(m);
        this.shots.delete(id);
        // blaster shots burst into droplets where they stop
        if (m.material === this.shotMats.blaster) {
          this.fx.emit(m.position.x, m.position.y, m.position.z, { n: 12, color: ['#bff8ff', '#ffffff', '#ffe0fb', '#d8fff0'], speed: 3.6, up: 1.2, life: 0.38, size: 0.28 });
          this.fx.ring(m.position.x, m.position.z, '#dffbff', 0.9, 0.22, 0.35);
        }
      }

    // ---- banana traps
    const seenMine = new Set<number>();
    for (const n of br.mines) {
      seenMine.add(n.id);
      let v = this.mines.get(n.id);
      if (!v) {
        const g = new THREE.Group();
        g.position.set(n.x, terrain.heightAt(n.x, n.z) + 0.02, n.z);
        g.rotation.y = n.id * 2.3;
        const lamp: { mat: THREE.MeshStandardMaterial | null } = { mat: null };
        void this.bananaReady?.then((m) => {
          const root = m.root.clone(true);
          root.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && (mesh.material as THREE.Material).name === 'bn_green') {
              lamp.mat = (mesh.material as THREE.MeshStandardMaterial).clone();
              mesh.material = lamp.mat;
            }
          });
          g.add(root);
        });
        this.group.add(g);
        this.mines.set(n.id, (v = { g, lamp, armed: false, born: performance.now() }));
      }
      // drop-in bounce, then the lamp: red and blinking while it arms, steady green when armed (and a pop ring)
      const age = (performance.now() - v.born) / 1000;
      v.g.position.y = terrain.heightAt(n.x, n.z) + 0.02 + Math.max(0, Math.sin(Math.min(1, age * 3.2) * Math.PI)) * 0.35;
      v.g.scale.setScalar(Math.min(1, 0.4 + age * 4));
      const armed = n.arm <= 0;
      if (armed && !v.armed) {
        v.armed = true;
        this.fx.ring(n.x, n.z, '#7dff8a', 1.3, 0.35, 0.3);
        this.fx.emit(n.x, terrain.heightAt(n.x, n.z) + 0.4, n.z, { n: 6, color: ['#7dff8a', '#ffffff'], speed: 1.6, up: 1.5, life: 0.35, size: 0.28 });
      }
      if (v.lamp.mat) {
        const m = v.lamp.mat;
        if (!armed) {
          const on = Math.sin(age * 22) > 0;
          m.color.set(on ? '#ff3a3a' : '#661010');
          m.emissive.set('#ff2020');
          m.emissiveIntensity = on ? 2.6 : 0.1;
        } else {
          m.color.set('#6dff7a');
          m.emissive.set('#2bff55');
          m.emissiveIntensity = 1.4 + Math.sin(age * 5) * 0.5;
        }
      }
    }
    for (const [id, v] of this.mines) if (!seenMine.has(id)) (this.group.remove(v.g), this.mines.delete(id));

    // ---- freeze bombs in the air + where they'll land
    const seenThrow = new Set<number>();
    for (const t of br.throws) {
      seenThrow.add(t.id);
      let v = this.throws.get(t.id);
      if (!v) {
        // the same bomb he was holding (spins through the air); a plain ice ball only if the model is missing
        const bomb = this.env.get('weap_icebomb') ?? this.env.get('weap_bomb');
        let ball: THREE.Object3D;
        if (bomb) {
          ball = new THREE.Group();
          const m = bomb.clone(true);
          m.position.set(0, -0.25, 0); // pivot at its base: centre it
          ball.add(m);
          ball.scale.setScalar(1.2);
        } else {
          ball = new THREE.Mesh(this.shotGeo, this.iceMat);
          ball.scale.setScalar(0.3);
        }
        const ring = new THREE.Mesh(new THREE.RingGeometry(W.freeze.radius - 0.15, W.freeze.radius, 48), this.ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(t.tx, w.terrain.heightAt(t.tx, t.tz) + 0.06, t.tz);
        this.group.add(ball, ring);
        this.throws.set(t.id, (v = { ball, ring }));
      }
      const k = Math.min(1, t.t / t.total);
      v.ball.position.set(t.fx + (t.tx - t.fx) * k, 1 + w.terrain.heightAt(t.fx + (t.tx - t.fx) * k, t.fz + (t.tz - t.fz) * k) + Math.sin(k * Math.PI) * 3, t.fz + (t.tz - t.fz) * k);
      v.ball.rotation.set(k * 14, k * 6, 0);
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
      // rivals show what they carry; yours is on the rack, so nothing floats in front of your aim
      h.visible = i !== this.localId && !!p.weapon && !inBubble && p.state !== 'falling';
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

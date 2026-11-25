import { release } from './dispose.ts';
import * as THREE from 'three';
import { addOutlines } from './style.ts';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Assets } from './assets.ts';
import type { HeroId } from '../../../shared/config/heroes.ts';

/**
 * A small 3D overlay scene drawn on top of the game: heroes on glossy podiums.
 * Used by the landing page (one hero) and the results screen (top 3).
 */
export interface Slot {
  hero: HeroId;
  anim: string;
  locked?: boolean;
  color?: string;
  height?: number; // podium height
}

interface SlotView {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  baseY: number;
}

export class Showcase {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  private views: SlotView[] = [];
  private assets: Assets;
  private t = 0;
  private spin = 0;
  /** Horizontal screen position of the group centre, -1..1 (0 = middle). */
  screenX = 0;
  screenY = 0;
  drag = 0;
  /** Orbit elevation (radians): drag up/down to look at the hero from below the waist up to straight overhead. */
  pitch = 0.13;
  pitchTarget = 0.13;

  /** Set once the player drags the hero. */
  touched = false;

  /** Drag on the hero stage: sideways spins, vertical orbits up to an overhead view. */
  orbit(dx: number, dy: number) {
    this.touched = true;
    this.drag = dx * 0.012;
    this.pitchTarget = Math.min(1.5, Math.max(-0.15, this.pitchTarget + dy * 0.008));
  }

  constructor(assets: Assets) {
    this.assets = assets;
    this.scene.add(new THREE.HemisphereLight('#f2eeff', '#6a4fc0', 1.6));
    const key = new THREE.DirectionalLight('#fff2dc', 2.6);
    key.position.set(2, 5, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#7fe3ff', 1.6);
    rim.position.set(-3, 3, -4);
    this.scene.add(rim);
  }

  set(slots: Slot[]) {
    for (const v of this.views) {
      v.mixer.stopAllAction();
      release(v.root);
    }
    this.views = [];
    const n = slots.length;
    slots.forEach((s, i) => {
      const a = this.assets.heroes.get(s.hero)!;
      const root = new THREE.Group();
      const h = s.height ?? 0.5;
      root.add(podium(h, s.color ?? '#7fe3ff'));
      const model = skeletonClone(a.scene);
      model.scale.setScalar(a.scale);
      model.position.y = h;
      if (s.locked) {
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: '#2b1a6b', emissive: '#4a2fd0', emissiveIntensity: 0.35, roughness: 0.6 });
        });
      } else {
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.material = (m.material as THREE.Material).clone();
        });
      }
      addOutlines(model, 0.02 / a.scale);
      root.add(model);
      const mixer = new THREE.AnimationMixer(model);
      const clip = a.clips.get(s.anim) ?? a.clips.get('Idle');
      if (clip) {
        const act = mixer.clipAction(clip);
        act.play();
        act.time = Math.random() * clip.duration;
      }
      // spread: centre slot first, then left/right (podium order 2-1-3 handled by caller)
      root.position.x = (i - (n - 1) / 2) * 1.95;
      this.scene.add(root);
      this.views.push({ root, model, mixer, baseY: h });
    });
    this.spin = 0;
  }

  get active() {
    return this.views.length > 0;
  }

  clear() {
    this.set([]);
  }

  update(dt: number) {
    this.t += dt;
    for (const v of this.views) v.mixer.update(dt);
    this.spin += this.drag;
    this.drag *= 0.9;
    this.pitch += (this.pitchTarget - this.pitch) * Math.min(1, dt * 10);
    const single = this.views.length === 1;
    for (const v of this.views) {
      // idle sway only until the player starts turning the hero by hand
      v.model.rotation.y = (single && !this.touched ? 0.35 + Math.sin(this.t * 0.6) * 0.25 : 0.2) + this.spin;
    }
  }

  /** Screen (px) position just under each podium — for HTML labels. Valid after render(). */
  labelPoints() {
    const v = new THREE.Vector3();
    return this.views.map((s) => {
      v.set(s.root.position.x, -0.05, 0.95).project(this.camera);
      return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
    });
  }

  render(renderer: THREE.WebGLRenderer) {
    if (!this.views.length) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const single = this.views.length === 1;
    this.camera.aspect = w / h;
    // frame by height so the hero keeps the same size on any screen
    this.camera.fov = single ? 26 : 30;
    const dist = single ? 11 : 14;
    // orbit around the hero's chest: any side (drag sideways) and any height up to a top view (drag up/down)
    const p = single ? this.pitch : 0.13;
    this.camera.position.set(0, 1.2 + Math.sin(p) * dist, Math.cos(p) * dist);
    this.camera.lookAt(0, 1.2, 0);
    // shift the picture so the group sits at screenX/screenY
    this.camera.setViewOffset(w, h, (-this.screenX * w) / 2, (this.screenY * h) / 2, w, h);
    this.camera.updateProjectionMatrix();
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}

function podium(h: number, color: string) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.92, h, 40),
    new THREE.MeshStandardMaterial({ color: '#5b3cf0', roughness: 0.35, metalness: 0.1 }),
  );
  body.position.y = h / 2;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.82, 0.08, 40), new THREE.MeshStandardMaterial({ color: '#8f7bff', roughness: 0.3 }));
  top.position.y = h + 0.04;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.84, 0.045, 10, 48),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = h + 0.05;
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.35, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.01;
  g.add(body, top, ring, glow);
  return g;
}

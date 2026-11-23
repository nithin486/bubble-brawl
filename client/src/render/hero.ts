import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HeroAsset } from './assets.ts';
import type { Player } from '../../../shared/sim/types.ts';
import { HEROES } from '../../../shared/config/heroes.ts';
import { TUNING } from '../../../shared/config/tuning.ts';
import { angleDiff } from '../../../shared/sim/math.ts';

const LOOPS = new Set(['Idle', 'Running_A', 'Walking_A', 'Jump_Idle', 'Interact', 'Cheer']);

export class HeroView {
  root = new THREE.Group();
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  private oneShotUntil = 0;
  private mats: THREE.MeshStandardMaterial[] = [];
  private flashT = 0;
  private squash = 0;
  private yaw = 0;
  private ring: THREE.Mesh;
  private glow: THREE.Sprite;
  private sticky: THREE.Sprite;
  private stars: THREE.Group;
  private shadowBlob: THREE.Mesh;
  private dustT = 0;
  private jumpT = 0;
  private jumpDur = 0;
  private jumpH = 0;
  private tumble = 0;
  readonly player: Player;
  readonly isLocal: boolean;
  celebrating = false;
  /** Strong carry glow only for you and the crown-holder; others get a soft one. */
  loudGlow = true;
  /** 1 = solid; lower when this hero stands in front of you in a crowd. */
  private fade = 1;
  fadeTarget = 1;
  private baseScale: number;

  constructor(asset: HeroAsset, player: Player, isLocal: boolean, color: string, glowTex: THREE.Texture) {
    this.player = player;
    this.isLocal = isLocal;
    this.model = skeletonClone(asset.scene);
    this.baseScale = asset.scale;
    this.model.scale.setScalar(asset.scale);
    // own materials so hit flashes don't affect other copies of the same hero
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        m.material = mat;
        this.mats.push(mat);
      }
    });
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [name, clip] of asset.clips) {
      const a = this.mixer.clipAction(clip);
      if (!LOOPS.has(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(name, a);
    }

    // ground ring in the player's colour (local player gets a thicker, brighter ring)
    const ringGeo = new THREE.RingGeometry(isLocal ? 0.62 : 0.66, 0.8, 40);
    this.ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isLocal ? 0.95 : 0.7, depthWrite: false, toneMapped: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.renderOrder = 2;
    this.root.add(this.ring);
    if (isLocal) {
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.32, 3),
        new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      );
      arrow.rotation.x = Math.PI / 2;
      arrow.position.set(0, 0.04, 1.0);
      arrow.scale.y = 1;
      this.ring.add(arrow);
      arrow.rotation.set(-Math.PI / 2, 0, 0);
      arrow.position.set(0, 0.95, 0);
    }
    // soft contact shadow so heroes feel grounded even on low quality
    this.shadowBlob = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ color: '#1a0b40', transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.position.y = 0.02;
    this.root.add(this.shadowBlob);

    // carry glow: brighter with more coins
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: '#ffcf3a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.glow.position.y = 1.0;
    this.root.add(this.glow);
    this.sticky = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: '#ff5fd2', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.sticky.position.y = 1.0;
    this.sticky.scale.setScalar(2.4);
    this.root.add(this.sticky);

    // stun stars
    this.stars = new THREE.Group();
    const starMat = new THREE.MeshBasicMaterial({ color: '#fff27a', toneMapped: false });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), starMat);
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.sin(a) * 0.45, 0, Math.cos(a) * 0.45);
      this.stars.add(s);
    }
    this.stars.position.y = 2.05;
    this.stars.visible = false;
    this.root.add(this.stars);

    this.play('Idle', 0);
    this.yaw = player.facing;
  }

  play(name: string, fade = 0.12, timeScale = 1) {
    const a = this.actions.get(name);
    if (!a) return;
    if (this.currentName === name && LOOPS.has(name)) {
      a.timeScale = timeScale;
      return;
    }
    a.reset();
    a.timeScale = timeScale;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
    this.currentName = name;
  }

  /** Play a one-shot clip that overrides locomotion for its length. */
  oneShot(name: string, now: number, timeScale = 1, maxLen = 99) {
    const a = this.actions.get(name);
    if (!a) return;
    this.play(name, 0.06, timeScale);
    this.oneShotUntil = now + Math.min(maxLen, a.getClip().duration / timeScale) - 0.08;
  }

  flash() {
    this.flashT = 0.12;
  }

  bump(amount: number) {
    this.squash = amount;
  }

  /** Visual hop (Ground Slam wind-up): the sim position stays on the ground. */
  jump(height: number, dur: number) {
    this.jumpH = height;
    this.jumpDur = dur;
    this.jumpT = dur;
  }

  /** Spin the model when knocked hard. */
  knockSpin(turns: number) {
    this.tumble = turns * Math.PI * 2;
  }

  /** Returns true when a footstep puff should spawn. */
  update(dt: number, now: number, hitStop: boolean): boolean {
    const p = this.player;
    this.root.position.set(p.x, p.y, p.z);
    if (this.jumpT > 0) {
      this.jumpT = Math.max(0, this.jumpT - dt);
      const k = 1 - this.jumpT / this.jumpDur;
      this.root.position.y += Math.sin(k * Math.PI) * this.jumpH * (k < 0.6 ? 1 : 1 - (k - 0.6) * 1.2);
      if (this.jumpT === 0) this.bump(0.5);
    }
    // smooth turning
    this.yaw += angleDiff(this.yaw, p.facing) * Math.min(1, dt * 18);
    if (Math.abs(this.tumble) > 0.01) {
      const step = Math.sign(this.tumble) * Math.min(Math.abs(this.tumble), dt * 22);
      this.tumble -= step;
      this.yaw += step;
    }
    this.model.rotation.y = this.yaw;

    let footstep = false;
    const speed = Math.hypot(p.vx, p.vz);
    const busy = now < this.oneShotUntil;
    if (this.celebrating) {
      if (this.currentName !== 'Cheer') this.play('Cheer', 0.2);
    } else if (p.state === 'falling') {
      this.play('Jump_Idle', 0.1);
    } else if (p.state === 'launched') {
      if (this.currentName !== 'Jump_Full_Short') this.oneShot('Jump_Full_Short', now, 1.3);
    } else if (p.state === 'stunned') {
      if (this.currentName !== 'Hit_B') this.oneShot('Hit_B', now, 0.6);
    } else if (!busy) {
      if (p.bankT > 0 && speed < 1.5) this.play('Interact', 0.15, 1.4);
      else if (speed > 0.6) {
        this.play('Running_A', 0.12, 0.65 + (speed / TUNING.hero.walkSpeed) * 0.55);
        this.dustT -= dt;
        if (this.dustT <= 0) {
          this.dustT = 0.22;
          footstep = true;
        }
      } else this.play('Idle', 0.18);
    }
    if (!hitStop) this.mixer.update(dt);

    // squash & stretch
    this.squash *= Math.exp(-dt * 10);
    const sq = this.squash;
    const s = this.baseScale;
    this.model.scale.set(s * (1 + sq * 0.5), s * (1 - sq), s * (1 + sq * 0.5));

    // flash on hit, blink while invulnerable
    this.flashT = Math.max(0, this.flashT - dt);
    const blink = p.invuln > 0 && p.state !== 'dashing' && Math.floor(now * 14) % 2 === 0;
    for (const m of this.mats) {
      m.emissive.setRGB(this.flashT > 0 ? 1 : 0, this.flashT > 0 ? 1 : 0, this.flashT > 0 ? 1 : 0);
      m.emissiveIntensity = this.flashT > 0 ? 0.9 : 0;
    }
    this.model.visible = !blink;

    // carry glow
    const g = Math.min(1, p.carried / TUNING.hero.glowFullAt);
    const gm = this.glow.material;
    gm.opacity = p.carried > 0 ? (0.18 + g * 0.6 + Math.sin(now * 6) * 0.05 * g) * (this.loudGlow ? 1 : 0.35) : 0;
    // see-through when standing between the camera and you
    if (Math.abs(this.fade - this.fadeTarget) > 0.01) {
      this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 10);
      for (const m of this.mats) {
        m.transparent = this.fade < 0.99;
        m.opacity = this.fade;
        m.depthWrite = this.fade > 0.95;
      }
    }
    this.glow.scale.setScalar(1.6 + g * 2.2);
    this.sticky.material.opacity = p.stickyT > 0 ? 0.45 + Math.sin(now * 12) * 0.2 : 0;

    this.stars.visible = p.state === 'stunned';
    if (this.stars.visible) this.stars.rotation.y += dt * 8;

    const air = p.y > 0.05 || p.state === 'falling';
    this.ring.visible = !air;
    this.shadowBlob.visible = p.state !== 'falling';
    this.shadowBlob.position.y = 0.02 - p.y;
    this.shadowBlob.scale.setScalar(Math.max(0.4, 1 - p.y * 0.15));
    return footstep;
  }

  get abilityAnim() {
    return HEROES[this.player.hero].abilityAnim;
  }
  get grabAnim() {
    return HEROES[this.player.hero].grabAnim;
  }
}

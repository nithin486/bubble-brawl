import * as THREE from 'three';
import { addOutlines } from './style.ts';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HeroAsset } from './assets.ts';
import type { Player, WeaponKind } from '../../../shared/sim/types.ts';
import { HEROES } from '../../../shared/config/heroes.ts';
import { TUNING } from '../../../shared/config/tuning.ts';
import { angleDiff } from '../../../shared/sim/math.ts';

/** Which env piece (tools/extract-props.mjs) each weapon looks like in the hero's hand. */
/** Held props that are not KayKit (no built-in grip): length in metres, grip point, rotation in the hand. */
const NON_KAYKIT: Partial<Record<WeaponKind, { len: number; at: [number, number, number]; rot: [number, number, number] }>> = {
  // Blender-made props (tools/blender/weapons): modelled with the muzzle on +x, y up. `at` = the grip point in model units
  // (metres in the model), which is moved into the palm; `len` = the longest side in metres once held.
  banana: { len: 0.5, at: [0, 0.16, 0], rot: [0, Math.PI / 2, 0.3] },
  hammer: { len: 1.0, at: [0, -0.12, 0], rot: [0, Math.PI / 2, 0] }, // held at the handle, head up
  hook: { len: 0.62, at: [-0.1, -0.14, 0], rot: [0, -Math.PI / 2, 0] },
  blaster: { len: 0.66, at: [-0.05, -0.14, 0], rot: [0, -Math.PI / 2, 0] },
  rocket: { len: 0.95, at: [-0.1, -0.2, 0], rot: [0, -Math.PI / 2, 0] },
  freeze: { len: 0.36, at: [0, 0.2, 0], rot: [0, 0, 0] },
};

const HELD_PIECE: Record<WeaponKind, string> = {
  blaster: 'weap_bubblegun',
  rocket: 'weap_rocketl',
  freeze: 'weap_icebomb',
  hook: 'weap_hook',
  hammer: 'weap_hammer',
  banana: 'weap_banana',
};

const LOOPS = new Set(['1H_Ranged_Aiming', '2H_Ranged_Aiming', '2H_Melee_Idle', 'Idle', 'Running_A', 'Walking_A', 'Jump_Idle', 'Interact', 'Cheer']);

export class HeroView {
  root = new THREE.Group();
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  private oneShotUntil = 0;
  private mats: THREE.MeshStandardMaterial[] = [];
  private ink: THREE.Material[] = [];
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

  constructor(asset: HeroAsset, player: Player, isLocal: boolean, color: string, glowTex: THREE.Texture, env?: Map<string, THREE.Object3D>) {
    this.env = env ?? null;
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
    this.ink = addOutlines(this.model, 0.016 / asset.scale);
    // real shadows from the hero (not just a blob), and for you an x-ray silhouette when cover hides you
    // stencil: the hero's visible pixels are marked; the silhouette draws only where it is NOT marked (= hidden behind cover)
    const xray = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthFunc: THREE.GreaterDepth, depthWrite: false, toneMapped: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp });
    if (isLocal) for (const m of this.mats) Object.assign(m, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    const skins: THREE.Mesh[] = [];
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.outline) {
        m.castShadow = true;
        skins.push(m);
      }
    });
    if (isLocal)
      for (const m of skins) {
        const sk = m as THREE.SkinnedMesh;
        let x: THREE.Mesh;
        if (sk.isSkinnedMesh) {
          const k = new THREE.SkinnedMesh(sk.geometry, xray);
          k.bind(sk.skeleton, sk.bindMatrix);
          x = k;
        } else x = new THREE.Mesh(m.geometry, xray);
        x.frustumCulled = false;
        x.renderOrder = 20;
        x.userData.outline = true; // not a real part: skipped by outlines / material lists
        m.add(x);
      }
    this.root.add(this.model);
    this.handR = this.model.getObjectByName('handslotr') ?? this.model.getObjectByName('handslot.r') ?? null; // (the glTF loader strips the dot from node names)
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
    const ringGeo = new THREE.RingGeometry(isLocal ? 0.6 : 0.72, 0.8, 40);
    this.ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isLocal ? 0.95 : 0.45, depthWrite: false, toneMapped: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.renderOrder = 2;
    this.root.add(this.ring);
    if (isLocal) {
      // facing pointer: shows where your attack / skill will go (turns with the hero)
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 3), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      arrow.rotation.x = Math.PI / 2;
      arrow.position.set(0, 0.04, 1.05);
      this.facePivot.add(arrow);
      this.root.add(this.facePivot);
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

  /** Show the weapon he is carrying in his right hand (hidden for a moment at the instant of a throw). */
  private syncHeld(kind: WeaponKind | null, now: number) {
    const gone = (now >= this.hideFrom && now < this.hideUntil) || this.player.state === 'falling' || this.player.state === 'bubble';
    const want = gone ? null : kind;
    if (want === this.heldKind) return;
    if (this.heldKind) {
      const o = this.heldObjs.get(this.heldKind);
      if (o) o.visible = false;
    }
    this.heldKind = want;
    if (!want) return;
    let o = this.heldObjs.get(want);
    if (!o) {
      const src = this.env?.get(HELD_PIECE[want]);
      if (!src || !this.handR) return;
      o = src.clone(true);
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.frustumCulled = false;
        }
      });
      const grip = NON_KAYKIT[want];
      if (grip) {
        // not a KayKit prop: size it for a hand, put the grip point in the palm, orient it
        const box = new THREE.Box3().setFromObject(o);
        const size = box.getSize(new THREE.Vector3());
        const k = grip.len / (Math.max(size.x, size.y, size.z) || 1) / this.baseScale;
        const c = new THREE.Vector3(...grip.at);
        const holder = new THREE.Group();
        o.position.sub(c);
        holder.add(o);
        holder.scale.setScalar(k);
        holder.rotation.set(...grip.rot);
        holder.position.set(0, 0.08, 0);
        o = holder;
      }
      addOutlines(o, 0.014 / this.baseScale);
      this.handR.add(o);
      this.heldObjs.set(want, o);
    }
    o.visible = true;
  }

  /** A weapon was just used: throws and drops let go of it part-way through the animation. */
  onFire(kind: WeaponKind, now: number) {
    if (kind === 'freeze') {
      this.hideFrom = now + 0.3;
      this.hideUntil = now + 0.75;
    } else if (kind === 'banana') {
      this.hideFrom = now + 0.2;
      this.hideUntil = now + 0.6;
    }
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
  /** Interpolated draw position (set by the game each frame); null = use the sim position. */
  view: { x: number; y: number; z: number } | null = null;
  private lean = 0;
  // ---- the weapon in his hand
  private env: Map<string, THREE.Object3D> | null;
  private handR: THREE.Object3D | null = null;
  private heldObjs = new Map<WeaponKind, THREE.Object3D>();
  private heldKind: WeaponKind | null = null;
  private hideFrom = 0;
  private hideUntil = 0;
  private facePivot = new THREE.Group();

  update(dt: number, now: number, hitStop: boolean): boolean {
    const p = this.player;
    const v = this.view ?? p;
    this.root.position.set(v.x, v.y, v.z);
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
    // lean into the run (and settle back when stopping): reads as weight, not sliding
    const spd = Math.min(1.3, Math.hypot(p.vx, p.vz) / TUNING.hero.walkSpeed);
    this.lean += ((p.state === 'normal' ? spd * 0.13 : 0) - this.lean) * Math.min(1, dt * 9);
    this.model.rotation.order = 'YXZ';
    this.model.rotation.x = this.lean;
    this.model.rotation.y = this.yaw;
    this.facePivot.rotation.y = this.yaw;

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
      } else {
        // standing still with a weapon: the matching ready stance
        const w = p.weapon;
        const want = w === 'blaster' || w === 'hook' ? '1H_Ranged_Aiming' : w === 'rocket' ? '2H_Ranged_Aiming' : w === 'hammer' ? '2H_Melee_Idle' : 'Idle';
        this.play(this.actions.has(want) ? want : 'Idle', 0.18);
      }
    }
    if (!hitStop) this.mixer.update(dt);
    this.syncHeld(p.weapon, now);

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
      for (const m of this.ink) m.visible = this.fade > 0.95;
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
    this.shadowBlob.position.y = 0.02 - v.y;
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

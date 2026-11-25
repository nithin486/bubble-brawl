import * as THREE from 'three';
import type { World } from '../../../shared/sim/world.ts';
import type { Player } from '../../../shared/sim/types.ts';
import { TUNING } from '../../../shared/config/tuning.ts';
import { HEROES } from '../../../shared/config/heroes.ts';
import { AIMED_CONE } from '../../../shared/sim/brawl.ts';

/**
 * Readability layer: what your Grab would hit, how far your skill reaches, who wears the crown,
 * and the map events (traffic, grave hands) with clear warnings.
 */
export class Markers {
  private scene: THREE.Scene;
  private reticle: THREE.Group;
  private reticleMat: THREE.MeshBasicMaterial;
  private skillRing: THREE.Mesh;
  private skillCone: THREE.Mesh;
  private skillMat: THREE.MeshBasicMaterial;
  private crown: THREE.Group;
  private crownGlow: THREE.Sprite;
  private cars = new Map<number, THREE.Group>();
  private warnLanes = new Map<number, THREE.Mesh>();
  private bellZones = new Map<number, THREE.Group>();
  private env: Map<string, THREE.Object3D>;
  private glowTex: THREE.Texture;
  // ---- aim scope (weapons): one small crosshair where the shot will land
  private scope!: THREE.Sprite;
  private scopeMat!: THREE.SpriteMaterial;
  /** Set by the game each frame: where the player is pointing (camera centre or mouse). null = use the hero's facing. */
  aimHint: { heading: number; dist: number } | null = null;
  /** Third person uses the HUD crosshair instead of the floating scope. */
  hideScope = false;
  /** The game camera: the scope is resized each frame so it stays a small, fixed size on screen. */
  cam: THREE.PerspectiveCamera | null = null;
  /** Rival under your Grab reticle (-1 = none). */
  grabTarget = -1;
  /** Rivals inside your skill's reach right now. */
  skillHits = 0;

  constructor(scene: THREE.Scene, env: Map<string, THREE.Object3D>, glowTex: THREE.Texture) {
    this.scene = scene;
    this.env = env;
    this.glowTex = glowTex;
    // grab reticle: four red brackets that spin and pulse under the target
    this.reticle = new THREE.Group();
    this.reticleMat = new THREE.MeshBasicMaterial({ color: '#ff3a5a', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const arc = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.98, 16, 1, i * (Math.PI / 2) + 0.25, Math.PI / 2 - 0.5), this.reticleMat);
      arc.rotation.x = -Math.PI / 2;
      this.reticle.add(arc);
    }
    const dot = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 4), this.reticleMat);
    dot.rotation.x = Math.PI;
    dot.position.y = 2.75;
    dot.name = 'arrow';
    this.reticle.add(dot);
    this.reticle.visible = false;
    this.reticle.renderOrder = 4;
    scene.add(this.reticle);

    // skill reach preview
    this.skillMat = new THREE.MeshBasicMaterial({ color: '#8fff7a', transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.skillRing = new THREE.Mesh(new THREE.RingGeometry(TUNING.abilities.rattleBurst.radius - 0.12, TUNING.abilities.rattleBurst.radius, 64), this.skillMat);
    this.skillRing.rotation.x = -Math.PI / 2;
    this.skillRing.visible = false;
    const half = (TUNING.abilities.groundSlam.coneDeg * Math.PI) / 360;
    this.skillCone = new THREE.Mesh(new THREE.CircleGeometry(TUNING.abilities.groundSlam.range, 24, -half, half * 2), this.skillMat);
    this.skillCone.visible = false;
    scene.add(this.skillRing, this.skillCone);

    // aim scope: a small icon floating in the air at the target (always faces the camera)
    this.scopeMat = new THREE.SpriteMaterial({ map: scopeTexture(), transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
    this.scope = new THREE.Sprite(this.scopeMat);
    this.scope.renderOrder = 31;
    this.scope.visible = false;
    scene.add(this.scope);

    // the crown
    this.crown = makeCrown();
    this.crownGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffd84a', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.crownGlow.scale.setScalar(1.8);
    this.crown.add(this.crownGlow);
    this.crown.visible = false;
    scene.add(this.crown);
  }

  /** A small scope where the shot will END: it follows your aim, stops at walls and rivals, and uses the sim's own rules. */
  private aim(world: World, me: Player, time: number, active: boolean) {
    const k = me.weapon;
    const on = active && world.mode === 'weapons' && !!k && me.ammo > 0 && world.phase === 'playing' && me.state !== 'falling' && me.state !== 'bubble' && me.state !== 'stunned';
    this.scope.visible = false;
    if (!on || !k || !this.cam || this.hideScope) return;
    const W = TUNING.weapons;
    const hint = this.aimHint;
    const heading = hint ? hint.heading : me.facing;
    const wished = hint ? hint.dist : 8;
    const cone = (full: number) => (hint ? Math.min(full, AIMED_CONE) : full); // the same assist cone the sim will use
    const saved = me.facing;
    me.facing = heading;
    const dir = { x: Math.sin(heading), z: Math.cos(heading) };
    let ex = me.x;
    let ez = me.z;
    let show = true;
    let locked = false;
    const aimAtPlayer = (t: Player, lead = 0) => {
      locked = true;
      ex = t.x + t.vx * lead;
      ez = t.z + t.vz * lead;
    };
    // first thing a straight shot meets within `dist`: a wall, a prop or a rival
    const along = (dist: number) => {
      for (let d = 0.8; d <= dist; d += 0.3) {
        const px = me.x + dir.x * d;
        const pz = me.z + dir.z * d;
        if (!world.arena.solid(px, pz) || world.obstacles.some((o) => (px - o.x) ** 2 + (pz - o.z) ** 2 < (o.r + 0.15) ** 2)) return { d: Math.max(0.8, d - 0.3), hit: false };
        for (const o of world.players) {
          if (o === me || o.state === 'falling' || o.state === 'launched') continue;
          const r = o.state === 'bubble' ? W.bubble.popRadius : TUNING.hero.radius + 0.35;
          if ((o.x - px) ** 2 + (o.z - pz) ** 2 < r * r) return { d, hit: true };
        }
      }
      return { d: dist, hit: false };
    };
    if (k === 'blaster' || k === 'rocket') {
      const g = W[k];
      const t = world.findTarget(me, g.range * 0.8, cone(150));
      if (t) {
        const a = Math.atan2(t.x - me.x, t.z - me.z);
        dir.x = Math.sin(a);
        dir.z = Math.cos(a);
      }
      const want = t ? Math.min(g.range, Math.hypot(t.x - me.x, t.z - me.z)) : Math.min(g.range, Math.max(2.5, wished));
      const r = along(want);
      locked = !!t || r.hit;
      ex = me.x + dir.x * r.d;
      ez = me.z + dir.z * r.d;
    } else if (k === 'freeze') {
      const t = world.findTarget(me, W.freeze.throw + 2, cone(150));
      if (t) aimAtPlayer(t, W.freeze.flight * 0.6);
      else {
        const reach = hint ? Math.min(W.freeze.throw + 3, Math.max(3, wished)) : W.freeze.throw;
        ex = me.x + dir.x * reach;
        ez = me.z + dir.z * reach;
      }
    } else if (k === 'hook') {
      const t = world.findTarget(me, W.hook.range, W.hook.coneDeg * 2);
      if (t) aimAtPlayer(t);
      else {
        const d = Math.min(W.hook.range, Math.max(2.5, wished));
        ex = me.x + dir.x * d;
        ez = me.z + dir.z * d;
      }
    } else if (k === 'banana') {
      ex = me.x - Math.sin(me.facing) * 1.0;
      ez = me.z - Math.cos(me.facing) * 1.0;
    } else show = false; // hammer: hits everyone around you, nothing to aim
    me.facing = saved;
    if (!show) return;

    this.scopeMat.color.set(locked ? '#ff3a5a' : '#ffffff'); // red = this shot will hit a rival
    this.scope.visible = true;
    this.scope.position.set(ex, world.terrain.heightAt(ex, ez) + 1.0, ez); // hangs in the air at chest height
    const dist = this.cam.position.distanceTo(this.scope.position);
    const px = Math.min(44, Math.max(30, window.innerHeight * 0.055)); // constant size on screen
    const pulse = locked ? 0.85 + Math.sin(time * 12) * 0.07 : 1;
    this.scope.scale.setScalar(((2 * dist * Math.tan((this.cam.fov * Math.PI) / 360) * px) / window.innerHeight) * pulse * (k === 'banana' ? 0.8 : 1));
  }

  setWorld() {
    for (const c of this.cars.values()) this.scene.remove(c);
    for (const l of this.warnLanes.values()) this.scene.remove(l);
    for (const b of this.bellZones.values()) this.scene.remove(b);
    this.cars.clear();
    this.warnLanes.clear();
    this.bellZones.clear();
  }

  update(world: World, me: Player, time: number, active: boolean) {
    // --- grab reticle
    const t = active && me.state !== 'falling' && world.phase === 'playing' ? world.findTarget(me) : null;
    this.grabTarget = t ? t.id : -1;
    this.reticle.visible = !!t;
    if (t) {
      this.reticle.position.set(t.x, 0.07, t.z);
      this.reticle.rotation.y = time * 2;
      const ready = me.grabCd <= 0.05;
      this.reticleMat.color.set(ready ? '#ff3a5a' : '#ff9aa8');
      this.reticleMat.opacity = ready ? 0.75 + Math.sin(time * 12) * 0.25 : 0.35;
      this.reticle.scale.setScalar(ready ? 1 + Math.sin(time * 10) * 0.06 : 0.9);
      const arrow = this.reticle.getObjectByName('arrow')!;
      arrow.visible = ready;
      arrow.position.y = 2.75 + Math.sin(time * 8) * 0.12;
    }

    this.aim(world, me, time, active);

    // --- skill reach
    const ab = HEROES[me.hero].ability;
    const showSkill = active && me.skillCd <= 0 && world.phase === 'playing' && me.state !== 'falling';
    this.skillHits = 0;
    if (showSkill && ab === 'rattleBurst') {
      const r = TUNING.abilities.rattleBurst.radius;
      this.skillHits = world.players.filter((o) => o !== me && o.state !== 'falling' && Math.hypot(o.x - me.x, o.z - me.z) < r + 0.45).length;
    } else if (showSkill && ab === 'groundSlam') {
      const c = TUNING.abilities.groundSlam;
      this.skillHits = world.players.filter((o) => {
        if (o === me || o.state === 'falling') return false;
        const dx = o.x - me.x;
        const dz = o.z - me.z;
        const d = Math.hypot(dx, dz);
        if (d > c.range + 1.5) return false; // aim assist turns you toward them
        return true;
      }).length;
    }
    this.skillRing.visible = showSkill && ab === 'rattleBurst';
    this.skillCone.visible = showSkill && ab === 'groundSlam';
    this.skillMat.opacity = this.skillHits > 0 ? 0.32 + Math.sin(time * 9) * 0.1 : 0.12;
    this.skillMat.color.set(this.skillHits > 0 ? '#8fff7a' : '#ffffff');
    this.skillRing.position.set(me.x, 0.06, me.z);
    this.skillCone.position.set(me.x, 0.06, me.z);
    // sector points along +x in its plane: lay it flat, then yaw it to face where you face
    this.skillCone.rotation.set(-Math.PI / 2, me.facing - Math.PI / 2, 0, 'YXZ');

    // --- crown
    const c = world.crownId >= 0 ? world.players[world.crownId] : null;
    this.crown.visible = !!c && c.state !== 'falling';
    if (c) {
      this.crown.position.set(c.x, c.y + 2.35 + Math.sin(time * 4) * 0.08, c.z);
      this.crown.rotation.y = time * 1.5;
    }

    // --- map events
    const live = new Set<number>();
    for (const h of world.hazards) {
      live.add(h.id);
      if (h.kind === 'traffic') this.traffic(h, time);
      else this.bell(h, time);
    }
    for (const [id, o] of this.cars) if (!live.has(id)) {
      this.scene.remove(o);
      this.cars.delete(id);
    }
    for (const [id, o] of this.warnLanes) if (!live.has(id)) {
      this.scene.remove(o);
      this.warnLanes.delete(id);
    }
    for (const [id, o] of this.bellZones) if (!live.has(id)) {
      this.scene.remove(o);
      this.bellZones.delete(id);
    }
  }

  private traffic(h: World['hazards'][number], time: number) {
    // flashing warning stripe down the street
    let lane = this.warnLanes.get(h.id);
    if (!lane) {
      const L = 34;
      lane = new THREE.Mesh(
        new THREE.PlaneGeometry(TUNING.hazards.traffic.halfWidth * 2 + 0.6, L),
        new THREE.MeshBasicMaterial({ map: stripeTexture(), transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }),
      );
      lane.rotation.x = -Math.PI / 2;
      lane.rotation.z = h.dx !== 0 ? Math.PI / 2 : 0;
      lane.position.set(0, 0.07, 0);
      lane.renderOrder = 3;
      this.scene.add(lane);
      this.warnLanes.set(h.id, lane);
    }
    const lm = lane.material as THREE.MeshBasicMaterial;
    lm.opacity = h.warn > 0 ? 0.35 + 0.35 * (Math.sin(time * 18) > 0 ? 1 : 0) : 0.25;
    (lm.map as THREE.Texture).offset.y = -time * (h.warn > 0 ? 1.5 : 4) * (h.dx + h.dz);
    // the car: a big taxi barrelling through, headlights on
    let car = this.cars.get(h.id);
    if (!car) {
      car = new THREE.Group();
      const body = this.env.get('car_taxi')?.clone();
      if (body) {
        body.scale.setScalar(3.4);
        car.add(body);
      }
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#fff6c0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      head.scale.set(3.5, 2, 1);
      head.position.set(0, 0.8, 1.9);
      car.add(head);
      this.scene.add(car);
      this.cars.set(h.id, car);
    }
    car.visible = h.warn <= 0;
    car.position.set(h.x, 0, h.z);
    car.rotation.y = Math.atan2(h.dx, h.dz);
    car.position.y = Math.abs(Math.sin(time * 30)) * 0.05;
  }

  private bell(h: World['hazards'][number], time: number) {
    let g = this.bellZones.get(h.id);
    if (!g) {
      g = new THREE.Group();
      for (const z of h.zones) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(z.r - 0.18, z.r, 48),
          new THREE.MeshBasicMaterial({ color: '#7dff6a', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(z.x, 0.08, z.z);
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(z.r - 0.18, 48),
          new THREE.MeshBasicMaterial({ color: '#4dff4a', transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }),
        );
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(z.x, 0.07, z.z);
        g.add(ring, fill);
      }
      this.scene.add(g);
      this.bellZones.set(h.id, g);
    }
    const k = h.warn > 0 ? 1 - h.warn / TUNING.hazards.bell.warn : 1;
    g.children.forEach((m, i) => {
      const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = (i % 2 === 0 ? 0.5 : 0.12) + (Math.sin(time * (8 + k * 20)) > 0 ? 0.3 : 0);
    });
  }
}

/** The scope icon: thin ring with four gaps, short ticks and a centre dot (white with a dark rim, tinted by the material). */
function scopeTexture() {
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.translate(N / 2, N / 2);
  g.lineCap = 'round';
  const draw = (fn: () => void, w: number) => {
    g.strokeStyle = 'rgba(20,8,50,0.95)';
    g.lineWidth = w + 8;
    fn();
    g.strokeStyle = '#ffffff';
    g.lineWidth = w;
    fn();
  };
  for (let i = 0; i < 4; i++) {
    const a0 = (i * Math.PI) / 2 + 0.42;
    draw(() => {
      g.beginPath();
      g.arc(0, 0, 40, a0, a0 + Math.PI / 2 - 0.84);
      g.stroke();
    }, 6);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    draw(() => {
      g.beginPath();
      g.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
      g.lineTo(Math.cos(a) * 27, Math.sin(a) * 27);
      g.stroke();
    }, 5);
  }
  g.fillStyle = 'rgba(20,8,50,0.9)';
  g.beginPath();
  g.arc(0, 0, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(0, 0, 4, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeCrown() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ff9d00', emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25, flatShading: true });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.22, 10, 1, true), gold);
  band.material.side = THREE.DoubleSide;
  g.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 4), gold);
    spike.position.set(Math.sin(a) * 0.32, 0.22, Math.cos(a) * 0.32);
    g.add(spike);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055), new THREE.MeshStandardMaterial({ color: i % 2 ? '#ff3a7a' : '#3ad8ff', emissive: i % 2 ? '#ff3a7a' : '#3ad8ff', emissiveIntensity: 0.8 }));
    gem.position.set(Math.sin(a + 0.6) * 0.33, 0, Math.cos(a + 0.6) * 0.33);
    g.add(gem);
  }
  g.scale.setScalar(1.25);
  return g;
}

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,40,60,0.9)';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (let y = 0; y < 128; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(32, y + 16);
    g.lineTo(64, y);
    g.lineTo(64, y + 10);
    g.lineTo(32, y + 26);
    g.lineTo(0, y + 10);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


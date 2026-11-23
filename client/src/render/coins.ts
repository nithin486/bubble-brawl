import * as THREE from 'three';
import { bakePiece } from './island.ts';
import type { World } from '../../../shared/sim/world.ts';

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const E = new THREE.Euler();
const COIN_SCALE = 1.75;

interface Flyer {
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  delay: number;
  onDone?: () => void;
}

/** Loose coins from the sim + purely visual flying coins (steals, banking). */
export class CoinsView {
  private loose: THREE.InstancedMesh;
  private flying: THREE.InstancedMesh;
  private flyers: Flyer[] = [];
  private glow: THREE.InstancedMesh;

  constructor(env: Map<string, THREE.Object3D>, scene: THREE.Scene, glowTex: THREE.Texture) {
    const { geo } = bakePiece(env.get('coin')!);
    geo.rotateX(Math.PI / 2); // stand the coin up so it spins like a pickup
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffcc33',
      emissive: '#ff9d00',
      emissiveIntensity: 0.55,
      metalness: 0.6,
      roughness: 0.3,
    });
    this.loose = new THREE.InstancedMesh(geo, mat, 320);
    this.loose.castShadow = true;
    this.loose.count = 0;
    this.loose.frustumCulled = false;
    this.flying = new THREE.InstancedMesh(geo, mat, 200);
    this.flying.count = 0;
    this.flying.frustumCulled = false;
    // cheap ground glow under each coin (one quad per coin, instanced)
    const glowGeo = new THREE.PlaneGeometry(1, 1);
    glowGeo.rotateX(-Math.PI / 2);
    this.glow = new THREE.InstancedMesh(
      glowGeo,
      new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffb020', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      320,
    );
    this.glow.count = 0;
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 1;
    scene.add(this.loose, this.flying, this.glow);
  }

  fly(from: THREE.Vector3, to: () => THREE.Vector3, n: number, opts: { dur?: number; arc?: number; spread?: number; onEach?: () => void } = {}) {
    for (let i = 0; i < Math.min(n, 40); i++) {
      if (this.flyers.length >= 200) break;
      const f = from.clone();
      f.x += (Math.random() - 0.5) * (opts.spread ?? 0.4);
      f.z += (Math.random() - 0.5) * (opts.spread ?? 0.4);
      this.flyers.push({ from: f, to, t: 0, dur: opts.dur ?? 0.45, arc: opts.arc ?? 1.6, delay: i * 0.035, onDone: opts.onEach });
    }
  }

  update(world: World, dt: number, time: number) {
    let n = 0;
    let g = 0;
    for (const c of world.coins) {
      if (c.delay > 0 || n >= 320) continue;
      const spin = time * 3 + c.id * 0.7;
      const bob = c.grounded ? 0.12 + Math.sin(time * 3 + c.id) * 0.08 : 0;
      E.set(0, spin, 0);
      Q.setFromEuler(E);
      P.set(c.x, c.y + bob, c.z);
      // blink when about to vanish (falling off the island)
      S.setScalar(COIN_SCALE);
      this.loose.setMatrixAt(n++, M.compose(P, Q, S));
      if (c.y < 1.5 && c.y > -0.5) {
        P.set(c.x, 0.04, c.z);
        S.setScalar(1.3);
        this.glow.setMatrixAt(g++, M.compose(P, Q.identity(), S));
      }
    }
    this.loose.count = n;
    this.loose.instanceMatrix.needsUpdate = true;
    this.glow.count = g;
    this.glow.instanceMatrix.needsUpdate = true;

    let k = 0;
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt / f.dur;
      const t = Math.min(1, f.t);
      const to = f.to();
      P.lerpVectors(f.from, to, t);
      P.y += Math.sin(t * Math.PI) * f.arc;
      E.set(time * 9, time * 7, 0);
      Q.setFromEuler(E);
      S.setScalar(COIN_SCALE * (1 - t * 0.35));
      if (k < 200) this.flying.setMatrixAt(k++, M.compose(P, Q, S));
      if (t >= 1) {
        f.onDone?.();
        this.flyers.splice(i, 1);
      }
    }
    this.flying.count = k;
    this.flying.instanceMatrix.needsUpdate = true;
  }
}

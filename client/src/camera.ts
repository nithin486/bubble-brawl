import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const tmpF = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export type CamPreset = 'third' | 'far' | 'close' | 'action' | 'bird';
/** Presets a player can pick (bird is a dev view). */
export type PlayerCam = Exclude<CamPreset, 'bird'>;
/** Camera views the player can pick in Settings. */
export const CAM_PRESETS: Record<CamPreset, { label: string; offset: [number, number, number]; look: [number, number, number]; lead: number; fov: number }> = {
  third: { label: 'BEHIND (3RD PERSON)', offset: [0, 4.4, 7.6], look: [0, 1.5, -7], lead: 0.12, fov: 54 },
  far: { label: 'TOP · FAR', offset: [0, 14, 12.5], look: [0, 0.8, -1.2], lead: 0.35, fov: 45 },
  close: { label: 'TOP · CLOSE', offset: [0, 11, 9], look: [0, 0.9, -1.4], lead: 0.45, fov: 46 },
  /** Dev view (?cam=bird): the whole big map from above. */
  bird: { label: 'BIRD (DEV)', offset: [0, 62, 38], look: [0, 0, -4], lead: 0, fov: 50 },
  action: { label: 'TOP · ACTION', offset: [0, 8.4, 10.4], look: [0, 1.3, -3.2], lead: 0.6, fov: 50 },
};

/** Critically damped follow camera with presets, lead, crowd ease-out and shake. */
export class CameraRig {
  private target = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private shakeT = 0;
  private shakeAmp = 0;
  shakeEnabled = true;
  offset = new THREE.Vector3(0, 11, 10);
  private lookOffset = new THREE.Vector3(0, 0.8, -1.2);
  private camera: THREE.PerspectiveCamera;
  /** 0 = gameplay; 1 = close-up (results / celebration) */
  private zoom = 0;
  zoomTarget = 0;
  /** 0..1: how crowded it is around you — the camera eases out a little. */
  crowd = 0;
  private crowdS = 0;
  private punchT = 0;
  private punchAmt = 0;
  private baseFov = 0;

  /** Quick zoom-in kick for big moments. */
  punch(amount: number) {
    this.punchAmt = amount;
    this.punchT = 0.35;
  }

  preset: CamPreset = 'far';
  private leadK = 0.35;
  /** Desired vertical FOV for this preset (Stage keeps aspect handling). */
  presetFov = 45;

  /** Third person with a weapon: the camera moves over the right shoulder so the crosshair is clear of your hero. */
  armed = false;
  private armedS = 0;

  /** Vertical look (third person): 1 = default; bigger = higher, more top-down; smaller = lower, looking farther. */
  heightMul = 1;
  private heightS = 1;

  /** Camera yaw (radians). 0 = looking toward -z. Only the third-person view turns. */
  yaw = 0;
  private manualT = 9;

  get turns() {
    return this.preset === 'third';
  }

  /** Third-person look up/down (radians): + = look up / farther, - = look down. */
  pitch = 0;
  addPitch(d: number) {
    if (!this.turns || !d) return;
    this.pitch = Math.min(0.6, Math.max(-0.85, this.pitch + d));
  }

  /** Where the third-person camera may not go (walls, decks, tall props). Set by the game. */
  blocked: ((x: number, y: number, z: number) => boolean) | null = null;
  private pull = 1;
  private feet = 0;

  /**
   * Third-person shooter camera: over the right shoulder, looking exactly along yaw / pitch.
   * The crosshair (screen centre) never lags, swings or re-targets: walls only pull the camera closer.
   */
  private shoulderCam(dt: number, hero: THREE.Vector3) {
    this.armedS += ((this.armed ? 1 : 0) - this.armedS) * Math.min(1, dt * 9);
    const sh = this.armedS;
    const k = (this.presetFar - 1) * 0.5 + 1;
    const side = 0.35 + sh * 0.6;
    const back = (5.9 - sh * 1.2) * k * this.heightMul;
    const lift = 0.95 - sh * 0.15;
    this.feet = Math.abs(hero.y - this.feet) > 3 ? hero.y : this.feet + (hero.y - this.feet) * Math.min(1, dt * 14);
    const cp = Math.cos(this.pitch);
    const f = tmpF.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const anchor = tmpA.set(hero.x + Math.cos(this.yaw) * side, this.feet + 1.55, hero.z - Math.sin(this.yaw) * side);
    const to = tmpB.copy(anchor).addScaledVector(f, -back);
    to.y = Math.max(this.feet + 0.45, to.y + lift);
    // pull in front of whatever is between the shoulder and the camera
    let free = 1;
    if (this.blocked)
      for (let i = 1; i <= 16; i++) {
        const t = i / 16;
        if (this.blocked(anchor.x + (to.x - anchor.x) * t, anchor.y + (to.y - anchor.y) * t, anchor.z + (to.z - anchor.z) * t)) {
          free = Math.max(0.22, t - 0.09);
          break;
        }
      }
    this.pull += (free - this.pull) * Math.min(1, dt * (free < this.pull ? 22 : 4));
    const cam = this.camera;
    cam.position.copy(anchor).lerp(to, this.pull);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * (this.shakeT / 0.3) * (this.armed ? 0.25 : 0.7);
      this.shakePh += dt;
      cam.position.x += this.wobble(0) * a;
      cam.position.y += this.wobble(1.7) * a;
    }
    cam.lookAt(tmpB.copy(cam.position).add(f));
    cam.updateMatrixWorld();
  }

  /** Manual turn (mouse / right-side drag / Q-E). */
  addYaw(d: number) {
    if (!this.turns || !d) return;
    this.yaw += d;
    this.manualT = 0;
  }

  /** Point the camera behind a hero facing `facing` (sim convention: atan2(x, z)). */
  faceBehind(facing: number) {
    this.yaw = facing + Math.PI;
    this.pitch = -0.16;
    this.pull = 1;
  }

  /** Screen-relative stick → world direction, for whatever way the camera faces. */
  toWorld(mx: number, mz: number) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { x: mx * c + mz * s, z: -mx * s + mz * c };
  }

  /** Player's chosen camera distance (1 = standard). */
  presetFar = 1;

  /** Third person: while running forward and not turning by hand, swing gently behind the hero. */
  autoFollow(dt: number, facing: number, forward: number) {
    this.manualT += dt;
    // never while a weapon is out: the crosshair moves only when you move it
    if (!this.turns || this.armed || this.manualT < 2.5 || forward < 0.35) return;
    let d = facing + Math.PI - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 1.6 * forward);
  }

  setPreset(p: CamPreset) {
    const c = CAM_PRESETS[p];
    this.preset = p;
    this.offset.set(...c.offset);
    this.lookOffset.set(...c.look);
    this.leadK = c.lead;
    this.presetFov = c.fov;
  }

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  snap(p: THREE.Vector3) {
    this.target.copy(p);
    this.vel.set(0, 0, 0);
  }

  /** Shake follows a smooth ~20 Hz wobble in time, not a new random jump every frame: the same feel at 30, 60 or 120 fps. */
  private shakePh = 0;
  private wobble(seed: number) {
    const t = this.shakePh;
    return 0.5 * (Math.sin(t * 131 + seed) * 0.6 + Math.sin(t * 83 + seed * 2.3) * 0.4);
  }

  shake(amount: number) {
    if (!this.shakeEnabled) return;
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = 0.3;
  }

  update(dt: number, focus: THREE.Vector3, lead: THREE.Vector3) {
    if (this.turns && this.zoomTarget === 0) {
      this.target.copy(focus);
      this.vel.set(0, 0, 0);
      this.zoom = 0;
      this.shoulderCam(dt, focus);
      return;
    }
    // critically damped smooth-damp toward focus + lead (settles in ~0.5 s)
    const goal = new THREE.Vector3().copy(focus).addScaledVector(lead, this.leadK);
    goal.y = focus.y * 0.8;
    const omega = 2 / (this.turns ? 0.12 : 0.28);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = new THREE.Vector3().subVectors(this.target, goal);
    const temp = new THREE.Vector3().copy(this.vel).addScaledVector(change, omega).multiplyScalar(dt);
    this.vel.addScaledVector(temp, -omega).multiplyScalar(exp);
    this.target.copy(goal).add(change.add(temp).multiplyScalar(exp));

    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 2.5);
    this.crowdS += (this.crowd - this.crowdS) * Math.min(1, dt * 1.5);
    const crowdK = this.turns ? 0.12 : 0.28;
    const off = new THREE.Vector3().copy(this.offset).multiplyScalar((1 - this.zoom * 0.45) * (1 + this.crowdS * crowdK));
    off.y -= this.zoom * 1.2;
    if (this.turns) {
      this.heightS += (this.heightMul - this.heightS) * Math.min(1, dt * 8);
      off.y *= this.heightS;
      off.z *= 1 + (this.heightS - 1) * 0.25;
      // shooter-style pitch: looking down raises the camera over the hero, looking up lowers it behind the shoulder
      off.y -= this.pitch * 3.2;
      off.z += Math.abs(this.pitch) * 0.6;
    }
    const yaw = this.turns ? this.yaw : 0;
    this.armedS += ((this.armed && this.turns ? 1 : 0) - this.armedS) * Math.min(1, dt * 7);
    const sh = this.armedS * (1 - this.zoom);
    off.multiplyScalar(1 - sh * 0.04);
    off.x += sh * 1.25;
    off.y += sh * 0.15;
    off.applyAxisAngle(UP, yaw);
    this.camera.position.copy(this.target).add(off);
    const lo = this.lookOffset.clone();
    if (this.turns) lo.y += this.pitch * 7.5;
    lo.x += sh * 1.25;
    lo.y -= sh * 0.15;
    const look = new THREE.Vector3().copy(this.target).add(lo.applyAxisAngle(UP, yaw));
    look.y += this.zoom * 0.6;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * (this.shakeT / 0.3);
      this.shakePh += dt;
      this.camera.position.x += this.wobble(0) * a;
      this.camera.position.y += this.wobble(1.7) * a;
      look.x += this.wobble(3.1) * a * 0.5;
    }
    this.camera.lookAt(look);
    // FOV kick: punch in fast, ease back out
    if (!this.baseFov || this.punchT <= 0) this.baseFov = this.camera.fov;
    if (this.punchT > 0) {
      this.punchT = Math.max(0, this.punchT - dt);
      const k = this.punchT / 0.35;
      this.camera.fov = this.baseFov - this.punchAmt * Math.sin(k * Math.PI * 0.5) ** 0.5 * k;
      this.camera.updateProjectionMatrix();
      if (this.punchT === 0) {
        this.camera.fov = this.baseFov;
        this.camera.updateProjectionMatrix();
      }
    }
  }
}

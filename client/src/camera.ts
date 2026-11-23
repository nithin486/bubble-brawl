import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export type CamPreset = 'third' | 'far' | 'close' | 'action';
/** Camera views the player can pick in Settings. */
export const CAM_PRESETS: Record<CamPreset, { label: string; offset: [number, number, number]; look: [number, number, number]; lead: number; fov: number }> = {
  third: { label: 'BEHIND (3RD PERSON)', offset: [0, 3.1, 5.3], look: [0, 1.2, -6], lead: 0.12, fov: 58 },
  far: { label: 'TOP · FAR', offset: [0, 11, 10], look: [0, 0.8, -1.2], lead: 0.35, fov: 45 },
  close: { label: 'TOP · CLOSE', offset: [0, 8.2, 6.6], look: [0, 0.9, -1.4], lead: 0.45, fov: 46 },
  action: { label: 'TOP · ACTION', offset: [0, 5.6, 7.4], look: [0, 1.3, -3.2], lead: 0.6, fov: 52 },
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

  /** Camera yaw (radians). 0 = looking toward -z. Only the third-person view turns. */
  yaw = 0;
  private manualT = 9;

  get turns() {
    return this.preset === 'third';
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
  }

  /** Screen-relative stick → world direction, for whatever way the camera faces. */
  toWorld(mx: number, mz: number) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { x: mx * c + mz * s, z: -mx * s + mz * c };
  }

  /** Third person: while running forward and not turning by hand, swing gently behind the hero. */
  autoFollow(dt: number, facing: number, forward: number) {
    this.manualT += dt;
    if (!this.turns || this.manualT < 1.2 || forward < 0.35) return;
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

  shake(amount: number) {
    if (!this.shakeEnabled) return;
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = 0.3;
  }

  update(dt: number, focus: THREE.Vector3, lead: THREE.Vector3) {
    // critically damped smooth-damp toward focus + lead (settles in ~0.5 s)
    const goal = new THREE.Vector3().copy(focus).addScaledVector(lead, this.leadK);
    goal.y = 0;
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
    const yaw = this.turns ? this.yaw : 0;
    off.applyAxisAngle(UP, yaw);
    this.camera.position.copy(this.target).add(off);
    const look = new THREE.Vector3().copy(this.target).add(this.lookOffset.clone().applyAxisAngle(UP, yaw));
    look.y += this.zoom * 0.6;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * (this.shakeT / 0.3);
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      look.x += (Math.random() - 0.5) * a * 0.5;
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

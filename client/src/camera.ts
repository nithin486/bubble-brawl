import * as THREE from 'three';

/** Critically damped follow camera: 14 m up, 11 m behind, small lead, optional shake. */
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
    const goal = new THREE.Vector3().copy(focus).addScaledVector(lead, 0.35);
    goal.y = 0;
    const omega = 2 / 0.28;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = new THREE.Vector3().subVectors(this.target, goal);
    const temp = new THREE.Vector3().copy(this.vel).addScaledVector(change, omega).multiplyScalar(dt);
    this.vel.addScaledVector(temp, -omega).multiplyScalar(exp);
    this.target.copy(goal).add(change.add(temp).multiplyScalar(exp));

    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 2.5);
    const off = new THREE.Vector3().copy(this.offset).multiplyScalar(1 - this.zoom * 0.45);
    off.y -= this.zoom * 1.2;
    this.camera.position.copy(this.target).add(off);
    const look = new THREE.Vector3().copy(this.target).add(this.lookOffset);
    look.y += this.zoom * 0.6;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * (this.shakeT / 0.3);
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      look.x += (Math.random() - 0.5) * a * 0.5;
    }
    this.camera.lookAt(look);
  }
}

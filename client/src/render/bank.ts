import { release } from './dispose.ts';
import * as THREE from 'three';
import { TUNING } from '../../../shared/config/tuning.ts';
import type { World } from '../../../shared/sim/world.ts';
import { len as hyp } from '../../../shared/sim/math.ts';

/** Height the bank bubble floats at — above heads and name tags. */
const HOVER = 5.0;
/** Pushed slightly away from the camera so it hangs above-and-behind whoever is banking. */
const BACK = -1.4;

/** The Bubble Bank: an iridescent bubble with a gold chest inside, plus the "next spot" beam. */
export class BankView {
  /** Free this round's bank before the next match builds its own. */
  dispose() {
    release(this.group);
    release(this.beam);
  }

  group = new THREE.Group();
  private bubble: THREE.Mesh;
  private bubbleMat: THREE.ShaderMaterial;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private inner: THREE.Group;
  private beam: THREE.Group;
  private beamMat: THREE.ShaderMaterial;
  private pulse = 0;
  private shaftMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.SpriteMaterial;
  private world: World;
  pos = new THREE.Vector3();

  constructor(world: World, env: Map<string, THREE.Object3D>, scene: THREE.Scene, glowTex: THREE.Texture) {
    this.world = world;
    const R = TUNING.bank.radius;
    this.bubbleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { time: { value: 0 }, pulse: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float time;
        void main(){ vec3 p = position; float w = sin(p.y*3.0+time*2.0)*0.03 + sin(p.x*4.0+time*1.7)*0.03; p += normal*w;
          vec4 mv = modelViewMatrix*vec4(p,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = p; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float time; uniform float pulse;
        void main(){ float f = 1.0 - abs(dot(vN, vV)); f = pow(f, 2.2);
          vec3 irid = 0.5 + 0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + f*1.3 + vP.y*0.25 + time*0.15));
          vec3 col = mix(vec3(0.55,0.95,1.0), irid, 0.55) + pulse*vec3(1.0,0.85,0.3);
          float a = 0.08 + f*0.75 + pulse*0.25;
          // specular highlight
          float s = pow(max(0.0, dot(reflect(-vV, vN), normalize(vec3(-0.4,0.8,0.4)))), 40.0);
          gl_FragColor = vec4(col + s, clamp(a + s, 0.0, 1.0)); }`,
    });
    // The bank hovers ABOVE the players like a balloon, so heroes standing in it stay readable.
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.1, 40, 24), this.bubbleMat);
    this.bubble.position.y = HOVER;
    this.bubble.renderOrder = 5;
    this.group.add(this.bubble);

    this.inner = new THREE.Group();
    const chest = env.get('chest_gold')!.clone();
    chest.scale.setScalar(0.55);
    chest.position.set(0, -0.45, 0);
    const stack = env.get('coin_stack')!.clone();
    stack.scale.setScalar(1.2);
    stack.position.set(0.55, -0.45, 0.35);
    this.inner.add(chest, stack);
    this.group.add(this.inner);

    // inner glow
    this.glowMat = new THREE.SpriteMaterial({ map: glowTex, color: '#7ff3ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(4);
    glow.position.set(0, HOVER, BACK);
    this.group.add(glow);

    this.ringMat = new THREE.MeshBasicMaterial({ color: '#58f0ff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.16, R + 0.04, 64), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.group.add(this.ring);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(R - 0.16, 48),
      new THREE.MeshBasicMaterial({ map: glowTex, color: '#3fd8ff', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.04;
    this.group.add(floor);
    // soft light cone linking the floating bank to its pad (no geometry over the heroes' bodies)
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, R - 0.1, HOVER - 1.1, 32, 1, true),
      (this.shaftMat = new THREE.MeshBasicMaterial({ color: '#7ff3ff', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })),
    );
    shaft.position.set(0, (HOVER - 1.1) / 2, BACK / 2);
    shaft.rotation.x = Math.atan2(-BACK / 2, HOVER - 1.1) * -1;
    this.group.add(shaft);
    scene.add(this.group);

    // beam showing where the bank goes next
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, alpha: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `varying vec2 vUv; uniform float time; uniform float alpha;
        void main(){ float a = (1.0 - vUv.y) * (0.6 + 0.4*sin(vUv.y*30.0 - time*8.0)); gl_FragColor = vec4(0.45,0.95,1.0, a*alpha); }`,
    });
    this.beam = new THREE.Group();
    const beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R, 22, 32, 1, true), this.beamMat);
    beamMesh.position.y = 11;
    const beamRing = new THREE.Mesh(new THREE.RingGeometry(R - 0.12, R + 0.05, 64), new THREE.MeshBasicMaterial({ color: '#7ff3ff', transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
    beamRing.rotation.x = -Math.PI / 2;
    beamRing.position.y = 0.06;
    this.beam.add(beamMesh, beamRing);
    this.beam.visible = false;
    scene.add(this.beam);
  }

  onBanked() {
    this.pulse = 1;
  }

  showNext(x: number, z: number) {
    this.beam.position.set(x, 0, z);
    this.beam.visible = true;
  }

  update(dt: number, time: number, cam?: THREE.Vector3) {
    const b = this.world.bank;
    // a close (third-person) camera inside the light cone would wash the screen out: fade it
    const near = cam ? Math.min(1, Math.max(0, (hyp(cam.x - b.x, cam.z - b.z) - 3) / 6)) : 1;
    this.shaftMat.opacity = 0.07 * near;
    this.glowMat.opacity = 0.2 + 0.35 * near;
    this.group.position.set(b.x, 0, b.z);
    this.pos.set(b.x, HOVER, b.z + BACK);
    this.pulse = Math.max(0, this.pulse - dt * 2.5);
    this.bubbleMat.uniforms.time.value = time;
    this.bubbleMat.uniforms.pulse.value = this.pulse;
    const s = 1 + Math.sin(time * 2.2) * 0.025 + this.pulse * 0.12;
    this.bubble.scale.set(s, s * (1 + Math.sin(time * 1.7) * 0.02), s);
    this.inner.position.set(0, HOVER + Math.sin(time * 1.5) * 0.12, BACK);
    this.bubble.position.set(0, HOVER + Math.sin(time * 1.5) * 0.12, BACK);
    this.inner.rotation.y = Math.sin(time * 0.6) * 0.3;
    const anyBanking = this.world.players.some((p) => p.bankT > 0);
    this.ringMat.color.set(anyBanking ? '#ffe066' : '#58f0ff');
    this.ringMat.opacity = 0.7 + Math.sin(time * 6) * 0.2;
    if (!b.warned) this.beam.visible = false;
    this.beamMat.uniforms.time.value = time;
    this.beamMat.uniforms.alpha.value = this.beam.visible ? 0.55 + Math.sin(time * 10) * 0.15 : 0;
  }
}

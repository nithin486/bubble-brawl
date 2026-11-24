// Standalone Bubble Ranger inspector (not part of the game build): open /preview-ranger.html on the dev server.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadModel } from './render/models.ts';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fb8e8');
scene.fog = new THREE.Fog('#9fb8e8', 8, 22);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 60);
cam.position.set(-2.6, 1.6, 4.2);
const ctl = new OrbitControls(cam, renderer.domElement);
ctl.target.set(0, 0.95, 0);
ctl.enableDamping = true;
ctl.autoRotate = true;
ctl.autoRotateSpeed = 1.6;

scene.add(new THREE.HemisphereLight('#ffffff', '#8aa0d8', 1.25));
const sun = new THREE.DirectionalLight('#fff3dd', 2.4);
sun.position.set(-3, 5, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun);
const rim = new THREE.DirectionalLight('#ffb070', 1.1);
rim.position.set(3, 2, -4);
scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: '#c9d6f5', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const ui = document.getElementById('ui')!;
const info = document.getElementById('info')!;
const model = await loadModel('assets/hero_ranger.glb', { height: 1.8, yaw: Math.PI });
scene.add(model.root);

const btn = (label: string, fn: () => void, on = false) => {
  const b = document.createElement('button');
  b.textContent = label;
  if (on) b.className = 'on';
  b.onclick = () => fn();
  ui.appendChild(b);
  return b;
};
const spin = btn('Auto-rotate', () => { ctl.autoRotate = !ctl.autoRotate; spin.classList.toggle('on', ctl.autoRotate); }, true);
const SHOW = ['Idle', 'Walking_A', 'Running_A', 'Jump_Start', 'Jump_Idle', 'Jump_Land', '1H_Ranged_Aiming', '1H_Ranged_Shoot', 'Hit_A', 'Cheer'];
const buttons = new Map<string, HTMLButtonElement>();
for (const name of SHOW) {
  if (!model.clips.some((c) => c.name === name)) continue;
  const b = btn(name.replace(/_/g, ' '), () => {
    const a = model.play(name, 0.15);
    if (a && !/Idle|Running|Walking|Aiming|Cheer/.test(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    buttons.forEach((x, k) => x.classList.toggle('on', k === name));
  }, name === 'Idle');
  buttons.set(name, b);
}
info.textContent = `${model.clips.length} clips · drag to orbit, scroll to zoom`;

addEventListener('resize', () => {
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  model.update(clock.getDelta());
  ctl.update();
  renderer.render(scene, cam);
});

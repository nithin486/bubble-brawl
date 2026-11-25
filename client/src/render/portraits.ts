import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HeroId } from '../../../shared/config/heroes.ts';
import type { Assets } from './assets.ts';
import { WEAPON_INFO, weaponIcon } from './weapons-view.ts';
import type { WeaponKind } from '../../../shared/sim/types.ts';

const WEAPON_PIECE: Record<WeaponKind, string> = { blaster: 'weap_bubblegun', rocket: 'weap_rocketl', banana: 'weap_banana', freeze: 'weap_icebomb', hook: 'weap_hook', hammer: 'weap_hammer' };
const shots = new Map<WeaponKind, string>();
/** Rendered preview of a weapon's real model (the flat icon until it has been rendered). */
export const weaponShot = (k: WeaponKind) => shots.get(k) ?? weaponIcon(k, 96).toDataURL();

function renderWeapons(renderer: THREE.WebGLRenderer, assets: Assets, size = 128) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a4a9c', 2.4));
  const key = new THREE.DirectionalLight('#fff3dd', 2.6);
  key.position.set(1.5, 2.5, 3);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.01, 50);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  for (const kind of Object.keys(WEAPON_INFO) as WeaponKind[]) {
    const src = assets.env.get(WEAPON_PIECE[kind]);
    if (!src) continue;
    const model = src.clone(true);
    model.position.set(0, 0, 0);
    const pivot = new THREE.Group();
    pivot.add(model);
    pivot.rotation.set(0.1, -0.5, kind === 'hammer' || kind === 'hook' ? -0.7 : 0.18);
    scene.add(pivot);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivot);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    cam.position.set(c.x, c.y + r * 0.25, c.z + (r * 0.82) / Math.sin((cam.fov * Math.PI) / 360));
    cam.lookAt(c);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    shots.set(kind, canvas.toDataURL('image/png'));
    scene.remove(pivot);
  }
  rt.dispose();
}

/** Render a small head-and-shoulders portrait of each hero with the real model. */
export function makePortraits(renderer: THREE.WebGLRenderer, assets: Assets, size = 160): Map<HeroId, string> {
  const out = new Map<HeroId, string>();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#6a4fc0', 2.2));
  const key = new THREE.DirectionalLight('#fff3dd', 2.4);
  key.position.set(1.5, 2.5, 3);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;

  for (const [id, a] of assets.heroes) {
    const model = skeletonClone(a.scene);
    model.scale.setScalar(a.scale);
    const mixer = new THREE.AnimationMixer(model);
    const idle = a.clips.get('Idle');
    if (idle) {
      mixer.clipAction(idle).play();
      mixer.update(0.4);
    }
    model.rotation.y = 0.35;
    scene.add(model);
    model.updateMatrixWorld(true);
    // frame on the head bone so every hero (big hats, capes) is centred the same way
    const head = new THREE.Vector3(0, 1.25, 0);
    model.getObjectByName('head')?.getWorldPosition(head);
    head.y += 0.12;
    cam.position.set(head.x + 0.35, head.y + 0.2, head.z + 2.3);
    cam.lookAt(head.x, head.y - 0.1, head.z);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    const img = ctx.createImageData(size, size);
    // flip Y
    for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.clearRect(0, 0, size, size);
    const grd = ctx.createRadialGradient(size / 2, size * 0.45, 4, size / 2, size / 2, size * 0.7);
    grd.addColorStop(0, '#9a7bff');
    grd.addColorStop(1, '#3a1f8f');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = size;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0);
    out.set(id, canvas.toDataURL('image/png'));
    scene.remove(model);
  }
  renderer.setClearColor(0x000000, 0);
  renderWeapons(renderer, assets);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;
  rt.dispose();
  return out;
}

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HeroId } from '../../../shared/config/heroes.ts';
import type { Assets } from './assets.ts';

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
    cam.position.set(0.35, 1.45, 2.6);
    cam.lookAt(0, 1.2, 0);
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
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;
  rt.dispose();
  return out;
}

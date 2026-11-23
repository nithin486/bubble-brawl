import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { HeroId } from '../../../shared/config/heroes.ts';

export interface HeroAsset {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  scale: number;
}

export interface Assets {
  heroes: Map<HeroId, HeroAsset>;
  env: Map<string, THREE.Object3D>;
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

function load(url: string, onProgress: (f: number) => void): Promise<GLTF> {
  return new Promise((resolve, reject) =>
    loader.load(url, resolve, (e) => e.total && onProgress(e.loaded / e.total), reject),
  );
}

export async function loadAssets(heroIds: HeroId[], onProgress: (f: number) => void): Promise<Assets> {
  const urls = ['assets/env.glb', ...heroIds.map((h) => `assets/hero_${h}.glb`)];
  const prog = urls.map(() => 0);
  const report = () => onProgress(prog.reduce((a, b) => a + b, 0) / urls.length);
  const results = await Promise.all(
    urls.map((u, i) =>
      load(u, (f) => {
        prog[i] = f;
        report();
      }).then((g) => {
        prog[i] = 1;
        report();
        return g;
      }),
    ),
  );

  const env = new Map<string, THREE.Object3D>();
  results[0].scene.traverse((o) => {
    if (o.name.startsWith('piece_')) env.set(o.name.slice(6), o);
  });
  env.forEach((o) =>
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    }),
  );

  const heroes = new Map<HeroId, HeroAsset>();
  heroIds.forEach((id, i) => {
    const g = results[i + 1];
    const clips = new Map(g.animations.map((c) => [c.name, c]));
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
        m.frustumCulled = false; // skinned bounds are bind-pose only
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.roughness = 0.75;
        mat.metalness = 0;
      }
    });
    // normalise height using the body meshes only (weapons stick out)
    const box = new THREE.Box3();
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh && !/Axe|Knife|Sword|Shield|Staff|Wand|Crossbow|Spellbook|Mug|Throwable/i.test(m.name)) {
        m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
      }
    });
    const h = box.max.y - box.min.y || 2;
    heroes.set(id, { scene: g.scene, clips, scale: 1.8 / h });
  });
  return { heroes, env };
}

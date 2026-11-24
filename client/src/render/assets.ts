import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { HeroId } from '../../../shared/config/heroes.ts';
import { celify } from './style.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface HeroAsset {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  scale: number;
}

export interface Assets {
  heroes: Map<HeroId, HeroAsset>;
  env: Map<string, THREE.Object3D>;
  /** Optional art packs already merged into `env` (see PACKS). */
  packs: Set<string>;
}

/** Map art packs loaded on demand (not at boot): realistic maps keep their plain PBR materials. */
const PACKS: Record<string, string> = { desert: 'assets/env_desert.glb' };

/** Load a map's art pack into assets.env (once). */
export async function loadPack(assets: Assets, name: string, onProgress: (f: number) => void = () => {}) {
  if (assets.packs.has(name) || !PACKS[name]) return;
  const g = await load(PACKS[name], onProgress);
  g.scene.traverse((o) => {
    if (o.name.startsWith('piece_')) assets.env.set(o.name.slice(6), o);
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  assets.packs.add(name);
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

function load(url: string, onProgress: (f: number) => void): Promise<GLTF> {
  return new Promise((resolve, reject) =>
    loader.load(url, resolve, (e) => e.total && onProgress(e.loaded / e.total), reject),
  );
}

/** Packed build (VITE_PACKED=1): every GLB inside one base64 JSON file, for hosts that don't serve .glb. */
async function loadPacked(urls: string[], onProgress: (f: number) => void): Promise<GLTF[]> {
  const res = await fetch('assets/pack.json');
  const total = Number(res.headers.get('content-length')) || 0;
  let text = '';
  if (res.body && total) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      text += dec.decode(value, { stream: true });
      onProgress(Math.min(0.95, got / total));
    }
    text += dec.decode();
  } else text = await res.text();
  const pack = JSON.parse(text) as Record<string, string>;
  return Promise.all(
    urls.map((u) => {
      const bin = Uint8Array.from(atob(pack[u]), (c) => c.charCodeAt(0));
      return loader.parseAsync(bin.buffer, '');
    }),
  ).then((r) => {
    onProgress(1);
    return r;
  });
}

export async function loadAssets(heroIds: HeroId[], onProgress: (f: number) => void): Promise<Assets> {
  const urls = ['assets/env.glb', ...heroIds.map((h) => `assets/hero_${h}.glb`)];
  const prog = urls.map(() => 0);
  const report = () => onProgress(prog.reduce((a, b) => a + b, 0) / urls.length);
  const results = import.meta.env.VITE_PACKED ? await loadPacked(urls, onProgress) : await Promise.all(
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
  const recolored = new Map<THREE.Texture, THREE.Texture>();
  env.forEach((o) =>
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.map && mat.map.name === 'hexagons_medieval') {
        if (!recolored.has(mat.map)) recolored.set(mat.map, greenerGrass(mat.map));
        mat.map = recolored.get(mat.map)!;
      }
    }),
  );

  env.forEach((o) => celify(o));

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
    celify(g.scene);
    // mergeSkinned(g.scene); — disabled: merged skins deformed wrongly (KayKit parts); revisit
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
  return { heroes, env, packs: new Set<string>() };
}

/**
 * KayKit heroes come as ~10 skinned parts (head, arms, legs…) on one skeleton with one atlas material.
 * Merge them into one skinned mesh per material: ~10× fewer draw calls per hero (and per outline/shadow).
 */
export function mergeSkinned(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  // group parts that share a parent and a texture (each KayKit part has its own Skeleton object,
  // but they all point at the same bones)
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const k = (m.parent?.uuid ?? '') + '|' + (mat.map?.uuid ?? mat.color?.getHexString() ?? mat.uuid) + '|' + mat.transparent;
    let list = groups.get(k);
    if (!list) groups.set(k, (list = []));
    list.push(m);
  });
  const ATTRS = ['position', 'normal', 'uv', 'skinWeight'];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const first = list[0];
    if (!list.every((m) => m.matrix.equals(first.matrix) && m.bindMatrix.equals(first.bindMatrix))) continue;
    // one skeleton with every bone any part uses
    const bones: THREE.Bone[] = [];
    const inverses: THREE.Matrix4[] = [];
    const indexOf = new Map<THREE.Bone, number>();
    for (const m of list)
      m.skeleton.bones.forEach((bone, i) => {
        if (indexOf.has(bone)) return;
        indexOf.set(bone, bones.length);
        bones.push(bone);
        inverses.push(m.skeleton.boneInverses[i].clone());
      });
    const geos: THREE.BufferGeometry[] = [];
    let ok = true;
    for (const m of list) {
      const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const g = new THREE.BufferGeometry();
      for (const a of ATTRS) {
        const attr = src.getAttribute(a) as THREE.BufferAttribute | undefined;
        if (!attr) {
          ok = false;
          break;
        }
        const f = new Float32Array(attr.count * attr.itemSize);
        for (let i = 0; i < attr.count; i++) for (let c = 0; c < attr.itemSize; c++) f[i * attr.itemSize + c] = attr.getComponent(i, c);
        g.setAttribute(a, new THREE.BufferAttribute(f, attr.itemSize));
      }
      const si = src.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
      if (!ok || !si) {
        ok = false;
        break;
      }
      // remap this part's joint indices into the shared skeleton
      const idx = new Uint16Array(si.count * 4);
      for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) idx[i * 4 + c] = indexOf.get(m.skeleton.bones[si.getComponent(i, c)]) ?? 0;
      g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
      geos.push(g);
    }
    if (!ok) continue;
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.SkinnedMesh(merged, first.material);
    mesh.name = 'body';
    mesh.position.copy(first.position);
    mesh.quaternion.copy(first.quaternion);
    mesh.scale.copy(first.scale);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    first.parent!.add(mesh);
    mesh.bind(new THREE.Skeleton(bones, inverses), first.bindMatrix);
    for (const m of list) m.parent!.remove(m);
  }
}

/**
 * KayKit's hex atlas paints grass with a lime-yellow swatch (x 0–128, y 512–768 of 1024²).
 * Repaint only that swatch with a richer green so sand, roads and wood keep their colours.
 */
function greenerGrass(tex: THREE.Texture): THREE.Texture {
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  if (!img?.width) return tex;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const sx = img.width / 1024;
  const sy = img.height / 1024;
  const grd = g.createLinearGradient(0, 512 * sy, 0, 768 * sy);
  grd.addColorStop(0, '#86cf4a');
  grd.addColorStop(0.3, '#6dbb40');
  grd.addColorStop(1, '#3a7a33');
  g.fillStyle = grd;
  g.fillRect(0, 512 * sy, 128 * sx, 256 * sy);
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY;
  t.colorSpace = tex.colorSpace;
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  t.magFilter = tex.magFilter;
  t.minFilter = tex.minFilter;
  return t;
}

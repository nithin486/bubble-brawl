import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { addOutlines, celify } from './style.ts';

/**
 * Runtime side of the asset pipeline (scripts/fetch_model.js → assets/models/<name>.glb).
 * Every model goes through `loadModel`, which makes it behave like the hand-picked KayKit assets:
 *  - normalised: centred on x/z, feet on y = 0, scaled to `height` (or `fit` the widest side)
 *  - facing +z (the game's forward) after `yaw`
 *  - cel-shaded + ink outline (the game's look), shadows on
 *  - animations wired: `play('Run')` crossfades, `update(dt)` each frame
 */

export interface ModelOptions {
  /** Target height in metres (default: keep the file's size). */
  height?: number;
  /** Or: scale so the largest side is this many metres. */
  fit?: number;
  /** Extra turn (radians) so the model faces +z. */
  yaw?: number;
  /** Ink outline width in metres (0 = none). Default 0.03. */
  outline?: number;
  castShadow?: boolean;
}

export interface Model {
  /** Add this to the scene; move/rotate it freely (the normalised model sits inside). */
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer | null;
  play(name: string, fade?: number): THREE.AnimationAction | null;
  update(dt: number): void;
  /** Size after normalisation (metres). */
  size: THREE.Vector3;
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }>>();

/** Load (once) and return a fresh, normalised instance. */
export async function loadModel(url: string, opts: ModelOptions = {}): Promise<Model> {
  if (!cache.has(url)) {
    cache.set(
      url,
      loader.loadAsync(url).then((g) => {
        celify(g.scene);
        return { scene: g.scene, clips: g.animations };
      }),
    );
  }
  const src = await cache.get(url)!;
  const inner = skeletonClone(src.scene) as THREE.Group;
  const shadow = opts.castShadow ?? true;
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = shadow;
    m.receiveShadow = true;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
  });

  // normalise: turn, scale, centre, ground
  inner.rotation.y = opts.yaw ?? 0;
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (opts.height && size.y > 0) s = opts.height / size.y;
  else if (opts.fit && size.length() > 0) s = opts.fit / Math.max(size.x, size.y, size.z);
  inner.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  size.multiplyScalar(s);

  const w = opts.outline ?? 0.03;
  if (w > 0) addOutlines(inner, w / s);

  const root = new THREE.Group();
  root.add(inner);
  const mixer = src.clips.length ? new THREE.AnimationMixer(inner) : null;
  let current: THREE.AnimationAction | null = null;
  const model: Model = {
    root,
    clips: src.clips,
    mixer,
    size,
    play(name, fade = 0.15) {
      if (!mixer) return null;
      const clip = src.clips.find((k) => k.name === name) ?? src.clips.find((k) => k.name.toLowerCase().includes(name.toLowerCase()));
      if (!clip) return null;
      const a = mixer.clipAction(clip);
      if (a === current) return a;
      a.reset().play();
      if (current) a.crossFadeFrom(current, fade, false);
      current = a;
      return a;
    },
    update(dt) {
      mixer?.update(dt);
    },
  };
  // idle by default when the model has one
  if (mixer) model.play(src.clips.find((k) => /idle/i.test(k.name))?.name ?? src.clips[0].name);
  return model;
}

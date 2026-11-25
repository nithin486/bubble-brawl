import * as THREE from 'three';

/**
 * Take an object out of the scene and free what it holds on the GPU. Safe for shared resources too:
 * three.js simply uploads a disposed geometry, material or texture again the next time it is drawn.
 */
export function release(root: THREE.Object3D | null | undefined) {
  if (!root) return;
  root.traverse((o) => {
    const m = o as THREE.Mesh & { skeleton?: THREE.Skeleton; dispose?: () => void; isInstancedMesh?: boolean; isBatchedMesh?: boolean };
    if (m.geometry && !(o as THREE.Sprite).isSprite) m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const x of Object.values(u)) if (x.value instanceof THREE.Texture) x.value.dispose();
      mat.dispose();
    }
    m.skeleton?.dispose();
    if (m.isInstancedMesh || m.isBatchedMesh) m.dispose?.();
  });
  root.removeFromParent();
}

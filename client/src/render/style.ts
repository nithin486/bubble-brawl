import * as THREE from 'three';

/**
 * The game's look: cel shading (3 crisp light bands instead of smooth PBR) + dark ink outlines.
 * Cheaper than PBR on phones, and reads like Brawl Stars / Smash Karts instead of "plain low-poly".
 */

/**
 * Look switch. Default 'toy': soft PBR shading (vinyl-toy sheen, env reflections, AO) with no ink lines,
 * like a modern stylized arcade game. ?style=cel = the older cel bands + ink outlines; ?style=old = raw materials.
 */
const STYLE = new URLSearchParams(location.search).get('style');
export const LOOK: 'toy' | 'cel' | 'old' = STYLE === 'cel' ? 'cel' : STYLE === 'old' ? 'old' : 'toy';
export const CEL = LOOK !== 'old';
/** Ink outlines only in the cel look. */
export const INKED = LOOK === 'cel';

/** Toy look: a PBR copy with a soft, slightly glossy plastic finish that picks up the environment map. */
function toyOf(s: THREE.MeshStandardMaterial, hero: boolean): THREE.Material {
  // plain standard material for everything (physical clearcoat/sheen cost too much on phones and caused hitches)
  const m = new THREE.MeshStandardMaterial();
  m.name = s.name;
  m.map = s.map;
  m.color.copy(s.color);
  m.emissive.copy(s.emissive);
  m.emissiveMap = s.emissiveMap;
  m.emissiveIntensity = s.emissiveIntensity;
  m.normalMap = s.normalMap;
  m.roughnessMap = s.roughnessMap;
  m.aoMap = s.aoMap;
  m.transparent = s.transparent;
  m.opacity = s.opacity;
  m.alphaTest = s.alphaTest;
  m.side = s.side;
  m.vertexColors = s.vertexColors;
  m.metalness = Math.min(s.metalness, 0.6);
  // stylized surfaces: never fully matte (no highlight), never mirror-like
  m.roughness = hero ? 0.48 : s.roughnessMap ? s.roughness : THREE.MathUtils.clamp(s.roughness, 0.42, 0.82);
  m.envMapIntensity = hero ? 1.0 : 0.75;
  m.userData.pbr = s;
  return m;
}

let ramp: THREE.DataTexture | null = null;
/** Light ramp: shadow band, mid band, lit band. Shadows stay warm and bright (cartoon, not gritty). */
function gradient() {
  if (ramp) return ramp;
  const steps = [104, 150, 205, 255]; // 4 softer bands: rounder form, still cartoon
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  ramp = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

const cache = new Map<THREE.Material, THREE.Material>();

/** Standard (PBR) material → toon material with the same texture and colours. */
const heroCache = new Map<THREE.Material, THREE.Material>();

export function toonOf(src: THREE.Material, hero = false): THREE.Material {
  if (!CEL) return src;
  const s = src as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial) return src;
  if (LOOK === 'toy') {
    const c = hero ? heroCache : cache;
    let t = c.get(src);
    if (!t) c.set(src, (t = toyOf(s, hero)));
    return t;
  }
  let t = cache.get(src);
  if (!t) {
    const m = new THREE.MeshToonMaterial({
      name: s.name,
      map: s.map,
      color: s.color,
      emissive: s.emissive,
      emissiveMap: s.emissiveMap,
      emissiveIntensity: s.emissiveIntensity,
      transparent: s.transparent,
      opacity: s.opacity,
      alphaTest: s.alphaTest,
      side: s.side,
      vertexColors: s.vertexColors,
      gradientMap: gradient(),
    });
    m.userData.pbr = src;
    cache.set(src, m);
    t = m;
  }
  return t;
}

/** Swap every standard material under `root` for its toon version. */
export function celify(root: THREE.Object3D, hero = false) {
  if (!CEL) return;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map((x) => toonOf(x, hero)) : toonOf(m.material, hero);
  });
}

// ------------------------------------------------------------------ outlines (inverted hull)

const INK = '#1c0f33';

function outlineMaterial(width: number) {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, transparent: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.outlineW = { value: width };
    sh.vertexShader = 'uniform float outlineW;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      // push the hull out along the (skinned) normal; a little more when far away so it never vanishes
      `#ifdef USE_SKINNING
         vec3 oN = normalize(objectNormal);
       #else
         vec3 oN = normalize(normal);
       #endif
       vec4 oMv = modelViewMatrix * vec4(transformed, 1.0);
       transformed += oN * outlineW * clamp(-oMv.z / 7.0, 1.0, 2.2);
       #include <project_vertex>`,
    );
  };
  m.customProgramCacheKey = () => 'outline' + width;
  return m;
}

/**
 * Add an ink outline to every mesh under `root` (skinned meshes follow their skeleton).
 * `width` is in the mesh's own units. Returns the outline materials (for fading).
 */
export function addOutlines(root: THREE.Object3D, width: number): THREE.MeshBasicMaterial[] {
  if (!INKED) return [];
  const mats: THREE.MeshBasicMaterial[] = [];
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.outline && m.visible) meshes.push(m);
  });
  for (const m of meshes) {
    const mat = outlineMaterial(width);
    let hull: THREE.Mesh;
    const sk = m as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) {
      const s = new THREE.SkinnedMesh(sk.geometry, mat);
      s.bind(sk.skeleton, sk.bindMatrix);
      s.frustumCulled = false;
      hull = s;
    } else hull = new THREE.Mesh(m.geometry, mat);
    if (!hull.geometry.attributes.normal) continue;
    hull.userData.outline = true;
    hull.castShadow = false;
    hull.receiveShadow = false;
    // child of the mesh with no offset: same transform, and hidden weapons hide their outline too
    m.add(hull);
    mats.push(mat);
  }
  return mats;
}

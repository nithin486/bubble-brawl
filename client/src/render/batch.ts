import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CEL } from './style.ts';

/**
 * Draw-call diet for low-end phones.
 *  - StaticBatch: many small props → one mesh per material (+ one outline mesh), rebuilt only when
 *    a tile falls in the finale (its props are taken out so they can fall on their own).
 *  - "See-through": geometry between the camera and your hero is dithered away in the shader,
 *    so one merged mesh can still clear the view (no per-object fading).
 *  - GlowField: every lamp/candle glow in one Points draw call.
 */

// ------------------------------------------------------------------ see-through (screen-door)

export const SEE = {
  seeCam: { value: new THREE.Vector3() },
  seeFocus: { value: new THREE.Vector3() },
  seeOn: { value: 0 },
  seeR: { value: 1.5 },
};

const SEE_VERT_HEAD = 'varying vec3 vSeeWP;\n';
const SEE_VERT = 'vSeeWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n';
const SEE_FRAG_HEAD = 'varying vec3 vSeeWP; uniform vec3 seeCam; uniform vec3 seeFocus; uniform float seeOn; uniform float seeR;\n';
const SEE_FRAG = `
  if (seeOn > 0.5 && vSeeWP.y > 0.3 && vSeeWP.y < seeFocus.y + 5.0) {
    vec2 sa = seeCam.xz; vec2 sab = seeFocus.xz - sa;
    float st = clamp(dot(vSeeWP.xz - sa, sab) / max(dot(sab, sab), 1e-4), 0.0, 1.0);
    float sd = length(vSeeWP.xz - (sa + sab * st));
    if (st > 0.02 && st < 0.96 && sd < seeR) {
      vec2 sq = mod(floor(gl_FragCoord.xy), 2.0);
      if (sq.x + sq.y > 0.5) discard; // keep 1 pixel in 4: you see through, the object is still hinted
    }
  }
`;

function addSeeThrough(sh: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(sh.uniforms, SEE);
  sh.vertexShader = SEE_VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + SEE_VERT);
  sh.fragmentShader = SEE_FRAG_HEAD + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + SEE_FRAG);
}

const seeCache = new Map<THREE.Material, THREE.Material>();
/** A copy of `src` that dithers away where it blocks the camera's view of the hero. */
export function seeThroughOf(src: THREE.Material): THREE.Material {
  let m = seeCache.get(src);
  if (!m) {
    m = src.clone();
    m.transparent = false;
    (m as THREE.MeshStandardMaterial).opacity = 1;
    m.onBeforeCompile = addSeeThrough;
    m.customProgramCacheKey = () => 'see' + src.type + (src.transparent ? 't' : '') + ((src as THREE.MeshLambertMaterial).alphaTest ?? 0);
    if (src.transparent) {
      m.transparent = true;
      m.depthWrite = false;
    }
    seeCache.set(src, m);
  }
  return m;
}

const INK = '#1c0f33';
/** Outline for already world-scaled merged geometry: width in metres. */
function batchOutline(width: number) {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.outlineW = { value: width };
    sh.vertexShader =
      'uniform float outlineW;\n' +
      sh.vertexShader.replace(
        '#include <project_vertex>',
        `vec4 oMv = modelViewMatrix * vec4(transformed, 1.0);
         transformed += normalize(normal) * outlineW * clamp(-oMv.z / 7.0, 1.0, 2.2);
         #include <project_vertex>`,
      );
    addSeeThrough(sh);
  };
  m.customProgramCacheKey = () => 'batch-outline' + width;
  return m;
}

// ------------------------------------------------------------------ baking

export interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  shadow: boolean;
}

/** Plain float, non-indexed position/normal/uv — every part can be merged with every other. */
function plain(src: THREE.BufferGeometry, m: THREE.Matrix4) {
  let g = src.index ? src.toNonIndexed() : src.clone();
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
    const size = name === 'uv' ? 2 : 3;
    const f = new Float32Array(g.getAttribute('position').count * size);
    if (a) for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) f[i * size + k] = a.getComponent(i, k);
    out.setAttribute(name, new THREE.BufferAttribute(f, size));
  }
  if (!g.getAttribute('normal')) out.computeVertexNormals();
  out.applyMatrix4(m);
  g = out;
  return g;
}

/** World-space parts of every visible mesh under `root` (root must be in its final place). */
export function bakeParts(root: THREE.Object3D, shadow: boolean, relativeTo?: THREE.Matrix4): Part[] {
  root.updateMatrixWorld(true);
  const parts: Part[] = [];
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (mesh.userData.outline) return;
    const m = relativeTo ? new THREE.Matrix4().multiplyMatrices(relativeTo, mesh.matrixWorld) : mesh.matrixWorld;
    parts.push({ geo: plain(mesh.geometry, m), mat: mesh.material as THREE.Material, shadow: shadow && mesh.castShadow !== false });
  });
  return parts;
}

/** Merge parts → one mesh per (material, shadow). */
export function mergeParts(parts: Part[], seeThrough: boolean): THREE.Mesh[] {
  const buckets = new Map<string, Part[]>();
  for (const p of parts) {
    const k = p.mat.uuid + (p.shadow ? 's' : '');
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = []));
    b.push(p);
  }
  const meshes: THREE.Mesh[] = [];
  for (const list of buckets.values()) {
    const geo = list.length === 1 ? list[0].geo.clone() : mergeGeometries(list.map((p) => p.geo));
    if (!geo) continue;
    const src = list[0].mat;
    const mesh = new THREE.Mesh(geo, seeThrough ? seeThroughOf(src) : src);
    mesh.castShadow = list[0].shadow;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  return meshes;
}

// ------------------------------------------------------------------ props batch

export interface BatchItem {
  parts: Part[];
  outline: boolean;
  /** In the merged mesh (false while its tile is falling / gone). */
  on: boolean;
}

export class StaticBatch {
  group = new THREE.Group();
  items: BatchItem[] = [];
  private dirty = true;
  private outlineMat = batchOutline(0.035);

  add(parts: Part[], outline: boolean): BatchItem {
    const it = { parts, outline, on: true };
    this.items.push(it);
    this.dirty = true;
    return it;
  }

  set(it: BatchItem, on: boolean) {
    if (it.on === on) return;
    it.on = on;
    this.dirty = true;
  }

  /** Rebuild the merged meshes if anything changed (cheap: a few ms, only on finale tile falls). */
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    for (const c of [...this.group.children]) {
      (c as THREE.Mesh).geometry.dispose();
      this.group.remove(c);
    }
    const live = this.items.filter((i) => i.on);
    for (const m of mergeParts(live.flatMap((i) => i.parts), true)) this.group.add(m);
    if (CEL) {
      const ink = live.filter((i) => i.outline).flatMap((i) => i.parts.filter((p) => (p.mat as THREE.Material & { alphaTest?: number }).alphaTest === 0 && !p.mat.transparent));
      if (ink.length) {
        const geo = mergeGeometries(ink.map((p) => p.geo));
        if (geo) this.group.add(new THREE.Mesh(geo, this.outlineMat));
      }
    }
  }
}

// ------------------------------------------------------------------ glows

const MAX_GLOWS = 256;

/** All small glows (lamps, candles, police lights) in one additive Points draw call. */
export class GlowField {
  points: THREE.Points;
  private pos = new Float32Array(MAX_GLOWS * 3);
  private col = new Float32Array(MAX_GLOWS * 3);
  private size = new Float32Array(MAX_GLOWS);
  private base: { x: number; y: number; z: number; s: number }[] = [];
  private n = 0;

  constructor(tex: THREE.Texture) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { map: { value: tex }, scale: { value: 1 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
          // fade out up close so a lamp next to the camera never fogs the screen
          vA = clamp((d - size * 0.6) / (size * 1.2 + 2.0), 0.0, 1.0) * 0.85;
          vC = color; gl_PointSize = size * scale / max(d, 0.1); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.onBeforeRender = (r, _s, cam) => {
      const c = cam as THREE.PerspectiveCamera;
      // world size → pixels: half the viewport height / tan(fov/2)
      const h = r.getDrawingBufferSize(new THREE.Vector2()).y;
      mat.uniforms.scale.value = h / (2 * Math.tan(((c.fov ?? 50) * Math.PI) / 360));
    };
  }

  /** Returns an id for `move`. */
  add(color: string, size: number, x: number, y: number, z: number): number {
    if (this.n >= MAX_GLOWS) return -1;
    const i = this.n++;
    const c = new THREE.Color(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.base.push({ x, y, z, s: size });
    this.move(i, 0, 0, 0, true);
    this.points.geometry.setDrawRange(0, this.n);
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    return i;
  }

  /** Offset a glow from its base (dy for falling tiles); hidden glows get size 0. */
  move(i: number, dx: number, dy: number, dz: number, visible: boolean) {
    if (i < 0) return;
    const b = this.base[i];
    this.pos.set([b.x + dx, b.y + dy, b.z + dz], i * 3);
    this.size[i] = visible ? b.s : 0;
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
  }
}

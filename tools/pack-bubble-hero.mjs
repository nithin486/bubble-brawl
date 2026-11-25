// Packs the Blender export of the Bubble Ranger into client/public/assets/hero_ranger.glb
// (same treatment as the KayKit heroes: rest-channel strip, quantize, meshopt) + shrinks the atlas to WebP.
// Run: node tools/pack-bubble-hero.mjs [--tex 1024]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'assets/characters/bubble_hero/export/bubble_hero_raw.glb');
const dst = path.join(root, 'assets/characters/bubble_hero/hero_ranger.glb'); // committed; tools/build-assets.mjs copies it into client/public/assets
const pub = path.join(root, 'client/public/assets/hero_ranger.glb');
const texArg = process.argv.indexOf('--tex');
const TEX = texArg > 0 ? +process.argv[texArg + 1] : 1024;

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const r = doc.getRoot();

// texture -> WebP
for (const t of r.listTextures()) {
  const buf = await sharp(Buffer.from(t.getImage())).blur(1.3).resize(TEX, TEX, { fit: 'fill' }).webp({ quality: 86, effort: 5 }).toBuffer();
  t.setImage(new Uint8Array(buf)).setMimeType('image/webp');
}
// glTF exporter leaves PBR defaults of metallic 1 on some materials; the cel look wants dielectric
for (const m of r.listMaterials()) {
  m.setMetallicFactor(0);
  m.setRoughnessFactor(Math.max(0.55, m.getRoughnessFactor()));
}

await doc.transform(resample({ tolerance: 0.0005 }));
let removed = 0;
for (const anim of r.listAnimations()) {
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode();
    const p = ch.getTargetPath();
    const out = ch.getSampler().getOutput().getArray();
    const n = p === 'rotation' ? 4 : 3;
    const rest = p === 'translation' ? node.getTranslation() : p === 'rotation' ? node.getRotation() : node.getScale();
    let still = true;
    for (let i = 0; i < out.length && still; i++) if (Math.abs(out[i] - rest[i % n]) > 1e-3) still = false;
    if (still) { const s = ch.getSampler(); ch.dispose(); s.dispose(); removed++; }
  }
}
for (const acc of r.listAccessors()) if (acc.listParents().every((p) => p.propertyType === 'Root')) acc.dispose();
await doc.transform(
  weld(), dedup(), prune({ keepLeaves: false }),
  quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
fs.mkdirSync(path.dirname(dst), { recursive: true });
await io.write(dst, doc);
fs.mkdirSync(path.dirname(pub), { recursive: true });
fs.copyFileSync(dst, pub);
const tris = r.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log(`hero_ranger.glb ${(fs.statSync(dst).size / 1024).toFixed(0)} KB · ${r.listAnimations().length} clips · ${Math.round(tris)} tris · ${r.listMaterials().length} materials · texture ${TEX}px webp · ${removed} rest channels dropped`);
console.log('clips:', r.listAnimations().map((a) => a.getName()).join(', '));

// Compresses Blender-exported GLBs in place (weld, dedup, prune, quantize, meshopt). Usage: node tools/opt-glb.mjs file.glb [file2.glb ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, quantize, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const before = fs.statSync(f).size;
  const doc = await io.read(f);
  await doc.transform(weld(), dedup(), prune({ keepLeaves: false }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(f, doc);
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  console.log(`${f.split(/[\/]/).pop()}: ${(before / 1024).toFixed(0)} KB -> ${(fs.statSync(f).size / 1024).toFixed(0)} KB, ${Math.round(tris)} tris`);
}

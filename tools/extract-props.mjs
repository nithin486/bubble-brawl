// Pulls single weapon props out of the KayKit character packs into small standalone GLBs (assets/props/*.glb).
// Each file keeps the prop's local pose relative to its hand slot, so it can be parented to `handslot.r` of ANY hero
// (they all share one rig). Run once: node tools/extract-props.mjs   (output is committed; build-assets merges it into env.glb)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
// [source model, node name, output name]
const PROPS = [
  ['Rogue', '1H_Crossbow', 'weap_blaster'],
  ['Rogue', '2H_Crossbow', 'weap_launcher'],
  ['Rogue', 'Throwable', 'weap_bomb'],
  ['Mage', '1H_Wand', 'weap_wand'],
  ['Barbarian', '2H_Axe', 'weap_axe'],
];
for (const [model, nodeName, out] of PROPS) {
  const doc = await io.read(path.join(root, 'assets/heroes', `${model}.glb`));
  const r = doc.getRoot();
  const target = r.listNodes().find((n) => n.getName() === nodeName && n.getMesh());
  if (!target) throw new Error(`${model}: no node ${nodeName}`);
  const scene = r.listScenes()[0];
  target.getParentNode()?.removeChild(target); // keeps its local translation / rotation (pose relative to the hand slot)
  for (const c of scene.listChildren()) scene.removeChild(c);
  scene.addChild(target);
  target.setSkin(null);
  for (const n of r.listNodes()) if (n !== target) n.dispose();
  for (const s of r.listSkins()) s.dispose();
  for (const a of r.listAnimations()) {
    for (const ch of a.listChannels()) ch.dispose();
    for (const smp of a.listSamplers()) smp.dispose();
    a.dispose();
  }
  for (const acc of r.listAccessors()) if (acc.listParents().every((p) => p.propertyType === 'Root')) acc.dispose(); // orphaned animation data
  await doc.transform(prune());
  const file = path.join(root, 'assets/props', `${out}.glb`);
  await io.write(file, doc);
  console.log(out.padEnd(14), (fs.statSync(file).size / 1024).toFixed(0), 'KB', r.listTextures().map((t) => t.getSize()?.join('x')).join(','));
}

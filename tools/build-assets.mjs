// Builds the compressed game assets into client/public/assets.
//  - heroes: strip unused props + animations, quantize, meshopt-compress
//  - env: merge KayKit environment pieces into one env.glb (one request)
// Run: npm run assets   (skips work when outputs are newer than inputs; pass --force to rebuild)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, meshopt, weld, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import { HEROES, KEEP_ANIMS } from '../shared/config/heroes.ts';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'client/public/assets');
fs.mkdirSync(out, { recursive: true });
const force = process.argv.includes('--force');

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const fresh = (target, inputs) =>
  !force && fs.existsSync(target) && inputs.every((i) => fs.statSync(i).mtimeMs < fs.statSync(target).mtimeMs);

/** Drop animation channels that never move away from the node's rest pose (~75% of KayKit channels). */
function stripRestChannels(doc) {
  let removed = 0;
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode();
      const path = ch.getTargetPath();
      const out = ch.getSampler().getOutput().getArray();
      const n = path === 'rotation' ? 4 : 3;
      const rest = path === 'translation' ? node.getTranslation() : path === 'rotation' ? node.getRotation() : node.getScale();
      let still = true;
      for (let i = 0; i < out.length && still; i++) if (Math.abs(out[i] - rest[i % n]) > 1e-3) still = false;
      if (still) {
        const s = ch.getSampler();
        ch.dispose();
        s.dispose();
        removed++;
      }
    }
  }
  return removed;
}

async function compress(doc, file) {
  await doc.transform(resample({ tolerance: 0.0005 }));
  stripRestChannels(doc);
  // prune() leaves orphaned animation accessors behind here; drop them explicitly.
  for (const acc of doc.getRoot().listAccessors()) {
    if (acc.listParents().every((p) => p.propertyType === 'Root')) acc.dispose();
  }
  await doc.transform(
    weld(),
    dedup(),
    prune({ keepLeaves: false }),
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(file, doc);
  return fs.statSync(file).size;
}

// ---------- heroes ----------
for (const hero of Object.values(HEROES)) {
  if (hero.external) {
    // custom hero: packed by its own script (tools/pack-bubble-hero.mjs) into assets/characters/<name>/hero_<id>.glb
    const packed = path.join(root, 'assets/characters', hero.model, `hero_${hero.id}.glb`);
    if (fs.existsSync(packed)) fs.copyFileSync(packed, path.join(out, `hero_${hero.id}.glb`));
    else console.warn(`missing ${packed}: run node tools/pack-bubble-hero.mjs`);
    continue;
  }
  const src = path.join(root, 'assets/heroes', `${hero.model}.glb`);
  const dst = path.join(out, `hero_${hero.id}.glb`);
  if (fresh(dst, [src, path.join(root, 'shared/config/heroes.ts')])) continue;
  const doc = await io.read(src);
  const r = doc.getRoot();
  for (const node of r.listNodes()) if (hero.hide.includes(node.getName())) node.dispose();
  const keep = new Set(KEEP_ANIMS);
  for (const a of r.listAnimations()) {
    if (keep.has(a.getName())) continue;
    // Dispose samplers + their accessors too, or they stay in the file as orphans.
    for (const ch of a.listChannels()) ch.dispose();
    for (const smp of a.listSamplers()) smp.dispose();
    a.dispose();
  }
  const size = await compress(doc, dst);
  console.log(`hero ${hero.id.padEnd(8)} ${(size / 1024).toFixed(0)} KB, ${r.listAnimations().length} clips`);
}

// ---------- environment ----------
const ENV = {
  // every KayKit hex-pack piece we downloaded into assets/env/hex
  hex: fs
    .readdirSync(path.join(root, 'assets/env/hex'))
    .filter((f) => f.endsWith('.gltf'))
    .sort()
    .map((f) => [f.slice(0, -5), path.join(root, 'assets/env/hex', f)]),
  city: fs
    .readdirSync(path.join(root, 'assets/env/city'))
    .filter((f) => f.endsWith('.gltf'))
    .sort()
    .map((f) => [f.slice(0, -5), path.join(root, 'assets/env/city', f)]),
  spooky: fs
    .readdirSync(path.join(root, 'assets/env/spooky'))
    .filter((f) => f.endsWith('.gltf'))
    .sort()
    .map((f) => [f.slice(0, -5), path.join(root, 'assets/env/spooky', f)]),
  // Candy Town: own Blender tiles + CC0 sweets, processed by scripts/fetch_model.js (assets/models/candy_*.glb)
  candy: fs
    .readdirSync(path.join(root, 'assets/models'))
    .filter((f) => f.startsWith('candy_') && f.endsWith('.glb'))
    .sort()
    .map((f) => [f.slice(0, -4), path.join(root, 'assets/models', f)]),
  // held weapons (tools/extract-props.mjs) + the banana from assets/models
  props: [
    ...fs
      .readdirSync(path.join(root, 'assets/props'))
      .filter((f) => f.endsWith('.glb'))
      .sort()
      .map((f) => [f.slice(0, -4), path.join(root, 'assets/props', f)]),
    ['weap_banana', path.join(root, 'assets/models/banana.glb')],
    ['weap_hammer', path.join(root, 'assets/models/weap_hammer.glb')],
    ['weap_hook', path.join(root, 'assets/models/weap_hook.glb')],
    ['weap_bubblegun', path.join(root, 'assets/models/weap_bubblegun.glb')],
    ['weap_rocketl', path.join(root, 'assets/models/weap_rocketl.glb')],
    ['weap_icebomb', path.join(root, 'assets/models/weap_icebomb.glb')],
    ['mystery_cube', path.join(root, 'assets/models/mystery_cube.glb')],
  ],
  dungeon: [
    ['coin', path.join(root, 'assets/env/dungeon/coin.gltf.glb')],
    ['coin_stack', path.join(root, 'assets/env/dungeon/coin_stack_small.gltf.glb')],
    ['chest_gold', path.join(root, 'assets/env/dungeon/chest_gold.glb')],
    ['torch_lit', path.join(root, 'assets/env/dungeon/torch_lit.gltf.glb')],
  ],
};
const envInputs = [...ENV.hex, ...ENV.city, ...ENV.spooky, ...ENV.candy, ...ENV.props, ...ENV.dungeon];
{
  const seen = new Set();
  for (const [n] of envInputs) {
    if (seen.has(n)) throw new Error(`duplicate env piece name: ${n}`);
    seen.add(n);
  }
}
async function mergeEnv(inputs, envDst, label) {
  // rebuild when any input is newer, OR the set of pieces / their sizes changed (renamed or deleted files keep old mtimes)
  const sig = inputs.map(([n, f]) => `${n}:${fs.statSync(f).size}`).join('\n');
  const sigFile = `${envDst}.sig`;
  const sameSet = fs.existsSync(sigFile) && fs.readFileSync(sigFile, 'utf8') === sig;
  if (sameSet && fresh(envDst, inputs.map((e) => e[1]))) return;
  fs.writeFileSync(sigFile, sig);
  {
    const doc = await io.read(inputs[0][1]);
    // Give every piece a single named root node "piece_<name>" in one scene.
    const nameRoot = (d, name) => {
      const scene = d.getRoot().listScenes()[0];
      const holder = d.createNode(`piece_${name}`);
      for (const child of scene.listChildren()) {
        scene.removeChild(child);
        holder.addChild(child);
      }
      scene.addChild(holder);
    };
    nameRoot(doc, inputs[0][0]);
    const mainScene = doc.getRoot().listScenes()[0];
    for (const [name, file] of inputs.slice(1)) {
      const other = await io.read(file);
      nameRoot(other, name);
      const map = mergeDocuments(doc, other);
      const otherScene = map.get(other.getRoot().listScenes()[0]);
      for (const child of otherScene.listChildren()) {
        otherScene.removeChild(child);
        mainScene.addChild(child);
      }
      otherScene.dispose();
    }
    await doc.transform(unpartition());
    const size = await compress(doc, envDst);
    console.log(`${label} ${(size / 1024).toFixed(0)} KB, ${inputs.length} pieces`);
  }
}
await mergeEnv(envInputs, path.join(out, 'env.glb'), 'env');
// Desert Outpost: realistic scanned props + PBR ground tiles, loaded only when that map is chosen
const desertInputs = fs
  .readdirSync(path.join(root, 'assets/models'))
  .filter((f) => f.startsWith('desert_') && f.endsWith('.glb'))
  .sort()
  .map((f) => [f.slice(0, -4), path.join(root, 'assets/models', f)]);
if (desertInputs.length) await mergeEnv(desertInputs, path.join(out, 'env_desert.glb'), 'env_desert');
// Bubblegum Islands: own Blender pieces (assets/models/bg_*.glb), loaded only when that map is chosen
const bgInputs = fs
  .readdirSync(path.join(root, 'assets/models'))
  .filter((f) => f.startsWith('bg_') && f.endsWith('.glb'))
  .sort()
  .map((f) => [f.slice(0, -4), path.join(root, 'assets/models', f)]);
if (bgInputs.length) await mergeEnv(bgInputs, path.join(out, 'env_bubblegum.glb'), 'env_bubblegum');
// Models fetched by scripts/fetch_model.js are already game-ready: copy them as they are.
const modelsSrc = path.join(root, 'assets/models');
if (fs.existsSync(modelsSrc)) {
  const dst = path.join(out, 'models');
  fs.mkdirSync(dst, { recursive: true });
  const glbs = fs.readdirSync(modelsSrc).filter((f) => f.endsWith('.glb') && !f.startsWith('desert_') && !f.startsWith('bg_')); // map pieces ship inside env_desert.glb / env_bubblegum.glb
  for (const f of glbs) if (!fresh(path.join(dst, f), [path.join(modelsSrc, f)])) fs.copyFileSync(path.join(modelsSrc, f), path.join(dst, f));
  if (glbs.length) console.log(`models ${glbs.length} → assets/models`);
}
console.log('assets ok →', path.relative(root, out));

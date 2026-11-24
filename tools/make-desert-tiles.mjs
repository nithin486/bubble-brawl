// Builds the Desert Outpost ground tiles (assets/models/desert_tile_*.glb) from Poly Haven CC0 PBR textures.
// A tile is a 4.8 m ground slab (top at y = 0, 1.2 m deep): realistic photo-scanned surface on top, weathered rock on the sides.
// The arena view re-maps the top surface to world coordinates, so neighbouring tiles of one type join into one continuous ground.
// Run: node tools/make-desert-tiles.mjs   (output is committed; credits go to assets/models/CREDITS.md)
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'assets/models');
const S = 4.8;
const D = 1.2;
const TILES = {
  sand: 'sandy_gravel_02',
  pale: 'dense_sand',
  gravel: 'rocky_trail',
  yard: 'concrete_floor_02',
  road: 'concrete_floor_01',
};
const SIDE = 'rock_boulder_dry';

async function tex(id) {
  const j = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const get = async (k) => {
    const u = j[k]?.['1k']?.jpg?.url;
    if (!u) return null;
    const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
    return sharp(buf).resize(512, 512).webp({ quality: 80 }).toBuffer();
  };
  return { diff: await get('Diffuse'), nor: await get('nor_gl') };
}

function quad(pos, nor, uv, idx, p, n, ur) {
  const base = pos.length / 3;
  for (const v of p) pos.push(...v);
  for (let i = 0; i < 4; i++) nor.push(...n);
  const uvs = [[0, 0], [ur, 0], [ur, ur], [0, ur]];
  for (const u of uvs) uv.push(...u);
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const rock = await tex(SIDE);
const credits = [];
for (const [name, id] of Object.entries(TILES)) {
  const top = await tex(id);
  const doc = new Document();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const buf = doc.createBuffer();
  const mk = (t, rough) => {
    const m = doc.createMaterial().setRoughnessFactor(rough).setMetallicFactor(0);
    m.setBaseColorTexture(doc.createTexture().setImage(t.diff).setMimeType('image/webp'));
    if (t.nor) m.setNormalTexture(doc.createTexture().setImage(t.nor).setMimeType('image/webp'));
    return m;
  };
  const mTop = mk(top, 0.95);
  const h = S / 2;
  // top face
  const tp = [], tn = [], tu = [], ti = [];
  quad(tp, tn, tu, ti, [[-h, 0, h], [h, 0, h], [h, 0, -h], [-h, 0, -h]], [0, 1, 0], 2);
  // four sides
  const sp = [], sn = [], su = [], si = [];
  quad(sp, sn, su, si, [[-h, -D, h], [h, -D, h], [h, 0, h], [-h, 0, h]], [0, 0, 1], 1);
  quad(sp, sn, su, si, [[h, -D, -h], [-h, -D, -h], [-h, 0, -h], [h, 0, -h]], [0, 0, -1], 1);
  quad(sp, sn, su, si, [[h, -D, h], [h, -D, -h], [h, 0, -h], [h, 0, h]], [1, 0, 0], 1);
  quad(sp, sn, su, si, [[-h, -D, -h], [-h, -D, h], [-h, 0, h], [-h, 0, -h]], [-1, 0, 0], 1);
  const prim = (p, n, u, i, mat) =>
    doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(p)).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(n)).setBuffer(buf))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(u)).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(i)).setBuffer(buf))
      .setMaterial(mat);
  const mesh = doc.createMesh(`desert_tile_${name}`).addPrimitive(prim(tp, tn, tu, ti, mTop)).addPrimitive(prim(sp, sn, su, si, mTop));
  const node = doc.createNode(`desert_tile_${name}`).setMesh(mesh);
  doc.createScene().addChild(node);
  const file = path.join(out, `desert_tile_${name}.glb`);
  await new NodeIO().registerExtensions([EXTTextureWebP]).write(file, doc);
  fs.writeFileSync(
    path.join(out, `desert_tile_${name}.json`),
    JSON.stringify({ name: `desert_tile_${name}`, title: `Desert tile (${id})`, source: 'polyhaven', author: 'Poly Haven', licence: 'CC0', link: `https://polyhaven.com/a/${id}`, needsCredit: false, textures: [id], dimensions: [S, D, S] }, null, 2),
  );
  credits.push(`${name}: ${id}`);
  console.log(name.padEnd(9), id.padEnd(24), (fs.statSync(file).size / 1024).toFixed(0), 'KB');
}
// the rock block under the ground (falls with each tile; stacked into the mesa's core)
{
  const doc = new Document();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const buf = doc.createBuffer();
  const m = doc.createMaterial().setRoughnessFactor(0.95).setMetallicFactor(0);
  m.setBaseColorTexture(doc.createTexture().setImage(rock.diff).setMimeType('image/webp'));
  if (rock.nor) m.setNormalTexture(doc.createTexture().setImage(rock.nor).setMimeType('image/webp'));
  const w = 4.4 / 2;
  const H = 2.6;
  const p = [], n = [], u = [], i = [];
  const f = (a) => quad(p, n, u, i, a[0], a[1], 1);
  f([[[-w, 0, w], [w, 0, w], [w, H, w], [-w, H, w]], [0, 0, 1]]);
  f([[[w, 0, -w], [-w, 0, -w], [-w, H, -w], [w, H, -w]], [0, 0, -1]]);
  f([[[w, 0, w], [w, 0, -w], [w, H, -w], [w, H, w]], [1, 0, 0]]);
  f([[[-w, 0, -w], [-w, 0, w], [-w, H, w], [-w, H, -w]], [-1, 0, 0]]);
  f([[[-w, 0, -w], [w, 0, -w], [w, 0, w], [-w, 0, w]], [0, -1, 0]]);
  f([[[-w, H, w], [w, H, w], [w, H, -w], [-w, H, -w]], [0, 1, 0]]);
  const acc = (t, a, Arr) => doc.createAccessor().setType(t).setArray(new Arr(a)).setBuffer(buf);
  const prim = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', p, Float32Array)).setAttribute('NORMAL', acc('VEC3', n, Float32Array)).setAttribute('TEXCOORD_0', acc('VEC2', u, Float32Array)).setIndices(acc('SCALAR', i, Uint16Array)).setMaterial(m);
  const mesh = doc.createMesh('desert_under').addPrimitive(prim);
  doc.createScene().addChild(doc.createNode('desert_under').setMesh(mesh));
  const file = path.join(out, 'desert_under.glb');
  await new NodeIO().registerExtensions([EXTTextureWebP]).write(file, doc);
  fs.writeFileSync(path.join(out, 'desert_under.json'), JSON.stringify({ name: 'desert_under', title: 'Desert rock block', source: 'polyhaven', author: 'Poly Haven', licence: 'CC0', link: `https://polyhaven.com/a/${SIDE}`, needsCredit: false, dimensions: [4.4, H, 4.4] }, null, 2));
  console.log('under     ', SIDE.padEnd(24), (fs.statSync(file).size / 1024).toFixed(0), 'KB');
}

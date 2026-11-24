#!/usr/bin/env node
// Find, download and make game-ready a free 3D model.
//
//   node scripts/fetch_model.js "wooden crate"
//   npm run model -- "rock" --height 1.2 --style any
//
// Sources (commercial-safe only):
//   • Poly Haven (CC0, no key)              api.polyhaven.com
//   • Sketchfab (CC0 / CC-BY, needs key)    api.sketchfab.com — SKETCHFAB_API_KEY in .env
//
// Output (all under assets/models/):
//   <name>.glb          game-ready: centred on x/z, standing on y=0, optional height, textures
//                       resized + WebP, meshopt-compressed. Served to the game at assets/models/<name>.glb
//   <name>.json         source, author, licence, link, triangles, size, bounds, animations
//   CREDITS.md          attribution list (CC-BY needs credit in the game's credits screen)
//   _raw/<name>/        the untouched download (git-ignored)
//
// Options:
//   --source auto|polyhaven|sketchfab   (default auto: search both, best score wins)
//   --style stylized|realistic|any      (default stylized: this game is cartoon low-poly, Poly Haven is photoreal)
//   --max-tris 15000   triangle budget (low-end phones)
//   --tex 512          max texture size in px
//   --height <m>       scale so the model is this tall (default: keep real-world size)
//   --rotate-y <deg>   turn the model so it faces +z (the game's forward)
//   --name <slug>      output file name (default from the search words)
//   --pick <n>         take the n-th ranked result instead of the best (1 = best)
//   --list             only print the ranked candidates, download nothing
//   --force            overwrite an existing model of the same name

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, meshopt, textureCompress, getBounds, unpartition, flatten, join, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const MODELS = path.join(ROOT, 'assets/models');
const RAW = path.join(MODELS, '_raw');
const UA = { 'User-Agent': 'bubble-brawl-asset-pipeline/1.0' };

// ------------------------------------------------------------------ args & env

function parseArgs(argv) {
  const o = { source: 'auto', style: 'stylized', maxTris: 15000, tex: 512, height: 0, rotateY: 0, name: '', pick: 1, list: false, force: false, query: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === '--source') o.source = v();
    else if (a === '--style') o.style = v();
    else if (a === '--max-tris') o.maxTris = Number(v());
    else if (a === '--tex') o.tex = Number(v());
    else if (a === '--height') o.height = Number(v());
    else if (a === '--rotate-y') o.rotateY = Number(v());
    else if (a === '--name') o.name = v();
    else if (a === '--pick') o.pick = Number(v());
    else if (a === '--list') o.list = true;
    else if (a === '--force') o.force = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else o.query.push(a);
  }
  o.q = o.query.join(' ').trim();
  return o;
}

function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'model';
const words = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function getJSON(url, headers = {}) {
  const r = await fetch(url, { headers: { ...UA, ...headers } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url.replace(/\?.*/, '')}`);
  return r.json();
}

async function download(url, file, headers = {}, expect = 0) {
  // retry: big files through proxies sometimes arrive cut short
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { ...UA, ...headers } });
      if (!r.ok) throw new Error(`download failed ${r.status} — ${url.replace(/\?.*/, '')}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (expect && buf.length !== expect) throw new Error(`incomplete download (${buf.length} of ${expect} bytes) — ${path.basename(file)}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      return buf.length;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((res) => setTimeout(res, 800 * attempt));
    }
  }
}

/** How well a name + tags match the search words (0..1). */
function textScore(q, name, tags) {
  const qw = words(q);
  if (!qw.length) return 0;
  const nw = new Set(words(name));
  const tw = new Set(tags.flatMap((t) => words(t)));
  let s = 0;
  for (const w of qw) {
    const stem = w.replace(/(es|s)$/, '');
    const hit = (set) => [...set].some((x) => x === w || x.replace(/(es|s)$/, '') === stem);
    if (hit(nw)) s += 1;
    else if (hit(tw)) s += 0.6;
  }
  return s / qw.length;
}

const BRANDS = /mario|nintendo|wii\b|zelda|pok[eé]mon|roblox|minecraft|fortnite|gorilla ?tag|brainrot|sonic|disney|marvel|star ?wars|halo\b|overwatch|valorant|league of legends|call of duty|gta\b|rockstar|sega\b|playstation|xbox|smash ?karts|brawl ?stars|clash|supercell|among ?us|fall ?guys/i;

const STYLIZED = ['lowpoly', 'low', 'stylized', 'stylised', 'cartoon', 'toon', 'cute', 'handpainted', 'hand', 'game', 'gameready', 'kaykit', 'quaternius', 'kenney', 'chibi', 'casual'];

// ------------------------------------------------------------------ Poly Haven

async function searchPolyHaven(o) {
  const all = await getJSON('https://api.polyhaven.com/assets?t=models');
  const out = [];
  for (const [id, a] of Object.entries(all)) {
    const tags = [...(a.tags ?? []), ...(a.categories ?? [])];
    const t = textScore(o.q, `${a.name} ${id}`, tags);
    if (t <= 0) continue;
    const tris = a.polycount ?? 0;
    let score = t * 100;
    if (id.toLowerCase() === o.q.toLowerCase().replace(/\s+/g, '_')) score += 1000; // exact Poly Haven id
    score += tris && tris <= o.maxTris ? 15 : -Math.min(40, (tris - o.maxTris) / 1000);
    if (o.style === 'stylized') score -= 25; // photoreal scans clash with the cartoon look
    if (o.style === 'realistic') score += 15;
    score += Math.min(10, (a.download_count ?? 0) / 20000);
    out.push({ source: 'polyhaven', id, name: a.name, tris, score, licence: 'CC0', author: Object.keys(a.authors ?? {}).join(', '), link: `https://polyhaven.com/a/${id}` });
  }
  return out;
}

async function fetchPolyHaven(c, o, dir) {
  const files = await getJSON(`https://api.polyhaven.com/files/${c.id}`);
  const resos = Object.keys(files.gltf ?? {});
  if (!resos.length) throw new Error('no glTF on Poly Haven for ' + c.id);
  // smallest texture set that is still ≥ the target size
  const want = o.tex <= 1024 ? '1k' : o.tex <= 2048 ? '2k' : '4k';
  const res = resos.includes(want) ? want : resos.sort((a, b) => parseInt(a) - parseInt(b))[0];
  const g = files.gltf[res].gltf;
  const main = path.join(dir, path.basename(new URL(g.url).pathname));
  let bytes = await download(g.url, main, {}, g.size);
  for (const [rel, f] of Object.entries(g.include ?? {})) bytes += await download(f.url, path.join(dir, rel), {}, f.size);
  console.log(`  downloaded ${kb(bytes)} (glTF + ${Object.keys(g.include ?? {}).length} files, ${res} textures)`);
  return main;
}

// ------------------------------------------------------------------ Sketchfab

async function searchSketchfab(o) {
  const key = process.env.SKETCHFAB_API_KEY;
  if (!key) return [];
  const out = [];
  const seen = new Set();
  // two passes: free-for-anything first, then CC-BY (needs credit)
  for (const licence of ['cc0', 'by']) {
    const url = `https://api.sketchfab.com/v3/search?type=models&downloadable=true&count=24&license=${licence}&max_face_count=${o.maxTris * 3}&q=${encodeURIComponent(o.q)}`;
    let data;
    try {
      data = await getJSON(url, { Authorization: `Token ${key}` });
    } catch (e) {
      console.warn('  sketchfab search failed:', e.message);
      continue;
    }
    for (const m of data.results ?? []) {
      if (seen.has(m.uid)) continue;
      seen.add(m.uid);
      const glb = m.archives?.glb;
      if (!glb) continue;
      // ripped game assets are someone else's IP whatever licence the uploader picked
      if (BRANDS.test(`${m.name} ${(m.tags ?? []).map((t) => t.name).join(' ')}`)) continue;
      const tags = (m.tags ?? []).map((t) => t.name);
      const t = textScore(o.q, m.name, tags);
      if (t <= 0) continue;
      const tris = glb.faceCount ?? m.faceCount ?? 0;
      let score = t * 100;
      score += tris <= o.maxTris ? 15 : -Math.min(40, (tris - o.maxTris) / 1000);
      score += glb.size < 2e6 ? 8 : glb.size < 8e6 ? 0 : -15;
      score += Math.min(12, Math.log10(1 + (m.likeCount ?? 0)) * 4);
      if (m.staffpickedAt) score += 5;
      if (licence === 'cc0') score += 6;
      const styled = [...words(m.name), ...tags.flatMap(words)].some((w) => STYLIZED.includes(w));
      if (o.style === 'stylized') score += styled ? 18 : 0;
      if (o.style === 'realistic') score += styled ? -10 : 5;
      if (m.animationCount) score += 2;
      out.push({
        source: 'sketchfab', id: m.uid, name: m.name, tris, score, size: glb.size, anims: m.animationCount ?? 0,
        licence: m.license?.label ?? licence.toUpperCase(), author: m.user?.displayName ?? m.user?.username ?? '?',
        authorLink: m.user?.profileUrl ?? '', link: m.viewerUrl,
      });
    }
  }
  return out;
}

async function fetchSketchfab(c, o, dir) {
  const key = process.env.SKETCHFAB_API_KEY;
  const d = await getJSON(`https://api.sketchfab.com/v3/models/${c.id}/download`, { Authorization: `Token ${key}` });
  if (d.glb?.url) {
    const f = path.join(dir, 'model.glb');
    console.log(`  downloaded ${kb(await download(d.glb.url, f))} (.glb)`);
    return f;
  }
  if (d.gltf?.url) {
    const zip = path.join(dir, 'model.zip');
    console.log(`  downloaded ${kb(await download(d.gltf.url, zip))} (.zip)`);
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
    const found = execFileSync('find', [dir, '-name', '*.gltf']).toString().trim().split('\n')[0];
    if (!found) throw new Error('no .gltf inside the archive');
    return found;
  }
  throw new Error('Sketchfab offers no glb/gltf download for this model');
}

// ------------------------------------------------------------------ make it game-ready

async function process3d(input, out, o) {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(input);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const skinned = root.listSkins().length > 0;
  const tris = () => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + ((p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3), 0), 0);
  const trisIn = tris();

  const steps = [dedup(), prune(), weld()];
  if (!skinned) steps.push(flatten(), join()); // fewer draw calls for static props
  // over budget: simplify (static meshes only — skinned ones would tear)
  if (!skinned && trisIn > o.maxTris) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.01, o.maxTris / trisIn), error: 0.08 }));
  steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [o.tex, o.tex], quality: 82 }));
  await doc.transform(...steps);


  // one pivot node: everything hangs under it, so we can centre / scale / turn the whole model
  const pivot = doc.createNode('model');
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    pivot.addChild(child);
  }
  scene.addChild(pivot);

  // turn to face +z, then scale, then centre on x/z and stand on y = 0
  if (o.rotateY) {
    const a = (o.rotateY * Math.PI) / 180;
    pivot.setRotation([0, Math.sin(a / 2), 0, Math.cos(a / 2)]);
  }
  let b = getBounds(scene);
  const h = b.max[1] - b.min[1];
  if (o.height > 0 && h > 0) {
    const s = o.height / h;
    pivot.setScale([s, s, s]);
    b = getBounds(scene);
  }
  const t = pivot.getTranslation();
  pivot.setTranslation([t[0] - (b.min[0] + b.max[0]) / 2, t[1] - b.min[1], t[2] - (b.min[2] + b.max[2]) / 2]);
  b = getBounds(scene);

  await doc.transform(unpartition(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  return {
    trisIn,
    tris: Math.round(tris()),
    size: fs.statSync(out).size,
    dims: [0, 1, 2].map((i) => +(b.max[i] - b.min[i]).toFixed(3)),
    animations: root.listAnimations().map((a) => a.getName()),
    skinned,
  };
}

// ------------------------------------------------------------------ main

async function main() {
  // Node's fetch ignores HTTPS_PROXY unless told to: re-run once with the flag (needed behind proxies/CI)
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    const r = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
    process.exit(r.status ?? 1);
  }
  loadEnv();
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.q) {
    console.log(fs.readFileSync(import.meta.filename, 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
    process.exit(o.q ? 0 : 1);
  }
  console.log(`🔎 "${o.q}"  (style ${o.style}, ≤ ${o.maxTris} tris, textures ≤ ${o.tex}px)`);
  if (!process.env.SKETCHFAB_API_KEY && o.source !== 'polyhaven') console.log('  (no SKETCHFAB_API_KEY in .env — Poly Haven only)');

  const lists = await Promise.all([
    o.source === 'sketchfab' ? [] : searchPolyHaven(o).catch((e) => (console.warn('  poly haven failed:', e.message), [])),
    o.source === 'polyhaven' ? [] : searchSketchfab(o),
  ]);
  const ranked = lists.flat().sort((a, b) => b.score - a.score);
  if (!ranked.length) {
    console.error('✗ nothing found — try other words (e.g. "barrel" instead of "wooden barrel"), --style any, or a bigger --max-tris');
    process.exit(2);
  }
  console.log('  top matches:');
  ranked.slice(0, 8).forEach((c, i) => console.log(`   ${i + 1}. [${c.source}] ${c.name} — ${c.tris || '?'} tris, ${c.licence}, score ${c.score.toFixed(0)}`));
  if (o.list) return;

  const pickList = ranked.slice(Math.max(0, o.pick - 1));
  const name = slug(o.name || o.q);
  const out = path.join(MODELS, `${name}.glb`);
  if (fs.existsSync(out) && !o.force) {
    console.error(`✗ ${path.relative(ROOT, out)} already exists (use --force or --name)`);
    process.exit(3);
  }
  // try the best one; if its download/processing fails, fall back to the next
  // fall back only to near-equally good matches (never from "cannon" to "television")
  const best = pickList[0].score;
  const fallbacks = pickList.slice(0, 4).filter((c, i) => i === 0 || (best < 900 && c.score >= best * 0.8));
  for (const c of fallbacks) {
    const dir = path.join(RAW, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    console.log(`⬇ ${c.name}  (${c.source}, ${c.licence}, by ${c.author})`);
    try {
      const input = c.source === 'polyhaven' ? await fetchPolyHaven(c, o, dir) : await fetchSketchfab(c, o, dir);
      const r = await process3d(input, out, o);
      const meta = {
        name, query: o.q, title: c.name, source: c.source, id: c.id, link: c.link, author: c.author, authorLink: c.authorLink ?? '',
        licence: c.licence, needsCredit: !/cc0|public/i.test(c.licence), triangles: r.tris, trianglesOriginal: r.trisIn,
        bytes: r.size, dimensions: r.dims, animations: r.animations, skinned: r.skinned, fetched: new Date().toISOString().slice(0, 10),
        normalized: { pivot: 'centre x/z, ground y=0', height: o.height || null, rotateY: o.rotateY, forward: '+z' },
      };
      fs.writeFileSync(path.join(MODELS, `${name}.json`), JSON.stringify(meta, null, 2) + '\n');
      writeCredits();
      console.log(`✓ ${path.relative(ROOT, out)}`);
      console.log(`  ${r.tris} tris${r.tris !== r.trisIn ? ` (was ${r.trisIn})` : ''}, ${kb(r.size)}, size ${r.dims.join(' × ')} m (w × h × d)`);
      if (r.animations.length) console.log(`  animations: ${r.animations.join(', ')}`);
      if (meta.needsCredit) console.log(`  ⚠ ${c.licence}: credit "${c.author}" in the game credits (added to assets/models/CREDITS.md)`);
      console.log(`  in game: loadModel('assets/models/${name}.glb') — see client/src/render/models.ts`);
      return;
    } catch (e) {
      console.warn(`  ✗ ${process.env.DEBUG ? e.stack : e.message} — trying the next match`);
    }
  }
  console.error('✗ could not download any of the top matches');
  process.exit(4);
}

function writeCredits() {
  const metas = fs.readdirSync(MODELS).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(MODELS, f), 'utf8')));
  const lines = ['# 3D model credits', '', 'Downloaded by `scripts/fetch_model.js`. CC-BY models must be credited in the game.', '', '| File | Model | Author | Licence | Source |', '|---|---|---|---|---|'];
  for (const m of metas.sort((a, b) => a.name.localeCompare(b.name))) lines.push(`| ${m.name}.glb | ${m.title} | ${m.author} | ${m.licence} | ${m.link} |`);
  fs.writeFileSync(path.join(MODELS, 'CREDITS.md'), lines.join('\n') + '\n');
}

main().catch((e) => {
  console.error('✗', e.stack || e.message);
  process.exit(1);
});

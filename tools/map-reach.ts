// Reachability audit of a map with the real hero (radius, step height, obstacles, tiles): every start, bank spot, mystery box and
declare const process: { argv: string[]; exit(code: number): never };
// raised deck must be reachable from the spawn, and you must be able to walk back out of every one of them.
// Also lists walkable pockets nobody can get into or out of (holes / traps). Run: node tools/map-reach.ts [map]
import { World, MAPS, type MapId } from '../shared/sim/index.ts';
import { TUNING } from '../shared/config/tuning.ts';

const id = (process.argv[2] ?? 'bubblegum') as MapId;
const w = new World([{ name: 'a', hero: 'bones', isBot: false }, { name: 'b', hero: 'bones', isBot: true }], { seed: 5, map: id, mode: 'weapons' });
const m = MAPS[id];
const R = m.shape.radius + 6;
const C = 0.5; // grid cell (m)
const n = Math.ceil((2 * R) / C);
const HR = TUNING.hero.radius;
const idx = (x: number, z: number) => [Math.round((x + R) / C), Math.round((z + R) / C)];
const at = (i: number, j: number) => ({ x: i * C - R, z: j * C - R });
const walk = new Uint8Array(n * n);
for (let i = 0; i < n; i++)
  for (let j = 0; j < n; j++) {
    const { x, z } = at(i, j);
    walk[i * n + j] = w.arena.safe(x, z) && w.clear(x, z, HR) ? 1 : 0;
  }

function flood(sx: number, sz: number) {
  const seen = new Uint8Array(n * n);
  const [si, sj] = idx(sx, sz);
  if (!walk[si * n + sj]) return seen;
  const q = [si * n + sj];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = Math.floor(q[h] / n);
    const j = q[h] % n;
    const a = at(i, j);
    const ha = w.terrain.heightAt(a.x, a.z);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n || seen[ni * n + nj] || !walk[ni * n + nj]) continue;
      const b = at(ni, nj);
      if (!w.terrain.canStep(ha, b.x, b.z)) continue;
      if (w.terrain.breach(ha, b.x, b.z, HR) > 0) continue;
      seen[ni * n + nj] = 1;
      q.push(ni * n + nj);
    }
  }
  return seen;
}

const start = m.starts[0];
const main = flood(start.x, start.z);
const reach = (x: number, z: number) => {
  const [i, j] = idx(x, z);
  return !!main[i * n + j];
};
let bad = 0;
const rep = (label: string, ok: boolean) => {
  if (!ok) {
    bad++;
    console.log('UNREACHABLE', label);
  }
};
m.starts.forEach((s, i) => rep(`start ${i} (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`, reach(s.x, s.z)));
m.bankSpots.forEach((s, i) => rep(`bank spot ${i} (${s.x}, ${s.z})`, reach(s.x, s.z)));
w.brawl.boxes.forEach((b) => rep(`mystery box ${b.id} (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`, reach(b.x, b.z)));
const decks = m.terrain?.decks ?? [];
decks.forEach((d, i) => rep(`deck ${i} top (${d.x}, ${d.z}, h ${d.h})`, reach(d.x + 0.6, d.z + 0.6) || reach(d.x + (d.w / 2 - 0.8), d.z)));
// can you walk back OUT of every deck / far corner to the spawn?
let trapped = 0;
const probes = [...decks.map((d) => ({ x: d.x + (d.w > 6 ? d.w / 2 - 1.2 : 0.6), z: d.z + 0.6 })), ...m.bankSpots];
for (const p of probes) {
  if (!reach(p.x, p.z)) continue;
  const f = flood(p.x, p.z);
  const [si, sj] = idx(start.x, start.z);
  if (!f[si * n + sj]) {
    trapped++;
    console.log('TRAP: cannot walk back to spawn from', p.x.toFixed(1), p.z.toFixed(1));
  }
}
// walkable cells that nobody can reach (hidden pockets)
let pockets = 0;
let total = 0;
const lost: string[] = [];
for (let i = 0; i < n; i++)
  for (let j = 0; j < n; j++)
    if (walk[i * n + j]) {
      total++;
      if (!main[i * n + j]) {
        pockets++;
        if (lost.length < 8 && pockets % 12 === 1) lost.push(`${at(i, j).x.toFixed(1)},${at(i, j).z.toFixed(1)}`);
      }
    }
const reached = main.reduce((a, v) => a + v, 0);
console.log(`${id}: ${total} walkable cells, ${reached} reachable from the spawn (${((100 * reached) / total).toFixed(1)}%), pockets ${pockets} ${lost.length ? '(e.g. ' + lost.join(' ') + ')' : ''}`);
console.log(`${decks.length} decks, ${m.bankSpots.length} bank spots, ${w.brawl.boxes.length} mystery boxes, ${m.starts.length} spawns checked; unreachable ${bad}, traps ${trapped}`);
if (bad || trapped) process.exit(1);

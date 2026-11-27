// How much garbage the simulation and the bots make per second of play (garbage = little stutters on phones).
// Run: node tools/alloc-bench.mjs [map]
import { Session } from 'node:inspector/promises';
import { World, BotBrain, Rng } from '../shared/sim/index.ts';
import { TUNING } from '../shared/config/tuning.ts';

globalThis.__cut = +(process.env.CUT || 0);
const map = process.argv[2] || 'bubblegum';
const heroes = ['ranger', 'bones', 'pinch', 'grizzle', 'ranger', 'bones', 'pinch', 'grizzle'];
const w = new World(heroes.map((h, i) => ({ name: `B${i}`, hero: h, isBot: true })), { seed: 5, map });
const rng = new Rng(9);
const brains = w.players.map((p) => new BotBrain(p.id, new Rng(rng.int(1, 1e9)), 0));
const step = () => {
  const inputs = brains.map((b) => b.update(w, TUNING.sim.dt));
  w.tick(TUNING.sim.dt, inputs);
};
for (let i = 0; i < 60 * 20; i++) step(); // warm up (JIT, countdown)
const s = new Session();
s.connect();
await s.post('HeapProfiler.enable');
await s.post('HeapProfiler.startSampling', { samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
const N = 60 * 30;
const t0 = performance.now();
for (let i = 0; i < N && w.phase !== 'matchEnd'; i++) step();
const ms = performance.now() - t0;
const { profile } = await s.post('HeapProfiler.stopSampling');
const tot = new Map();
let all = 0;
const walk = (n) => {
  const f = n.callFrame;
  const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
  all += n.selfSize;
  if (n.selfSize) tot.set(k, (tot.get(k) ?? 0) + n.selfSize);
  n.children.forEach(walk);
};
walk(profile.head);
console.log(`${map}: ${(all / 1e6 / 30).toFixed(2)} MB garbage per game-second, sim+bots ${(ms / N).toFixed(3)} ms per step`);
[...tot].sort((a, b) => b[1] - a[1]).slice(0, +(process.env.TOP || 14)).forEach(([k, v]) => console.log(`  ${(v / 1e6 / 30).toFixed(3)} MB/s  ${k}`));

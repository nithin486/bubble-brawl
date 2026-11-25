// @ts-nocheck
// Lists pairs of solid things on one map that leave a gap too narrow for a hero (0 < gap < 1.4 m) or sit on a hole.
import { MAPS, type MapId } from '../shared/config/maps.ts';
import { Arena } from '../shared/sim/arena.ts';
const id = (process.argv[2] ?? 'bubblegum') as MapId;
const m = MAPS[id];
const arena = new Arena(m.shape);
const obs = m.obstacles.filter((o) => o.r > 0);
let bad = 0;
for (let i = 0; i < obs.length; i++) {
  if (!arena.solid(obs[i].x, obs[i].z)) { console.log('off-ground', obs[i].kind, obs[i].x, obs[i].z); bad++; }
  for (let j = i + 1; j < obs.length; j++) {
    const gap = Math.hypot(obs[i].x - obs[j].x, obs[i].z - obs[j].z) - obs[i].r - obs[j].r;
    if (gap > 0.05 && gap < 1.4 && obs[i].kind !== obs[j].kind + '_') { console.log(`gap ${gap.toFixed(2)}: ${obs[i].kind}(${obs[i].x.toFixed(1)},${obs[i].z.toFixed(1)}) - ${obs[j].kind}(${obs[j].x.toFixed(1)},${obs[j].z.toFixed(1)})`); bad++; }
  }
}
console.log(bad ? `${bad} issues` : 'no narrow gaps');

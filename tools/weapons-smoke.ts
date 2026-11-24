// Weapons mode: plays full bot matches on every map and prints how the fight went.
import { World, BotBrain, Rng, MAPS, type Input, type MapId } from '../shared/sim/index.ts';
import { TUNING } from '../shared/config/tuning.ts';
const heroes = ['bones', 'pinch', 'grizzle', 'bones', 'pinch', 'grizzle'] as const;
for (const map of Object.keys(MAPS) as MapId[]) {
  const w = new World(heroes.map((h, i) => ({ name: `P${i}`, hero: h, isBot: true })), { seed: 5, map, mode: 'weapons' });
  const rng = new Rng(11);
  const brains = w.players.map((p) => new BotBrain(p.id, new Rng(rng.int(1, 1e9)), -1));
  const counts: Record<string, number> = {};
  const fired: Record<string, number> = {};
  const picked: Record<string, number> = {};
  let steps = 0;
  let moving = 0;
  let stuck = 0;
  let armedFrames = 0;
  let playFrames = 0;
  while (w.phase !== 'matchEnd' && steps < 60 * 700) {
    const inputs: Input[] = brains.map((b) => b.update(w, TUNING.sim.dt));
    const prev = w.players.map((p) => ({ x: p.x, z: p.z }));
    const r0 = w.round;
    w.tick(TUNING.sim.dt, inputs);
    if (w.round !== r0) brains.forEach((b) => b.newRound());
    for (const e of w.events) {
      counts[e.t] = (counts[e.t] ?? 0) + 1;
      if (e.t === 'fire') fired[e.weapon] = (fired[e.weapon] ?? 0) + 1;
      if (e.t === 'boxPick') picked[e.weapon] = (picked[e.weapon] ?? 0) + 1;
    }
    if (w.phase === 'playing') {
      playFrames += w.players.length;
      armedFrames += w.players.filter((p) => p.weapon).length;
      inputs.forEach((inp, i) => {
        const p = w.players[i];
        if (p.state !== 'normal' || Math.hypot(inp.mx, inp.mz) < 0.5) return;
        moving++;
        if (Math.hypot(p.x - prev[i].x, p.z - prev[i].z) / TUNING.sim.dt < 1) stuck++;
      });
    }
    for (const p of w.players) if (!Number.isFinite(p.x + p.z + p.y)) throw new Error(`${map}: NaN`);
    steps++;
  }
  if (w.phase !== 'matchEnd') throw new Error(`${map}: match did not finish`);
  const pts = w.players.map((p) => p.bankedTotal);
  const minutes = (TUNING.match.rounds * TUNING.match.roundSeconds) / 60;
  console.log(
    `${map.padEnd(8)} KOs ${counts.ko ?? 0} (${((counts.ko ?? 0) / minutes).toFixed(0)}/min) | pops ${counts.pop ?? 0} | escapes ${counts.escape ?? 0} | hits ${counts.hit ?? 0} | boxes ${counts.boxPick ?? 0} | armed ${((100 * armedFrames) / playFrames).toFixed(0)}% | points ${pts.join(' ')} | stuck ${((100 * stuck) / moving).toFixed(1)}%`,
  );
  console.log(`         fired ${JSON.stringify(fired)}  picked ${JSON.stringify(picked)}`);
}

// First match: an average player (driven by a normal bot brain) should usually win round 1 —
// the first minute decides whether people stay.
let wins = 0;
const N = 12;
for (let seed = 1; seed <= N; seed++) {
  const w = new World(heroes.map((h, i) => ({ name: `P${i}`, hero: h, isBot: i !== 0 })), { seed, map: 'city', mode: 'weapons', firstMatch: true });
  const rng = new Rng(seed * 7 + 1);
  const brains = w.players.map((p) => new BotBrain(p.id, new Rng(rng.int(1, 1e9)), 0));
  let winner = -1;
  for (let s = 0; s < 60 * 120 && winner < 0; s++) {
    w.tick(TUNING.sim.dt, brains.map((b) => b.update(w, TUNING.sim.dt)));
    for (const e of w.events) if (e.t === 'roundEnd') winner = e.winner;
  }
  if (winner === 0) wins++;
}
console.log(`first-match round-1 win rate (weapons) for an average player: ${wins}/${N}`);

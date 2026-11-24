// Plays one full bot match on every map and checks nothing breaks.
import { World, BotBrain, Rng, MAPS, type Input, type MapId } from '../shared/sim/index.ts';
import { TUNING } from '../shared/config/tuning.ts';
for (const map of Object.keys(MAPS) as MapId[]) {
  const w = new World(['bones', 'pinch', 'grizzle', 'bones', 'pinch', 'grizzle'].map((h, i) => ({ name: `P${i}`, hero: h as 'bones', isBot: i > 0 })), { seed: 3, map, mode: 'coins' });
  const rng = new Rng(9);
  const brains = w.players.map((p) => new BotBrain(p.id, new Rng(rng.int(1, 1e9)), 0));
  let steps = 0;
  let moving = 0;
  let stuck = 0;
  const counts: Record<string, number> = {};
  while (w.phase !== 'matchEnd' && steps < 60 * 600) {
    const inputs: Input[] = brains.map((b) => b.update(w, TUNING.sim.dt));
    const prev = w.players.map((p) => ({ x: p.x, z: p.z }));
    const r0 = w.round;
    w.tick(TUNING.sim.dt, inputs);
    if (w.round !== r0) brains.forEach((b) => b.newRound());
    for (const e of w.events) counts[e.t] = (counts[e.t] ?? 0) + 1;
    if (w.phase === 'playing')
      inputs.forEach((inp, i) => {
        const p = w.players[i];
        if (p.state !== 'normal' || Math.hypot(inp.mx, inp.mz) < 0.5) return;
        moving++;
        if (Math.hypot(p.x - prev[i].x, p.z - prev[i].z) / TUNING.sim.dt < 1) stuck++;
      });
    for (const p of w.players) if (!Number.isFinite(p.x + p.z)) throw new Error(`${map}: NaN`);
    steps++;
  }
  if (w.phase !== 'matchEnd') throw new Error(`${map}: match did not finish`);
  const banked = w.players.reduce((a, p) => a + p.bankedTotal, 0) / 30;
  console.log(`${map.padEnd(8)} tiles ${w.arena.tiles.length} | banked/player/round ${banked.toFixed(1)} | falls ${counts.fall ?? 0} | bounces ${counts.bounce ?? 0} | jackpots ${counts.jackpot} | stuck ${((100 * stuck) / moving).toFixed(1)}%`);
}

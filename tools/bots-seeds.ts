// @ts-nocheck
import { World, BotBrain, Rng, type Input } from '../shared/sim/index.ts';
import { TUNING } from '../shared/config/tuning.ts';
for (const map of (process.argv[2] ?? 'bubblegum,candy').split(',') as 'candy'[])
  for (const seed of [1, 2, 3, 4]) {
    const w = new World(['bones', 'pinch', 'grizzle', 'bones', 'pinch', 'grizzle'].map((h, i) => ({ name: `P${i}`, hero: h as 'bones', isBot: true })), { seed, map, mode: 'coins' });
    const rng = new Rng(seed * 3);
    const brains = w.players.map((p) => new BotBrain(p.id, new Rng(rng.int(1, 1e9)), 0));
    let steps = 0, moving = 0, stuck = 0, falls = 0;
    while (w.phase !== 'matchEnd' && steps < 60 * 600) {
      const inputs: Input[] = brains.map((b) => b.update(w, TUNING.sim.dt));
      const prev = w.players.map((p) => ({ x: p.x, z: p.z }));
      const r0 = w.round;
      w.tick(TUNING.sim.dt, inputs);
      if (w.round !== r0) brains.forEach((b) => b.newRound());
      for (const e of w.events) if (e.t === 'fall') falls++;
      if (w.phase === 'playing') inputs.forEach((inp, i) => { const p = w.players[i]; if (p.state !== 'normal' || Math.hypot(inp.mx, inp.mz) < 0.5) return; moving++; if (Math.hypot(p.x - prev[i].x, p.z - prev[i].z) / TUNING.sim.dt < 1) stuck++; });
      steps++;
    }
    console.log(map, 'seed', seed, 'banked/p/r', (w.players.reduce((a, p) => a + p.bankedTotal, 0) / 30).toFixed(1), 'falls', falls, 'stuck', ((100 * stuck) / moving).toFixed(1) + '%');
  }

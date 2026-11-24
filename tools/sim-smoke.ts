// Headless check of the simulation: plays full matches with bots only and prints stats.
// Run: npm test
import { World, BotBrain, Rng, type Input } from '../shared/sim/index.ts';
import { TUNING } from '../shared/config/tuning.ts';
import type { HeroId } from '../shared/config/heroes.ts';

const heroes: HeroId[] = ['bones', 'pinch', 'grizzle', 'bones', 'pinch', 'grizzle'];

function playMatch(seed: number, firstMatch: boolean) {
  const w = new World(
    heroes.map((h, i) => ({ name: i === 0 ? 'You' : `Bot${i}`, hero: h, isBot: i !== 0 })),
    { seed, firstMatch, mode: 'coins' },
  );
  // player 0 is driven by a normal-difficulty brain standing in for an average human
  const rng = new Rng(seed * 7 + 1);
  const brains = w.players.map((p) => new BotBrain(p.id, new Rng(rng.int(1, 1e9)), 0));
  const counts: Record<string, number> = {};
  const round1: number[] = [];
  let steps = 0;
  let moving = 0;
  let stuck = 0;
  let lastRound = 1;
  while (w.phase !== 'matchEnd' && steps < 60 * 60 * 10) {
    const inputs: Input[] = brains.map((b) => b.update(w, TUNING.sim.dt));
    const prev = w.players.map((p) => ({ x: p.x, z: p.z }));
    w.tick(TUNING.sim.dt, inputs);
    for (const e of w.events) {
      counts[e.t] = (counts[e.t] ?? 0) + 1;
      if (e.t === 'roundEnd' && e.round === 1) round1.push(...w.players.map((p) => p.bankedRound));
      if (e.t === 'roundStart' && e.round !== lastRound) {
        lastRound = e.round;
        brains.forEach((b) => b.newRound());
      }
    }
    for (const p of w.players) if (!Number.isFinite(p.x + p.z + p.y)) throw new Error(`NaN position p${p.id}`);
    if (w.phase === 'playing')
      inputs.forEach((inp, i) => {
        const p = w.players[i];
        if (p.state !== 'normal' || Math.hypot(inp.mx, inp.mz) < 0.5) return;
        moving++;
        const moved = Math.hypot(p.x - prev[i].x, p.z - prev[i].z) / TUNING.sim.dt;
        if (moved < 1) stuck++;
      });
    steps++;
  }
  if (w.phase !== 'matchEnd') throw new Error('match did not finish');
  return { w, counts, round1, steps, stuckPct: (100 * stuck) / Math.max(1, moving) };
}

let r1wins = 0;
let bankedSum = 0;
let stuckSum = 0;
const N = 12;
for (let s = 1; s <= N; s++) {
  const { w, counts, round1, steps, stuckPct } = playMatch(s, true);
  stuckSum += stuckPct;
  const proxyWon = round1[0] === Math.max(...round1);
  if (proxyWon) r1wins++;
  else console.log("lost seed", s, round1.join(" "));
  bankedSum += w.players.reduce((a, p) => a + p.bankedTotal, 0);
  if (s <= 2) {
    console.log(`match ${s}: ${(steps / 60).toFixed(0)} s simulated`);
    console.log('  events', counts);
    console.log('  round1 banked', round1.join(' '));
    console.log(
      '  totals',
      w.players.map((p) => `${p.name}(${p.hero}) ${p.bankedTotal} steals ${p.stats.steals} falls ${p.stats.falls}`).join(' | '),
    );
  }
}
console.log(`first-match round-1 win rate for an average-bot "player": ${r1wins}/${N}`);
console.log(`avg banked per player per round: ${(bankedSum / N / 6 / TUNING.match.rounds).toFixed(1)}`);
console.log(`bots pushing but not moving (stuck): ${(stuckSum / N).toFixed(1)}% of moving frames`);
{
  // feature check: power-ups, jackpots and bombs actually happen in a match
  const { counts } = playMatch(99, false);
  console.log('power spawns', counts.powerSpawn, '| picked', counts.power, '| bombs', counts.bombBoom, '| shield blocks', counts.shieldBlock ?? 0, '| jackpots', counts.jackpot);
}

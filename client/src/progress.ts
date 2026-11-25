// Levels, unlocks, missions and bot difficulty. Everything is earned by playing; every number is here.
import type { HeroId } from '../../shared/config/heroes.ts';
import type { MapId } from '../../shared/config/maps.ts';
import { WEAPONS, type WeaponKind } from '../../shared/sim/types.ts';

/** The hero and map every new player starts with. */
export const DEFAULT_HERO: HeroId = 'ranger';
export const DEFAULT_MAP: MapId = 'bubblegum';

export type Unlock = { level: number } & ({ hero: HeroId } | { map: MapId } | { weapon: WeaponKind });

/** The reward track, in order. Anything not listed is open from level 1. */
export const UNLOCK_TRACK: Unlock[] = [
  { level: 2, map: 'candy' }, // one quick reward after the first match
  { level: 5, hero: 'bones' }, // about 5 matches
  { level: 7, map: 'desert' }, // about 8
  { level: 10, hero: 'pinch' }, // about 16
  { level: 16, hero: 'grizzle' }, // about 40
];

/** Level n needs 120 + 60·(n−1) XP; a good match gives about 100–200. */
export function levelOf(xp: number) {
  let level = 1;
  let need = 120;
  let left = Math.max(0, xp);
  while (left >= need) {
    left -= need;
    level++;
    need = 120 + 60 * (level - 1);
  }
  return { level, frac: left / need, left, need };
}

const levelFor = (match: (u: Unlock) => boolean) => UNLOCK_TRACK.find(match)?.level ?? 1;
export const heroLevel = (h: HeroId) => levelFor((u) => 'hero' in u && u.hero === h);
export const mapLevel = (m: string) => levelFor((u) => 'map' in u && u.map === m);
export const weaponLevel = (w: WeaponKind) => levelFor((u) => 'weapon' in u && u.weapon === w);
export const weaponPool = (level: number) => WEAPONS.filter((w) => weaponLevel(w) <= level);
export const nextUnlock = (level: number) => UNLOCK_TRACK.find((u) => u.level > level) ?? null;

/** Bot skill 0..1: gentle for new players, sharper with level, nudged by how the last matches went. */
export const botSkill = (level: number, form: number) => Math.max(0.05, Math.min(0.95, 0.12 + (level - 1) * 0.085 + form));
/** After a match: winning makes bots a touch sharper, finishing in the bottom half eases them off. */
export const nextForm = (form: number, rank: number, players: number) => Math.max(-0.25, Math.min(0.2, form + (rank === 1 ? 0.06 : rank > players / 2 ? -0.09 : -0.01)));

// ------------------------------------------------------------------ missions

export type Stat = 'kos' | 'pops' | 'hits' | 'wins' | 'podiums' | 'matches' | 'boxes';
export interface Mission {
  stat: Stat;
  goal: number;
  done: number;
  xp: number;
}

const KINDS: Record<Stat, { text: (n: number) => string; goals: number[]; xp: number }> = {
  kos: { text: (n) => `Knock out ${n} rivals`, goals: [4, 8, 14], xp: 70 },
  pops: { text: (n) => `Pop ${n} bubbles`, goals: [3, 6, 10], xp: 70 },
  hits: { text: (n) => `Land ${n} hits`, goals: [25, 50, 90], xp: 60 },
  boxes: { text: (n) => `Open ${n} mystery boxes`, goals: [6, 12, 20], xp: 50 },
  matches: { text: (n) => `Finish ${n} match${n > 1 ? 'es' : ''}`, goals: [1, 3, 5], xp: 50 },
  podiums: { text: (n) => (n > 1 ? `Reach the top 3 ${n} times` : 'Reach the top 3'), goals: [1, 2, 4], xp: 80 },
  wins: { text: (n) => (n > 1 ? `Win ${n} matches` : 'Win a match'), goals: [1, 2, 3], xp: 110 },
};

export const missionText = (m: Mission) => KINDS[m.stat].text(m.goal);

/** A fresh mission of a kind not already on the board; harder (and worth more) as you level. */
function draw(board: Mission[], level: number, turn: number): Mission {
  const free = (Object.keys(KINDS) as Stat[]).filter((s) => !board.some((m) => m.stat === s));
  const stat = free[turn % free.length];
  const tier = Math.min(2, Math.floor((level - 1) / 3));
  const k = KINDS[stat];
  return { stat, goal: k.goals[tier], done: 0, xp: k.xp + tier * 30 };
}

export function startMissions(): Mission[] {
  return [
    { stat: 'matches', goal: 1, done: 0, xp: 60 },
    { stat: 'kos', goal: 4, done: 0, xp: 70 },
    { stat: 'boxes', goal: 6, done: 0, xp: 50 },
  ];
}

/** Add a match's stats to the board. Finished missions pay out and are replaced. */
export function advanceMissions(board: Mission[], stats: Partial<Record<Stat, number>>, level: number, turn: number) {
  const finished: Mission[] = [];
  const next = board.map((m) => ({ ...m, done: Math.min(m.goal, m.done + (stats[m.stat] ?? 0)) }));
  for (let i = 0; i < next.length; i++) {
    if (next[i].done < next[i].goal) continue;
    finished.push(next[i]);
    // never hand the same kind straight back
    next[i] = draw(next, level, turn + i * 2 + finished.length);
  }
  return { board: next, finished, xp: finished.reduce((a, m) => a + m.xp, 0) };
}

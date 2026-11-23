import type { HeroId, AbilityId } from '../config/heroes.ts';

export type Phase = 'countdown' | 'playing' | 'roundEnd' | 'matchEnd';
export type PState = 'normal' | 'dashing' | 'stagger' | 'stunned' | 'launched' | 'falling';

/** One tick of player intent. Buttons are "pressed since last tick". */
export interface Input {
  mx: number; // world-space move direction (length ≤ 1)
  mz: number;
  dash: boolean;
  grab: boolean;
  skill: boolean;
  /** Bots only: first-match handicap — walk through the bank without banking. */
  skipBank?: boolean;
}

export const NO_INPUT: Input = { mx: 0, mz: 0, dash: false, grab: false, skill: false };

export interface PlayerStats {
  steals: number; // successful grabs that took coins
  stolen: number; // coins taken from others
  lostToSteals: number;
  hitsLanded: number;
  falls: number;
  banks: number;
  bestBank: number;
}

export interface Player {
  id: number;
  name: string;
  hero: HeroId;
  isBot: boolean;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  kx: number; // knockback velocity
  kz: number;
  vy: number;
  facing: number;
  state: PState;
  stateT: number;
  carried: number;
  bankedRound: number;
  bankedTotal: number;
  roundsWon: number;
  dashCd: number;
  grabCd: number;
  skillCd: number;
  invuln: number;
  cast: null | { kind: 'grab' | 'skill'; t: number };
  stickyT: number;
  bankT: number;
  launch: null | { fx: number; fz: number; tx: number; tz: number; t: number };
  dashDx: number;
  dashDz: number;
  padCd: number;
  stats: PlayerStats;
  magnetT: number;
  speedT: number;
  shieldT: number;
  combo: number;
  comboT: number;
  /** Who last robbed/hit me, and for how much longer revenge counts. */
  robbedBy: number;
  robbedT: number;
}

export interface Coin {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  delay: number; // spawn delay before it starts falling (wave stagger)
  blockId: number; // player who cannot pick it up yet
  blockT: number;
  anyT: number; // nobody can pick it up yet
  v: number; // value: 1, or more for a golden coin
}

export type RoundMod = 'none' | 'giant' | 'thieves' | 'bombs' | 'turbo' | 'magnet' | 'goldrush' | 'double';

export interface Hazard {
  id: number;
  kind: 'traffic' | 'bell';
  /** Seconds until it becomes dangerous (warning phase while > 0). */
  warn: number;
  /** traffic: car position + direction */
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** bell: danger zones */
  zones: { x: number; z: number; r: number }[];
  life: number;
  hit: number[];
}

export type PowerKind = 'magnet' | 'speed' | 'shield' | 'bomb';

export interface PowerUp {
  id: number;
  kind: PowerKind;
  x: number;
  z: number;
  age: number;
}

export interface Bomb {
  id: number;
  owner: number;
  x: number;
  z: number;
  fuse: number;
}

export interface Bank {
  x: number;
  z: number;
  spot: number;
  nextSpot: number;
  moveT: number; // seconds since last move
  warned: boolean;
  glide: null | { fx: number; fz: number; t: number };
}

export interface BouncePad {
  x: number;
  z: number;
}

export type SimEvent =
  | { t: 'pickup'; p: number; x: number; z: number; v: number; combo: number }
  | { t: 'powerSpawn'; id: number; kind: PowerKind; x: number; z: number }
  | { t: 'power'; p: number; kind: PowerKind; x: number; z: number }
  | { t: 'shieldBlock'; p: number }
  | { t: 'bombPlant'; id: number; owner: number; x: number; z: number }
  | { t: 'bombBoom'; owner: number; x: number; z: number; hits: number }
  | { t: 'jackpotWarn' }
  | { t: 'crown'; p: number }
  | { t: 'bounty'; p: number; from: number; n: number }
  | { t: 'revenge'; p: number; from: number; n: number }
  | { t: 'hazardWarn'; kind: 'traffic' | 'bell' }
  | { t: 'hazardHit'; kind: 'traffic' | 'bell'; p: number }
  | { t: 'jackpot'; n: number }
  | { t: 'steal'; from: number; to: number; n: number; sticky: boolean }
  | { t: 'hit'; victim: number; by: number; kind: 'grab' | 'bomb' | 'traffic' | 'bell' | AbilityId; drop: number; x: number; z: number }
  | { t: 'grab'; p: number; hit: boolean }
  | { t: 'dash'; p: number }
  | { t: 'skill'; p: number; ability: AbilityId }
  | { t: 'skillFire'; p: number; ability: AbilityId; x: number; z: number; facing: number; hits: number }
  | { t: 'stun'; p: number }
  | { t: 'bankProgress'; p: number }
  | { t: 'bank'; p: number; n: number; total: number; mult: number; label: string; x: number; z: number }
  | { t: 'fall'; p: number; lost: number }
  | { t: 'respawn'; p: number }
  | { t: 'bounce'; p: number }
  | { t: 'land'; p: number }
  | { t: 'wave'; n: number }
  | { t: 'bankWarn'; x: number; z: number }
  | { t: 'bankMove'; x: number; z: number }
  | { t: 'finale' }
  | { t: 'tilesFall'; n: number }
  | { t: 'countdown'; n: number }
  | { t: 'roundStart'; round: number }
  | { t: 'roundEnd'; round: number; winner: number; lost: { p: number; n: number }[] }
  | { t: 'matchEnd'; ranking: number[] };

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
  | { t: 'pickup'; p: number; x: number; z: number }
  | { t: 'steal'; from: number; to: number; n: number; sticky: boolean }
  | { t: 'hit'; victim: number; by: number; kind: 'grab' | AbilityId; drop: number; x: number; z: number }
  | { t: 'grab'; p: number; hit: boolean }
  | { t: 'dash'; p: number }
  | { t: 'skill'; p: number; ability: AbilityId }
  | { t: 'skillFire'; p: number; ability: AbilityId; x: number; z: number; facing: number; hits: number }
  | { t: 'stun'; p: number }
  | { t: 'bankProgress'; p: number }
  | { t: 'bank'; p: number; n: number; x: number; z: number }
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

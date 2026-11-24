import type { HeroId, AbilityId } from '../config/heroes.ts';

export type Phase = 'countdown' | 'playing' | 'roundEnd' | 'matchEnd';
export type PState = 'normal' | 'dashing' | 'stagger' | 'stunned' | 'launched' | 'falling' | 'bubble';

export type GameMode = 'coins' | 'weapons';
export type WeaponKind = 'blaster' | 'rocket' | 'banana' | 'freeze' | 'hook' | 'hammer';
export const WEAPONS: WeaponKind[] = ['blaster', 'rocket', 'banana', 'freeze', 'hook', 'hammer'];

/** One tick of player intent. Buttons are "pressed since last tick". */
export interface Input {
  mx: number; // world-space move direction (length ≤ 1)
  mz: number;
  dash: boolean;
  grab: boolean;
  skill: boolean;
  /** Where the player is pointing (facing angle, atan2(x, z)): mouse / camera aim. Used when a weapon fires. */
  aim?: number;
  /** Distance to the aim point in metres (rocket / bomb land there). */
  aimD?: number;
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
  cast: null | { kind: 'grab' | 'skill'; t: number; total: number };
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
  // ---- weapons mode
  hp: number;
  weapon: WeaponKind | null;
  ammo: number;
  fireCd: number;
  /** Seconds left trapped in a KO bubble. */
  bubbleT: number;
  lastHitBy: number;
  lastHitT: number;
  kos: number;
}

export interface MysteryBox {
  id: number;
  x: number;
  z: number;
  /** > 0: picked up, back in this many seconds. */
  respawn: number;
}

export interface Projectile {
  id: number;
  kind: 'blaster' | 'rocket';
  owner: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Metres left before it fizzles. */
  left: number;
}

export interface Mine {
  id: number;
  owner: number;
  x: number;
  z: number;
  arm: number;
  life: number;
}

export interface Throw {
  id: number;
  owner: number;
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  t: number;
  total: number;
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
  | { t: 'hit'; victim: number; by: number; kind: 'grab' | 'bomb' | 'traffic' | 'bell' | AbilityId | WeaponKind; drop: number; x: number; z: number }
  | { t: 'grab'; p: number; hit: boolean }
  | { t: 'grabStart'; p: number; facing: number }
  | { t: 'dodge'; p: number; from: number }
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
  | { t: 'matchEnd'; ranking: number[] }
  | { t: 'boxPick'; p: number; weapon: WeaponKind; x: number; z: number }
  | { t: 'fire'; p: number; weapon: WeaponKind; x: number; z: number; facing: number }
  | { t: 'boom'; kind: 'rocket' | 'freeze' | 'hammer'; x: number; z: number; r: number; hits: number }
  | { t: 'hook'; p: number; target: number; x: number; z: number }
  | { t: 'slip'; p: number }
  | { t: 'frozen'; p: number }
  | { t: 'damage'; victim: number; by: number; n: number; hp: number }
  | { t: 'ko'; victim: number; by: number; x: number; z: number }
  | { t: 'pop'; victim: number; by: number; x: number; z: number }
  | { t: 'escape'; p: number };

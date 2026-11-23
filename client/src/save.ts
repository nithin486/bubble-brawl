// Local profile (no account in Step 1). All storage access is guarded: private mode can throw.
import type { HeroId } from '../../shared/config/heroes.ts';

export interface Profile {
  matches: number;
  coins: number;
  xp: number;
  map: string;
  name: string;
  camera: 'far' | 'close' | 'action';
  unlocked: HeroId[];
  hero: HeroId;
  firstSeen: string;
  lastSeen: string;
  sound: boolean;
  shake: boolean;
  quality: 'auto' | 'low' | 'medium' | 'high';
}

const KEY = 'bb_profile_v1';

export function loadProfile(): Profile {
  const today = new Date().toISOString().slice(0, 10);
  const base: Profile = { matches: 0, coins: 0, xp: 0, map: 'city', name: '', camera: 'close', unlocked: ['bones'], hero: 'bones', firstSeen: today, lastSeen: today, sound: true, shake: true, quality: 'auto' };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return base;
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Level curve: level n needs 200 + 100·(n−1) XP. A match gives ~80–200 XP. */
export function levelOf(xp: number) {
  let level = 1;
  let need = 200;
  let left = xp;
  while (left >= need) {
    left -= need;
    level++;
    need = 200 + 100 * (level - 1);
  }
  return { level, frac: left / need };
}

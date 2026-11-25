// Local profile (no account in Step 1). All storage access is guarded: private mode can throw.
import type { HeroId } from '../../shared/config/heroes.ts';
import { DEFAULT_HERO, DEFAULT_MAP, heroLevel, levelOf, mapLevel, startMissions, type Mission } from './progress.ts';
export { levelOf } from './progress.ts';

export interface Profile {
  matches: number;
  coins: number;
  xp: number;
  map: string;
  name: string;
  camera: 'third' | 'far' | 'close' | 'action';
  /** Today's three missions. */
  missions: Mission[];
  /** Bot difficulty nudge from recent results. */
  form: number;
  hero: HeroId;
  firstSeen: string;
  lastSeen: string;
  sound: boolean;
  shake: boolean;
  quality: 'auto' | 'low' | 'medium' | 'high';
  /** Look speed: slow, normal, fast. */
  aimSpeed: 'low' | 'normal' | 'high';
  /** Touch screens: fire the laser by itself while the crosshair is on a rival. */
  autoFire: boolean;
}

const KEY = 'bb_profile_v1';

export function loadProfile(): Profile {
  const today = new Date().toISOString().slice(0, 10);
  const base: Profile = { matches: 0, coins: 0, xp: 0, map: DEFAULT_MAP, name: '', camera: 'third', missions: startMissions(), form: 0, hero: DEFAULT_HERO, firstSeen: today, lastSeen: today, sound: true, shake: true, quality: 'auto', aimSpeed: 'normal', autoFire: true };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = { ...base, ...JSON.parse(raw) } as Profile & { mapV?: number; unlocked?: HeroId[] };
      // one-time move to the new default map
      if ((p.mapV ?? 0) < 3) {
        p.map = DEFAULT_MAP;
        p.hero = DEFAULT_HERO;
        p.mapV = 3;
      }
      // unlocks now come from the level alone
      delete p.unlocked;
      const { level } = levelOf(p.xp);
      if (!(heroLevel(p.hero) <= level)) p.hero = DEFAULT_HERO;
      if (!(mapLevel(p.map) <= level)) p.map = DEFAULT_MAP;
      if (!Array.isArray(p.missions) || p.missions.length !== 3) p.missions = startMissions();
      return p;
    }
  } catch {
    /* storage unavailable */
  }
  return { ...base, mapV: 3 } as Profile;
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

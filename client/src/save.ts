// Local profile (no account in Step 1). All storage access is guarded: private mode can throw.
import type { HeroId } from '../../shared/config/heroes.ts';
import { DEFAULT_HERO, DEFAULT_MAP, heroLevel, levelOf, mapLevel, startMissions, type Mission } from './progress.ts';
export { levelOf } from './progress.ts';
import { platform } from './platform/index.ts';
import { DEFAULT_LOOK, cleanLook, type Look } from './cosmetics.ts';

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
  /** Touch screens: a rival very close to the crosshair takes the shot. */
  aimAssist: boolean;
  /** Touch screens: size of the on-screen buttons, and vibration. */
  buttons: 'small' | 'normal' | 'large';
  vibrate: boolean;
  /** Shop: bought items, what is worn, paid packs already handed out, today's videos for coins. */
  owned: string[];
  look: Look;
  redeemed: string[];
  adDay: string;
  adCount: number;
}

const KEY = 'bb_profile_v1';

export function loadProfile(): Profile {
  const today = new Date().toISOString().slice(0, 10);
  const base: Profile = { matches: 0, coins: 0, xp: 0, map: DEFAULT_MAP, name: '', camera: 'third', missions: startMissions(), form: 0, hero: DEFAULT_HERO, firstSeen: today, lastSeen: today, sound: true, shake: true, quality: 'auto', aimSpeed: 'normal', autoFire: false, aimAssist: true, buttons: 'normal', vibrate: true, owned: [], look: { ...DEFAULT_LOOK }, redeemed: [], adDay: '', adCount: 0 };
  try {
    const raw = platform.store.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const p = { ...base, ...saved, fireV: saved.fireV } as Profile & { mapV?: number; fireV?: number; unlocked?: HeroId[] };
      // one-time move to the new default map
      if ((p.mapV ?? 0) < 3) {
        p.map = DEFAULT_MAP;
        p.hero = DEFAULT_HERO;
        p.mapV = 3;
      }
      // auto-attack became opt-in: switch it off once for everyone who had the old default
      if (!p.fireV) {
        p.autoFire = false;
        p.fireV = 1;
      }
      // unlocks now come from the level alone
      delete p.unlocked;
      const { level } = levelOf(p.xp);
      if (!(heroLevel(p.hero) <= level)) p.hero = DEFAULT_HERO;
      if (!(mapLevel(p.map) <= level)) p.map = DEFAULT_MAP;
      if (!Array.isArray(p.missions) || p.missions.length !== 3) p.missions = startMissions();
      p.look = cleanLook(p.look);
      if (!Array.isArray(p.owned)) p.owned = [];
      if (!Array.isArray(p.redeemed)) p.redeemed = [];
      if (!Number.isFinite(p.coins)) p.coins = 0;
      return p;
    }
  } catch {
    /* storage unavailable */
  }
  return { ...base, mapV: 3, fireV: 1 } as Profile;
}

export function saveProfile(p: Profile) {
  try {
    platform.store.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

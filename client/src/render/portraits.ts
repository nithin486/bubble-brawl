// Hero and weapon pictures for the menus and HUD: files in client/public/portraits, rendered once from the real models
// (drawing them at start-up cost seconds of shader compiling on weak GPUs). A new hero or weapon needs a new picture;
// the renderer that made them is in this file's git history.
import { HERO_IDS, type HeroId } from '../../../shared/config/heroes.ts';
import type { WeaponKind } from '../../../shared/sim/types.ts';

export const loadPortraits = (): Map<HeroId, string> => new Map(HERO_IDS.map((h) => [h, `portraits/${h}.webp`]));
export const weaponShot = (k: WeaponKind) => `portraits/weapon_${k}.webp`;

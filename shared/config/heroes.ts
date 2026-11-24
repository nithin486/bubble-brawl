// Hero roster: presentation data (model, visible props, animations) + which ability each uses.
// Ability numbers live in tuning.ts.

export type AbilityId = 'rattleBurst' | 'stickyFingers' | 'groundSlam';
export type HeroId = 'bones' | 'pinch' | 'grizzle';

export interface HeroDef {
  id: HeroId;
  name: string;
  role: string;
  model: string; // file in assets/heroes
  /** Mesh nodes to delete (each KayKit model ships every weapon). */
  hide: string[];
  ability: AbilityId;
  abilityName: string;
  abilityText: string;
  /** Animation clip played when the ability fires. */
  abilityAnim: string;
  grabAnim: string;
  color: string; // UI accent
}

export const HEROES: Record<HeroId, HeroDef> = {
  bones: {
    id: 'bones',
    name: 'Bones',
    role: 'Balanced',
    model: 'Skeleton_Minion',
    hide: [],
    ability: 'rattleBurst',
    abilityName: 'Rattle Burst',
    abilityText: 'Knock back everyone around you. Each rival hit drops an extra coin.',
    abilityAnim: 'Spellcast_Raise',
    grabAnim: 'Unarmed_Melee_Attack_Punch_A',
    color: '#7fe3ff',
  },
  pinch: {
    id: 'pinch',
    name: 'Pinch',
    role: 'Thief',
    model: 'Rogue',
    hide: ['1H_Crossbow', '2H_Crossbow', 'Throwable'],
    ability: 'stickyFingers',
    abilityName: 'Sticky Fingers',
    abilityText: 'Your next Grab steals 6 and pulls the target in.',
    abilityAnim: 'Dualwield_Melee_Attack_Stab',
    grabAnim: 'Dualwield_Melee_Attack_Slice',
    color: '#ff8fc8',
  },
  grizzle: {
    id: 'grizzle',
    name: 'Grizzle',
    role: 'Bruiser',
    model: 'Barbarian',
    hide: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', 'Mug'],
    ability: 'groundSlam',
    abilityName: 'Ground Slam',
    abilityText: 'Smash the ground in front of you. Stuns for 1 s.',
    abilityAnim: '2H_Melee_Attack_Chop',
    grabAnim: 'Unarmed_Melee_Attack_Punch_B',
    color: '#9dff7a',
  },
};

export const HERO_IDS = Object.keys(HEROES) as HeroId[];

/** Clips kept in the compressed hero files; everything else is stripped. */
export const KEEP_ANIMS = [
  'Idle',
  'Running_A',
  'Walking_A',
  'Dodge_Forward',
  'Hit_A',
  'Hit_B',
  'Cheer',
  'Jump_Full_Short',
  'Jump_Idle',
  'Interact',
  'Death_A',
  'Taunt',
  'Spellcast_Raise',
  'Dualwield_Melee_Attack_Stab',
  'Dualwield_Melee_Attack_Slice',
  '2H_Melee_Attack_Chop',
  'Unarmed_Melee_Attack_Punch_A',
  'Unarmed_Melee_Attack_Punch_B',
  '1H_Ranged_Shoot',
  'Throw',
  '2H_Melee_Attack_Spin',
] as const;

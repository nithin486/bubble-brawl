// Every gameplay number lives here so playtests can change feel without touching code.
// Units: metres, seconds, coins. Values come from docs/IMPLEMENTATION_SPEC.md → tuning table
// unless a comment says why they differ.

export const TUNING = {
  sim: {
    /** Fixed simulation step on the client (server will use 1/20). */
    dt: 1 / 60,
  },

  match: {
    rounds: 5,
    roundSeconds: 75,
    /** Long enough to read the round twist card. */
    countdownSeconds: 4,
    roundEndSeconds: 4.5,
    playersPerMatch: 6,
  },

  hero: {
    height: 1.8,
    radius: 0.45,
    walkSpeed: 6,
    /** Acceleration toward target velocity (higher = snappier). */
    accel: 40,
    turnSpeed: 16,
    /** Speed multiplier lost per carried coin (0.05 per 10 coins). */
    carrySlowPerCoin: 0.005,
    carrySlowFloor: 0.6,
    /** Carried count at which the glow is at full brightness. */
    glowFullAt: 30,
  },

  dash: {
    distance: 5,
    duration: 0.25,
    cooldown: 3,
    invulnerable: 0.2,
  },

  grab: {
    coneDeg: 60,
    range: 1.6,
    /** Small forgiveness so grabs feel fair on touch screens. */
    rangeForgiveness: 0.35,
    steal: 3,
    cooldown: 1.2,
    /** Shove applied to the victim (metres). */
    shove: 1.5,
    windup: 0.08,
  },

  hit: {
    dropFraction: 0.3,
    dropMin: 1,
    dropMax: 10,
    scatterRadius: 2,
    knockback: 4,
    /** Knockback decay rate; distance travelled = speed / decay. */
    knockDecay: 9,
    /** Time a hit victim cannot steer. */
    staggerSeconds: 0.35,
    /** Victim cannot re-pick their own dropped coins for this long. */
    ownPickupDelay: 0.9,
    otherPickupDelay: 0.25,
  },

  coins: {
    pickupRadius: 0.85,
    waveEvery: 8,
    waveSize: 24,
    maxLoose: 120,
    firstWaveSize: 30,
    /** Coins spawned in a wave fall from this height. */
    spawnHeight: 5,
    /** Coins avoid spawning closer than this to the bank centre. */
    bankClearance: 2.5,
  },

  bank: {
    radius: 2,
    /** Spec said 8 m; the bank sits at the end of each road, 3 tiles (6 m) out, so it stays on land after the crumble. */
    ringRadius: 6,
    spots: 6,
    moveEvery: 20,
    warnSeconds: 3,
    bankSeconds: 1.5,
    /** Coins fly into the bank over this many seconds (visual only). */
    flySeconds: 0.6,
  },

  arena: {
    radius: 14,
    /** KayKit hex tile: 2 m flat-to-flat, pointy-top. */
    hexSize: 2 / Math.sqrt(3),
    bouncePadRadius: 11.5,
    bouncePadCount: 4,
    bouncePadSize: 1.1,
    bounceDistance: 6,
    bounceSeconds: 0.75,
    bounceHeight: 3.2,
    fallRespawnSeconds: 2,
    respawnInvulnerable: 1,
  },

  finale: {
    seconds: 15,
    shrinkToRadius: 8,
    /** Tiles shake this long before they fall. */
    telegraph: 2,
    /** Rings crumble outside-in over this long. */
    crumbleSpread: 5,
    waveMultiplier: 2,
  },

  bots: {
    thinkHz: 5,
    reactionMin: 0.25,
    reactionMax: 0.6,
    aimErrorDeg: 14,
    speedMin: 0.9,
    speedMax: 1.0,
    bankThresholdMin: 8,
    bankThresholdMax: 20,
    stealRange: 6,
    fleeCarry: 10,
    fleeRange: 4,
    /** First match only: easier bots so the new player wins round 1. */
    firstMatch: {
      reaction: 0.6,
      bankThreshold: 6,
      speed: 0.85,
      grabPlayerChance: 0.25,
    },
  },

  powerups: {
    first: 7,
    every: 11,
    max: 2,
    pickupRadius: 1.15,
    /** Relative chance of each power bubble. */
    weights: { magnet: 3, speed: 3, shield: 2, bomb: 3 },
    magnet: { seconds: 6, radius: 4.8, pull: 11 },
    speed: { seconds: 5, mult: 1.45 },
    shield: { seconds: 10 },
    bomb: { fuse: 1.3, radius: 3.6, knockback: 5.5, extraDrop: 1 },
  },

  jackpot: {
    first: 16,
    every: 24,
    warn: 2.5,
    coins: 16,
    goldenValue: 5,
    finaleMult: 1.5,
    minDist: 2.2,
    maxDist: 6.5,
  },

  combo: { window: 0.9 },

  /** Greedy banking: bigger deposits pay more. Checked from the top. */
  bankBonus: [
    { min: 30, mult: 2, label: 'MEGA DEPOSIT' },
    { min: 20, mult: 1.5, label: 'BIG DEPOSIT' },
    { min: 10, mult: 1.2, label: 'NICE DEPOSIT' },
  ],
  /** After a deposit this big the bank bubble pops and moves. */
  bankPopAt: 20,

  /** The richest carrier wears the crown: everyone hunts them. */
  /** Crown is earned at `min` carried and lost below `keep` (hysteresis keeps it readable). */
  crown: { min: 12, keep: 6, dropMult: 2, stealBonus: 2, bounty: 3 },

  /** Rob someone who robbed you within this window → bonus. */
  revenge: { window: 25, bonus: 2 },

  /** Round twists (Round Roulette). */
  mods: {
    giant: { waveScale: 0.45, value: 3 },
    thieves: { stealMult: 2, grabCdMult: 0.6 },
    bombs: { every: 3.2, fuse: 1.6 },
    turbo: { speedMult: 1.35 },
    magnet: { radius: 2.8 },
    goldrush: { jackpotEvery: 9 },
    double: { bankMult: 2 },
  },

  /** Map events. */
  hazards: {
    traffic: { first: 12, every: 15, warn: 2, speed: 16, halfWidth: 1.25, knock: 5.5 },
    bell: { first: 14, every: 20, warn: 2.5, radius: 2.1, stun: 1.0 },
  },

  layout: {
    wellRadius: 1.15,
    /** Collision radius per obstacle kind (see shared/sim/layout.ts). */
    radius: { well: 1.15, trees: 1.0, rock: 0.95, crates: 0.85, barrels: 0.6, cart: 0.85 },
  },

  abilities: {
    rattleBurst: { cooldown: 12, radius: 3, knockback: 5, extraDrop: 1, castDelay: 0.25 },
    stickyFingers: { cooldown: 14, buffSeconds: 4, steal: 6, pull: 2, castDelay: 0.1 },
    groundSlam: { cooldown: 10, coneDeg: 70, range: 3.5, stun: 1, knockback: 1.5, castDelay: 0.35 },
  },

  rewards: {
    firstRoundWinCoins: 100,
  },
} as const;

export type Tuning = typeof TUNING;

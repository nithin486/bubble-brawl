// Every gameplay number lives here so playtests can change feel without touching code.
// Units: metres, seconds, coins. Values come from docs/IMPLEMENTATION_SPEC.md → tuning table
// unless a comment says why they differ.

export const TUNING = {
  sim: {
    /** Fixed simulation step on the client (server will use 1/20). */
    dt: 1 / 60,
  },

  match: {
    rounds: 1,
    /** Weapon Brawl: the round twist changes this often (seconds). */
    twistEvery: 45,
    roundSeconds: 180,
    /** Long enough to read the round twist card. */
    countdownSeconds: 3,
    roundEndSeconds: 1.2,
    playersPerMatch: 6,
  },

  hero: {
    height: 1.8,
    radius: 0.45,
    /** Heroes keep this much distance between centres so crowds stay readable. */
    personalSpace: 1.2,
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
    /** Visible lunge before the grab lands — long enough to see and dash away from. */
    windup: 0.22,
    /** Extra reach from the lunge. */
    lunge: 0.7,
    /** A whiffed grab leaves you stumbling this long. */
    missRecover: 0.35,
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
    /** The last stretch: double points while the edges crumble. */
    seconds: 30,
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
      /** How long into the match they stay easy. */
      seconds: 145,
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

  /** Dashing through an attack at the right moment. */
  dodge: { dashRefund: 0.5 },

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
    // weapons-mode twists
    rapid: { cooldownMult: 0.5 },
    ammo: { mult: 2 },
    boxfest: { respawnMult: 0.25 },
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
    rattleBurst: { cooldown: 12, radius: 3, knockback: 5, extraDrop: 1, castDelay: 0.4 },
    stickyFingers: { cooldown: 14, buffSeconds: 4, steal: 6, pull: 2, castDelay: 0.1 },
    groundSlam: { cooldown: 10, coneDeg: 70, range: 3.5, stun: 1, knockback: 1.5, castDelay: 0.45 },
  },

  /** Shop coins are scarce on purpose: an ordinary match pays about 10, a win about 25. */
  rewards: {
    firstRoundWinCoins: 30,
    perMatch: 5,
    /** One more coin for every this many points. */
    pointsPerCoin: 5,
    win: 15,
    podium: 5,
  },

  /** Weapons mode: mystery boxes, 6 weapons, health and Bubble KO. */
  weapons: {
    /** Health bar: 0..100. Every attack's damage is in "hits"; one hit takes hitHp (3 hits knock you out, as before). */
    hp: 100,
    hitHp: 34,
    /** Punch (no weapon): uses the grab timings, does this much damage. */
    punchDamage: 1,
    boxes: { count: 6, respawn: 5, pickupRadius: 1.1 },
    /** Box odds (relative). */
    odds: { blaster: 3, rocket: 2, banana: 2, freeze: 2, hook: 2, hammer: 2 },
    /** The Bubble Laser: an instant beam. Hold fire to keep shooting; about eight hits knock a rival out. */
    blaster: { ammo: 26, cooldown: 0.16, range: 18, damage: 0.4, knock: 0.22 },
    /** Bot beam wobble in degrees: [weakest, strongest] bots. */
    botSpreadDeg: [11, 3.5],
    rocket: { ammo: 2, cooldown: 0.6, speed: 15, range: 16, damage: 2, knock: 4, blast: 1.3 },
    banana: { ammo: 3, cooldown: 0.4, trigger: 0.85, slip: 1.3, damage: 1, life: 25, arm: 0.6 },
    freeze: { ammo: 1, cooldown: 0.5, throw: 7, flight: 0.7, radius: 2.8, freeze: 1.8, damage: 1 },
    hook: { ammo: 2, cooldown: 0.5, range: 10, coneDeg: 30, damage: 1, pullTo: 1.3 },
    hammer: { ammo: 3, cooldown: 0.7, windup: 0.25, radius: 2.7, damage: 2, knock: 3.2 },
    /** Damage from hero skills and map events. */
    skillDamage: { rattleBurst: 1, groundSlam: 1, stickyFingers: 1, bomb: 2, traffic: 2, bell: 1 },
    bubble: {
      /** Seconds trapped if nobody pops it. */
      seconds: 3.5,
      /** Each button mash shaves this much off. */
      mash: 0.16,
      rise: 2.2,
      popRadius: 1.9,
      koPoints: 1,
      popPoints: 1,
      /** A KO counts for whoever hit you within this many seconds (also falls). */
      creditWindow: 6,
    },
    respawnInvulnerable: 1.5,
    /** Power bubbles that appear on the map: grab them mid-fight. */
    pickups: {
      first: 8, every: 9, max: 3,
      weights: { heal: 3, speed: 2, shield: 2, rage: 2, energy: 2 },
      heal: 50, rageSeconds: 8, rageDamage: 1.6, energy: 0.4, speedSeconds: 6, shieldSeconds: 10,
    },
    /** The Super meter (0..1) and the four hero Supers. */
    super: {
      /** Charge per "hit" of damage dealt, per KO, per bubble popped, and per second just playing. */
      perHit: 0.08, perKo: 0.18, perPop: 0.1, perSecond: 0.007,
      overdrive: { seconds: 7, speed: 1.2, damage: 1.4, cooldownMult: 0.7 },
      quake: { radius: 8, damage: 1.6, knock: 5.5, shield: 2, chargeRate: 0.75 },
      rush: { seconds: 7, speed: 1.55, heal: 60, dashCooldown: 0.5, damage: 1.35 },
      titan: { seconds: 8, resist: 0.4, touchRadius: 2.1, touchDamage: 1, touchEvery: 0.6, knock: 3.5 },
    },
    /** Every this many KOs without being knocked out: a reward. */
    streak: { every: 3, heal: 50, speedSeconds: 5, charge: 0.3 },
    /** After a freeze or banana slip ends you can't be stunned again for this long (no stun-locking). */
    stunImmunity: 1.2,
  },
} as const;

export type Tuning = typeof TUNING;

# Implementation spec — Step 1: single-player slice

Goal of Step 1: a single-player Coin Clash match against bots that is **fun enough that friends ask for another match**. No server yet. Everything here is a starting point for playtests; change numbers in the config, not in code.

## Scope

- 1 arena, 1 mode (Coin Clash), 6 characters per match (player + 5 bots).
- 3 heroes: **Bones** (starter), **Pinch**, **Grizzle**. Bots use the same 3.
- Full round loop: 5 rounds × 75 s, results screen, one-tap **Rematch**.
- Desktop and mobile controls; landscape only (show "rotate your phone" in portrait).
- Out of scope for Step 1: online play, accounts, shop, quests, other heroes, sound polish.

## Architecture rule (do this from day one)

Put the game simulation (movement, coins, hits, banking, abilities, bots) in a **pure TypeScript module with no Three.js or DOM imports** (`shared/sim/`). The client renders it. In Step 2 the same module runs inside the Colyseus server, so online play is the same game, not a rewrite.

Suggested layout:

```
client/            Vite + Three.js app (rendering, input, UI overlay, audio)
shared/sim/        simulation: world state, tick(dt, inputs), rules, bots
shared/config/     tuning.ts — every number below, in one place
server/            (Step 2) Colyseus rooms that run shared/sim
assets/heroes/     GLB models
docs/              design docs
```

## Arena

- Floating round island, radius **14 m**, flat with gentle bumps only (no platforming, no gravity tricks).
- **Bubble Bank:** glowing ring, radius 2 m. Moves every **20 s** between 6 spots on a circle of radius 8 m; the next spot is shown **3 s** before it moves (beam of light + arrow on screen edge).
- **4 bounce pads** near the edge that launch you 6 m toward the centre.
- **Edge:** falling off drops all carried coins at the edge, respawn after **2 s** with 1 s of invulnerability.
- **Last 15 s of a round:** the outer ring crumbles (tiles fall, telegraphed 2 s ahead) down to radius **8 m**; coin waves double; banked totals are hidden.
- Look: bright stylised fantasy island over a violet sky (match `docs/ui/` colours). Use CC0 kits in the same style as the heroes (KayKit Prototype Bits on GitHub, KayKit environment packs, Kenney platformer kit). Soft shadows, light bloom on coins and the bank.

## Tuning table (`shared/config/tuning.ts`)

| Name | Value | Notes |
|---|---|---|
| Hero height | 1.8 m | normalise every model to this |
| Walk speed | 6 m/s | |
| Carry slowdown | −5% per 10 carried coins, floor 60% | glow brightness rises with carried coins |
| Dash | 5 m in 0.25 s, cooldown 3 s, 0.2 s invulnerable | |
| Grab | 60° cone, 1.6 m range, steals 3 coins, cooldown 1.2 s | stolen coins fly to the grabber |
| Hit drop | 30% of carried (min 1, max 10), scattered within 2 m | any hit: grab, ability, slam |
| Knockback | 4 m base | |
| Banking | stand in the bank 1.5 s; any hit cancels | progress ring over the player |
| Coin waves | every 8 s, 24 coins, max 120 loose coins | ×2 in the last 15 s |
| Round / match | 75 s × 5 rounds | winner = most banked coins over all rounds |
| Respawn | 2 s, then 1 s invulnerable | |

Hero abilities (Step 1 heroes):

| Hero | Ability | Cooldown | Exact effect | Animation |
|---|---|---|---|---|
| Bones | Rattle Burst | 12 s | Ring radius 3 m around self; knockback 5 m; each rival hit drops 1 extra coin | `Cheer` or `Spellcast_Raise` |
| Pinch | Sticky Fingers | 14 s | For 4 s, next Grab steals 6 and pulls the target 2 m toward Pinch | `Dualwield_Melee_Attack_Stab` |
| Grizzle | Ground Slam | 10 s | Cone 70°, 3.5 m; stun 1 s; normal hit drop | `2H_Melee_Attack_Chop` |

All 8 heroes' abilities are in `CLAUDE.md`; add the other 5 in Step 3.

## Bots

Simple state machine per bot, re-evaluated 5×/s with a reaction delay:

1. **Collect:** go to the nearest cluster of loose coins.
2. **Bank:** when carried ≥ personal threshold (random 8–20), go to the bank.
3. **Steal:** if a rival within 6 m carries more than the bot and Grab is ready, chase and grab.
4. **Flee:** if carrying ≥ 10 and a rival is closing in, Dash away toward the bank.
5. **Skill:** use the ability when it would hit ≥ 2 rivals, or 1 rival carrying ≥ 8.

Difficulty per bot: reaction 0.25–0.6 s, aim error, speed 90–100%.
**First match only:** bots react slower (0.6 s), bank early (threshold 6), and never target the player with abilities in round 1, so the player wins round 1. Label bots as bots on the results screen.

## Camera

- Perspective, FOV 45°, follows the player from about 14 m up and 11 m behind, looking slightly ahead of the player.
- Smooth follow (critically damped), small lead in the movement direction; brief shake on hits taken (with a setting to turn shake off).
- Off-screen rivals carrying lots of coins get an edge arrow with their coin count.

## Controls

- **Desktop:** WASD or arrows to move, Space = Dash, J or left click = Grab, K or right click = Skill. Movement is camera-relative.
- **Mobile:** floating joystick on the left half of the screen; on the right a big **Skill** button with a cooldown ring, plus **Grab** and **Dash**. Buttons ≥ 64 px, no accidental zoom or scroll.

## First session

1. Page opens straight into a match as Bones (no menu). Load target: first input in under 5 s.
2. Three one-line prompts, one at a time: "Move", "Grab a coin", "Bank it!" (shown when carrying ≥ 5).
3. Skill button pulses "Press SKILL!" the first time a rival is within range.
4. Player wins round 1; confetti, +100 coins.
5. After match 1: unlock Pinch, show Rematch (primary) and a hero picker.

## Feel (this is what makes it fun — don't skip)

- Hit-stop of 60 ms on every hit, coin burst particles, numbers popping (+3, −5).
- Squash-and-stretch on dash and landing; footstep dust.
- Banking: rising "cha-ching" with coins flying into the bank.
- Big banners for moments: "STOLEN 6!", "BANKED 24!", "STUNNED!".
- Placeholder sounds are fine in Step 1, but every action must have one.

## Performance targets

- Initial download under 10 MB: compress hero GLBs (meshopt or Draco), strip unused animations, load only Step 1 heroes.
- 60 fps on desktop; at least 30 fps in Chrome mobile emulation with 4× CPU slowdown and 6 characters on screen.
- Instanced meshes for coins; one shadow-casting light.

## Analytics (log to console + localStorage in Step 1)

`session_start`, `first_input` (ms since load), `match_start`, `round_end` (banked, stolen, steals), `match_end` (rank), `skill_used`, `rematch_click`, `hero_selected`, `first_seen` date (for Day-1 return checks).

## Step 1 is done when

- [ ] A full 5-round match plays start to finish with no errors; Rematch works.
- [ ] First input under 5 s on a throttled mobile profile; download under 10 MB.
- [ ] 30+ fps on throttled mobile; 60 fps desktop.
- [ ] Nithin has seen a screen recording and approved the look.
- [ ] **Gate:** 5 friends play it without explanation; at least 4 ask for another match unprompted, and they understand banking without being told.

## Additions after the first playtest (Nithin: "only clicking buttons, not interesting")

Added on top of the original Step 1 scope; all numbers are in `shared/config/tuning.ts`:

- **Power bubbles** (`powerups`): one spawns every 11 s (max 2): Magnet (pulls coins 6 s), Speed Boots (×1.45, no carry slowdown, 5 s), Bubble Shield (blocks the next hit, 10 s), Bubble Bomb (planted at your feet, 1.3 s fuse, 3.6 m blast).
- **Wishing Well jackpot** (`jackpot`): the centre well bubbles for 2.5 s, then erupts 16 coins + one golden coin worth 5 (first at 16 s, then every 24 s; ×1.5 in the finale).
- **Combo counter** (`combo`): quick pickups chain; visual only for now.
- **Map**: village island with roads, well, beach rim, solid cover props; waterfalls, windmill, drifting bubbles.
- **Skill feel**: wind-up glow, shockwave domes, debris, ground cracks, camera punch, screen flash, slow motion on big hits.
- **Landing page** with live attract-mode match behind it (PLAY is still the only click before a match).

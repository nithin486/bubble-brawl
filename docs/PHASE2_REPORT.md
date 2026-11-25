# Phase 2 report: Bubblegum Islands + six redesigned weapons

Design and numbers: `docs/PHASE2_DESIGN.md`. Assets and licences: `docs/ASSET_MANIFEST_PHASE2.md`. Images: `assets/phase2/renders/` (`game/` = real in-game screenshots, `weapons/` + `weapons_contact_sheet.jpg` = Blender showcase renders, 5 views per weapon).

## What shipped

* **New map `bubblegum` ("Bubblegum Islands")**, first in the map rotation (Candy Town and Desert still there). 133 tiles, ~64 m across: central island with an octagon plaza (+1.2 m) and the Bubblegum Fountain landmark, four satellite islands, four corner islets with raised nests, 12 bridges with real rails, 12 floating backdrop islets (waterfalls, castle, crystal garden), soap bubbles rising round the fountain.
* **Six weapons modelled from scratch in Blender**, same names/functions: Bubble Blaster, Rocket Launcher (+ its own missile model), Banana Trap, Freeze Bomb, Grapple Hook, Thunder Hammer. Held props re-gripped for the Ranger hero.
* **Mechanics hardening (all in the authoritative sim)**: hook needs line of sight and is stopped by rocks/rails, pulls step by step and never through walls or off the island; weapon stuns (freeze, banana slip) can't be chained (1.2 s immunity after, `TUNING.weapons.stunImmunity`); all status times expire.
* **Effects**: ice block on frozen heroes, thunder lightning bolts radiating from the hammer, teal energy cable for the hook, banana arming lamp (blinking red, steady green + ring when armed), drop bounce, peel burst on slip, rocket missile model with exhaust trail, muzzle bubbles / back-blast smoke, weapon cooldown ring on the action button. Ground effects now ride raised plazas/ramps (before they would have drawn under the floor). Effects reuse shared geometry; all are removed when finished.
* **Bots** now route over bridges (`Arena.route`, tile graph), never dash off edges and sidestep when wedged (this also lowered stuck time on every map).

## Tests (`npm test`)

* `tools/weapons-test.ts` (new, 40+ checks on the real sim): damage per weapon, cooldowns, rocket radius (inside hurts / outside doesn't), banana arm delay + slip time + no stun-lock, freeze group + duration + immunity, hook hit / blocked by rock / miss / never over open air, hammer radius + knockback, no leftover projectiles/traps, no permanent status. All pass.
* `tools/map-reach.ts bubblegum`: every spawn, bank spot, mystery box and deck reachable with the real hero; can walk back out of every deck; 100% of walkable ground reachable (1 cell pocket). `tools/map-gaps.ts` lists any gap < 1.4 m between solid things.
* `maps-smoke` / `weapons-smoke` include the new map: 15 KOs/min (Candy 15), banked per player per round ~39 (Candy ~26-45), stuck 4-7 % (Candy ~1-2 %: bridges and ramps are chokepoints on purpose), ~25 falls per bot match (islands have edges).

## Performance (measured with `tools/perf-map.mjs` in the real game, software GL, so fps numbers are NOT meaningful, draw calls / triangles are)

| | draw calls | triangles / frame (incl. shadow pass, 6 heroes) | JS heap |
|---|---|---|---|
| Candy Town (reference) | 223 | 367k | |
| Bubblegum Islands (all 6 players = Ranger, worst case) | 267 | 610k | 63 MB |

The Ranger's 29k triangles are most of the excess (6 Rangers = 175k x 2 passes); with normal KayKit heroes the map is ~330-400k. Over the 300k phone budget: see known issues. Art pack `env_bubblegum.glb` = ~0.55 MB, loaded only when the map is chosen; each weapon GLB 40-80 KB.

## Known issues / honest gaps

* Triangle count is above the 300k phone target when several Rangers are in a match (Phase 1 flaw). Map pieces were already cut by ~40 %; next steps: Ranger LOD, fountain LOD (12k triangles), fewer tile sprinkles.
* Not measured on a real GPU or phone (only software GL here), no throttled-mobile run, no long-session soak test.
* No visual test of the multiplayer (PeerJS) path: effects are driven by the same sim events as before, nothing new is sent over the network; the sim changes (stun immunity, hook) live on the host.
* Weapon sounds are the existing synthesized ones (a bit generic); no new audio.
* Walkable pockets: one 0.5 m cell near an islet crystal.
* Dash (5 m) can cross the 4 m void gaps between islands: a deliberate risk/reward shortcut, not required for any route.
* Hook cable and lightning use short-lived tubes (a handful per use, disposed afterwards), not a pooled mesh.
* Poly Pizza/Sketchfab were not searched (BlenderMCP source off); everything is original Blender work.
* The Banana Trap / Freeze Bomb held poses were checked in-game from a top camera only.

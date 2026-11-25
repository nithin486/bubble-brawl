# Phase 3 report: map polish, new lobby, UI and HUD

All screenshots are real in-game frames. Before/after sheets: `phase3/compare-desert.jpg`, `compare-candy.jpg`, `compare-ui.jpg`, `compare-phone.jpg` (left = before, right = after). Full sets: `phase3/before/`, `phase3/after/`. Gameplay clips (10 s each, autoplay): `phase3/after/clips/*.webp`.

**Not pushed, not deployed.** Everything, including the rebuilt `site/`, is committed locally on `claude/youthful-wright-wwuz3r`; pushing and merging to `main` wait for Nithin's approval. Note: `deploy/worker.js` in the repo reads this branch's `site/` (the session that relayed the task says the live site reads `main`), so treat a push of this branch as possibly going live.

## Audit (stage A): what made Bubblegum Islands look better

Own modelled pieces with colour variation and baked contact shading, a real edge around the ground, a landmark, and a populated background. Desert and Candy had flat tiles, bare edges, little architecture (desert had none) and an empty horizon. The UI had unreadable settings/pause titles, and the loading logo sat in the corner.

## Shipped

* **Desert Outpost:** own Blender pieces (sandstone walls, layered rocks, saguaro and prickly pear, watchtowers, adobe houses, arches, market stall, rope bridges, rock shelves, kerb). An outpost village on eight shelves around the arena. Calmer ground colours. Cars, crates, barrels and dead trees kept.
* **Candy Town:** frosted tiles, layer-cake blocks, wafer ramps with candy kerbs, icing edge, bubblegum fountain, orchard trees; gingerbread houses, candy towers, cake islands and wafer bridges around the arena. Cupcakes, gumdrops, pillars, chocolate and ice creams kept.
* **Collision and layouts:** unchanged (nothing under `shared/` was touched).
* **Lobby:** profile (name, level, XP), coins, sound and settings buttons, four hero portraits, map cards with in-game thumbnails, how-to-play with the weapon arsenal, larger PLAY. Layouts for desktop, tablet, phone and very short phone screens.
* **UI/HUD:** one token file (`client/src/ui/theme.css`) and one icon set; six-slot weapon rack (held weapon, ammo, reload); knocked-out card; settings with switches; victory/defeat and round screens; loading screen with percentage; favicon.
* **Fixes found while testing:**
  * Every map switch and rematch leaked GPU memory (1,659 geometries after 18 map switches). Now flat at about 130–140.
  * The Enter key stayed bound after the results screen and could restart a later match.
  * The "medium" graphics tier (the phone default) ran at about 8 fps on an Intel HD 620 because of post-processing. Medium now skips it: 22–29 fps. Medium therefore looks a little flatter (no bloom or colour grade); "high" keeps both.
  * The finale banner said "coins ×2" in Weapon Brawl.

## Tests

| Test | Result |
|---|---|
| `npm test` (simulation, maps, weapons, Bubblegum reach) | all pass |
| `tools/ui-test.mjs` (real clicks, keys, touches; log in `phase3/ui-test.log`) | 69 of 69 pass, no browser errors: menus, settings, hero and map pickers, keyboard, six weapons, pause, round and match end, rematch, quit, saved-map reload, phone multi-touch, overlap and button size, rotate prompt, load failure, memory over repeated switches and sessions |
| `tools/net-test.mjs` (two browsers, one room; `phase3/net-test.log`) | 9 of 9 pass: create, join, start, movement sync, round end |

The weapon check allows a second key press: a press that lands during another action's wind-up is ignored by the game, which made a single-press check fail now and then.

Reach tool on the unchanged layouts: all walkable ground is reachable on Desert and Candy. It also flags 4 Desert start points (they overlap barriers) and 2 Candy deck probe points. Both predate this phase.

The game has no jump, so ramps and movement were tested instead. Movement was tested by keys and touch, not by walking every route by hand.

## Performance

Machine: the laptop's Intel HD 620, Chrome with GPU, phone-size viewport. No real phone was tested. Raw numbers: `phase3/after/perf-compare.txt` (old and new build, same session, fixed quality, two runs each).

| Phone viewport | fps before → after (low) | fps before → after (medium) | triangles at low |
|---|---|---|---|
| Desert | 44.6 → 44.5 | 8.3 → 25.7 | 231k → 326k |
| Candy | 43.1 → 38.1 | 7.4 → 24.8 | 247k → 335k |
| Bubblegum (map unchanged) | 42.8 → 38.5 | 8.8 → 27.8 | 356k → 349k |

* Run-to-run noise is about ±8 fps (Bubblegum "before" read 46.7 and 38.8). Candy at low is probably a real loss of about 10 %.
* **Over budget:** all three maps draw about 325–350k triangles with six heroes, above the 300k target. Heroes are about 110–150k of that. Draw calls are about 180–200 at low (budget 250), higher at medium.
* **JS memory is up** on the two enhanced maps: about 55–70 MB → 80–90 MB.
* **Downloads:** `env.glb` 1.91 → 2.21 MB (loaded at start, holds the Candy pieces), `env_desert.glb` 1.13 → 1.15 MB. Three map thumbnails add about 68 KB.
* The 60 fps desktop target is **not met** on this GPU: the 1366×768 autoplay runs in `after/perf.json` average 12–17 fps, including start-up stalls (before: 6–11 fps). Not tested on stronger hardware.

## Decisions taken without asking

1. The weapon "slots" are a status display, not buttons: the game gives one random weapon per mystery box, so selectable slots would do nothing.
2. No loadout, daily reward, jump button or new currency was added.
3. Game mode shows as information because only one mode exists.
4. Candy pieces stay in the start-up download.
5. Unused scanned desert models (tyre, barrier, quiver trees, boulder) were removed.

## Remaining issues

* Triangle budget and memory, above. Next steps: lighter Ranger model, move Candy pieces into their own pack, drop far scenery on "low".
* A giant mushroom can block the camera at some Bubblegum spawns (seen before this phase; not fixed).
* On phones, the skill name banner and the tutorial prompt can overlap.
* The new buildings sit outside the arena: they are scenery and cannot be walked on.
* Not tested: a real Android phone, throttled mobile network, long soak runs, friends rooms across two networks.
* A long-running `npm run dev` server kept serving old HUD styles; restart it after pulling these changes.

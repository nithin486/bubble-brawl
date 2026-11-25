# Phase 4 report: release candidate

Committed locally on `claude/youthful-wright-wwuz3r`. **Not pushed** (pushing this branch updates the live site).

## What changed

**Shooting**
* The Bubble Blaster is now the **Bubble Laser**: an instant beam, hold to keep firing, 26 shots, about 8 hits to knock a rival out, stopped by props and cliffs. It does not stagger, so it cannot stun-lock.
* With a weapon the camera moves over the right shoulder, the hero faces the crosshair while running any way, and guns point where you aim (legs run, arms hold the aim).
* Crosshair kick, hit marker, gold knock-out marker. Small aim assist (stronger on touch, never through walls).
* Touch: hold the fire button and slide it to aim; optional auto-fire when the crosshair is on a rival (on by default). Settings: aim speed.

**Levels** (`client/src/progress.ts` holds every number)
* Start: Ranger, Bubblegum Islands, Laser, Rocket, Banana, Hook.
* Level 2 Candy Town · 3 Bones · 4 Freeze Bomb · 5 Desert Outpost · 6 Pinch · 7 Thunder Hammer · 8 Grizzle.
* Three missions at a time, paying XP. Level-up screen shows what unlocked. Quitting keeps the XP of finished rounds.
* Bots start gentle, get sharper with level, and ease off after a bad result.
* Existing players start on the Ranger and Bubblegum; their XP counts. The "all heroes unlocked" playtest switch is gone.

**Release items**
* Matches are 3 rounds (were 5), for quicker rewards.
* "Play with friends" shows SOON and is disabled; invite links do nothing.
* Collision circles now match the models (`tools/collision-audit.mjs`: nothing sticks out more than 0.35 m). Walk-through ground dressing is grass only. Desert start points no longer overlap barriers.
* Props right in front of the camera fade out.
* Credits screen, web app manifest and icons.

## Aim rework (after playtest feedback)

* The shot goes to exactly the point under the crosshair, in three dimensions: over low cover, stopped by tall props, ground and decks. Heights are in `shared/sim/ray.ts`.
* No mouse aim snapping. Touch keeps a small optional aim assist.
* New over-the-shoulder camera: it looks exactly where you aim, never lags, turns by itself or re-targets your hero near walls.
* PLAY captures the mouse (raw movement where the browser allows); Esc releases it and pauses; "CLICK TO AIM" shows when it is free.
* The laser beam is thick, unbroken while fire is held, with a muzzle flash and impact burst. Damage numbers show health points.
* `tools/aim-test.mjs` measures this in the real game.

## Smoothness pass

Causes found by measurement, and the fix:

* The automatic graphics switch rebuilt every shader mid-match. The tier is now picked once from the GPU; while playing only the picture resolution changes.
* Each new match recompiled shaders (materials were disposed). They are kept.
* Shaders are compiled behind the loading screen without blocking it; hero and weapon pictures are files, not rendered at start.
* Heroes and held weapons were 16-37 draw calls each; their parts are merged.
* See-through surfaces made three.js look their shader up on every frame.
* The HUD rewrote parts of itself every frame, generated images on weapon pickup and forced page layout on speech bubbles and shots.
* Every hit froze the game for 60-90 ms.
* The same map is reused for the next match.

`tools/smooth-test.mjs`, desktop 1366x768, Intel HD 620, another browser tab using about 80% of the graphics chip (both builds measured back to back):

| | previous release | now |
|---|---|---|
| Load to lobby | 107 s | 24 s |
| PLAY to playing | 65 s | 8.6 s |
| Average fps | 1.5 | 18.6 (second match 20) |
| Worst freeze | 17.1 s | 0.38 s |

Still short of smooth on this machine in these conditions. Not measured with an idle graphics chip or on a phone.

## Tests

| Check | Result |
|---|---|
| `npm test` | all pass |
| `tools/ui-test.mjs` | 84 checks, then a test-only timeout on a pulsing button; the remaining 17 pass when rerun |
| `tools/net-test.mjs` (friends turned on with `?friends`) | 9 of 9 on the previous release; not rerun |
| `tools/aim-test.mjs` | 29 of 30 on-target shots (the miss was a displaced test hero); other checks pass |
| `tools/collision-audit.mjs` | pass on the previous release; layouts unchanged since |
| Speed, phone-size, low graphics, Intel HD 620 | Bubblegum 45 → 44 fps, Candy 45 → 46 fps (previous release → this one) |

## Before a public launch

* **Play it on a real Android phone.** Nothing here was tested on one, and aim feel needs a human thumb.
* Analytics only writes to the browser (`client/src/analytics.ts`): you will not see play time or retention until it sends to a server.
* No privacy policy page; the Play Store requires one.
* No service worker, so no offline install. Play Store packaging (Bubblewrap) and ads/purchases are not done.
* The site is served from GitHub raw files through a Worker; use Cloudflare static assets (`npm run deploy`) before real traffic.
* Each map draws about 330–400k triangles, above the 300k phone target.
* The game name has not been checked on Play or the portals.

# CLAUDE.md — read this first, every session

You are building **Bubble Brawl**, a 3–8 player online party brawler for the web (PWA) and Google Play (TWA). This file is the project's memory: who it is for, why it exists, what was decided, and how to work. Full detail lives in `docs/`.

## The person you are working with

- **Nithin** (GitHub `nithin486`): final-year Computer Science student in India (graduating May 2027), strong competitive programmer. He builds this game on his own, alongside college.
- He talks in short, fast messages, often with typos. Answer **short and direct**; one line when he asks for one line. Show pictures or a playable build instead of long explanations when you can.
- He wants **honest answers**, including "no" and "this is a guess". Never oversell.

## Why this game exists (intent and feelings — take this seriously)

- His previous game, **Upside Down Run** (formerly *Flip The Rule*, a 40-level gravity-flip puzzle platformer, Phaser 3 + TypeScript, repo `nithin486/flip-the-rule`), was **rejected by CrazyGames at Basic Launch**. It was technically solid; players just left. Numbers he received:
  - Played ≥1 minute: 44% desktop, 15% mobile
  - Average playtime: 2m22s desktop, 0m53s mobile
  - Day-1 retention: 0.46% desktop, 0.84% mobile
- That rejection hurt. His words: *"this time won't miss, learn from failures"*, *"be more serious"*. He wants a game people **get addicted to and play with friends**, that can reach the **top of CrazyGames**, and that earns real money: target **₹50 lakh**.
- He is ambitious and impatient to see results; he is also trusting you with something that matters to him. Protect him from repeating the old mistakes: a weak first minute, nothing to come back for, a solo game with fixed content.

## Non-negotiables (from his feedback)

1. **Graphics must look good — never "blocky" or "cheap AI".** References he named: GTA, Smash Karts. Hand-made primitive shapes were rejected twice. Use the real rigged models in `assets/heroes/` and matching CC0 environment kits. If something looks cheap, say so and fix it before showing him.
2. **No gravity mechanics.** He was tired of gravity-based ideas ("why gravity idea every time"). Gravity-flip belongs to the old game.
3. **Multiplayer with friends** is the point: share a link, friends land in the same room, bots fill empty seats.
4. **The first minute decides everything:** first input in under 5 seconds, no menu, no login, no tutorial screen.
5. **No pay-to-win.** Purchases are cosmetic or convenience only; every hero is earnable for free.
6. Keep it **light for low-end Android phones in India** (3 GB RAM, mobile data).

## What the game is

**Carry-and-bank brawler:** grab coins → carrying more makes you slower and glow brighter → any hit makes you drop some → only coins deposited at the moving **Bubble Bank** are safe. Every second is greed vs. safety. 75-second rounds, 5-round matches, one-tap Rematch.

### The 8 heroes (models in `assets/heroes/`, all CC0 KayKit, same rig, ~76 animations each)

| Hero | Model file | Role | Ability (cooldown) |
|---|---|---|---|
| Bones | Skeleton_Minion.glb | Balanced | Rattle Burst (12 s): knockback ring, each rival hit drops 1 coin |
| Pinch | Rogue.glb | Thief | Sticky Fingers (14 s): next Grab steals double and pulls the target in |
| Grizzle | Barbarian.glb | Bruiser | Ground Slam (10 s): forward cone, 1 s stun, breaks Shield Wall |
| Sir Clank | Knight.glb | Tank | Shield Wall (16 s): 4 s wall that blocks grabs and pushes |
| Dash | Skeleton_Rogue.glb | Speedster | Turbo Trail (13 s): 3 s boost, no carry slowdown, drops 1 coin/s behind |
| Shade | Rogue_Hooded.glb | Trickster | Smoke Swap (18 s): swap places with a rival, leave a decoy |
| Nova | Mage.glb | Disruptor | Zap Chain (15 s): hits up to 3 nearby rivals, 40% slow |
| Frostbite | Skeleton_Mage.glb | Controller | Ice Slide (14 s): slide forward leaving ice that makes rivals slip |

Each KayKit model contains every weapon/prop; show only the one each hero uses (see `assets/heroes/README.txt`). The Figma concept art in `docs/ui/` shows an earlier blob-style roster; **the KayKit roster above replaces it**, but the UI layout, colours and HUD ideas still apply.

## Decisions already made

- **Client:** Three.js + TypeScript + Vite; UI as an HTML/CSS overlay. One build for portals, own site and the Play app, with a platform switch.
- **Multiplayer:** Colyseus (Node.js), server-authoritative, 20 ticks/s, state sent 15×/s, client prediction for own movement. Target < 1.5 KB/s per player.
- **Backend:** Azure Functions (API) + Cosmos DB free tier. Game servers on Azure for Students free VMs (B1s / B2ats v2). Budget: $100 Azure student credit — network egress is the real cost.
- **Static hosting:** Cloudflare Workers static assets (as for the old game).
- **Play Store:** Bubblewrap TWA + Play Billing via Digital Goods API (see `docs/GDD.md` Phase 4).
- **Monetization:** cosmetics, ₹99 season pass, starter pack, optional rewarded ads. No loot boxes for money.
- **Open decisions (ask Nithin, don't assume):** CrazyGames vs Poki (Poki deals are usually web-exclusive); final game name (check it is free on Play and portals).

## How to work

1. Follow the **build steps and gates** in `docs/GDD.md` → "Prototype plan". Do **not** start the next step until the current gate passes. Current step: **Step 1 — single-player slice** (spec in `docs/IMPLEMENTATION_SPEC.md`).
2. Use the numbers in `docs/IMPLEMENTATION_SPEC.md` → tuning table. Keep every tunable in one config file so playtests can change them without code edits.
3. After each meaningful change: run it, take a screenshot or short clip, and look at it yourself before calling it done. Ugly or confusing = not done.
4. Keep the game fast: measure load size and FPS on a throttled mobile profile.
5. Commit small, with clear messages. Never commit secrets (Azure keys, Play service-account JSON).
6. When something in the plan is wrong, say so plainly and propose the fix.

## Map of the repo

- `docs/GDD.md` — full game design document and technical blueprint (concept, loops, monetization, architecture, PWA/TWA checklists, build plan, risks).
- `docs/IMPLEMENTATION_SPEC.md` — what to build in Step 1: arena, tuning numbers, bots, camera, controls, file layout, acceptance checks.
- `docs/HISTORY.md` — the story so far: old game, rejection data, ideas tried and rejected, his feedback.
- `docs/ui/` — UI concept images (thumbnails) and links to the Figma file.
- `assets/heroes/` — the 9 hero GLB models + licences.
- `assets/concepts/` — rendered roster images.

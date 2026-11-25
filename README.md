# Bubblaze

Formerly Bubble Brawl (the repository, folder and web address keep the old name).

A cartoon arena shooter for the web, CrazyGames and Google Play: 3-minute brawls, solo against bots or 2–6 friends.

**Publishing and earning:** [`docs/RELEASE.md`](docs/RELEASE.md) · `npm run release:check`

- Start here: [`CLAUDE.md`](CLAUDE.md)
- Design: [`docs/GDD.md`](docs/GDD.md)
- What to build now: [`docs/IMPLEMENTATION_SPEC.md`](docs/IMPLEMENTATION_SPEC.md)
- Background: [`docs/HISTORY.md`](docs/HISTORY.md)

## Play

**Live: https://bubble-brawl.21351cm038.workers.dev** — tap *Play with friends* → *CREATE ROOM* → send the invite link. Rooms hold 2–6 real players, no bots.

Hosting: the Cloudflare Worker in `deploy/worker.js` serves the built game from `site/` on this branch
(via raw.githubusercontent.com, cached by Cloudflare for ~2 minutes). To publish a new version:

```bash
npm run build:site && git add site && git commit -m "Update site" && git push
```

## Run it

```bash
npm install
npm run assets   # compresses heroes + env into client/public/assets (~1.4 MB)
npm run dev      # http://localhost:5173  (also reachable from a phone on the same Wi-Fi)
```

```bash
npm test         # headless: plays full bot matches through the shared sim
npm run build             # website + Android app build into dist/
npm run build:crazygames  # CrazyGames upload into dist-crazygames/
node tools/release-test.mjs   # shop, purchases, rooms, offline, CrazyGames (needs both builds)
```

Debug URL params (the test switches work on localhost only): `?fps` (FPS counter), `?q=low|medium|high` (force quality), `?autoplay` (a bot plays for you), `?speed=4` (fast-forward).

Controls — desktop: WASD/arrows move · Space dash · J or left-click grab · K or right-click skill · Esc pause. Mobile: drag on the left half, buttons on the right.

## Layout

```
client/          Vite + Three.js app (render/, ui/, input, audio, analytics)
shared/config/   tuning.ts (every gameplay number) + heroes.ts
shared/sim/      pure-TS simulation: world, arena, bots (no Three.js/DOM → runs on the server in Step 2)
tools/           asset pipeline, sim smoke test, screenshot scripts
assets/heroes/   KayKit character GLBs (source)
assets/env/      KayKit Medieval Hexagon + Dungeon Remastered pieces (source, CC0)
```

Art: KayKit Character Packs (Adventurers, Skeletons), Medieval Hexagon Pack and Dungeon Remastered by Kay Lousberg — CC0.

# Bubble Brawl

Grab it, steal it, bank it. A 3–8 player carry-and-bank party brawler for the web (PWA) and Google Play (TWA).

- Start here: [`CLAUDE.md`](CLAUDE.md)
- Design: [`docs/GDD.md`](docs/GDD.md)
- What to build now: [`docs/IMPLEMENTATION_SPEC.md`](docs/IMPLEMENTATION_SPEC.md)
- Background: [`docs/HISTORY.md`](docs/HISTORY.md)

## Run it

```bash
npm install
npm run assets   # compresses heroes + env into client/public/assets (~1.4 MB)
npm run dev      # http://localhost:5173  (also reachable from a phone on the same Wi-Fi)
```

```bash
npm test         # headless: plays full bot matches through the shared sim
npm run build    # type-check + production build into dist/
```

Debug URL params: `?fps` (FPS counter), `?q=low|medium|high` (force quality), `?autoplay` (a bot plays for you), `?speed=4` (fast-forward).

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

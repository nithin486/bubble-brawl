# History and lessons

## The old game: Upside Down Run (formerly Flip The Rule)

- 40-level gravity-flip puzzle platformer: "You can't jump. Flip gravity instead." Phaser 3 + TypeScript + Vite, repo `nithin486/flip-the-rule`, hosted on Cloudflare Workers (`upside-down-run`).
- Submitted to CrazyGames. **Rejected at Basic Launch:** "The game did not reach the performance benchmarks during Basic Launch".

| Metric | Desktop | Mobile | CrazyGames score |
|---|---|---|---|
| Overall | 4/15 | 4/15 | — |
| Average playtime | 2m22s | 0m53s | 1/5 |
| Day-1 retention | 0.46% | 0.84% | 2/5 |
| Conversion (played ≥1 min) | 44.13% | 15.46% | 1/5 |

**Lessons:** the code was fine; the first minute lost players (especially on mobile), and nothing brought them back the next day. A finite solo puzzle has no replay loop.

## Ideas explored and rejected for the new game

| Idea | Why it was dropped |
|---|---|
| Gravity Pulse, Gravity Ghosts | Nithin is tired of gravity mechanics |
| Ghost Crew (+ artifact picks with curses) | Small scope, but weaker friend/multiplayer pull |
| Artifact Runners (from a Perplexity chat) | Too large in scope for one developer |
| Lights Out Heist | Needs a mansion art pack we don't have |
| Paint Panic, Copycat Court | Weaker core loop |
| Coin Clash (party arena) | Evolved into Bubble Brawl's carry-and-bank rule |

## Art direction history (important)

- Hand-coded Three.js primitives → "looking like cheap AI", "looks like blocks". Rejected.
- Rounded procedural blob heroes → better, still simple, no animations.
- AI concept screens generated in Figma (gameplay HUD, lobby, shop, results, main menu, character select, roster key art) → liked as a UI direction.
- Final: **KayKit Adventurers + Skeletons (CC0)** rigged chibi models — consistent style, ~76 animations each. Higgsfield (AI 3D) was not available on the free plan; a freelance artist is the upgrade path after first revenue.

## Things Nithin asked for along the way

- "I need a new idea... has to be addicted... this time won't miss, learn from failures"
- "unique, not copied"
- "graphics like GTA / Smash Karts", "super fantastic", "not box shaped"
- "has to be played with friends... has to be in top at least"
- Revenue goal ₹50 lakh; Azure for Students $100 credit for the backend
- PWA for web portals + TWA for Google Play

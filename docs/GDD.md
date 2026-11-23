# Bubble Brawl — GDD & Technical Blueprint

Version: 2026-11-23 · Owner: Nithin · Live doc: https://claude.ai/artifact/EFPzNppSmGWivWGTYhxfMK (this file is the repo copy; the hero roster here is newer — KayKit heroes replace the earlier blob heroes)

## Summary

Bubble Brawl is a 3–8 player online party brawler with 8 heroes, each with one special ability, built around one new rule: **coins you carry can be stolen, and only coins you bank are safe**. It ships as a lightweight PWA on the web portals and as a Trusted Web Activity on Google Play, on a backend that starts inside the $100 Azure for Students credit.

Reaching ₹50 lakh takes roughly 300,000 monthly players with 1% paying and 1.5 rewarded ads per daily player, held for 7 months (Phase 3 has the arithmetic). That scale is only possible if the first minute and Day-1 retention are fixed, which is exactly where Upside Down Run failed on CrazyGames.

**What changes after the CrazyGames rejection**

| Upside Down Run result | Design response in Bubble Brawl |
| --- | --- |
| Conversion (played ≥1 min) 44% desktop, 15% mobile | Into a bot match in under 5 seconds; no menu, no login, no tutorial screen |
| Average playtime 2m22s desktop, 0m53s mobile | 75-second rounds, 5-round matches, a one-tap Rematch |
| D1 retention 0.46% desktop, 0.84% mobile | Daily quests, login streak, hero unlocks, friends' rooms |
| Solo puzzle with fixed content | Endless replay from other players, 8 heroes and rotating modes |

## Phase 1: Core concept and market fit

The concept is a **carry-and-bank brawler**: you scoop up coins, every hit makes you drop some, and only coins you deposit at the moving Bubble Bank count for good. Carrying more makes you slower and glow brighter, so every second is a choice between greed and safety. That one rule is what separates it from obstacle-race party games and from pure arena fighters.

**Pitch:** "Grab it, steal it, bank it. 75 seconds, 8 heroes, your friends in one link."

### The 8 heroes

Each hero has one ability on one button, a visible cooldown and a clear counter, so no hero is unbeatable. Models: KayKit Adventurers + Skeletons (CC0), in `assets/heroes/`. Cooldowns are starting values for playtests.

| Hero | Model | Role | Ability | Cooldown | Effect | Counter |
| --- | --- | --- | --- | --- | --- | --- |
| Bones | Skeleton_Minion | Balanced | Rattle Burst | 12 s | Knockback ring; each rival hit drops 1 coin | Dash out of the ring |
| Pinch | Rogue | Thief | Sticky Fingers | 14 s | Next Grab steals double and pulls the target in | Bubble Shield pickup, Shield Wall |
| Grizzle | Barbarian | Bruiser | Ground Slam | 10 s | Forward cone, 1 s stun, breaks Shield Wall | Side-step the narrow cone |
| Sir Clank | Knight | Tank | Shield Wall | 16 s | 4 s wall that blocks grabs and pushes | Ground Slam or Bubble Bomb breaks it |
| Dash | Skeleton_Rogue | Speedster | Turbo Trail | 13 s | 3 s speed boost while carrying, no slowdown | Trail drops 1 coin per second for chasers |
| Shade | Rogue_Hooded | Trickster | Smoke Swap | 18 s | Swap places with a rival; leaves a decoy | Decoy pops on any hit |
| Nova | Mage | Disruptor | Zap Chain | 15 s | Lightning hits up to 3 nearby rivals, 40% slow | Spread out |
| Frostbite | Skeleton_Mage | Controller | Ice Slide | 14 s | Slides forward leaving ice that makes rivals slip | Jump or Dash over the ice |

### Why it fits India first, then global web

- **Low-end Android first:** under 10 MB first load, 30 fps on 3 GB RAM phones, lower-quality fallback for very weak devices.
- **Data-light:** under 1.5 KB/s per player in a match (Phase 4), so a full match costs well under 1 MB of mobile data.
- **Short sessions:** 75-second rounds fit commute and break play.
- **Friends over WhatsApp:** every private room is one share link that opens straight into the room, in the browser or in the Play app.
- **Hindi plus English at launch,** with Telugu, Tamil and Bengali added once the text set is stable.
- **Sachet pricing:** ₹10–₹99 items through Play Billing, which handles UPI on Android.

### Why it can spread

1. **Friends are the content.** A match with your friends is different every time, so there is no level list to run out of.
2. **Built-in moments to share.** A last-second Smoke Swap or a 30-coin steal makes a 10-second clip, and the results screen offers "Share clip".
3. **Every invite is a new player.** Room links work without an install or account, so each share lands a playable match.
4. **Bots fill empty rooms,** so a new player never waits alone while the player base is small.
5. **Web game audiences already play this way.** Poki's 2026 report says the most common web gamer plays several times a day in 11–20 minute sessions, and 54% often play with a friend or family member ([Poki, State of Web Gaming 2026](https://poki.com/blog/state-of-web-gaming-report-2026)). Those figures come from US and UK players only.

The risk is that party brawlers depend on full rooms. Bots, private rooms and a modest launch (one region, one mode) are the hedge.

## Phase 2: Gameplay and multiplayer loops

The core loop is a 75-second round of **grab → carry → fight → bank**, and the meta loop turns every match into XP, quest progress and hero mastery so there is always a next goal.

### Moment to moment (one round)

1. **Grab.** Coins spawn in waves across the arena; walking over them picks them up.
2. **Carry.** Each 10 carried coins slows you 5% and makes your glow brighter, so rivals can spot the rich player.
3. **Fight.** Three verbs: **Dash** (dodge, 3 s cooldown), **Grab** (steal 3 coins, or 6 with Pinch's ability), **Skill** (the hero's ability). Every hit drops a share of what you carry.
4. **Bank.** The Bubble Bank floats to a new spot every 20 seconds. Standing in it for 1.5 s banks everything; you are exposed while you do.
5. **Last 15 seconds.** The arena shrinks, coin waves double, and banked totals are hidden until the end, so comebacks stay possible.

The controls are a joystick plus 3 buttons on mobile, and WASD plus 3 keys on desktop.

### Modes (rotating)

| Mode | Players | Win condition | Unlocked |
| --- | --- | --- | --- |
| Coin Clash | 3–8 | Most banked coins after 5 rounds | From the first match |
| Crown Chase | 3–8 | Hold the crown longest; carrier cannot bank | Level 3 |
| Bubble Sumo | 2–8 | Last on the shrinking platform | Level 5 |
| Duos | 4–8 (2-player teams) | Team total; shared bank | Level 7 |
| Ranked Clash | 6–8 | Coin Clash with rank points | Level 10 |
| Weekend Event | 3–8 | Twist rules (giant coins, double bank, all-Shade) | Weekends |

### First session (the minute that failed last time)

1. **0–5 s:** the game opens straight into a bot match as Bones. Three one-line prompts appear in turn: Move, Grab a coin, Bank it.
2. **30 s:** the Skill button pulses "Press SKILL!" when a rival is close.
3. **75 s:** the player wins round 1 (bots are tuned to lose it), gets confetti and +100 coins.
4. **About 2 min:** Pinch unlocks after the first match, so a reward lands inside two minutes.
5. **After match 1:** offer "Play with friends" (copy link) and "Play online". Asking for a name comes only now, as a nickname with no account.

### Meta loop (long-term progression)

- **Player level:** XP from every match; levels unlock modes, then cosmetics.
- **Hero mastery:** 10 levels per hero; level 5 unlocks a skin colour, level 10 a mastery badge and an emote.
- **Hero unlocks:** 3 free in a weekly rotation; the rest are earned with coins (about 6–8 matches each) or bought with gems.
- **Daily quests:** 3 per day, for example "Bank 50 coins with Sir Clank"; one free reroll.
- **Login streak:** 7-day calendar with a hero-trial ticket on day 3 and a chest on day 7.
- **Season (6 weeks):** free and premium reward tracks, a themed arena and a limited mode.

### Social and competitive features

| Feature | How it works | Why it matters |
| --- | --- | --- |
| Private rooms | Room code plus share link; host picks mode; bots fill empty seats | The main growth loop; CrazyGames also asks for invite links in multiplayer games |
| Party system | Invite up to 3 friends, queue together | Groups play longer and come back together |
| Friends list | Add from a match or by code; see who is online and join their room | Brings players back daily |
| Crews (clans) | 20-member crews; weekly crew score from banked coins; crew chest at milestones | Long-term belonging and weekly return |
| Leaderboards | Daily, weekly and seasonal; global, country and friends tabs | Competition without needing ranked play |
| Ranked Clash | Bronze to Diamond tiers, reset each season | Goal for skilled players |
| Referral rewards | Friend who joins via your link and finishes 3 matches gives both of you a hero-trial ticket and 200 coins | Rewards completed matches, not raw installs |
| Emotes only | Emote wheel and quick phrases, no free text chat | Safe for all ages and avoids running chat moderation |
| Share clip | Last 10 seconds recorded on the device; one tap to share | Free marketing from real players |
| Seasonal events | Diwali, Holi, IPL season and Christmas arenas and skins | Timely reasons to come back and to share |

### Anti-frustration rules

- Bots fill any room within 8 seconds and are labelled as bots in the results.
- Leavers are replaced by bots; their coins are banked automatically so teammates are not punished.
- New players are matched with other new players for their first 10 matches.
- A player who has lost 3 matches in a row gets a hidden easier bot lobby.

## Phase 3: Monetization (₹50 lakh roadmap)

Revenue comes from cosmetics, a season pass and optional rewarded ads, and nothing sold changes who wins a match. At about ₹2.37 net per monthly player, a game that grows to 300,000 monthly players passes ₹50 lakh in month 13.

### What we sell

| Item | Price | What it gives | Pay-to-win check |
| --- | --- | --- | --- |
| Starter pack (first 72 hours only) | ₹29 | Pinch skin, 300 gems, 2 hero-trial tickets | Cosmetic plus a hero any player can also earn |
| Gem packs | ₹10, ₹49, ₹99, ₹249, ₹499 | Gems for skins, emotes, trails, victory dances | Cosmetic only |
| Season Pass (premium track) | ₹99 per 6-week season | 30 cosmetic rewards and gems back | Free track gets every gameplay unlock |
| Hero bundle | ₹79 | One hero plus an exclusive skin | Every hero is also earnable with coins in 6–8 matches |
| Ad-free | ₹149 once | Removes between-match ads; rewarded ads stay optional | No gameplay effect |
| Rewarded ads (free) | Watch a video | Double match coins, quest reroll, chest open, 3-match hero trial | Capped at 10 a day |

Rules: no stat boosts, no paid power-ups, no loot boxes sold for money (chests come only from play), every hero earnable for free.

### Where each revenue line works

| Channel | Ads | Purchases | Notes |
| --- | --- | --- | --- |
| CrazyGames | Their SDK ads, revenue share | Only through options the portal supports | Split not published; launch exclusivity optional ([Playgama](https://playgama.com/blog/business-faqs/poki-vs-crazygames-vs-gamedistribution-revenue-share/), unverified) |
| Poki | Their SDK ads | Only through options the portal supports | Exclusive deals are the default; decide before applying |
| itch.io | None | Pay-what-you-want or support link | Community and feedback channel |
| Own site (Cloudflare) | Rewarded ads via a web game ad network such as Google's H5 Games Ads (approval needed) | Web checkout (e.g. Razorpay) for gems | Highest margin; home for share links |
| Google Play (TWA) | Same web ad code inside the app | Play Billing via the Digital Goods API | Play's India service fee is 15% on the first $1M a year ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)) |

Portal SDKs usually require their own ads and forbid outside ads and purchase links, so the build needs a platform switch that turns features on and off per portal.

### Revenue model

| Assumption | Value | Source |
| --- | --- | --- |
| Daily players as a share of monthly players | 20% | Planning assumption |
| Rewarded ads per daily player per day | 1.5 | Planning assumption |
| Blended rewarded eCPM, India-heavy | ₹150 (about $1.80) | Assumption; US rewarded eCPM is about $16 on Android and India runs several times lower ([Playio, 2026](https://blog.playio.co/rewarded-ad-benchmarks-2026)) |
| Monthly players who pay | 1% | Planning assumption |
| Average spend per payer per month | ₹120 | Planning assumption |
| Play service fee | 15% | Play Console Help |

Net per month = MAU × (0.20 × 1.5 × 30 ÷ 1000 × 150 + 0.01 × 120 × 0.85) = MAU × ₹2.37

At 300,000 monthly players: ₹4.05 lakh from ads + ₹3.06 lakh from purchases = ₹7.11 lakh a month. With players growing 10k → 300k over 10 months, cumulative net passes ₹50 lakh in month 13. If India eCPM is half (₹75), about month 15. Portal revenue share is upside.

### Metrics needed to get there

| Metric | Target | Upside Down Run had |
| --- | --- | --- |
| Load to first input | Under 5 s | Splash plus menu first |
| Played at least 1 minute | 70% desktop, 55% mobile | 44% desktop, 15% mobile |
| Average playtime | 10+ minutes | 2m22s desktop, 0m53s mobile |
| Day-1 retention | 15% or more | 0.46% desktop, 0.84% mobile |
| Day-7 retention | 5% or more | Not measured |
| Daily / monthly players | 20% or more | Not measured |
| Players who share a room link in week 1 | 20% or more | No sharing feature |
| Invited friends who finish 3 matches | 30% or more | No sharing feature |
| Paying share of monthly players | 1% or more | No purchases |

### Getting to 300,000 monthly players

1. **Portals first:** CrazyGames/Poki featuring is the largest free source of players; pass Basic Launch on retention, not just looks.
2. **Google Play:** TWA with a store page in English and Hindi; ask for ratings only after a won match.
3. **Short videos:** real match clips on YouTube Shorts and Instagram Reels from the game's own account, 3–4 a week.
4. **Creators:** early access and private-room codes for Indian gaming creators; paid or gifted deals disclosed in their videos.
5. **College tournaments:** at college fests and through campus clubs, starting with Nithin's own college.
6. **Communities:** Discord servers and subreddits that allow it, following each one's self-promotion rules.
7. **Paid ads last:** only once measured revenue per install beats cost per install.

## Phase 4: Technical architecture and PWA setup

Run the game on a self-hosted Colyseus server on Azure's free student VMs, with Azure Functions and the Cosmos DB free tier for everything else. Compute and database cost close to $0 for the first 12 months, so the $100 credit mostly pays for network traffic out of Azure, the real cost driver.

```
Player devices (CrazyGames/Poki iframe · own site PWA · Play app TWA; one Three.js build; bot matches offline)
   ├─ files ──────► Static files (Cloudflare Workers static assets)
   ├─ WebSocket ──► Game servers (Colyseus rooms on Azure VMs) ── match results ──► API
   └─ HTTPS ──────► API (Azure Functions) ──► Database (Cosmos DB free tier)
                                           └─ verify purchases ──► Google Play Developer API
```

The game server decides every hit, steal and bank so a modified client cannot cheat; the API handles profiles, quests and purchases.

### Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Client | Three.js + TypeScript + Vite; HTML/CSS overlay for UI | Small download; runs in every browser and in a TWA |
| Art | KayKit CC0 heroes + KayKit/Kenney CC0 environment kits | Free commercially; one consistent style; commission art after revenue |
| Netcode | [Colyseus](https://colyseus.io) (Node.js, MIT) with delta-compressed state | Rooms, matchmaking, reconnection built in; no per-player fees |
| Simulation | Server-authoritative, 20 ticks/s, state sent 15×/s; client predicts own movement | Fair on Indian mobile networks (80–200 ms ping) |
| API | Azure Functions (Node.js), consumption plan | Pay per request with a free allowance |
| Database | Azure Cosmos DB for NoSQL, free tier | Profiles, inventories, quests, leaderboards, purchases |
| Auth | Guest device ID → signed token; optional Google sign-in later | No login wall in the first minute |
| Static hosting | Cloudflare Workers static assets | Free; already used |

### Azure free allowances used ([Azure for Students](https://azure.microsoft.com/en-us/free/students): $100 credit for 12 months, renewable while a student)

| Service | Free allowance | Used for |
| --- | --- | --- |
| Virtual Machines | 750 h/month each of B1s, B2pts v2, B2ats v2 for 12 months | 2–3 always-on game servers |
| Azure Functions | 1 million requests/month | API |
| Cosmos DB | 1,000 RU/s and 25 GB | Database |
| Container Apps | 180,000 vCPU-s/month | Not for game servers (~50 vCPU-hours) |
| App Service | 1 h compute/day on free tier | Not used |

Azure Web PubSub rejected: free tier 20 concurrent connections, and it relays messages rather than running game logic.

### Monthly cost at 100 average concurrent players

| Item | Cost/month | Basis |
| --- | --- | --- |
| Game server VMs | $0 | Student free hours |
| Disks + public IPs | ~$5–8 | Estimate; confirm in Azure pricing calculator |
| Functions, Cosmos DB | $0 | Free allowances |
| Network egress | ~$15–25 | 1.2 KB/s × 100 players × 30 days ≈ 311 GB |
| **Total** | **~$20–33** | $100 lasts 3–5 months at this load |

### Handling more players

1. Keep traffic small first: binary state, 15 updates/s, only changed fields.
2. One 1-vCPU VM ≈ 25–50 rooms of 8 (estimate — load-test with bot clients).
3. Each VM registers in Cosmos DB; a "find a room" Function routes to the emptiest server. No Redis/Kubernetes until well past 1,000 CCU.
4. Host in Central or South India first.
5. When all servers are full, start bot-only matches on the device.

### PWA requirements

- [ ] HTTPS (Cloudflare).
- [ ] Manifest: `name`, `short_name`, `id`, `start_url`, `scope`, `display: fullscreen`, `orientation: landscape`, `theme_color`, `background_color`, icons 192/512 + maskable.
- [ ] Service worker (Workbox): precache shell; cache models on first use; versioned caches.
- [ ] Offline: bot matches work offline; online modes show "You're offline".
- [ ] First load < 10 MB; compressed textures and GLBs; lazy-load locked heroes/arenas.
- [ ] Platform switch: on CrazyGames/Poki, no service worker, no outside links, no own checkout; portal SDK ads.

### Play Store requirements (TWA) — per [Chrome's Play Billing in TWA guide](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing)

- [ ] Bubblewrap build from the web manifest; upload the App Bundle.
- [ ] `/.well-known/assetlinks.json` with the Play App Signing SHA-256 fingerprint.
- [ ] `features.playBilling.enabled: true` in `twa-manifest.json`; `bubblewrap update` + `build`.
- [ ] In-app products in Play Console (needs a testing-track release first).
- [ ] Client: `getDigitalGoodsService('https://play.google.com/billing')`, `getDetails()`, Payment Request with product ID as `sku`; Chrome 101+.
- [ ] Backend verifies each `purchaseToken` with the Play Developer API and acknowledges within 3 days (else refunded).
- [ ] On launch, `listPurchases()` and acknowledge anything missed.
- [ ] Inside the Play app, digital items only via Play Billing.
- [ ] Listing: privacy policy, Data safety, content rating, ads declaration, target age 13+.
- [ ] Test on Android 9+ with test accounts and products.

## Prototype plan

Six 2-week steps. Do not start the next step until the current gate passes.

| Weeks | Build | Gate |
| --- | --- | --- |
| 1–2 | Single-player slice: one arena, Bones, Pinch, Grizzle, bots, Coin Clash (see `IMPLEMENTATION_SPEC.md`) | 5 friends play; ≥4 ask for another match unprompted |
| 3–4 | Online rooms: Colyseus on one B1s VM, private room links, 8 players with bot fill | Stable 8-player match at 150 ms ping; < 1.5 KB/s per player |
| 5–6 | Meta: XP, quests, unlocks, all 8 heroes, results screen; Functions + Cosmos DB | 30 testers; ≥30% return next day |
| 7–8 | Web launch on own site + itch.io; first college tournament; analytics | 500+ players; 70% past 1 min; D1 ≥ 15% |
| 9–10 | CrazyGames submission (SDK, invite links, room status); TWA internal testing with test products | Portal checks pass; test purchase verified and acknowledged |
| 11–12 | Google Play open release; Season 1 | First real purchases; server cost per player measured |

### Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Rooms feel empty | Bots in 8 s; one mode, one region; push private rooms |
| Egress costs more than planned | 10 updates/s; smaller payloads; cheaper region |
| India ad rates lower | Lean on season pass + starter pack; month-15 case |
| Poki wants web exclusivity | Decide Poki vs CrazyGames before applying |
| Ads in the Play app need an approved web ad network | Launch Play with purchases only |
| Hero art looks cheap next to competitors | Commission an artist after first revenue |

### Sources

- [Azure for Students](https://azure.microsoft.com/en-us/free/students)
- [Azure Web PubSub pricing](https://azure.microsoft.com/en-us/pricing/details/web-pubsub/)
- [cloudprice.net: Standard_B1s](https://cloudprice.net/vm/Standard_B1s)
- [Chrome: Play Billing in TWA](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing)
- [Play Console Help: service fees](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)
- [Poki: State of Web Gaming 2026](https://poki.com/blog/state-of-web-gaming-report-2026)
- [Playgama: portal revenue share](https://playgama.com/blog/business-faqs/poki-vs-crazygames-vs-gamedistribution-revenue-share/)
- [Playio: Rewarded ad benchmarks 2026](https://blog.playio.co/rewarded-ad-benchmarks-2026)

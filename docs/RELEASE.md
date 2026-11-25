# Release guide

Rules below were read on 25 November 2026. Stores change them: re-check before submitting.
Run `npm run release:check` at any time to see what is still missing.

| You want to publish on | What to run | Then |
|---|---|---|
| Website | `git push` (today's setup) or `npm run deploy` (section 2) | open the address and play |
| CrazyGames | `npm run package:crazygames` | upload `release/crazygames-upload.zip` contents (section 1) |
| Google Play | publish the website first | package the live address (section 3) |

## First: three decisions only you can make

1. **Name.** Google Play already lists a "Bubble Brawl" (by Pasha Utt) and a "Bubble Brawl : Sort & Conquer". Search
   Play, CrazyGames and a trademark database, and pick the final name before uploading anywhere.
2. **Android package id.** `android/app.json` holds `in.nithin486.bubblebrawl`. It can never change after the first upload.
3. **Contact email** for the privacy policy: `contactEmail` in `client/src/platform/release.ts`. It will be public.

## Where money can come from

| Where | How | State in the code | You still need |
|---|---|---|---|
| CrazyGames | Video ads (between matches, "double coins", "watch for coins") | Built, switched off | Full Launch, then `crazyGamesAds: true` |
| Android app | Coin packs (cosmetics only) | Built | Play account, products, server key |
| Your website | Google H5 Games Ads | Built, switched off, **never tried with a real account** | AdSense approval, then `adsenseClient` |

Not built: season pass, starter pack, CrazyGames in-game purchases (invite only).

## Progression and coins

Unlocks (level, rough number of matches): Candy Town 2 (1), Bones 5 (5), Desert 7 (8), Pinch 10 (16), Grizzle 16 (40).
Coins per match: 5, plus 1 per 5 points, plus 15 for winning or 5 for the top three. Rewarded video: 20. All numbers:
`client/src/progress.ts`, `TUNING.rewards`, `client/src/platform/release.ts`. Watch where new players stop and ease the
early unlocks if they leave.

## 1. CrazyGames

1. `npm run package:crazygames` → unzip `release/crazygames-upload.zip` and upload those files at
   https://developer.crazygames.com/games (or drag in the contents of `dist-crazygames/`)
2. Turn on: Data Module ("Yes, using the Data Module"), multiplayer / online with friends, lobby size 2–6, mobile support,
   landscape.
3. Covers (drafts in `store/crazygames/`): 1920×1080, 800×1200, 800×800, title only. Check them yourself.
4. Preview videos: 15–20 s, 1080p, landscape 16:9 **and** portrait 2:3, no sound, no "play now" text. Record on a good
   phone or computer (not made here).
5. Description and controls text (below). Use their QA tool before submitting.
6. **Basic Launch** (7–21 days) has **no ads and no revenue**. They judge playtime, retention and conversion. Your old game
   was rejected here. If it passes: set `crazyGamesAds: true`, rebuild, upload for Full Launch.

## 2. Hosting (do this before Play)

```
npx wrangler@4 login
npm run deploy
```
This puts the files on Cloudflare static assets (file requests are not counted against the daily limit) plus the small
purchase check. It replaces the current GitHub-backed Worker, so afterwards **pushing to GitHub no longer updates the site;
`npm run deploy` does.** Not run yet: check the game, `/privacy.html` and (after step 3) `/.well-known/assetlinks.json`.

## 3. Google Play

1. Developer account: US$25 once. New personal accounts need a **closed test with at least 12 testers opted in for
   14 days in a row** before production.
**Easier way to build the app (not tried here):** https://www.pwabuilder.com → enter your live address → Android.
Set the package id from `android/app.json`, display fullscreen, orientation landscape, start URL `/?source=play`,
switch on Google Play billing if offered, let it create a new signing key. The download holds the `.aab` to upload,
the signing key with its passwords (**back them up, never commit them**) and an `assetlinks.json`. Check that it targets
API 36 or newer, then continue at step 4. If billing is not offered there, use the command-line way:

2. Install Node, JDK 17, then `npm i -g @bubblewrap/cli`, and in an empty folder:
   `bubblewrap init --manifest="https://<your-site>/manifest.webmanifest"`
   Use: package id from `android/app.json`, display fullscreen, orientation landscape, start URL `/?source=play`.
3. In `twa-manifest.json` add `"features": { "playBilling": { "enabled": true } }`, run `bubblewrap update`, check that
   `app/build.gradle` targets **API 36** or newer, then `bubblewrap build`. Upload the `.aab`.
   **Back up the keystore and its passwords. Never commit them.**
4. In Play Console > App signing copy the SHA-256 fingerprint(s) (upload key and Play's key), then
   `npm run assetlinks -- <fingerprint> [<fingerprint>]`, `npm run deploy`. Without this the app shows a browser bar.
5. Coin packs: create one-time products `coins_500`, `coins_1500`, `coins_4000` and set prices.
6. Purchase check (without it the app offers no coin packs):
   * In Google Cloud create a service account and a JSON key; enable the Google Play Android Developer API.
   * In Play Console > Users and permissions invite that account with order management permission.
   * `npx wrangler@4 secret put PLAY_SERVICE_ACCOUNT` and paste the JSON.
   * `PLAY_PACKAGE` in `wrangler.jsonc` must equal the package id.
7. Store listing: icon `client/public/icons/icon-512.png`, drafts in `store/play/` (feature graphic 1024×500, screenshots).
8. Forms: content rating, Data safety, target audience, privacy policy URL `https://<your-site>/privacy.html`.
   Data safety must reflect what `privacy.html` says (peer connections expose IP addresses; purchases through Play).
9. Before real sales: make one test purchase, and check three days later that it was not refunded.

The app shows no ads: whether Google's web ads are allowed inside this kind of app could not be confirmed.

## Listing text (draft)

**Short:** A cartoon arena shooter: grab mystery boxes, blast your rivals and pop their bubbles.

**Long:** Jump into 3-minute brawls on candy islands. Grab mystery boxes for lasers, rockets, banana traps, freeze bombs,
hooks and hammers. Charge your hero's Super, chain knockouts, unlock heroes and maps, and dress up your laser. Play solo
against bots or invite 1 to 5 friends with a room link.

**Controls:** Computer: WASD move, mouse aim, left click fire, Space dash, K or right click skill, F Super.
Phone: left thumb moves, drag right side to aim, buttons to fire, dash, skill and Super.

## Known limits

* Friends rooms run on the host's device through the free PeerJS service. If the host leaves, the match ends; a short
  switch to another app is bridged, a locked or closed phone is not. With five friends the host uploads about 85 KB per second
  (about 15 MB a match), worked out from the message size. Network feel was measured with a simulated connection
  (`node tools/net-feel.mjs`), not between two real phones.
* Progress and coins live on the player's device (or CrazyGames account): a determined player can edit them.
* A paid coin pack is confirmed by the server, but the coin balance itself is not stored there; it is lost if the app's
  data is cleared.
* No analytics server: you only get the numbers the stores show.
* Wider device testing (low-end Android, iPhone Safari, Chromebook) has not been done.

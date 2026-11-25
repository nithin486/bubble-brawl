// Everything that differs between "my machine" and "released". Fill these in, then run `npm run release:check`.
export const RELEASE = {
  /** Your public web address (the Play app opens this too). */
  siteUrl: 'https://bubble-brawl.21351cm038.workers.dev/',
  /** Shown in the privacy policy so players can reach you. REQUIRED before publishing. */
  contactEmail: '',
  /** CrazyGames: keep false for Basic Launch (they switch ads off); set true once the game is on Full Launch. */
  crazyGamesAds: false,
  /** Your own website only: Google AdSense publisher id ("ca-pub-…") once AdSense approves the site. Empty = no ads. */
  adsenseClient: '',
  /**
   * Coin packs sold in the Android app. Create one-time products with exactly these ids in Play Console and set
   * their prices there. They are consumable and buy cosmetics only.
   */
  coinPacks: [
    { id: 'coins_500', coins: 500 },
    { id: 'coins_1500', coins: 1500 },
    { id: 'coins_4000', coins: 4000 },
  ],
  /** "Watch a video" coins in the shop: how many per video, and the most videos per day. */
  adCoins: 60,
  adCoinsPerDay: 5,
};

// One game, three places: your website, the Android app (a Trusted Web Activity of the same site) and CrazyGames.
// Everything the game needs from the place it runs in goes through `platform`.
import { RELEASE } from './release.ts';

export type PlatformName = 'web' | 'play' | 'crazygames';

/** Silence and stop the game while an ad covers it. */
export interface AdHooks {
  start(): void;
  end(): void;
}

export interface Product {
  id: string;
  coins: number;
  /** Formatted for the player, e.g. "₹49.00". */
  price: string;
}

export interface Purchase {
  id: string;
  token: string;
}

export interface Platform {
  readonly name: PlatformName;
  init(): Promise<void>;
  /** The loading screen is gone. */
  loadingDone(): void;
  /** True while the player is actually fighting (false in menus, pause, results). */
  gameplay(on: boolean): void;
  /** A moment worth celebrating (a win). */
  celebrate(): void;
  store: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  /** The player's account name where there is one, else ''. */
  username(): string;
  /** The place demands silence (e.g. its own mute button). */
  muted(): boolean;
  onMuted(fn: () => void): void;
  /** May the game ask for full screen itself? */
  readonly canFullscreen: boolean;

  // ---- ads
  canReward(): boolean;
  /** Resolves true only when the whole video was watched. */
  rewarded(name: string, hooks: AdHooks): Promise<boolean>;
  /** A break between matches; resolves when the game may go on (at once when there is no ad). */
  breakAd(name: string, hooks: AdHooks): Promise<void>;

  // ---- purchases (Android app only)
  products(): Promise<Product[]>;
  /** Resolves null when the player cancels or it fails. */
  buy(id: string): Promise<Purchase | null>;
  /** Paid but not yet handed out (the app closed mid-purchase). */
  pending(): Promise<Purchase[]>;
  /** Our server checks the purchase with Google and confirms it. Coins are handed out only after a yes. */
  confirm(id: string, token: string): Promise<boolean>;
  /** Tell the store the coins were handed out, so the pack can be bought again. */
  consume(token: string): Promise<void>;

  // ---- friends rooms
  /** May we offer WhatsApp / the share sheet? */
  readonly externalShare: boolean;
  roomLink(code: string, fallback: string): string;
  roomOpen(code: string, joinable: boolean): void;
  roomLeft(): void;
  /** Room code the game was opened with, if any. */
  launchRoom(): string | null;
  /** The place asks for a fresh room straight away. */
  wantsRoom(): boolean;
  onJoinRoom(fn: (code: string) => void): void;
}

const cleanCode = (v: unknown) => {
  const c = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  return c.length === 5 ? c : null;
};

const memory = new Map<string, string>();
const localStore: Platform['store'] = {
  getItem(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return memory.get(k) ?? null; // private mode
    }
  },
  setItem(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      memory.set(k, v);
    }
  },
};

// ------------------------------------------------------------------ website and Android app

type AdBreak = Record<string, unknown>;
interface DigitalGoods {
  getDetails(ids: string[]): Promise<{ itemId: string; price: { currency: string; value: string } }[]>;
  listPurchases(): Promise<{ itemId: string; purchaseToken: string }[]>;
  consume(token: string): Promise<void>;
}
const PLAY_BILLING = 'https://play.google.com/billing';

function web(): Platform {
  // the Android app opens the site with ?source=play (and Android names itself as the referrer)
  let twa = new URLSearchParams(location.search).get('source') === 'play' || document.referrer.startsWith('android-app://');
  try {
    if (twa) sessionStorage.setItem('bb_twa', '1');
    twa ||= sessionStorage.getItem('bb_twa') === '1';
  } catch {
    /* no storage */
  }
  let goods: DigitalGoods | null = null;
  let adBreak: ((o: AdBreak) => void) | null = null;
  const brk = (o: AdBreak, hooks: AdHooks) =>
    new Promise<boolean>((resolve) => {
      if (!adBreak) return resolve(false);
      let viewed = false;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        hooks.end();
        resolve(viewed);
      };
      // a blocked or missing ad script never calls back: go on after a moment
      let timer = window.setTimeout(finish, 4000);
      adBreak({
        ...o,
        beforeAd: () => {
          clearTimeout(timer);
          hooks.start();
        },
        beforeReward: (show: () => void) => show(),
        adViewed: () => (viewed = true),
        adBreakDone: finish,
      });
    });
  return {
    name: twa ? 'play' : 'web',
    async init() {
      if (twa) {
        const get = (window as unknown as { getDigitalGoodsService?: (s: string) => Promise<DigitalGoods> }).getDigitalGoodsService;
        goods = get ? await get(PLAY_BILLING).catch(() => null) : null;
        return;
      }
      // Google's ads for HTML5 games: your own website only, and only once you have a publisher id
      if (!RELEASE.adsenseClient) return;
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(RELEASE.adsenseClient)}`;
      s.crossOrigin = 'anonymous';
      s.dataset.adFrequencyHint = '120s';
      s.onerror = () => (adBreak = null);
      const w = window as unknown as { adsbygoogle?: AdBreak[] };
      const queue = (w.adsbygoogle ??= []);
      adBreak = (o) => queue.push(o);
      adBreak({ preloadAdBreaks: 'on', sound: 'on' });
      document.head.append(s);
    },
    loadingDone() {},
    gameplay() {},
    celebrate() {},
    store: localStore,
    username: () => '',
    muted: () => false,
    onMuted() {},
    canFullscreen: true,
    canReward: () => !!adBreak,
    rewarded: (name, hooks) => brk({ type: 'reward', name }, hooks),
    breakAd: async (name, hooks) => void (await brk({ type: 'next', name }, hooks)),
    async products() {
      if (!goods) return [];
      try {
        // sell nothing unless the purchase can be confirmed afterwards (deploy/api.js, set up with its Google key)
        const server = await fetch('api/purchase', { cache: 'no-store' }).then((r) => r.json());
        if (!server?.ready) return [];
        const found = await goods.getDetails(RELEASE.coinPacks.map((p) => p.id));
        return RELEASE.coinPacks.flatMap((p) => {
          const d = found.find((f) => f.itemId === p.id);
          return d ? [{ id: p.id, coins: p.coins, price: new Intl.NumberFormat(undefined, { style: 'currency', currency: d.price.currency }).format(Number(d.price.value)) }] : [];
        });
      } catch (e) {
        console.warn('store unavailable', e);
        return [];
      }
    },
    async buy(id) {
      if (!goods) return null;
      try {
        // (Play shows the real price; the total here is required by the API and ignored)
        const request = new PaymentRequest([{ supportedMethods: PLAY_BILLING, data: { sku: id } }], { total: { label: 'Total', amount: { currency: 'INR', value: '0' } } });
        const response = await request.show();
        const token = (response.details as { purchaseToken?: string }).purchaseToken;
        await response.complete(token ? 'success' : 'fail');
        return token ? { id, token } : null;
      } catch {
        return null; // cancelled
      }
    },
    async pending() {
      if (!goods) return [];
      return (await goods.listPurchases().catch(() => [])).map((p) => ({ id: p.itemId, token: p.purchaseToken }));
    },
    async confirm(id, token) {
      try {
        const res = await fetch('api/purchase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sku: id, token }) });
        return res.ok && (await res.json()).ok === true;
      } catch {
        return false; // offline: tried again at the next start
      }
    },
    async consume(token) {
      await goods?.consume(token);
    },
    externalShare: true,
    roomLink: (_code, fallback) => fallback,
    roomOpen() {},
    roomLeft() {},
    launchRoom: () => cleanCode(new URLSearchParams(location.search).get('room')),
    wantsRoom: () => false,
    onJoinRoom() {},
  };
}

// ------------------------------------------------------------------ CrazyGames (SDK v3)

/* eslint-disable @typescript-eslint/no-explicit-any */
function crazygames(): Platform {
  let sdk: any = null;
  // (?testads switches them on for local testing only)
  let adsOff = !(RELEASE.crazyGamesAds || (location.hostname === 'localhost' && location.search.includes('testads')));
  let user = '';
  let playing = false;
  /** Every SDK call is best effort: a platform hiccup must never stop the game. */
  const call = <T>(fn: () => T, fallback: T): T => {
    if (!sdk) return fallback;
    try {
      return fn();
    } catch (e) {
      console.warn('CrazyGames SDK', e);
      return fallback;
    }
  };
  const ad = (type: 'midgame' | 'rewarded', hooks: AdHooks) =>
    new Promise<boolean>((resolve) => {
      if (!sdk || adsOff) return resolve(false);
      const finish = (ok: boolean) => {
        hooks.end();
        resolve(ok);
      };
      try {
        sdk.ad.requestAd(type, {
          adStarted: () => hooks.start(),
          adFinished: () => finish(true),
          adError: (e: { code?: string }) => {
            if (e?.code === 'adsDisabled') adsOff = true;
            finish(false);
          },
        });
      } catch {
        finish(false);
      }
    });
  return {
    name: 'crazygames',
    async init() {
      try {
        const s = (window as any).CrazyGames?.SDK;
        if (!s) return;
        await s.init();
        if (s.environment === 'disabled') return;
        sdk = s;
        call(() => sdk.game.loadingStart(), undefined);
        user = (await call(() => sdk.user.getUser(), Promise.resolve(null)))?.username ?? '';
      } catch (e) {
        console.warn('CrazyGames SDK unavailable', e);
      }
    },
    loadingDone: () => call(() => sdk.game.loadingStop(), undefined),
    gameplay(on) {
      if (on === playing) return;
      playing = on;
      call(() => (on ? sdk.game.gameplayStart() : sdk.game.gameplayStop()), undefined);
    },
    celebrate: () => call(() => sdk.game.happytime(), undefined),
    // CrazyGames saves progress to the player's account through its data module
    store: {
      getItem: (k) => call<string | null>(() => sdk.data.getItem(k), null) ?? localStore.getItem(k),
      setItem(k, v) {
        localStore.setItem(k, v);
        call(() => sdk.data.setItem(k, v), undefined);
      },
    },
    username: () => user,
    muted: () => call(() => !!sdk.game.settings?.muteAudio, false),
    onMuted: (fn) => call(() => sdk.game.addSettingsChangeListener(fn), undefined),
    canFullscreen: false, // CrazyGames has its own full-screen button
    canReward: () => !!sdk && !adsOff,
    rewarded: (_name, hooks) => ad('rewarded', hooks),
    breakAd: async (_name, hooks) => void (await ad('midgame', hooks)),
    products: async () => [], // in-game purchases are invite-only there
    buy: async () => null,
    pending: async () => [],
    confirm: async () => false,
    consume: async () => {},
    externalShare: false, // no links out of CrazyGames
    roomLink: (code, fallback) => call(() => sdk.game.inviteLink({ room: code }) as string, fallback),
    roomOpen: (code, joinable) => call(() => sdk.game.updateRoom({ roomId: code, isJoinable: joinable, inviteParams: { room: code } }), undefined),
    roomLeft: () => call(() => sdk.game.leftRoom(), undefined),
    launchRoom: () => cleanCode(call(() => sdk.game.inviteParams?.room ?? sdk.game.getInviteParam('room'), null) ?? new URLSearchParams(location.search).get('room')),
    wantsRoom: () => call(() => !!sdk.game.isInstantMultiplayer, false),
    onJoinRoom: (fn) =>
      call(
        () =>
          sdk.game.addJoinRoomListener((p: any) => {
            const c = cleanCode(p?.room ?? p?.inviteParams?.room ?? p?.roomId);
            if (c) fn(c);
          }),
        undefined,
      ),
  };
}

export const platform: Platform = import.meta.env.VITE_PLATFORM === 'crazygames' ? crazygames() : web();

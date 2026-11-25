// Looks you buy with coins. Cosmetics only: nothing here changes damage, speed or health.

export type Slot = 'laser' | 'trail' | 'ko';

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  price: number;
  /** laser: core, beam, glow · trail and ko: particle colours (empty = the plain look). */
  colors: string[];
}

export type Look = Record<Slot, string>;

export const SLOT_NAMES: Record<Slot, string> = { laser: 'Laser', trail: 'Trail', ko: 'Knockout' };

export const ITEMS: Item[] = [
  { id: 'laser_classic', slot: 'laser', name: 'Bubble Blue', price: 0, colors: ['#ffffff', '#00c8ff', '#ff2fc0'] },
  { id: 'laser_lime', slot: 'laser', name: 'Lime Zap', price: 150, colors: ['#ffffff', '#2fe34a', '#b6ff2f'] },
  { id: 'laser_ember', slot: 'laser', name: 'Ember', price: 250, colors: ['#fff6c0', '#ff7a1a', '#e3261f'] },
  { id: 'laser_royal', slot: 'laser', name: 'Royal', price: 400, colors: ['#ffffff', '#8a4bff', '#3b2bd6'] },
  { id: 'laser_gold', slot: 'laser', name: 'Solid Gold', price: 800, colors: ['#ffffff', '#ffc400', '#ff8a00'] },
  { id: 'trail_none', slot: 'trail', name: 'No Trail', price: 0, colors: [] },
  { id: 'trail_bubbles', slot: 'trail', name: 'Bubbles', price: 120, colors: ['#9fefff', '#ffffff', '#ffb3ec'] },
  { id: 'trail_stars', slot: 'trail', name: 'Star Dust', price: 300, colors: ['#ffd23f', '#fff6b0', '#ffffff'] },
  { id: 'trail_fire', slot: 'trail', name: 'Hot Feet', price: 450, colors: ['#ff4a1a', '#ff9f1a', '#ffd23f'] },
  { id: 'trail_rainbow', slot: 'trail', name: 'Rainbow', price: 700, colors: ['#ff4a6e', '#ffd23f', '#4be36a', '#37c8ff', '#b06bff'] },
  { id: 'ko_classic', slot: 'ko', name: 'Pop', price: 0, colors: [] },
  { id: 'ko_confetti', slot: 'ko', name: 'Party Pop', price: 200, colors: ['#ff4a6e', '#ffd23f', '#4be36a', '#37c8ff', '#ffffff'] },
  { id: 'ko_gold', slot: 'ko', name: 'Gold Burst', price: 500, colors: ['#ffc400', '#fff3a0', '#ff9a00'] },
  { id: 'ko_ghost', slot: 'ko', name: 'Spooky', price: 600, colors: ['#b38cff', '#6dffd0', '#2a1580'] },
];

export const DEFAULT_LOOK: Look = { laser: 'laser_classic', trail: 'trail_none', ko: 'ko_classic' };

export const item = (id: string) => ITEMS.find((i) => i.id === id);

/** A look that only names real items in the right slots (saves and other players' messages are not trusted). */
export function cleanLook(l: unknown): Look {
  const out = { ...DEFAULT_LOOK };
  for (const slot of Object.keys(out) as Slot[]) {
    const id = (l as Partial<Look> | undefined)?.[slot];
    if (typeof id === 'string' && item(id)?.slot === slot) out[slot] = id;
  }
  return out;
}

export const owns = (owned: string[], id: string) => item(id)?.price === 0 || owned.includes(id);

/** What a wallet looks like to the shop. */
export interface Wallet {
  coins: number;
  owned: string[];
  look: Look;
}

/** Buy (if needed) and wear an item. False when it can't be afforded. */
export function buyOrWear(w: Wallet, id: string): boolean {
  const it = item(id);
  if (!it) return false;
  if (!owns(w.owned, id)) {
    if (w.coins < it.price) return false;
    w.coins -= it.price;
    w.owned.push(id);
  }
  w.look[it.slot] = id;
  return true;
}

/** Hand out a paid coin pack exactly once, however many times the store reports it. */
export function redeem(w: { coins: number; redeemed: string[] }, coins: number, token: string): boolean {
  if (w.redeemed.includes(token)) return false;
  w.coins += coins;
  w.redeemed = [...w.redeemed, token].slice(-100);
  return true;
}

/** Rewarded videos for coins are limited per day. */
export function adCoinsLeft(w: { adDay: string; adCount: number }, today: string, perDay: number) {
  return w.adDay === today ? Math.max(0, perDay - w.adCount) : perDay;
}

export function countAd(w: { adDay: string; adCount: number }, today: string) {
  w.adCount = w.adDay === today ? w.adCount + 1 : 1;
  w.adDay = today;
}

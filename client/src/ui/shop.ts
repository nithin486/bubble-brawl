import './shop.css';
import { ITEMS, SLOT_NAMES, owns, type Slot, type Wallet } from '../cosmetics.ts';
import type { Product } from '../platform/index.ts';
import { UI } from './icons.ts';

const el = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface ShopState {
  wallet: Wallet;
  /** Coin packs the store offers (empty outside the Android app). */
  products: Product[];
  /** Videos for coins still available today; null when there are no ads here. */
  ads: { left: number; coins: number } | null;
}

/** The coin shop: looks for your laser, your trail and your knockouts, plus ways to get coins. */
export class Shop {
  root = el('div', 'friends-veil shop-veil');
  private box = el('div', 'panel shop');
  private tab: Slot = 'laser';
  private state: ShopState;
  private note = '';
  onItem: (id: string) => void = () => {};
  onPack: (id: string) => void = () => {};
  onAd: () => void = () => {};
  onClose: () => void = () => {};

  constructor(state: ShopState) {
    this.state = state;
    this.root.append(this.box);
    document.body.append(this.root);
    this.draw();
  }

  update(state: ShopState, note = '') {
    this.state = state;
    this.note = note;
    this.draw();
  }

  close() {
    this.root.remove();
  }

  private draw() {
    const { wallet, products, ads } = this.state;
    const b = this.box;
    b.innerHTML = '';
    const x = el('button', 'fp-x tap', '✕');
    x.setAttribute('aria-label', 'Close shop');
    x.addEventListener('click', () => this.onClose());
    const head = el('div', 'shop-head', `<h1 class="stroke">Shop</h1><div class="wallet glass">${UI.coin}<b>${wallet.coins}</b></div>`);
    b.append(x, head);
    const tabs = el('div', 'shop-tabs');
    for (const slot of Object.keys(SLOT_NAMES) as Slot[]) {
      const t = el('button', `tap${slot === this.tab ? ' on' : ''}`, SLOT_NAMES[slot]);
      t.addEventListener('click', () => {
        this.tab = slot;
        this.note = '';
        this.draw();
      });
      tabs.append(t);
    }
    b.append(tabs);
    const grid = el('div', 'shop-grid');
    for (const it of ITEMS.filter((i) => i.slot === this.tab)) {
      const mine = owns(wallet.owned, it.id);
      const worn = wallet.look[it.slot] === it.id;
      const swatch = it.colors.length ? `linear-gradient(135deg, ${it.colors.join(', ')})` : 'linear-gradient(135deg, #3a4572, #1d2650)';
      const card = el(
        'button',
        `shop-item tap${worn ? ' worn' : ''}${!mine && wallet.coins < it.price ? ' poor' : ''}`,
        `<i class="sw ${it.slot}" style="background:${swatch}"></i><b>${it.name}</b><span>${worn ? 'WEARING' : mine ? 'WEAR' : `${UI.coin}${it.price}`}</span>`,
      );
      card.dataset.id = it.id;
      card.setAttribute('aria-label', `${it.name}: ${worn ? 'wearing' : mine ? 'wear' : `${it.price} coins`}`);
      card.addEventListener('click', () => this.onItem(it.id));
      grid.append(card);
    }
    b.append(grid);
    if (this.note) b.append(el('div', 'fp-err', esc(this.note)));
    if (ads || products.length) {
      const get = el('div', 'shop-get', '<span>Get coins</span>');
      if (ads) {
        const a = el('button', 'big-btn alt tap ad', ads.left ? `▶ WATCH · +${ads.coins}` : 'MORE VIDEOS TOMORROW') as HTMLButtonElement;
        a.disabled = !ads.left;
        a.addEventListener('click', () => this.onAd());
        get.append(a);
      }
      for (const p of products) {
        const pk = el('button', 'big-btn tap pack', `<i class="coin-ico"></i> ${p.coins}<small>${esc(p.price)}</small>`);
        pk.dataset.id = p.id;
        pk.addEventListener('click', () => this.onPack(p.id));
        get.append(pk);
      }
      b.append(get);
    } else b.append(el('div', 'sub', 'Play matches and finish missions to earn coins.'));
  }
}

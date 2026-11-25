import type { HeroId } from '../../../shared/config/heroes.ts';
import type { Member } from '../net/room.ts';
import { MAX_HUMANS } from '../net/room.ts';

const el = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The "Play with friends" panel: create/join a room, share the link, lobby, start. */
export class FriendsPanel {
  root = el('div', 'friends-veil');
  private box = el('div', 'panel friends-panel');
  private portraits: Map<HeroId, string>;
  onCreate: (name: string) => void = () => {};
  onJoin: (code: string, name: string) => void = () => {};
  onStart: () => void = () => {};
  onLeave: () => void = () => {};

  constructor(portraits: Map<HeroId, string>) {
    this.portraits = portraits;
    this.root.append(this.box);
    document.body.append(this.root);
  }

  close() {
    this.root.remove();
  }

  menu(name: string, code = '') {
    this.box.innerHTML = '';
    const x = el('button', 'fp-x', '✕');
    x.addEventListener('click', () => this.onLeave());
    this.box.append(x, el('h1', 'stroke', 'Play with friends'));
    this.box.append(el('div', 'sub', 'Make a room, send the invite to your friends and fight each other. No bots: 2 to 6 real players.'));
    const nameRow = el('label', 'fp-field', '<span>Your name</span>');
    const nameIn = el('input') as HTMLInputElement;
    nameIn.maxLength = 14;
    nameIn.value = name;
    nameRow.append(nameIn);
    this.box.append(nameRow);
    const create = el('button', 'big-btn', 'CREATE ROOM');
    create.addEventListener('click', () => this.onCreate(nameIn.value.trim() || 'Player'));
    const row = el('div', 'btn-row');
    row.append(create);
    this.box.append(row);
    this.box.append(el('div', 'fp-or', '<span>or join a friend</span>'));
    const joinRow = el('div', 'fp-join');
    const codeIn = el('input', 'fp-code') as HTMLInputElement;
    codeIn.placeholder = 'ROOM CODE';
    codeIn.maxLength = 5;
    codeIn.value = code;
    codeIn.addEventListener('input', () => (codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
    const join = el('button', 'big-btn alt', 'JOIN');
    join.addEventListener('click', () => codeIn.value.length === 5 && this.onJoin(codeIn.value, nameIn.value.trim() || 'Player'));
    joinRow.append(codeIn, join);
    this.box.append(joinRow);
  }

  busy(text: string) {
    this.box.innerHTML = `<h1 class="stroke">${esc(text)}</h1><div class="fp-spin"></div>`;
  }

  error(text: string, name: string) {
    this.menu(name);
    this.box.insertBefore(el('div', 'fp-err', esc(text)), this.box.children[2]);
  }

  lobby(code: string, link: string, members: Member[], isHost: boolean, mapName: string, externalShare: boolean) {
    this.box.innerHTML = '';
    const x = el('button', 'fp-x', '✕');
    x.title = 'Leave room';
    x.addEventListener('click', () => this.onLeave());
    this.box.append(x);
    this.box.append(el('div', 'fp-codehead', `ROOM CODE`), el('div', 'fp-bigcode stroke', esc(code)));
    const share = el('div', 'btn-row');
    const copy = el('button', 'big-btn alt', 'COPY INVITE LINK');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
        copy.textContent = 'COPIED! ✓';
      } catch {
        prompt('Copy this link', link);
      }
    });
    share.append(copy);
    if (externalShare) {
      const wa = el('button', 'big-btn wa', 'WHATSAPP');
      wa.addEventListener('click', () => window.open(`https://wa.me/?text=${encodeURIComponent(`Join my Bubble Brawl room ${code}! ${link}`)}`, '_blank', 'noopener'));
      share.append(wa);
    }
    if (externalShare && navigator.share) {
      const sh = el('button', 'big-btn alt', 'SHARE');
      sh.addEventListener('click', () => navigator.share({ title: 'Bubble Brawl', text: `Join my Bubble Brawl room ${code}!`, url: link }).catch(() => {}));
      share.append(sh);
    }
    this.box.append(share);
    const list = el('div', 'fp-seats');
    for (let i = 0; i < MAX_HUMANS; i++) {
      const m = members[i];
      list.append(
        m
          ? el('div', 'fp-seat', `<div class="face" style="background-image:url(${this.portraits.get(m.hero)})"></div><b>${esc(m.name)}</b>${i === 0 ? '<em>HOST</em>' : ''}`)
          : el('div', 'fp-seat empty', '<div class="face"></div><b>Empty</b><span>invite a friend</span>'),
      );
    }
    this.box.append(list);
    this.box.append(el('div', 'sub', `Map: <b>${esc(mapName)}</b> · ${members.length} of ${MAX_HUMANS} players · no bots`));
    const row = el('div', 'btn-row');
    if (isHost) {
      const alone = members.length < 2;
      const go = el('button', 'big-btn start', alone ? 'WAITING FOR A FRIEND…' : `START · ${members.length} PLAYERS`) as HTMLButtonElement;
      go.disabled = alone;
      go.addEventListener('click', () => this.onStart());
      row.append(go);
    } else row.append(el('div', 'fp-wait', 'Waiting for the host to start…'));
    this.box.append(row);
  }
}

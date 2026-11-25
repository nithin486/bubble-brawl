// A friends room: lobby list, match start, inputs up, snapshots down.
import type { HeroId } from '../../../shared/config/heroes.ts';
import type { MapId } from '../../../shared/config/maps.ts';
import type { Input } from '../../../shared/sim/types.ts';
import type { Snapshot } from '../../../shared/sim/snapshot.ts';
import { localHost, localJoin, makeCode, peerHost, peerJoin, type Msg, type Transport } from './transport.ts';

export interface Member {
  peer: string;
  name: string;
  hero: HeroId;
}

export interface StartMsg {
  map: MapId;
  seed: number;
  /** One entry per seat; humans first, then bots. */
  seats: { name: string; hero: HeroId; isBot: boolean; peer: string }[];
}

export const MAX_HUMANS = 6;
const useLocal = () => new URLSearchParams(location.search).has('localnet');

export class Room {
  code: string;
  t: Transport;
  members: Member[] = [];
  /** Host: latest input per remote peer (buttons latch until the sim reads them). */
  inputs = new Map<string, Input>();
  onLobby: (m: Member[]) => void = () => {};
  onStart: (s: StartMsg, mySeat: number) => void = () => {};
  onSnap: (s: Snapshot) => void = () => {};
  onLeft: (peer: string) => void = () => {};
  onClosed: (reason: string) => void = () => {};

  private constructor(code: string, t: Transport) {
    this.code = code;
    this.t = t;
  }

  get isHost() {
    return this.t.isHost;
  }

  static async create(me: { name: string; hero: HeroId }) {
    const code = makeCode();
    const t = useLocal() ? await localHost(code) : await peerHost(code);
    const room = new Room(code, t);
    room.members = [{ peer: t.id, name: me.name, hero: me.hero }];
    t.onMessage = (from, msg) => room.hostMessage(from, msg);
    t.onLeave = (peer) => {
      room.members = room.members.filter((m) => m.peer !== peer);
      room.inputs.delete(peer);
      room.onLeft(peer);
      room.sendLobby();
    };
    return room;
  }

  static async join(code: string, me: { name: string; hero: HeroId }) {
    const t = useLocal() ? await localJoin(code) : await peerJoin(code);
    const room = new Room(code, t);
    t.onMessage = (_from, msg) => room.clientMessage(msg);
    t.onLeave = () => room.onClosed('The host left the room');
    t.broadcast({ t: 'hello', name: me.name, hero: me.hero });
    return room;
  }

  // ---------------------------------------------------------------- host

  private hostMessage(from: string, msg: Msg) {
    if (msg.t === 'hello') {
      if (this.members.length >= MAX_HUMANS || this.members.some((m) => m.peer === from)) return;
      this.members.push({ peer: from, name: String(msg.name).slice(0, 14) || 'Friend', hero: msg.hero as HeroId });
      this.sendLobby();
    } else if (msg.t === 'in') {
      const prev = this.inputs.get(from);
      // latch button presses until the host's sim consumes them
      this.inputs.set(from, {
        mx: Number(msg.mx) || 0,
        mz: Number(msg.mz) || 0,
        dash: !!msg.d || !!prev?.dash,
        grab: !!msg.g || !!prev?.grab,
        skill: !!msg.s || !!prev?.skill,
        ult: !!msg.u || !!prev?.ult,
        aim: msg.a === undefined ? undefined : Number(msg.a),
        aimD: msg.ad === undefined ? undefined : Number(msg.ad),
        aimY: msg.ay === undefined ? undefined : Number(msg.ay),
      });
    } else if (msg.t === 'hero') {
      const m = this.members.find((x) => x.peer === from);
      if (m) m.hero = msg.hero as HeroId;
      this.sendLobby();
    }
  }

  /** Read (and clear the buttons of) a remote player's input. */
  takeInput(peer: string): Input | null {
    const i = this.inputs.get(peer);
    if (!i) return null;
    this.inputs.set(peer, { ...i, dash: false, grab: false, skill: false, ult: false });
    return i;
  }

  sendLobby() {
    this.t.broadcast({ t: 'lobby', members: this.members });
    this.onLobby(this.members);
  }

  start(s: StartMsg) {
    s.seats.forEach((seat, i) => {
      if (!seat.isBot && seat.peer !== this.t.id) this.t.send(seat.peer, { t: 'start', ...s, you: i });
    });
  }

  snapshot(s: Snapshot) {
    this.t.broadcast({ t: 'snap', s } as unknown as Msg);
  }

  // ---------------------------------------------------------------- client

  private clientMessage(msg: Msg) {
    if (msg.t === 'lobby') {
      this.members = msg.members as Member[];
      this.onLobby(this.members);
    } else if (msg.t === 'start') this.onStart(msg as unknown as StartMsg, Number(msg.you));
    else if (msg.t === 'snap') this.onSnap(msg.s as Snapshot);
  }

  sendInput(i: Input) {
    this.t.broadcast({ t: 'in', mx: Math.round(i.mx * 100) / 100, mz: Math.round(i.mz * 100) / 100, d: i.dash ? 1 : 0, g: i.grab ? 1 : 0, s: i.skill ? 1 : 0, ...(i.ult ? { u: 1 } : {}), ...(i.aim !== undefined ? { a: Math.round(i.aim * 100) / 100, ad: Math.round((i.aimD ?? 8) * 10) / 10, ...(i.aimY !== undefined ? { ay: Math.round(i.aimY * 10) / 10 } : {}) } : {}) });
  }

  setHero(hero: HeroId) {
    if (!this.isHost) this.t.broadcast({ t: 'hero', hero });
  }

  leave() {
    this.t.close();
  }

  link() {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('room', this.code);
    if (useLocal()) u.searchParams.set('localnet', '');
    return u.toString();
  }
}

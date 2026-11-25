// A friends room: lobby list, match start, inputs up, snapshots down.
import { HERO_IDS, type HeroId } from '../../../shared/config/heroes.ts';
import type { MapId } from '../../../shared/config/maps.ts';
import type { Input } from '../../../shared/sim/types.ts';
import { cleanLook, type Look } from '../cosmetics.ts';
import type { Snapshot } from '../../../shared/sim/snapshot.ts';
import { localHost, localJoin, makeCode, peerHost, peerJoin, type Msg, type Transport } from './transport.ts';

export interface Member {
  peer: string;
  name: string;
  hero: HeroId;
  look: Look;
}

export interface StartMsg {
  map: MapId;
  seed: number;
  /** One entry per seat; humans first, then bots. */
  seats: { name: string; hero: HeroId; isBot: boolean; peer: string; look?: Look }[];
}

export const MAX_HUMANS = 6;
const useLocal = () => new URLSearchParams(location.search).has('localnet');

export class Room {
  code: string;
  t: Transport;
  members: Member[] = [];
  /** Host: latest input per remote peer (buttons latch until the sim reads them). */
  inputs = new Map<string, Input>();
  /** Host: what came with each peer's newest input, and when the sim first used it. */
  private notes = new Map<string, { n: number; vt: number; ax?: number; az?: number; heard: number; used: number; since: number }>();
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

  static async create(me: { name: string; hero: HeroId; look: Look }) {
    const code = makeCode();
    const t = useLocal() ? await localHost(code) : await peerHost(code);
    const room = new Room(code, t);
    room.members = [{ peer: t.id, name: me.name, hero: me.hero, look: me.look }];
    t.onMessage = (from, msg) => room.hostMessage(from, msg);
    t.onLeave = (peer) => {
      room.members = room.members.filter((m) => m.peer !== peer);
      room.inputs.delete(peer);
      room.onLeft(peer);
      room.sendLobby();
    };
    return room;
  }

  static async join(code: string, me: { name: string; hero: HeroId; look: Look }) {
    const t = useLocal() ? await localJoin(code) : await peerJoin(code);
    const room = new Room(code, t);
    t.onMessage = (_from, msg) => room.clientMessage(msg);
    t.onLeave = () => room.onClosed('The host left the room');
    t.broadcast({ t: 'hello', name: me.name, hero: me.hero, look: me.look });
    return room;
  }

  // ---------------------------------------------------------------- host

  private hostMessage(from: string, msg: Msg) {
    if (msg.t === 'hello') {
      if (this.members.some((m) => m.peer === from)) return;
      if (this.members.length >= MAX_HUMANS) return this.t.send(from, { t: 'full' });
      const hero = HERO_IDS.includes(msg.hero as HeroId) ? (msg.hero as HeroId) : HERO_IDS[0]; // messages are not trusted
      this.members.push({ peer: from, name: String(msg.name ?? '').slice(0, 14) || 'Friend', hero, look: cleanLook(msg.look) });
      this.sendLobby();
    } else if (msg.t === 'in') {
      const n = Number(msg.n) || 0;
      const old = this.notes.get(from);
      // messages can overtake each other: an older input only adds its button presses
      if (old && n <= old.n) {
        const cur = this.inputs.get(from);
        if (cur) this.inputs.set(from, { ...cur, dash: cur.dash || !!msg.d, grab: cur.grab || !!msg.g, skill: cur.skill || !!msg.s, ult: cur.ult || !!msg.u });
        return;
      }
      const num = (v: unknown) => (v === undefined || !Number.isFinite(Number(v)) ? undefined : Number(v));
      this.notes.set(from, { n, vt: Number(msg.vt) || 0, ax: num(msg.ax), az: num(msg.az), heard: performance.now(), used: old?.used ?? 0, since: old?.since ?? 0 });
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
      if (m && HERO_IDS.includes(msg.hero as HeroId)) m.hero = msg.hero as HeroId;
      this.sendLobby();
    }
  }

  /**
   * The input to use for a remote player in this sim step (button presses are used once). `now` is the sim clock, and
   * `at` where the host has their hero: the aim is a point in the world, so it is turned into a direction from there.
   */
  takeInput(peer: string, now: number, at: { x: number; z: number }): Input | null {
    const i = this.inputs.get(peer);
    const note = this.notes.get(peer);
    if (!i || !note) return null;
    this.inputs.set(peer, { ...i, dash: false, grab: false, skill: false, ult: false });
    if (note.used !== note.n) {
      note.used = note.n;
      note.since = now;
    }
    // nothing heard for a while (tab hidden, signal lost): stand still rather than walk on
    if (performance.now() - note.heard > 600) return { mx: 0, mz: 0, dash: false, grab: false, skill: false };
    const out: Input = { ...i, rewind: note.vt ? Math.max(0, Math.min(0.4, now - note.vt)) : 0 };
    if (note.ax !== undefined && note.az !== undefined && Math.hypot(note.ax - at.x, note.az - at.z) > 0.8) {
      out.aim = Math.atan2(note.ax - at.x, note.az - at.z);
      out.aimD = Math.hypot(note.ax - at.x, note.az - at.z);
    }
    return out;
  }

  /** For the snapshot: the last input used from this peer, and how long ago it was first used. */
  ack(peer: string, now: number): [number, number] {
    const note = this.notes.get(peer);
    return note ? [note.used, Math.round((now - note.since) * 1000) / 1000] : [0, 0];
  }

  /** A new match: input numbers start again. */
  freshMatch() {
    this.inputs.clear();
    this.notes.clear();
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
    } else if (msg.t === 'full') this.onClosed('That room is full (6 players)');
    else if (msg.t === 'start') this.onStart(msg as unknown as StartMsg, Number(msg.you));
    else if (msg.t === 'snap') this.onSnap(msg.s as Snapshot);
  }

  sendInput(i: Input, n: number, viewTime: number, aimAt?: { x: number; z: number }) {
    this.t.broadcast({ t: 'in', n, vt: Math.round(viewTime * 1000) / 1000, ...(aimAt ? { ax: Math.round(aimAt.x * 100) / 100, az: Math.round(aimAt.z * 100) / 100 } : {}), mx: Math.round(i.mx * 100) / 100, mz: Math.round(i.mz * 100) / 100, d: i.dash ? 1 : 0, g: i.grab ? 1 : 0, s: i.skill ? 1 : 0, ...(i.ult ? { u: 1 } : {}), ...(i.aim !== undefined ? { a: Math.round(i.aim * 100) / 100, ad: Math.round((i.aimD ?? 8) * 10) / 10, ...(i.aimY !== undefined ? { ay: Math.round(i.aimY * 10) / 10 } : {}) } : {}) });
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

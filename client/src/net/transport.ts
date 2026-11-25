// Connections between friends' browsers. The host's browser runs the game; others send inputs.
// PeerTransport: real WebRTC via PeerJS (its free public broker introduces the peers).
// LocalTransport: BroadcastChannel between tabs of one browser — for testing without internet.

export type Msg = Record<string, unknown> & { t: string };

export interface Transport {
  readonly id: string;
  readonly isHost: boolean;
  send(to: string, msg: Msg): void;
  broadcast(msg: Msg): void;
  onMessage: (from: string, msg: Msg) => void;
  onJoin: (peer: string) => void;
  onLeave: (peer: string) => void;
  onError: (text: string) => void;
  close(): void;
}

const PREFIX = 'bubblebrawl-room-';

export function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

const noop = () => {};

// ------------------------------------------------------------------ PeerJS (WebRTC)

export async function peerHost(code: string): Promise<Transport> {
  const { Peer } = await import('peerjs');
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + code, { debug: 0 });
    const conns = new Map<string, import('peerjs').DataConnection>();
    const t: Transport = {
      id: PREFIX + code,
      isHost: true,
      send: (to, msg) => conns.get(to)?.open && conns.get(to)!.send(msg),
      broadcast: (msg) => conns.forEach((c) => c.open && c.send(msg)),
      onMessage: noop,
      onJoin: noop,
      onLeave: noop,
      onError: noop,
      close: () => peer.destroy(),
    };
    peer.on('open', () => resolve(t));
    peer.on('error', (e) => {
      t.onError(String(e.type ?? e));
      reject(e);
    });
    peer.on('connection', (c) => {
      c.on('open', () => {
        conns.set(c.peer, c);
        t.onJoin(c.peer);
      });
      c.on('data', (d) => t.onMessage(c.peer, d as Msg));
      const gone = () => {
        if (conns.delete(c.peer)) t.onLeave(c.peer);
      };
      c.on('close', gone);
      c.on('error', gone);
    });
  });
}

export async function peerJoin(code: string): Promise<Transport> {
  const { Peer } = await import('peerjs');
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0 });
    const host = PREFIX + code;
    const t: Transport = {
      id: '',
      isHost: false,
      send: (_to, msg) => conn?.open && conn.send(msg),
      broadcast: (msg) => conn?.open && conn.send(msg),
      onMessage: noop,
      onJoin: noop,
      onLeave: noop,
      onError: noop,
      close: () => peer.destroy(),
    };
    let conn: import('peerjs').DataConnection | null = null;
    peer.on('error', (e) => {
      const text = e.type === 'peer-unavailable' ? 'Room not found — check the code' : String(e.type ?? e);
      t.onError(text);
      reject(new Error(text));
    });
    peer.on('open', (id) => {
      (t as { id: string }).id = id;
      // unordered: every message still arrives, but one that gets lost no longer holds back the ones behind it
      conn = peer.connect(host, { reliable: false, serialization: 'json' });
      conn.on('open', () => resolve(t));
      conn.on('data', (d) => t.onMessage(host, d as Msg));
      conn.on('close', () => t.onLeave(host));
    });
  });
}

// ------------------------------------------------------------------ BroadcastChannel (local test)

/**
 * Test only: ?localnet&lag=90&jit=60&loss=0.03 makes tab-to-tab messages behave like a phone network (one-way delay,
 * jitter, and lost packets that are re-sent later). &ordered=1 holds everything behind a late message, as an ordered
 * channel does.
 */
function slowly(deliver: (e: MessageEvent) => void) {
  const q = new URLSearchParams(location.search);
  const lag = Number(q.get('lag')) || 0;
  const jit = Number(q.get('jit')) || 0;
  const loss = Number(q.get('loss')) || 0;
  if (!lag && !jit && !loss) return deliver;
  let last = 0;
  return (e: MessageEvent) => {
    let at = performance.now() + lag + Math.random() * jit + (Math.random() < loss ? 2 * lag + 200 : 0);
    if (q.has('ordered')) at = last = Math.max(last, at);
    setTimeout(() => deliver(e), at - performance.now());
  };
}

export function localHost(code: string): Promise<Transport> {
  const ch = new BroadcastChannel(PREFIX + code);
  const id = 'host';
  const t: Transport = {
    id,
    isHost: true,
    send: (to, msg) => ch.postMessage({ from: id, to, msg }),
    broadcast: (msg) => ch.postMessage({ from: id, to: '*', msg }),
    onMessage: noop,
    onJoin: noop,
    onLeave: noop,
    onError: noop,
    close: () => {
      ch.postMessage({ from: id, to: '*', msg: { t: 'bye' } });
      ch.close();
    },
  };
  const known = new Set<string>();
  ch.onmessage = slowly((e) => {
    const { from, to, msg } = e.data as { from: string; to: string; msg: Msg };
    if (from === id || (to !== id && to !== '*')) return;
    if (msg.t === 'knock') {
      if (!known.has(from)) {
        known.add(from);
        t.onJoin(from);
      }
      return;
    }
    if (msg.t === 'bye') {
      if (known.delete(from)) t.onLeave(from);
      return;
    }
    t.onMessage(from, msg);
  });
  return Promise.resolve(t);
}

export function localJoin(code: string): Promise<Transport> {
  const ch = new BroadcastChannel(PREFIX + code);
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  const t: Transport = {
    id,
    isHost: false,
    send: (_to, msg) => ch.postMessage({ from: id, to: 'host', msg }),
    broadcast: (msg) => ch.postMessage({ from: id, to: 'host', msg }),
    onMessage: noop,
    onJoin: noop,
    onLeave: noop,
    onError: noop,
    close: () => {
      ch.postMessage({ from: id, to: 'host', msg: { t: 'bye' } });
      ch.close();
    },
  };
  ch.onmessage = slowly((e) => {
    const { from, to, msg } = e.data as { from: string; to: string; msg: Msg };
    if (from !== 'host' || (to !== id && to !== '*')) return;
    if (msg.t === 'bye') t.onLeave('host');
    else t.onMessage('host', msg);
  });
  ch.postMessage({ from: id, to: 'host', msg: { t: 'knock' } });
  return Promise.resolve(t);
}

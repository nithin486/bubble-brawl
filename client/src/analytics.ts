// Step 1 analytics: console + localStorage ring buffer. Swap for a real endpoint in Step 4.

const KEY = 'bb_events_v1';
const t0 = performance.now();

export function track(name: string, data: Record<string, unknown> = {}) {
  const ev = { name, at: new Date().toISOString(), ms: Math.round(performance.now() - t0), ...data };
  console.info('[analytics]', name, data);
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown[];
    list.push(ev);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-500)));
  } catch {
    /* ignore */
  }
}

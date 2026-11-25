// The one piece of server code: confirm a Google Play coin-pack purchase before the coins are handed out.
// Google refunds a purchase that is not confirmed within three days.
// Runs as the Worker next to the static game files (wrangler.jsonc); only /api/* ever reaches it.
//   vars:   PLAY_PACKAGE            the Android package id
//   secret: PLAY_SERVICE_ACCOUNT    the JSON key of a Google service account allowed to manage orders in Play Console

const PRODUCTS = ['coins_500', 'coins_1500', 'coins_4000'];
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text = (o) => new TextEncoder().encode(JSON.stringify(o));

/** Sign in as the service account (OAuth with a signed JWT). */
async function accessToken(account, http) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(text({ alg: 'RS256', typ: 'JWT' }))}.${b64url(text({ iss: account.client_email, scope: SCOPE, aud: account.token_uri, iat: now, exp: now + 3600 }))}`;
  const der = Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await http(account.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(signature)}` }).toString(),
  });
  if (!res.ok) throw new Error(`sign-in failed (${res.status})`);
  return (await res.json()).access_token;
}

export async function handle(request, env, http = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/purchase') return json({ error: 'not found' }, 404);
  const ready = !!(env.PLAY_SERVICE_ACCOUNT && env.PLAY_PACKAGE);
  if (request.method === 'GET') return json({ ready });
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!ready) return json({ ok: false, error: 'not set up' }, 503);
  let sku;
  let token;
  try {
    ({ sku, token } = await request.json());
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }
  if (!PRODUCTS.includes(sku) || typeof token !== 'string' || !token || token.length > 2000) return json({ ok: false, error: 'bad request' }, 400);
  try {
    const auth = { authorization: `Bearer ${await accessToken(JSON.parse(env.PLAY_SERVICE_ACCOUNT), http)}` };
    const base = `${API}/${env.PLAY_PACKAGE}/purchases/products/${sku}/tokens/${encodeURIComponent(token)}`;
    const res = await http(base, { headers: auth });
    // Google doesn't know this token for this product: a made-up or foreign purchase
    if (res.status === 400 || res.status === 404 || res.status === 410) return json({ ok: false, error: 'unknown purchase' }, 403);
    if (!res.ok) return json({ ok: false, error: 'store unavailable' }, 502);
    const purchase = await res.json();
    if (purchase.purchaseState !== 0) return json({ ok: false, error: 'not paid' }, 403); // 1 cancelled, 2 pending
    if (purchase.consumptionState === 1) return json({ ok: false, error: 'already used' }, 409);
    if (purchase.acknowledgementState !== 1) {
      const ack = await http(`${base}:acknowledge`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{}' });
      if (!ack.ok) return json({ ok: false, error: 'could not confirm' }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'store unavailable' }, 502);
  }
}

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return handle(request, env);
    return env.ASSETS.fetch(request);
  },
};

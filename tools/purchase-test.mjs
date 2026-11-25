// The purchase check (deploy/api.js) against a stand-in for Google: real signing, fake answers.
import { handle } from '../deploy/api.js';

let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) fails++;
};
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
const env = { PLAY_PACKAGE: 'test.app', PLAY_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'bot@test', token_uri: 'https://auth.test/token', private_key: pem }) };

const store = new Map([
  ['good', { purchaseState: 0, consumptionState: 0, acknowledgementState: 0 }],
  ['pending', { purchaseState: 2, consumptionState: 0, acknowledgementState: 0 }],
  ['used', { purchaseState: 0, consumptionState: 1, acknowledgementState: 1 }],
]);
const log = [];
let signatureOk = false;
const google = async (url, init = {}) => {
  log.push(`${init.method || 'GET'} ${url}`);
  if (url === 'https://auth.test/token') {
    const [h, p, s] = new URLSearchParams(init.body).get('assertion').split('.');
    signatureOk = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${p}`));
    return new Response(JSON.stringify({ access_token: 'at' }));
  }
  if (init.headers?.authorization !== 'Bearer at') return new Response('', { status: 401 });
  const m = url.match(/applications\/test\.app\/purchases\/products\/coins_500\/tokens\/([^:]+)(:acknowledge)?$/);
  const p = m && store.get(m[1]);
  if (!p) return new Response('', { status: 404 });
  if (m[2]) {
    p.acknowledgementState = 1;
    return new Response('');
  }
  return new Response(JSON.stringify(p));
};
const post = async (body, e = env) => {
  const r = await handle(new Request('https://x/api/purchase', { method: 'POST', body: JSON.stringify(body) }), e, google);
  return { status: r.status, ...(await r.json()) };
};
const ready = async (e) => (await (await handle(new Request('https://x/api/purchase'), e, google)).json()).ready;

check('says whether it is set up', (await ready(env)) === true && (await ready({ PLAY_PACKAGE: 'test.app' })) === false);
const good = await post({ sku: 'coins_500', token: 'good' });
check('a paid purchase is confirmed to Google', good.ok && store.get('good').acknowledgementState === 1 && log.some((l) => l.startsWith('POST') && l.endsWith('good:acknowledge')));
check('the sign-in request is properly signed', signatureOk);
check('asking again is harmless', (await post({ sku: 'coins_500', token: 'good' })).ok);
check('a made-up purchase is refused', (await post({ sku: 'coins_500', token: 'fake' })).status === 403);
check('an unpaid purchase is refused', (await post({ sku: 'coins_500', token: 'pending' })).status === 403);
check('a used purchase is refused', (await post({ sku: 'coins_500', token: 'used' })).status === 409);
check('an unknown product is refused', (await post({ sku: 'coins_999999', token: 'good' })).status === 400);
check('without keys nothing is confirmed', (await post({ sku: 'coins_500', token: 'good' }, { PLAY_PACKAGE: 'test.app' })).status === 503);
console.log(fails ? `${fails} FAILED` : 'purchase checks passed');
process.exit(fails ? 1 : 0);

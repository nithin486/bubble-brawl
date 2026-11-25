// Writes the file that lets the Android app open the website without browser bars.
//   npm run assetlinks -- AA:BB:…:FF [second fingerprint from Play Console]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const prints = process.argv.slice(2).map((s) => s.trim().toUpperCase());
const bad = prints.filter((p) => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(p));
if (!prints.length || bad.length) {
  console.error('Give the SHA-256 certificate fingerprint(s): 32 pairs like AA:BB:…  (Play Console > App signing)');
  process.exit(1);
}
const app = JSON.parse(readFileSync('android/app.json', 'utf8'));
mkdirSync('client/public/.well-known', { recursive: true });
writeFileSync(
  'client/public/.well-known/assetlinks.json',
  JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: app.packageId, sha256_cert_fingerprints: prints } }], null, 2) + '\n',
);
console.log(`wrote client/public/.well-known/assetlinks.json for ${app.packageId}. Build and deploy the site again.`);

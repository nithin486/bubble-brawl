// What still stands between this folder and a store listing.   npm run release:check
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RELEASE } from '../client/src/platform/release.ts';

let broken = 0;
const ok = (m) => console.log(`OK     ${m}`);
const todo = (m) => console.log(`TODO   ${m}`);
const fail = (m) => {
  broken++;
  console.log(`BROKEN ${m}`);
};
const files = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));

console.log('— you');
if (RELEASE.contactEmail) ok('contact email set');
else todo('set contactEmail in client/src/platform/release.ts (the privacy policy needs it)');
const app = JSON.parse(readFileSync('android/app.json', 'utf8'));
if (app.packageIdConfirmed) ok(`package id ${app.packageId}`);
else todo(`confirm the Android package id (${app.packageId}) and the game name in android/app.json: the id is permanent`);
if (existsSync('client/public/.well-known/assetlinks.json')) ok('assetlinks.json present');
else todo('after creating the signing key: npm run assetlinks -- <SHA-256 fingerprint>');
if (!RELEASE.adsenseClient) todo('optional, own website ads: AdSense approval, then adsenseClient');
if (!RELEASE.crazyGamesAds) todo('CrazyGames ads stay off until Full Launch: then set crazyGamesAds = true and rebuild');

for (const [dir, name] of [['dist', 'website + Android'], ['dist-crazygames', 'CrazyGames']]) {
  console.log(`— ${name} build (${dir})`);
  if (!existsSync(join(dir, 'index.html'))) {
    todo(`not built: npm run ${dir === 'dist' ? 'build' : 'build:crazygames'}`);
    continue;
  }
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const all = files(dir);
  const mb = all.reduce((a, f) => a + statSync(f).size, 0) / 1048576;
  if (/(src|href)="\/(?!\/)/.test(html)) fail('index.html uses absolute paths');
  else ok('relative paths only');
  if (mb <= 250 && all.length <= 1500) ok(`${mb.toFixed(1)} MB in ${all.length} files`);
  else fail(`${mb.toFixed(1)} MB in ${all.length} files (limit 250 MB, 1500 files)`);
  if (dir === 'dist-crazygames') {
    if (html.includes('sdk.crazygames.com/crazygames-sdk-v3.js')) ok('CrazyGames SDK included');
    else fail('CrazyGames SDK script missing');
    if (existsSync(join(dir, 'sw.js'))) fail('offline worker must not ship to CrazyGames');
    if (mb <= 20) ok('under 20 MB even counting every file (mobile homepage limit)');
    else todo('check the initial download is 20 MB or less for the mobile homepage');
  } else {
    if (existsSync(join(dir, 'sw.js')) && !readFileSync(join(dir, 'sw.js'), 'utf8').includes('__BUILD__')) ok('offline worker versioned');
    else fail('offline worker missing or unversioned');
    if (existsSync(join(dir, 'privacy.html')) && !readFileSync(join(dir, 'privacy.html'), 'utf8').includes('%CONTACT%')) ok('privacy page');
    else fail('privacy page missing');
  }
}
process.exit(broken ? 1 : 0);

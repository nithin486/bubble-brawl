import { loadAssets, loadPack } from './render/assets.ts';
import { MAP_PACK, MAP_ROTATION, type MapId } from '../../shared/config/maps.ts';
import { Stage, isTouch, detectQuality, type Quality } from './render/stage.ts';
import { loadPortraits } from './render/portraits.ts';
import { Game } from './game.ts';
import { Sfx } from './audio.ts';
import { loadProfile, saveProfile } from './save.ts';
import { track } from './analytics.ts';
import { DEFAULT_MAP } from './progress.ts';
import { HERO_IDS } from '../../shared/config/heroes.ts';
import { platform } from './platform/index.ts';

async function boot() {
  await platform.init(); // first: saved progress may live with the platform
  const profile = loadProfile();
  if (!profile.name && platform.username()) profile.name = platform.username().slice(0, 14);
  profile.lastSeen = new Date().toISOString().slice(0, 10);
  saveProfile(profile);
  track('session_start', { matches: profile.matches, first_seen: profile.firstSeen, returning: profile.firstSeen !== profile.lastSeen });

  const bar = document.getElementById('bootbar') as HTMLElement;
  const q = new URLSearchParams(location.search).get('q') as Quality | null;
  const quality: Quality = q ?? (profile.quality !== 'auto' ? profile.quality : detectQuality(isTouch()));
  const stage = new Stage(document.getElementById('app')!, quality);
  const pct = document.getElementById('bootpct');
  const progress = (f: number) => {
    bar.style.width = `${Math.max(5, f * 100)}%`;
    if (pct) pct.textContent = `LOADING ${Math.round(f * 100)}%`;
  };
  const assets = await loadAssets(HERO_IDS, (f) => progress(f * 0.85));
  // the first screen shows the ?map= or saved map: its art pack must be here before the game builds it
  const wanted = new URLSearchParams(location.search).get('map') ?? profile.map;
  const first = (MAP_ROTATION as string[]).includes(wanted) ? (wanted as MapId) : DEFAULT_MAP;
  const pack = MAP_PACK[first];
  // a failed download is not fatal: the game falls back to a map that needs no pack
  if (pack) await loadPack(assets, pack, (f) => progress(0.85 + f * 0.15)).catch((e) => console.warn(e));
  progress(1);
  const portraits = loadPortraits();
  const game = new Game(stage, assets, portraits, profile, new Sfx());
  // build every shader behind the loading screen, without freezing it, so nothing stalls once play starts
  if (pct) pct.textContent = 'PREPARING GRAPHICS';
  await game.prepare();
  const boot = document.getElementById('boot')!;
  boot.style.opacity = '0';
  setTimeout(() => boot.remove(), 400);
  platform.loadingDone();
  track('ready', { ms_since_load: Math.round(performance.now()) });
}

// offline play and instant repeat visits for the website and the Android app
if (import.meta.env.PROD && import.meta.env.VITE_PLATFORM !== 'crazygames' && 'serviceWorker' in navigator) {
  // a newer version took over while this one was still loading: start again, so old and new files never mix
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => document.getElementById('boot') && location.reload(), { once: true });
  }
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('offline mode unavailable', e)));
}
// a phone that runs out of graphics memory drops the 3D view: say so and offer a restart instead of a frozen screen
window.addEventListener(
  'webglcontextlost',
  (e) => {
    e.preventDefault();
    const d = document.createElement('div');
    d.className = 'crashed';
    d.innerHTML = '<div><b>The graphics stopped</b><span>Your device ran low on memory.</span><button>RESTART</button></div>';
    d.querySelector('button')!.addEventListener('click', () => location.reload());
    document.body.append(d);
  },
  true,
);

boot().catch((e) => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.innerHTML = `<div class="logo">Bubblaze</div><div>Could not start: ${String(e?.message ?? e)}</div>`;
});

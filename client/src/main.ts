import { loadAssets, loadPack } from './render/assets.ts';
import { MAP_PACK, MAP_ROTATION, type MapId } from '../../shared/config/maps.ts';
import { Stage, isTouch, type Quality } from './render/stage.ts';
import { makePortraits } from './render/portraits.ts';
import { Game } from './game.ts';
import { Sfx } from './audio.ts';
import { loadProfile, saveProfile } from './save.ts';
import { track } from './analytics.ts';
import { DEFAULT_MAP } from './progress.ts';
import { HERO_IDS } from '../../shared/config/heroes.ts';

async function boot() {
  const profile = loadProfile();
  profile.lastSeen = new Date().toISOString().slice(0, 10);
  saveProfile(profile);
  track('session_start', { matches: profile.matches, first_seen: profile.firstSeen, returning: profile.firstSeen !== profile.lastSeen });

  const bar = document.getElementById('bootbar') as HTMLElement;
  const q = new URLSearchParams(location.search).get('q') as Quality | null;
  const quality: Quality = q ?? (profile.quality !== 'auto' ? profile.quality : isTouch() ? 'medium' : 'high');
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
  const portraits = makePortraits(stage.renderer, assets);
  new Game(stage, assets, portraits, profile, new Sfx());
  const boot = document.getElementById('boot')!;
  boot.style.opacity = '0';
  setTimeout(() => boot.remove(), 400);
  track('ready', { ms_since_load: Math.round(performance.now()) });
}

boot().catch((e) => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.innerHTML = `<div class="logo">Bubble Brawl</div><div>Could not start: ${String(e?.message ?? e)}</div>`;
});

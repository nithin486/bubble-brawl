import { loadAssets } from './render/assets.ts';
import { Stage, isTouch, type Quality } from './render/stage.ts';
import { makePortraits } from './render/portraits.ts';
import { Game } from './game.ts';
import { Sfx } from './audio.ts';
import { loadProfile, saveProfile } from './save.ts';
import { track } from './analytics.ts';
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
  const assets = await loadAssets(HERO_IDS, (f) => (bar.style.width = `${Math.max(5, f * 100)}%`));
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

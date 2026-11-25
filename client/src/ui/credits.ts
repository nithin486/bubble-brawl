// In-game credits, built from the asset pipeline's own table so a new model is credited automatically.
import table from '../../../assets/models/CREDITS.md?raw';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Rows of the markdown table: File | Model | Author | Licence | Source. */
const rows = table
  .split('\n')
  .filter((l) => l.startsWith('|') && !/^\|\s*(File|---)/.test(l))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
  .filter((c) => c.length >= 4 && c[2] && !/^Bubble Brawl/i.test(c[2]));

const byAuthor = new Map<string, Set<string>>();
for (const [, model, author, licence] of rows) {
  const key = `${author} (${licence})`;
  if (!byAuthor.has(key)) byAuthor.set(key, new Set());
  byAuthor.get(key)!.add(model);
}
const models = [...byAuthor].map(([who, set]) => `<li><b>${esc(who)}</b>: ${[...set].map(esc).join(', ')}</li>`).join('');

export const CREDITS_HTML = `
  <h4>Heroes</h4>
  <ul><li>KayKit Adventurers and Skeletons by Kay Lousberg (CC0)</li><li>Bubble Ranger, weapons and map pieces: original Bubble Brawl art</li></ul>
  <h4>3D models</h4><ul>${models}</ul>
  <h4>Scenery</h4><ul><li>KayKit Hexagon, City, Halloween and Dungeon packs by Kay Lousberg (CC0)</li></ul>
  <h4>Fonts and code</h4><ul><li>Lilita One and Nunito (SIL Open Font License)</li><li>three.js and PeerJS (MIT)</li></ul>`;

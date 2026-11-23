// For hosts that don't serve .glb: bundle dist/assets/*.glb into dist/assets/pack.json (base64) and drop the .glb files.
// Used by: npm run build:packed
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(import.meta.dirname, '../dist/assets');
const pack = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  pack[`assets/${f}`] = fs.readFileSync(path.join(dir, f)).toString('base64');
  fs.unlinkSync(path.join(dir, f));
}
fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify(pack));
console.log('packed', Object.keys(pack).length, 'models →', (fs.statSync(path.join(dir, 'pack.json')).size / 1024).toFixed(0), 'KB');

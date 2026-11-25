// Tiles screenshots into one labelled sheet: node tools/contact-sheet.mjs out.jpg cols tileW img1 img2 ...
import sharp from 'sharp';
import path from 'node:path';
const [out, cols, w, ...files] = process.argv.slice(2);
const tw = +w;
const tiles = [];
let th = 0;
for (const f of files) {
  const buf = await sharp(f).resize({ width: tw }).toBuffer({ resolveWithObject: true });
  th = Math.max(th, buf.info.height);
  tiles.push({ f, buf: buf.data });
}
const C = +cols;
const rows = Math.ceil(tiles.length / C);
const label = (t) => Buffer.from(`<svg width="${tw}" height="20"><rect width="100%" height="100%" fill="#000"/><text x="6" y="15" fill="#fff" font-family="sans-serif" font-size="13">${t}</text></svg>`);
const layers = tiles.flatMap((t, i) => {
  const left = (i % C) * (tw + 6);
  const top = Math.floor(i / C) * (th + 26);
  return [{ input: label(path.basename(t.f)), left, top }, { input: t.buf, left, top: top + 20 }];
});
await sharp({ create: { width: C * (tw + 6), height: rows * (th + 26), channels: 3, background: '#222' } }).composite(layers).jpeg({ quality: 86 }).toFile(out);

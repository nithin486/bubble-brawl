// App icons for the web manifest (and later the Play Store wrapper): node tools/make-icons.mjs
import fs from 'node:fs';
import sharp from 'sharp';
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#5cb6ff"/><stop offset="1" stop-color="#16204f"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<g transform="translate(256 256) scale(${pad}) translate(-256 -256)">
<circle cx="256" cy="256" r="168" fill="#8fe9ff" fill-opacity=".45" stroke="#fff" stroke-width="16"/>
<circle cx="196" cy="190" r="46" fill="#fff"/><circle cx="150" cy="262" r="16" fill="#fff"/>
<path d="M286 150 214 280h54l-24 96 104-140h-60l34-86z" fill="#ffd23f" stroke="#16204f" stroke-width="14" stroke-linejoin="round"/>
</g></svg>`;
fs.mkdirSync('client/public/icons', { recursive: true });
for (const [name, size, pad] of [['icon-192', 192, 1.15], ['icon-512', 512, 1.15], ['icon-maskable-512', 512, 0.88]])
  await sharp(Buffer.from(svg(pad))).resize(size, size).png({ palette: true }).toFile(`client/public/icons/${name}.png`);
console.log('icons ok');

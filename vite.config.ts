import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RELEASE } from './client/src/platform/release.ts';

/** `vite build --mode crazygames` makes the CrazyGames upload; the plain build is the website and the Android app. */
export default defineConfig(({ mode }) => {
  const crazy = mode === 'crazygames';
  const outDir = crazy ? '../dist-crazygames' : '../dist';
  const finish = (): Plugin => ({
    name: 'bubble-brawl-release',
    transformIndexHtml: (html) =>
      crazy
        ? html
            .replace(/\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/g, '')
            .replace('<title>', '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n    <title>')
        : html,
    closeBundle() {
      const out = resolve('client', outDir);
      if (!existsSync(out)) return;
      if (crazy) {
        // CrazyGames hosts the game itself: no offline worker, no app manifest, no Android link file
        for (const f of ['sw.js', 'manifest.webmanifest', '.well-known']) rmSync(join(out, f), { recursive: true, force: true });
      }
      const privacy = join(out, 'privacy.html');
      if (existsSync(privacy)) {
        const who = RELEASE.contactEmail ? `<a href="mailto:${RELEASE.contactEmail}">${RELEASE.contactEmail}</a>` : '<b>[add your contact email in client/src/platform/release.ts]</b>';
        writeFileSync(privacy, readFileSync(privacy, 'utf8').replaceAll('%CONTACT%', who));
      }
      // a new offline cache for every different build
      const sw = join(out, 'sw.js');
      if (existsSync(sw)) {
        const hash = createHash('sha256');
        const walk = (d: string) => {
          for (const f of readdirSync(d).sort()) {
            const p = join(d, f);
            if (statSync(p).isDirectory()) walk(p);
            else if (p !== sw) hash.update(f).update(readFileSync(p));
          }
        };
        walk(out);
        writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD__', hash.digest('hex').slice(0, 12)));
      }
    },
  });
  return {
    root: 'client',
    publicDir: 'public',
    base: './',
    server: { host: true, port: 5173 },
    define: { 'import.meta.env.VITE_PLATFORM': JSON.stringify(crazy ? 'crazygames' : 'web') },
    plugins: [finish()],
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2020',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 900,
    },
  };
});

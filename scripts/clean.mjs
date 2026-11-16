/**
 * clean.mjs — clear build + dev caches across the monorepo.
 * Use when `astro dev` errors with a stale content/Vite cache, e.g.
 * "Cannot find module .../content/.astro/content-assets.mjs".
 *
 *   pnpm clean   # then: pnpm sync && pnpm dev
 */
import { existsSync, rmSync } from 'node:fs';

const targets = [
  'node_modules/.vite',
  'apps/web/.astro',
  'apps/web/dist',
  'apps/web/node_modules/.vite',
  'apps/docs/.astro',
  'apps/docs/dist',
  'apps/docs/node_modules/.vite',
];

for (const t of targets) {
  if (!existsSync(t)) continue;
  rmSync(t, { recursive: true, force: true });
  console.log('removed', t);
}
console.log('clean complete — run `pnpm sync` then `pnpm dev`.');

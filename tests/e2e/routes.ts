import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGES_DIR = fileURLToPath(new URL('../../apps/web/src/pages', import.meta.url));

/** Top-level entries that exist but are not indexable backbone pages.
 *  `search` is rendered on demand — it never exists in dist/client, so the
 *  static projects cannot reach it; the `worker` project covers it. */
const EXCLUDE = new Set(['404', 'api', 'search']);

/**
 * Every level-1 ("backbone") route, derived from the pages directory so a new
 * top-level page is under the e2e contract the moment its file exists — no
 * hand-maintained URL list to forget. `foo.astro` → /foo, `foo/index.astro`
 * → /foo, `index.astro` → /.
 */
export const backboneRoutes = (): string[] => {
  const routes = new Set<string>();
  for (const entry of readdirSync(PAGES_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDE.has(entry.name) && existsSync(join(PAGES_DIR, entry.name, 'index.astro'))) {
        routes.add(`/${entry.name}`);
      }
    } else if (entry.name.endsWith('.astro')) {
      const name = entry.name.slice(0, -'.astro'.length);
      if (!EXCLUDE.has(name)) routes.add(name === 'index' ? '/' : `/${name}`);
    }
  }
  return [...routes].sort();
};

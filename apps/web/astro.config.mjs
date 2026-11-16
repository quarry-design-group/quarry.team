// @ts-check
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { FontaineTransform } from 'fontaine';

const SITE = process.env.SITE_URL ?? 'https://quarry.team';

/**
 * rehype plugin: tag photo-credit paragraphs (carried over from the legacy
 * content as inline body text — "Photo by … on Unsplash") with class `credit` so the prose styles
 * render them as a small, subtle caption beneath their image rather than body copy.
 * Self-contained (no extra deps) to keep the build hermetic.
 *
 * Wired via `markdown.processor: unified({...})` — the replacement for the
 * `markdown.rehypePlugins` array (deprecated in Astro 6, removed in 7). The
 * mdx() integration inherits the processor's plugins, which is what applies it
 * here (all content collections are MDX).
 */
function rehypeImageCredits() {
  /** @param {any} node @returns {string} */
  const textOf = (node) =>
    node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join('');
  /** @param {string} t */
  const isCredit = (t) => {
    const s = t.trim().toLowerCase();
    if (!s) return false;
    return (
      /^(photo|cover photo|cover image|image|illustration|shot)\s+by\s+/.test(s) ||
      (/\bon\s+unsplash\b/.test(s) && s.length < 200)
    );
  };
  return (/** @type {any} */ tree) => {
    /** @param {any} node */
    const walk = (node) => {
      if (node.tagName === 'p' && isCredit(textOf(node))) {
        node.properties = node.properties ?? {};
        const cls = node.properties.className ?? [];
        node.properties.className = (Array.isArray(cls) ? cls : [cls]).concat('credit');
      }
      (node.children ?? []).forEach(walk);
    };
    walk(tree);
  };
}

/**
 * slug → lastmod (ISO date) for /work/* and /blog/*, read straight from the
 * MDX frontmatter on disk. The sitemap integration runs outside the content
 * collections API (no getCollection in config), but the glob-loader id IS the
 * directory name, so a light frontmatter scan gives the same mapping without
 * a post-build rewrite step. Cases: updatedDate ?? releasedDate; posts:
 * updatedDate ?? publishedDate.
 */
function contentLastmodMap() {
  /** @type {Map<string, string>} */
  const map = new Map();
  const read = (
    /** @type {string} */ base,
    /** @type {string[]} */ keys,
    /** @type {string} */ prefix,
  ) => {
    const dir = join(import.meta.dirname, 'src/content', base);
    if (!existsSync(dir)) return;
    for (const slug of readdirSync(dir)) {
      const file = join(dir, slug, 'index.mdx');
      if (!existsSync(file)) continue;
      const fm = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
      for (const key of keys) {
        const m = fm.match(new RegExp(`^${key}:\\s*['"]?(\\d{4}-\\d{2}-\\d{2})`, 'm'));
        if (m) {
          map.set(`${prefix}/${slug}`, m[1]);
          break;
        }
      }
    }
  };
  read('cases', ['updatedDate', 'releasedDate'], '/work');
  read('posts', ['updatedDate', 'publishedDate'], '/blog');
  return map;
}
const lastmodBySlug = contentLastmodMap();

/**
 * The policies collection (flat MDX, `policies/<slug>.mdx` → /policies/<slug>)
 * carries two sitemap facts in frontmatter: `updated` (lastmod) and
 * `sitemap: false` (thin legal boilerplate — privacy, terms — stays out of the
 * sitemap so it never dilutes crawl focus). Same light frontmatter scan as
 * above; the collection stays the single source. See ADR-0016.
 */
function policiesSitemapFacts() {
  const dir = join(import.meta.dirname, 'src/content/policies');
  const excluded = new Set();
  /** On-demand (interactive) entries, invisible to the sitemap integration.
   *  @type {string[]} */
  const customPages = [];
  if (!existsSync(dir)) return { excluded, customPages };
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.mdx')) continue;
    const slug = file.slice(0, -'.mdx'.length);
    const fm =
      readFileSync(join(dir, file), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    if (/^sitemap:\s*false\s*$/m.test(fm)) excluded.add(`/policies/${slug}`);
    const updated = fm.match(/^updated:\s*['"]?(\d{4}-\d{2}-\d{2})/m)?.[1];
    if (updated) lastmodBySlug.set(`/policies/${slug}`, updated);
    const flag = (/** @type {string} */ name) =>
      new RegExp('^' + name + ':' + '\\s*true\\s*$', 'm').test(fm);
    if (flag('interactive') && !flag('draft')) customPages.push(`${SITE}/policies/${slug}`);
  }
  return { excluded, customPages };
}
const policies = policiesSitemapFacts();

/** The `/*` header block of public/_headers, inlined for the on-demand
 *  middleware (Cloudflare applies _headers to static assets only — ADR-0017). */
const headersSource = readFileSync(join(import.meta.dirname, 'public/_headers'), 'utf8');

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // Static output: every content page is prerendered to immutable HTML for
  // optimal Core Web Vitals and minimal attack surface. The only on-demand
  // routes are the same-origin form endpoints (`src/pages/api/*`, marked
  // `prerender = false`), which run as Cloudflare Workers via the adapter and
  // write submissions to D1. See ADR-0002 (stack) and ADR-0014 (forms + data tier).
  output: 'static',
  adapter: cloudflare({ imageService: 'compile' }),
  // No route reads or writes a session. `false` keeps the adapter from wiring
  // its KV session driver and injecting a `SESSION` binding into the emitted
  // dist/server/wrangler.json.
  session: false,
  trailingSlash: 'never',
  markdown: {
    processor: unified({ rehypePlugins: [rehypeImageCredits] }),
  },
  build: {
    // 'always': every page's CSS ships inline in the HTML — measured at 74 KB
    // raw / 11 KB brotli on a case study or post, 88 KB / 13 KB on the home
    // page. Three render-blocking stylesheet requests disappear, which is
    // worth more than cross-page CSS caching on a site whose HTML is served
    // straight from the edge (Lighthouse render-blocking-insight, mobile LCP).
    inlineStylesheets: 'always',
    format: 'directory',
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
  integrations: [
    mdx(),
    sitemap({
      // Exclude the policies that opt out in frontmatter (the legal
      // boilerplate) — thin pages that dilute crawl focus and never need to
      // rank. Drafts never reach the sitemap: no route is built for them.
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/$/, '');
        // /search is rendered on demand and carries `noindex, follow`
        // (ADR-0021); the integration lists the route, so it is excluded here.
        if (path === '/search') return false;
        return !policies.excluded.has(path);
      },
      // On-demand routes are invisible to the integration; interactive policy
      // entries (the grievance page) are listed explicitly unless drafted.
      customPages: policies.customPages,
      // Stamp <lastmod> on dated content (cases + posts) from frontmatter.
      serialize: (item) => {
        const path = new URL(item.url).pathname.replace(/\/$/, '');
        const lastmod = lastmodBySlug.get(path);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  vite: {
    define: {
      __HEADERS_SOURCE__: JSON.stringify(headersSource),
    },
    plugins: [
      tailwindcss(),
      // Metric-matched fallback faces ("<Family> fallback" via size-adjust/
      // ascent-override) for the Fontsource @font-face rules, so the swap
      // from system fallback to webfont doesn't reflow the page. The hero's
      // text pushed the pit SVG ~0.14 CLS on throttled mobile runs without
      // this. The token font stacks reference the generated families.
      FontaineTransform.vite({
        fallbacks: ['Georgia', 'Arial'],
        resolvePath: (id) => new URL('./node_modules/' + id, import.meta.url),
      }),
    ],
    build: {
      // Never inline fonts as data: URIs. Vite inlines assets < 4 KB, which
      // put two tiny Fontsource subsets into Base.css as data:font/woff2 —
      // refused by the CSP (font-src 'self') with a console error on every
      // page. Files under /_astro are covered by 'self' and cache immutably.
      // The search page's island ships as an external module (ADR-0021): the
      // on-demand /search response then carries no inline script beyond the
      // layout's hash-pinned ones, and the module caches under script-src
      // 'self'. Astro inlines any page script under 4 KB otherwise.
      // Returning undefined keeps Vite's default behavior for everything else.
      assetsInlineLimit: (filePath) =>
        /\.(woff2?|ttf|otf|eot)$/.test(filePath) ||
        /\bsearch\.astro_astro_type_script/.test(filePath)
          ? false
          : undefined,
    },
  },
});

#!/usr/bin/env node
/**
 * check-asset-refs.mjs — sitewide broken-asset sweep over the built output.
 *
 * Walks apps/web/dist/client/**\/*.html (and *.css), extracts every local URL
 * reference — <img src/srcset>, <source src/srcset>, <video poster>, <link href>
 * (stylesheets, fonts, icons, manifests), <script src>, og:image / twitter:image
 * metas, <a href> ending in a known asset extension, and url(...) in inline
 * styles + stylesheets — normalizes each (strip query/hash, URL-decode), and
 * verifies it maps to a real file under dist/client.
 *
 * Only ASSET-extension refs are validated (pages route through the
 * drop-trailing-slash rewrite, so /path may be /path/index.html or /path.html —
 * page-link checking is deliberately out of scope to keep this precise).
 *
 * Usage: node scripts/check-asset-refs.mjs [distDir]
 * Exits 1 and prints missing refs grouped by page when anything is broken.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';

const DIST = process.argv[2] ?? join(import.meta.dirname, '..', 'apps', 'web', 'dist', 'client');

/** Absolute URLs on the site's own origin (og:image, JSON-LD…) are validated
 *  like local refs; any other origin is out of scope. */
const SITE_ORIGIN = (process.env.SITE_URL ?? 'https://quarry.team').replace(/\/+$/, '');

if (!existsSync(DIST)) {
  console.error(`dist dir not found: ${DIST} — run the build first.`);
  process.exit(2);
}

/** Extensions we treat as assets (anything else — page links — is skipped). */
const ASSET_EXT =
  /\.(avif|webp|png|jpe?g|gif|svg|ico|css|js|mjs|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|ogg|wav|pdf|zip|json|webmanifest|xml|txt)$/i;

/** Recursively collect files under dir matching a test. */
const walk = (dir, test, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, test, out);
    else if (test(p)) out.push(p);
  }
  return out;
};

/** Normalize a raw ref → root-relative path, or null when out of scope. */
const normalize = (raw, fromFile) => {
  let url = raw.trim();
  if (!url || url.startsWith('#')) return null;
  // Same-origin absolute URLs are validated like local refs.
  if (url.startsWith(SITE_ORIGIN + '/')) url = url.slice(SITE_ORIGIN.length);
  else if (url.startsWith('//' + SITE_ORIGIN.replace(/^https?:\/\//, '') + '/')) {
    url = url.replace(/^\/\/[^/]+/, '');
  }
  // External / non-fetch schemes are out of scope.
  if (/^(https?:)?\/\//i.test(url) || /^(data|mailto|tel|javascript|blob|about):/i.test(url)) {
    return null;
  }
  url = url.replace(/[?#].*$/, '');
  try {
    url = decodeURIComponent(url);
  } catch {
    /* keep as-is on malformed escapes */
  }
  if (!url) return null;
  if (url.startsWith('/')) return url;
  // Relative ref — resolve against the containing file's directory.
  const baseDir = posix.dirname('/' + relative(DIST, fromFile).split(sep).join('/'));
  return posix.normalize(posix.join(baseDir, url));
};

/** Extract candidate refs (raw strings) from an HTML document. */
const refsFromHtml = (html) => {
  const refs = [];
  // src / href / poster attributes on asset-bearing elements. We collect every
  // src/href/poster and filter by extension later, so <a href="/file.pdf"> is
  // covered and page links fall away naturally.
  for (const m of html.matchAll(/\s(?:src|href|poster)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    refs.push(m[2] ?? m[3]);
  }
  // srcset / imagesrcset: comma-separated "url [descriptor]" entries.
  for (const m of html.matchAll(/\s(?:srcset|imagesrcset)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    for (const entry of (m[2] ?? m[3]).split(',')) {
      const url = entry.trim().split(/\s+/)[0];
      if (url) refs.push(url);
    }
  }
  // og:image / twitter:image metas (content= attr; property or name form).
  for (const m of html.matchAll(
    /<meta\s[^>]*(?:property|name)\s*=\s*["'](?:og:image|og:image:url|og:image:secure_url|twitter:image)["'][^>]*>/gi,
  )) {
    const c = m[0].match(/\scontent\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (c) refs.push(c[2] ?? c[3]);
  }
  // url(...) inside inline style attributes and <style> blocks.
  for (const m of html.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi)) {
    refs.push(m[1] ?? m[2] ?? m[3]);
  }
  // JSON-LD: any string value that looks like a URL/path (image, logo, …).
  for (const m of html.matchAll(
    /<script\s[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const collect = (v) => {
        if (typeof v === 'string') {
          if (v.startsWith('/') || v.startsWith(SITE_ORIGIN + '/')) refs.push(v);
        } else if (Array.isArray(v)) v.forEach(collect);
        else if (v && typeof v === 'object') Object.values(v).forEach(collect);
      };
      collect(JSON.parse(m[1]));
    } catch {
      /* malformed JSON-LD — not this script's concern */
    }
  }
  return refs;
};

/** Extract url(...) refs from a stylesheet. */
const refsFromCss = (css) => {
  const refs = [];
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi)) {
    refs.push(m[1] ?? m[2] ?? m[3]);
  }
  return refs;
};

const htmlFiles = walk(DIST, (p) => p.endsWith('.html'));
const cssFiles = walk(DIST, (p) => p.endsWith('.css'));

/** page (root-relative) → Set of missing refs */
const missing = new Map();
let checked = 0;

const checkRefs = (file, rawRefs) => {
  const page = '/' + relative(DIST, file).split(sep).join('/');
  for (const raw of rawRefs) {
    const ref = normalize(raw, file);
    if (!ref || !ASSET_EXT.test(ref)) continue; // page link or out of scope
    checked++;
    if (!existsSync(join(DIST, ...ref.split('/')))) {
      if (!missing.has(page)) missing.set(page, new Set());
      missing.get(page).add(ref);
    }
  }
};

for (const f of htmlFiles) checkRefs(f, refsFromHtml(readFileSync(f, 'utf8')));
for (const f of cssFiles) checkRefs(f, refsFromCss(readFileSync(f, 'utf8')));

console.log(
  `Scanned ${htmlFiles.length} HTML + ${cssFiles.length} CSS files; verified ${checked} asset refs.`,
);

if (missing.size === 0) {
  console.log('No missing asset references.');
} else {
  console.error(
    `\nMissing asset references (${[...missing.values()].reduce((n, s) => n + s.size, 0)}):`,
  );
  for (const [page, refs] of [...missing.entries()].sort()) {
    console.error(`\n  ${page}`);
    for (const ref of [...refs].sort()) console.error(`    → ${ref}`);
  }
  process.exit(1);
}

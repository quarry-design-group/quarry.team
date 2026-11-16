// Strict-CSP hash injector (ADR-0015).
//
// The site ships a Content-Security-Policy in `public/_headers`. To keep
// `script-src` free of `'unsafe-inline'` — the directive that would otherwise
// nullify the policy's XSS protection — every inline <script> the site emits is
// pinned by SHA-256 hash instead. Those hashes are a build output: they change
// whenever an inline script changes, so hand-maintaining them in `_headers`
// would rot. This postbuild step recomputes them from the emitted HTML and
// rewrites the deployed `dist/client/_headers`, replacing the placeholder token
// the source file carries. It fails the build if the placeholder is missing or
// no inline scripts were found, so a hashless (therefore broken) strict CSP can
// never ship silently.
//
// The same contract covers `style-src`: `build.inlineStylesheets: 'always'`
// ships per-page CSS as inline <style>, and components emit generated
// per-instance style blocks (src/lib/style-scope.ts) instead of style
// attributes — so every <style> element is hashed too and `style-src` carries
// no 'unsafe-inline' either. Style *attributes* would need CSP's
// 'unsafe-hashes' weakening; the source ships none, and keeping it that way is
// enforced by the e2e run against the built site.
//
// The one script the site does not author — the bot-detection bootstrap that
// Cloudflare injects at the edge — is unhashable and is covered at serve time
// instead: src/worker.ts adds a per-request nonce to `script-src` of every
// HTML response (ADR-0019). Nothing here knows about it.
//
// The policy is emitted PER ROUTE FAMILY, not as one global rule: Cloudflare
// caps `_headers` lines at 2000 characters (API error 100324), which a global
// hash union exceeds — and page-scoped policies are tighter anyway (a page can
// only use its own inline content). The rules are OVERLAP-FREE by construction:
// `/*` carries no CSP, and every HTML route (incl. /404) matches exactly one
// generated rule. An earlier design kept a `/*` fallback that family rules
// detached (`! Content-Security-Policy`); local workerd honored it, but the
// production _headers pipeline served the fallback policy anyway — so nothing
// here may depend on detach or rule precedence. Unmatched paths (which serve
// 404.html with no matching rule) are covered by a <meta http-equiv> CSP
// injected into 404.html itself — fetch directives only; the header-only
// directives still arrive via /*'s other headers. Guards fail the build before
// Cloudflare's line (2000 chars) or rule-count (100) limits can.
//
// Runs from `apps/web` (pnpm postbuild) against `dist/client`, after `astro
// build` has materialized the static output.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The tokens `public/_headers` carries in `script-src`/`style-src` for this step to fill. */
export const CSP_HASH_PLACEHOLDER = '__CSP_SCRIPT_HASHES__';
export const CSP_STYLE_PLACEHOLDER = '__CSP_STYLE_HASHES__';

/** base64(sha256(text)) as a CSP source expression — what the browser computes. */
const cspHash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/**
 * Collect CSP source-expression hashes for every *executable* inline <script>
 * in an HTML document, adding them to `sink`. External scripts (`src=…`) are
 * covered by the host allowlist and skipped; non-executable blocks
 * (`type="application/ld+json"`, import maps, etc.) are not governed by
 * `script-src` and skipped too. The hash is `base64(sha256(text))` over the
 * element's exact text content — byte-identical to what the browser hashes.
 *
 * @param {string} html
 * @param {Set<string>} [sink]
 * @returns {Set<string>}
 */
export function collectScriptHashes(html, sink = new Set()) {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const [, attrs, body] = match;
    if (/\bsrc\s*=/i.test(attrs)) continue; // external — host-allowlisted
    const typeMatch = attrs.match(/\btype\s*=\s*["']?\s*([^"'\s>]+)/i);
    const type = (typeMatch ? typeMatch[1] : '').toLowerCase();
    const executable =
      type === '' ||
      type === 'text/javascript' ||
      type === 'application/javascript' ||
      type === 'module';
    if (!executable) continue;
    sink.add(cspHash(body));
  }
  return sink;
}

/**
 * Collect CSP source-expression hashes for every inline <style> element in an
 * HTML document, adding them to `sink`. Same exact-text contract as scripts:
 * the hash covers the element's verbatim text content.
 *
 * @param {string} html
 * @param {Set<string>} [sink]
 * @returns {Set<string>}
 */
export function collectStyleHashes(html, sink = new Set()) {
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = re.exec(html)) !== null) sink.add(cspHash(match[1]));
  return sink;
}

/** @param {string} dir @returns {string[]} absolute paths of every .html under dir */
function walkHtml(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) return walkHtml(p);
    return entry.name.endsWith('.html') ? [p] : [];
  });
}

/** Route served for an emitted HTML file, mirroring drop-trailing-slash handling. */
function routeOf(clientDir, file) {
  const rel = file.slice(clientDir.length).replaceAll('\\', '/');
  if (rel === '/index.html') return '/';
  if (rel.endsWith('/index.html')) return rel.slice(0, -'/index.html'.length);
  return rel.slice(0, -'.html'.length); // e.g. /404.html → /404
}

// Cloudflare's own limits are 2000 chars/line and 100 rules; failing earlier
// keeps a safety margin so growth is caught in CI, not at the deploy edge.
const MAX_LINE = 1900;
const MAX_RULES = 90;

/**
 * Rewrite `<clientDir>/_headers`, expanding the tokenized CSP template into
 * per-route-family rules with each family's own inline script/style hashes.
 */
export function injectCspHashes(clientDir) {
  const headersPath = join(clientDir, '_headers');
  if (!existsSync(headersPath)) {
    throw new Error(`inject-csp-hashes: no _headers at ${headersPath}`);
  }
  const headers = readFileSync(headersPath, 'utf8');
  for (const token of [CSP_HASH_PLACEHOLDER, CSP_STYLE_PLACEHOLDER]) {
    if (!headers.includes(token)) {
      throw new Error(`inject-csp-hashes: ${token} not present in ${headersPath}`);
    }
  }
  const templateMatch = headers.match(/^ {2}(Content-Security-Policy: .*)$/m);
  if (!templateMatch) {
    throw new Error(`inject-csp-hashes: no Content-Security-Policy template in ${headersPath}`);
  }
  const template = templateMatch[1];
  const joined = (set) => [...set].sort().join(' ');
  const cspFor = (scripts, styles) =>
    template
      .replaceAll(CSP_HASH_PLACEHOLDER, joined(scripts))
      .replaceAll(CSP_STYLE_PLACEHOLDER, joined(styles));

  // Per-family hash unions. /404 is a family of its own (direct visits get a
  // header rule); the copies of 404.html served at unmatched paths are covered
  // by the meta CSP injected below.
  const families = new Map(); // '/', '/404', '/work', … → {exact, children, scripts, styles}
  const all = { scripts: new Set(), styles: new Set() };
  let notFound = null;
  for (const file of walkHtml(clientDir)) {
    const html = readFileSync(file, 'utf8');
    const scripts = collectScriptHashes(html);
    const styles = collectStyleHashes(html);
    scripts.forEach((h) => all.scripts.add(h));
    styles.forEach((h) => all.styles.add(h));
    const route = routeOf(clientDir, file);
    if (route === '/404') notFound = { file, scripts, styles };
    const key = route === '/' ? '/' : `/${route.split('/')[1]}`;
    const fam = families.get(key) ?? {
      exact: false,
      children: false,
      scripts: new Set(),
      styles: new Set(),
    };
    if (route === key) fam.exact = true;
    else fam.children = true;
    scripts.forEach((h) => fam.scripts.add(h));
    styles.forEach((h) => fam.styles.add(h));
    families.set(key, fam);
  }
  if (all.scripts.size === 0 || all.styles.size === 0) {
    throw new Error(
      `inject-csp-hashes: found ${all.scripts.size} inline scripts / ${all.styles.size} inline styles — refusing to ship a broken CSP`,
    );
  }

  if (!notFound) {
    throw new Error('inject-csp-hashes: no 404.html — the unmatched-path meta CSP needs it');
  }

  // `/*` carries no CSP — drop the template line entirely.
  let out = headers.replace(templateMatch[0] + '\n', '');

  // One plain rule per family path; no detach, no overlap.
  const blocks = [
    '',
    '# Per-route CSP (generated by scripts/inject-csp-hashes.mjs — ADR-0015).',
    '# Each family carries only its own inline-content hashes: Cloudflare caps',
    '# _headers lines at 2000 chars (a global union exceeds it) and page-scoped',
    '# policies are tighter anyway. Rules are overlap-free and /* carries no CSP',
    '# (the production _headers pipeline does not reliably honor `!` detach);',
    '# unmatched paths serve 404.html, whose own <meta> CSP covers them.',
  ];
  let rules = 0;
  for (const [key, fam] of [...families.entries()].sort()) {
    const csp = cspFor(fam.scripts, fam.styles);
    if (csp.length + 2 > MAX_LINE) {
      throw new Error(
        `inject-csp-hashes: CSP for ${key} is ${csp.length} chars — nearing Cloudflare's 2000-char _headers line limit; split the family or reduce its inline content`,
      );
    }
    const paths = [
      ...(fam.exact ? [key] : []),
      ...(fam.children ? [`${key === '/' ? '' : key}/*`] : []),
    ];
    for (const path of paths) {
      blocks.push(path, `  ${csp}`);
      rules += 1;
    }
  }
  if (rules > MAX_RULES) {
    throw new Error(
      `inject-csp-hashes: ${rules} generated header rules — nearing Cloudflare's 100-rule limit; coarsen the family grouping`,
    );
  }
  writeFileSync(headersPath, out + blocks.join('\n') + '\n');

  // Meta CSP into 404.html: governs the copies served at unmatched paths,
  // which no header rule reaches. Fetch directives only — frame-ancestors is
  // meta-invalid (browsers ignore it there); X-Frame-Options and HSTS still
  // arrive via /*. Placed directly after <meta charset> so it precedes every
  // inline script/style it must govern.
  const metaPolicy = cspFor(notFound.scripts, notFound.styles)
    .replace(/^Content-Security-Policy: /, '')
    .replace(/ ?frame-ancestors [^;]*;/, '');
  const html404 = readFileSync(notFound.file, 'utf8');
  const charset = html404.match(/<meta charset[^>]*>/i);
  if (!charset) {
    throw new Error('inject-csp-hashes: 404.html has no <meta charset> to anchor the meta CSP');
  }
  writeFileSync(
    notFound.file,
    html404.replace(
      charset[0],
      `${charset[0]}<meta http-equiv="Content-Security-Policy" content="${metaPolicy}">`,
    ),
  );
  return { scripts: all.scripts.size, styles: all.styles.size, rules };
}

// Run only when invoked directly (not when imported by the unit test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const clientDir = join(process.cwd(), 'dist', 'client');
  const { scripts, styles, rules } = injectCspHashes(clientDir);
  console.log(
    `strict CSP: pinned ${scripts} inline-script + ${styles} inline-style hash(es) across ${rules} per-route rules`,
  );
}

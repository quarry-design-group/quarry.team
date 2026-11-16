import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collectScriptHashes, collectStyleHashes } from '../../scripts/inject-csp-hashes.mjs';
import {
  CSP_SCRIPT_TOKEN,
  CSP_STYLE_TOKEN,
  cspHash,
  inlineScripts,
  inlineStyles,
  nonDocumentHeadersFor,
  parseGlobalHeaders,
  securityHeadersFor,
} from './csp-runtime';

/**
 * The runtime header module must agree byte-for-byte with the build-time
 * injector (ADR-0015): same inline-content selection, same hash encoding.
 * Otherwise an on-demand page would ship a different policy than its static
 * siblings for the same markup.
 */
const HEADERS = readFileSync(
  fileURLToPath(new URL('../../public/_headers', import.meta.url)),
  'utf8',
);
const nodeHash = (s: string) =>
  `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

const sample = `<!doctype html><html><head>
<script>init()</script>
<script type="application/ld+json">{"@type":"Org"}</script>
<script src="/_astro/x.js"></script>
<script type="module">mod()</script>
<style>.a{--x:1}</style><style media="print">.p{display:none}</style>
</head><body><script>
  tail();
</script></body></html>`;

describe('csp-runtime parity with the build injector', () => {
  it('selects exactly the inline scripts and styles the injector hashes', async () => {
    const scripts = await Promise.all(inlineScripts(sample).map(cspHash));
    const styles = await Promise.all(inlineStyles(sample).map(cspHash));
    expect(new Set(scripts)).toEqual(collectScriptHashes(sample));
    expect(new Set(styles)).toEqual(collectStyleHashes(sample));
  });

  it('hashes with the same encoding as node:crypto', async () => {
    expect(await cspHash("\n  console.log('hi');\n")).toBe(nodeHash("\n  console.log('hi');\n"));
  });
});

describe('parseGlobalHeaders', () => {
  it('reads the /* block of the real _headers, tokenized CSP included', () => {
    const h = parseGlobalHeaders(HEADERS);
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Strict-Transport-Security']).toContain('max-age=');
    expect(h['Content-Security-Policy']).toContain(CSP_SCRIPT_TOKEN);
    expect(h['Content-Security-Policy']).toContain(CSP_STYLE_TOKEN);
    // Only the /* block — the cache rules that follow are not headers of ours.
    expect(h['Cache-Control']).toBeUndefined();
  });

  it('refuses a source without a tokenized policy', () => {
    expect(() => parseGlobalHeaders('/*\n  X-Frame-Options: DENY\n')).toThrow(/tokenized/);
  });
});

describe('securityHeadersFor', () => {
  it('pins the document’s own inline hashes and leaves no unsafe-* or tokens', async () => {
    const h = await securityHeadersFor(HEADERS, sample);
    const csp = h['Content-Security-Policy'];
    expect(csp).not.toContain('__CSP_');
    expect(csp).not.toMatch(/unsafe-/);
    expect(csp).toContain(nodeHash('init()'));
    expect(csp).toContain(nodeHash('.a{--x:1}'));
    expect(csp).toMatch(/script-src [^;]*'sha256-/);
    expect(csp).toMatch(/style-src [^;]*'sha256-/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });
});

describe('nonDocumentHeadersFor', () => {
  it('carries the transport, sniffing, and referrer headers of the real _headers', () => {
    const h = nonDocumentHeadersFor(HEADERS);
    expect(Object.keys(h).sort()).toEqual([
      'Referrer-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
    ]);
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Strict-Transport-Security']).toMatch(/max-age=\d+/);
  });
});

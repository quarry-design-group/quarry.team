import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
// The injector is a build-time .mjs (runs in `postbuild`); we exercise its pure
// hash-collection helper here so the strict-CSP contract (ADR-0015) is covered
// by the unit suite, not only by the e2e run against the built site.
import { collectScriptHashes, collectStyleHashes } from '../../scripts/inject-csp-hashes.mjs';

const sha256 = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

describe('collectScriptHashes (strict-CSP script-src pinning)', () => {
  it('hashes an executable inline script over its exact text content', () => {
    const body = "\n  console.log('hi');\n";
    const hashes = collectScriptHashes(`<script>${body}</script>`);
    expect([...hashes]).toEqual([sha256(body)]);
  });

  it('skips external scripts — they are covered by the host allowlist', () => {
    const hashes = collectScriptHashes('<script src="/_astro/app.js"></script>');
    expect(hashes.size).toBe(0);
  });

  it('skips non-executable blocks (JSON-LD, import maps) that script-src does not govern', () => {
    const html =
      '<script type="application/ld+json">{"@type":"Org"}</script>' +
      '<script type="importmap">{}</script>';
    expect(collectScriptHashes(html).size).toBe(0);
  });

  it('treats module and text/javascript scripts as executable', () => {
    const html = '<script type="module">a()</script><script type="text/javascript">b()</script>';
    expect(collectScriptHashes(html)).toEqual(new Set([sha256('a()'), sha256('b()')]));
  });

  it('deduplicates identical inline scripts across a document (and pages)', () => {
    const one = '<script>init()</script>';
    expect(collectScriptHashes(one + one).size).toBe(1);
  });

  it('accumulates into a shared sink across documents', () => {
    const sink = new Set<string>();
    collectScriptHashes('<script>a()</script>', sink);
    collectScriptHashes('<script>b()</script>', sink);
    expect(sink.size).toBe(2);
  });
});

describe('collectStyleHashes (strict-CSP style-src pinning)', () => {
  it('hashes a style element over its exact text content', () => {
    const body = '.a{--x:1}';
    expect([...collectStyleHashes(`<style>${body}</style>`)]).toEqual([sha256(body)]);
  });

  it('hashes style elements regardless of attributes (media, data-*)', () => {
    const hashes = collectStyleHashes('<style media="print">.p{display:none}</style>');
    expect([...hashes]).toEqual([sha256('.p{display:none}')]);
  });

  it('deduplicates identical style blocks across documents via a shared sink', () => {
    const sink = new Set<string>();
    collectStyleHashes('<style>.a{}</style>', sink);
    collectStyleHashes('<style>.a{}</style><style>.b{}</style>', sink);
    expect(sink.size).toBe(2);
  });

  it('does not confuse styles with scripts', () => {
    const html = '<style>.a{}</style><script>b()</script>';
    expect(collectStyleHashes(html).size).toBe(1);
    expect(collectScriptHashes(html).size).toBe(1);
  });
});

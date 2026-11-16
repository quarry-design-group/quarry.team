import { describe, expect, it } from 'vitest';
import { applyScriptNonce, newNonce, withScriptNonce } from './csp-nonce';

/**
 * The nonce is a serve-time addition to the strict policy (ADR-0019): it must
 * land in `script-src` only, beside the build-time hashes, on HTML responses
 * only, fresh for every response. The Worker e2e project checks the same
 * contract on the served site; this suite pins the pure functions.
 */

const POLICY =
  "default-src 'self'; object-src 'none'; style-src 'self' 'sha256-styleA='; " +
  "script-src 'self' 'sha256-scriptA=' https://challenges.cloudflare.com; " +
  "frame-ancestors 'none'";

const NONCE = /^[A-Za-z0-9+/]{22}==$/;

const html = (headers: Record<string, string> = {}) =>
  new Response('<!doctype html><script>init()</script>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });

describe('newNonce', () => {
  it('is 128 bits of base64, fresh every call', () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).toMatch(NONCE);
    expect(b).toMatch(NONCE);
    expect(a).not.toBe(b);
  });
});

describe('withScriptNonce', () => {
  it('adds the nonce source to script-src and changes nothing else', () => {
    const out = withScriptNonce(POLICY, 'abc=');
    expect(out).toBe(POLICY.replace('script-src ', "script-src 'nonce-abc=' "));
    expect(out).toContain("'sha256-scriptA='");
    expect(out).toContain("style-src 'self' 'sha256-styleA='");
    expect(out).not.toMatch(/unsafe-/);
  });

  it('matches the directive name case-insensitively and mid-policy', () => {
    expect(withScriptNonce("Script-Src 'self'; img-src 'self'", 'n=')).toBe(
      "script-src 'nonce-n=' 'self'; img-src 'self'",
    );
    expect(withScriptNonce("img-src 'self';script-src 'self'", 'n=')).toBe(
      "img-src 'self';script-src 'nonce-n=' 'self'",
    );
  });

  it('leaves script-src-elem / script-src-attr alone and returns undefined without script-src', () => {
    expect(withScriptNonce("script-src-elem 'self'; script-src-attr 'none'", 'n=')).toBeUndefined();
    expect(withScriptNonce("default-src 'self'", 'n=')).toBeUndefined();
  });
});

describe('applyScriptNonce', () => {
  it('stamps a fresh nonce into script-src of an HTML response and keeps the body', async () => {
    const res = applyScriptNonce(html({ 'content-security-policy': POLICY }));
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonce = csp.match(/script-src 'nonce-([^']+)'/)?.[1];
    expect(nonce).toMatch(NONCE);
    expect(csp).toBe(POLICY.replace('script-src ', `script-src 'nonce-${nonce}' `));
    expect(csp.match(/nonce-/g)).toHaveLength(1);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toBe('<!doctype html><script>init()</script>');
  });

  it('mints a different nonce for every response', () => {
    const a = applyScriptNonce(html({ 'content-security-policy': POLICY }));
    const b = applyScriptNonce(html({ 'content-security-policy': POLICY }));
    expect(a.headers.get('content-security-policy')).not.toBe(
      b.headers.get('content-security-policy'),
    );
  });

  it('honours an explicit nonce (for tests and tracing)', () => {
    const res = applyScriptNonce(html({ 'content-security-policy': POLICY }), 'fixed=');
    expect(res.headers.get('content-security-policy')).toContain("'nonce-fixed='");
  });

  it('returns non-HTML responses untouched, as the same object', () => {
    const asset = new Response('body{}', {
      headers: { 'content-type': 'text/css', 'content-security-policy': POLICY },
    });
    expect(applyScriptNonce(asset)).toBe(asset);
    expect(asset.headers.get('content-security-policy')).toBe(POLICY);
  });

  it('returns HTML without a policy, or without script-src, untouched', () => {
    const bare = html();
    expect(applyScriptNonce(bare)).toBe(bare);
    const noScriptSrc = html({ 'content-security-policy': "default-src 'self'" });
    expect(applyScriptNonce(noScriptSrc)).toBe(noScriptSrc);
    expect(noScriptSrc.headers.get('content-security-policy')).toBe("default-src 'self'");
  });

  it('works on a response whose headers are immutable', () => {
    // fetch()-style responses carry an immutable headers guard; the assets
    // binding returns those. A copy is made rather than mutating in place.
    const immutable = html({ 'content-security-policy': POLICY });
    Object.defineProperty(immutable.headers, 'set', {
      value: () => {
        throw new TypeError('immutable');
      },
    });
    const res = applyScriptNonce(immutable, 'n=');
    expect(res).not.toBe(immutable);
    expect(res.headers.get('content-security-policy')).toContain("'nonce-n='");
  });
});

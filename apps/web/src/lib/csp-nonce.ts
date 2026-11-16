/**
 * Per-request CSP nonce for the script Cloudflare injects at the edge
 * (ADR-0019, extending ADR-0015/0017).
 *
 * The site's own inline scripts are hash-pinned at build, but Cloudflare's
 * bot-detection bootstrap (`/cdn-cgi/challenge-platform/…`) is injected into
 * every HTML response at the edge with the request's ray id in its body, so no
 * hash can ever match it. Cloudflare parses the response's
 * Content-Security-Policy header for a `'nonce-…'` source in `script-src` and
 * stamps that nonce on the script it injects. The Worker entry
 * (`src/worker.ts`) therefore appends a fresh nonce to `script-src` on every
 * HTML response, static and on-demand alike. Nothing else in the policy
 * changes: the hashes stay, no `'unsafe-*'` appears, and a nonce is valid only
 * for the one response it was minted for.
 *
 * Web Crypto only, so this runs on workerd and in the unit suite alike.
 */

/** 128 random bits per nonce — unguessable within a response's lifetime. */
const NONCE_BYTES = 16;

/** A fresh base64 nonce (CSP `base64-value`), never reused. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return btoa(String.fromCharCode(...bytes));
}

// The `script-src` directive name only — `script-src-elem` / `script-src-attr`
// are distinct directives and stay untouched. Directive names are
// case-insensitive; the policy is otherwise preserved verbatim.
const SCRIPT_SRC = /(^|;\s*)script-src(?=\s|;|$)/i;

/**
 * `policy` with `'nonce-<nonce>'` added to `script-src`, or `undefined` when
 * the policy has no `script-src` directive to extend (the caller then leaves
 * the response alone rather than inventing a directive).
 */
export function withScriptNonce(policy: string, nonce: string): string | undefined {
  if (!SCRIPT_SRC.test(policy)) return undefined;
  return policy.replace(SCRIPT_SRC, `$1script-src 'nonce-${nonce}'`);
}

/**
 * `res` with a nonce appended to its CSP `script-src` when it is an HTML
 * document carrying a policy; any other response is returned as is. Only a
 * header changes — the body stream is passed through unread.
 */
export function applyScriptNonce(res: Response, nonce: string = newNonce()): Response {
  const type = res.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('text/html')) return res;
  const policy = res.headers.get('content-security-policy');
  if (!policy) return res;
  const next = withScriptNonce(policy, nonce);
  if (!next) return res;
  // Responses from the assets binding carry immutable headers; a copy of the
  // response (status, statusText, headers) with the same body is mutable.
  const out = new Response(res.body, res);
  out.headers.set('content-security-policy', next);
  return out;
}

/**
 * Runtime security headers for on-demand HTML (ADR-0017, extending ADR-0015).
 *
 * `public/_headers` governs static assets only — Cloudflare does not apply it
 * to Worker-generated responses — so server-rendered pages (the grievance form
 * and its confirmation) set the same headers themselves. The `/*` block of
 * `_headers` is the single source of truth: it is inlined at build
 * (`__HEADERS_SOURCE__`, astro.config) and parsed here; the CSP's
 * `__CSP_SCRIPT_HASHES__`/`__CSP_STYLE_HASHES__` tokens are filled with
 * SHA-256 hashes of the inline scripts and styles in the response body, the
 * same contract the build-time injector enforces for static HTML. Web Crypto
 * only, so this runs on workerd and in the unit suite alike.
 */

export const CSP_SCRIPT_TOKEN = '__CSP_SCRIPT_HASHES__';
export const CSP_STYLE_TOKEN = '__CSP_STYLE_HASHES__';

const enc = new TextEncoder();

/** base64(sha256(text)) as a CSP source expression — what the browser computes. */
export async function cspHash(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return `'sha256-${btoa(String.fromCharCode(...digest))}'`;
}

/** Text of every executable inline <script> (same rules as the build injector). */
export function inlineScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [, attrs, body] = m;
    if (/\bsrc\s*=/i.test(attrs)) continue; // external — host-allowlisted
    const type = (attrs.match(/\btype\s*=\s*["']?\s*([^"'\s>]+)/i)?.[1] ?? '').toLowerCase();
    if (
      type === '' ||
      type === 'text/javascript' ||
      type === 'application/javascript' ||
      type === 'module'
    )
      out.push(body);
  }
  return out;
}

/** Text of every inline <style> element. */
export function inlineStyles(html: string): string[] {
  const out: string[] = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/** The `/*` header block of a `_headers` file as name → value. */
export function parseGlobalHeaders(source: string): Record<string, string> {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '/*');
  if (start === -1) throw new Error('_headers has no /* block');
  const headers: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break; // next rule or blank ends the block
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  if (!headers['Content-Security-Policy']?.includes(CSP_SCRIPT_TOKEN)) {
    throw new Error('_headers /* block has no tokenized Content-Security-Policy');
  }
  return headers;
}

/** The `/*` headers that apply to a non-document response: transport, MIME
 *  sniffing, and referrer. The CSP and the framing and permission policies
 *  govern documents and are left to HTML. */
export const NON_DOCUMENT_HEADERS = [
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Referrer-Policy',
] as const;

/** The header set for an on-demand non-HTML response (the `/api/*` JSON, a redirect). */
export function nonDocumentHeadersFor(headersSource: string): Record<string, string> {
  const global = parseGlobalHeaders(headersSource);
  const headers: Record<string, string> = {};
  for (const name of NON_DOCUMENT_HEADERS) {
    if (global[name]) headers[name] = global[name];
  }
  return headers;
}

const joined = async (texts: string[]) =>
  (await Promise.all([...new Set(texts)].map(cspHash))).sort().join(' ');

/**
 * The full header set for one server-rendered HTML document: every `/*`
 * header from `_headers`, with the CSP hash tokens replaced by the document's
 * own inline-script and inline-style hashes.
 */
export async function securityHeadersFor(
  headersSource: string,
  html: string,
): Promise<Record<string, string>> {
  const headers = parseGlobalHeaders(headersSource);
  const [scripts, styles] = await Promise.all([
    joined(inlineScripts(html)),
    joined(inlineStyles(html)),
  ]);
  headers['Content-Security-Policy'] = headers['Content-Security-Policy']
    .replaceAll(CSP_SCRIPT_TOKEN, scripts)
    .replaceAll(CSP_STYLE_TOKEN, styles)
    .replace(/\s{2,}/g, ' ');
  return headers;
}

/**
 * On-demand routes only (static pages never reach middleware in production).
 * Cloudflare applies `public/_headers` to static assets, not to Worker
 * responses, so every server-rendered response gets its security headers
 * here. An HTML document gets the full set — including the strict,
 * hash-pinned CSP computed from the document's own inline content
 * (ADR-0015/0017). Every other response — the `/api/*` JSON (ADR-0014), a
 * redirect — gets the transport, sniffing, and referrer headers. All are
 * marked uncacheable: each render of the grievance form carries a fresh
 * signed token, and an API answer belongs to one request.
 */
import { defineMiddleware } from 'astro:middleware';
import { nonDocumentHeadersFor, securityHeadersFor } from '@/lib/csp-runtime';

// The `/*` block of public/_headers, inlined at build by astro.config.
declare const __HEADERS_SOURCE__: string;

export const onRequest = defineMiddleware(async (context, next) => {
  // Astro also runs middleware while prerendering at build; those responses
  // become static files whose headers `_headers` supplies, so skip the work.
  if (context.isPrerendered) return next();
  const res = await next();
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) {
    const headers = new Headers(res.headers);
    for (const [name, value] of Object.entries(nonDocumentHeadersFor(__HEADERS_SOURCE__))) {
      headers.set(name, value);
    }
    headers.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
  const html = await res.text();
  const headers = new Headers(res.headers);
  for (const [name, value] of Object.entries(await securityHeadersFor(__HEADERS_SOURCE__, html))) {
    headers.set(name, value);
  }
  headers.set('Cache-Control', 'no-store');
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
});

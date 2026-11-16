/**
 * The Worker entry (wrangler.toml `main`). `run_worker_first` sends every
 * non-asset request here so each HTML response can leave with a per-request
 * CSP nonce in `script-src` (ADR-0019, src/lib/csp-nonce.ts).
 *
 * Serving order is the platform's own — assets first, then the app — but
 * performed inside the Worker: a GET/HEAD is offered to the assets binding
 * with `redirect: 'manual'`, so everything the asset layer decides is passed
 * through verbatim (a page with its `_headers` policy, a `_redirects` 301, the
 * trailing-slash 307, a 304). The adapter's own fallback fetches with
 * redirect-follow and would turn a legacy 301 into a 200 at the target. Only
 * a 404 from the binding — an on-demand route or an unknown path — reaches the
 * adapter's handler, which renders `/api/*`, `/policies/grievances`, and the
 * 404 page exactly as before.
 *
 * PR previews are served on `*.workers.dev` (ADR-0013), a host the zone's
 * staging noindex rule never sees, so the entry marks every response there
 * `X-Robots-Tag: noindex, nofollow` itself. Cloudflare also stamps
 * `X-Robots-Tag: noindex` on every workers.dev preview response at its edge
 * (that is the value a client sees); the header here keeps the posture
 * independent of the platform's.
 *
 * The daily cron trigger (wrangler.toml `[triggers]`) runs `scheduled`: the
 * retention purge of every D1 row past its date-based term
 * (src/lib/retention.ts, docs/runbooks/data-retention.md).
 */
import { handle } from '@astrojs/cloudflare/handler';
import { applyScriptNonce } from './lib/csp-nonce';
import { purgeExpired, type D1Purgeable } from './lib/retention';

type AssetsEnv = { ASSETS?: { fetch(request: Request): Promise<Response> } };
type RetentionEnv = { DB?: D1Purgeable };

/** Preview hosts: the hash-prefixed `*.workers.dev` URLs of uploaded versions. */
const isPreviewHost = (url: string): boolean => new URL(url).hostname.endsWith('.workers.dev');

/** `res` with the preview noindex header; the body stream passes through unread. */
function withPreviewNoindex(res: Response): Response {
  // Responses from the assets binding carry immutable headers; a copy of the
  // response (status, statusText, headers) with the same body is mutable.
  const out = new Response(res.body, res);
  out.headers.set('x-robots-tag', 'noindex, nofollow');
  return out;
}

async function serve(...args: Parameters<typeof handle>): Promise<Response> {
  const [request, env] = args;
  const assets = (env as AssetsEnv).ASSETS;
  if (assets && (request.method === 'GET' || request.method === 'HEAD')) {
    const asset = await assets.fetch(new Request(request, { redirect: 'manual' }));
    if (asset.status !== 404) return applyScriptNonce(asset);
  }
  return applyScriptNonce(await handle(...args));
}

export default {
  async fetch(...args: Parameters<typeof handle>): Promise<Response> {
    const res = await serve(...args);
    return isPreviewHost(args[0].url) ? withPreviewNoindex(res) : res;
  },

  async scheduled(_controller: unknown, env: RetentionEnv): Promise<void> {
    if (!env.DB) {
      console.error('[retention] no D1 binding; nothing purged');
      return;
    }
    const counts = await purgeExpired(env.DB);
    console.log('[retention] purged', JSON.stringify(counts));
  },
};

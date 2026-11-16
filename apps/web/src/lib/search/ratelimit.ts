/**
 * Site search — the per-address budget on `/search` (ADR-0021). A Workers
 * Rate Limiting binding (`[[ratelimits]]` in wrangler.toml) counts requests
 * per `cf-connecting-ip`; the budget covers debounced typing with room to
 * spare and stops a scripted loop. The zone's WAF rate-limit rule is
 * POST-only and stays as it is.
 */

/** The binding's interface, as the runtime exposes it. */
export type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type SearchEnv = {
  SEARCH_RATE_LIMITER?: RateLimiter;
};

/** Mirrors `simple.limit` / `simple.period` in wrangler.toml; the values are
 *  documentation here — the binding enforces them. */
export const RATE_LIMIT_BUDGET = 60;
export const RATE_LIMIT_PERIOD_SEC = 60;

/** Sent with a 429 so a client knows when the window has moved on. */
export const RETRY_AFTER_SEC = RATE_LIMIT_PERIOD_SEC;

/**
 * Whether this request fits the address's budget. Without the binding —
 * a build served outside the Worker, or a config that lost the table — the
 * page stays available: search is read-only and the binding is the guard,
 * so its absence is logged rather than turned into an outage.
 */
export async function withinBudget(env: SearchEnv, ip: string): Promise<boolean> {
  const limiter = env.SEARCH_RATE_LIMITER;
  if (!limiter) {
    console.warn('[search] SEARCH_RATE_LIMITER is not bound; the route runs without a budget');
    return true;
  }
  const { success } = await limiter.limit({ key: ip || 'unknown' });
  return success;
}

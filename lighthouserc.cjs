/**
 * Lighthouse CI budgets — one representative URL per page CLASS (template),
 * not per URL: home, the two listing grids (work, blog), a work discipline
 * view, the three content templates (case study, blog post, careers
 * position), team, the marketing pages, contact, the policies index, a
 * policy-prose page, and the 404. /policies/privacy stands in for the static
 * policy template (terms shares it); the grievance page and /search are
 * on-demand and not in the static dist, so they are gated by the worker e2e
 * project instead. ai-services, services, compliance,
 * and how-we-use-ai are gated individually because they are distinct
 * templates. Slugs are pinned to committed content so the URLs stay valid.
 *
 * A representative pins its TEMPLATE: a regression in shared markup, CSS,
 * scripts, fonts, or image handling shows on it. Content weight (how heavy one
 * post's or case's own images are) is bounded per asset by `pnpm images:check`
 * (≤2560px, ≤900 KB per raster), so the representatives need not be the
 * heaviest member of their class.
 *
 * Served from the static build (staticDistDir), so these numbers reflect the
 * shipped HTML/asset weight, not the dev server. `.cjs` (not `.json`) to carry
 * this rationale, and (not `.js`) because the package is type:module — LHCI
 * require()s its config, so it must be explicit CommonJS.
 *
 * Sharding. CI splits the URL list across parallel jobs: LIGHTHOUSE_SHARD=i/n
 * (1-based, as Playwright's --shard) keeps only shard i's URLs; unset, every
 * URL runs (local `pnpm dlx @lhci/cli autorun`). A URL never splits — all
 * numberOfRuns of it run in one shard, so its median and its assertion are
 * exactly what an unsharded run computes, and each shard asserts only its own
 * URLs. Shards are packed by measured cost, heaviest first onto the lightest
 * shard (ties to the earlier URL and the lower shard), so the assignment is
 * deterministic and a new URL needs no shard picked by hand. COST is relative
 * wall time per URL; unlisted URLs cost 1 (~12–17 s per run on CI).
 */
const COST = {
  // The WebGL globe's render loop keeps the main thread busy for as long as
  // Lighthouse waits: ~100 s per run on CI vs ~13 s for a typical page.
  'http://localhost/team/index.html': 8,
};

/** Deterministic cost-balanced split of `urls` into `total` shards. */
function partition(urls, total) {
  const shards = Array.from({ length: total }, () => ({ load: 0, urls: [] }));
  urls
    .map((url, order) => ({ url, order, cost: COST[url] ?? 1 }))
    .sort((a, b) => b.cost - a.cost || a.order - b.order)
    .forEach((item) => {
      const lightest = shards.reduce((min, s) => (s.load < min.load ? s : min));
      lightest.load += item.cost;
      lightest.urls.push(item);
    });
  return shards.map((s) => s.urls.sort((a, b) => a.order - b.order).map((i) => i.url));
}

/** This run's URLs: shard i of n per LIGHTHOUSE_SHARD, or all of them. */
function select(urls, spec) {
  if (!spec) return urls;
  const m = /^(\d+)\/(\d+)$/.exec(spec);
  const [index, total] = m ? [Number(m[1]), Number(m[2])] : [0, 0];
  if (!m || index < 1 || index > total || total > urls.length) {
    throw new Error(
      `LIGHTHOUSE_SHARD must be i/n with 1 <= i <= n <= ${urls.length}; got "${spec}"`,
    );
  }
  return partition(urls, total)[index - 1];
}

const URLS = [
  'http://localhost/index.html', // home
  'http://localhost/work/index.html', // work listing
  'http://localhost/work/discipline/data/index.html', // work discipline view
  'http://localhost/work/branding-an-oregonian-coworking-startup-in-a-growing-market/index.html', // case study
  'http://localhost/blog/index.html', // insights listing
  'http://localhost/blog/bad-data-ad-spend/index.html', // blog post
  'http://localhost/team/index.html', // team (WebGL globe)
  'http://localhost/services/index.html', // services
  'http://localhost/ai-services/index.html', // AI services
  'http://localhost/how-we-use-ai/index.html', // how we use AI
  'http://localhost/compliance/index.html', // compliance (evidence ledger + framework grid)
  'http://localhost/careers/index.html', // careers listing
  'http://localhost/careers/product-data-scientist/index.html', // position
  'http://localhost/contact/index.html', // contact (form + Turnstile)
  'http://localhost/policies/index.html', // policies index
  'http://localhost/policies/privacy/index.html', // policy prose (stands in for terms)
  'http://localhost/404.html', // not-found
];

module.exports = {
  // Not LHCI options (it reads only `ci`): exported for the shard guard,
  // apps/web/src/lib/lighthouse-shards.test.ts.
  URLS,
  partition,
  select,
  ci: {
    collect: {
      staticDistDir: 'apps/web/dist/client',
      numberOfRuns: 3,
      url: select(URLS, process.env.LIGHTHOUSE_SHARD),
    },
    assert: {
      // assertMatrix applies EVERY entry whose pattern matches a URL, so the
      // patterns below are mutually exclusive: the default excludes the three
      // special cases via negative lookahead; each gets its own entry. Each
      // entry is a complete assert-options object — LHCI rejects assertMatrix
      // next to any sibling option — so aggregationMethod is repeated per entry.
      //
      // Where a composite performance score can't be measured faithfully in
      // this environment (team, blog index — see those entries), the gate binds
      // the underlying user metrics (LCP/CLS) instead. Caps are set from
      // measured CI medians with 20–40% headroom: tight enough that a real
      // regression (a lost priority hint, an unoptimized asset, a new blocking
      // script) trips them, loose enough that runner variance does not.
      assertMatrix: [
        {
          // Every page class except the three exceptions below.
          matchingUrlPattern: '^(?!.*/team/)(?!.*/404\\.html)(?!.*/blog/index\\.html).*',
          aggregationMethod: 'median',
          assertions: {
            'categories:performance': ['error', { minScore: 0.95 }],
            'categories:accessibility': ['error', { minScore: 1 }],
            'categories:best-practices': ['warn', { minScore: 0.95 }],
            'categories:seo': ['error', { minScore: 1 }],
          },
        },
        {
          // Team carries the brand's WebGL globe (cobe). CI's headless runner
          // has no GPU, so WebGL falls back to software rasterization and the
          // render loop reads as one endless main-thread task — TBT ~168s and a
          // composite score in the 60s for a page that scores 93+ on real
          // hardware. The composite is therefore noise HERE; gate the metrics
          // this environment does measure faithfully (LCP, CLS) plus strict
          // a11y/SEO. Caps vs measured CI medians: LCP 2117 -> 3000,
          // CLS 0.030 -> 0.100 (the CWV "good" threshold).
          matchingUrlPattern: '.*/team/.*',
          aggregationMethod: 'median',
          assertions: {
            'largest-contentful-paint': ['error', { maxNumericValue: 3000 }],
            'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
            'categories:accessibility': ['error', { minScore: 1 }],
            'categories:best-practices': ['warn', { minScore: 0.95 }],
            'categories:seo': ['error', { minScore: 1 }],
          },
        },
        {
          // The blog index renders every post's cover; its LCP element is a
          // full-width photographic image on mobile, and Lighthouse's simulated
          // render delay for that paint (~2.3s regardless of image bytes — the
          // cover is preloaded and fully fetched by ~1s) pins the composite at
          // ~0.90 on CI. Rather than a flappy 0.90 gate on the composite, bind
          // the metric that actually moves when this page regresses: LCP,
          // capped at 4000ms vs a measured CI median of ~3300 with the cover
          // preload (losing the preload/priority hint alone costs ~1s and
          // trips it). Composite floor stays as a coarse disaster net.
          matchingUrlPattern: '.*/blog/index\\.html',
          aggregationMethod: 'median',
          assertions: {
            'categories:performance': ['error', { minScore: 0.85 }],
            'largest-contentful-paint': ['error', { maxNumericValue: 4000 }],
            'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
            'categories:accessibility': ['error', { minScore: 1 }],
            'categories:best-practices': ['warn', { minScore: 0.95 }],
            'categories:seo': ['error', { minScore: 1 }],
          },
        },
        {
          // The 404 is deliberately noindex/nofollow, so Lighthouse's SEO
          // is-crawlable audit fails by design and tanks the SEO score. Drop the
          // SEO gate here (it would assert against correct behavior); perf and
          // a11y still apply.
          matchingUrlPattern: '.*/404\\.html',
          aggregationMethod: 'median',
          assertions: {
            'categories:performance': ['error', { minScore: 0.95 }],
            'categories:accessibility': ['error', { minScore: 1 }],
            'categories:best-practices': ['warn', { minScore: 0.95 }],
            'categories:seo': 'off',
          },
        },
      ],
    },
    upload: { target: 'temporary-public-storage' },
  },
};

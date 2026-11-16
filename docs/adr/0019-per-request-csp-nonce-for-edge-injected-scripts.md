# 19. A per-request CSP nonce for the script Cloudflare injects at the edge

- **Status:** Accepted
- **Date:** 2026-09-06
- **Deciders:** Engineering, Security

## Context

[ADR 0015](0015-strict-csp-via-build-time-script-hashes.md) made the
Content-Security-Policy fully strict: every inline script and style the site
emits is SHA-256 hash-pinned at build, and `script-src` carries no
`'unsafe-*'` expression. That policy governs the document, and the document
is not entirely ours. The zone runs Cloudflare **Bot Fight Mode** (the Free
plan's bot product), under which **JavaScript Detections** is always on and
cannot be switched off: Cloudflare injects a small inline bootstrap into
every HTML response at the edge, which loads
`/cdn-cgi/challenge-platform/scripts/jsd/main.js` and issues the visitor a
`cf_clearance` cookie. That cookie is what lets real visitors pass the
`managed_challenge` WAF rules on the form endpoints without seeing a
challenge.

The bootstrap's body embeds the request's ray id and a timestamp, so its hash
differs on every response and can never be pinned. Under the strict policy
the browser blocks it — one `script-src` violation in every visitor's console,
and no JavaScript signal in Cloudflare's scoring of our traffic. The WAF rules
keep working on IP reputation alone, which is part of why a CI runner's
non-browser probes were answered with 403s ([ADR 0018](0018-dependency-update-policy.md)'s
smoke rework).

Cloudflare documents one supported mechanism: if the response's
`Content-Security-Policy` **header** carries a `'nonce-…'` source in
`script-src`, the edge parses it and stamps the nonce on the script it
injects. A nonce in a `<meta>` policy is not read, and `'unsafe-inline'` is
discouraged by Cloudflare as much as by us.

ADR 0015 rejected per-request nonces because they "need a server in the
request path" and would route every page through Worker code with
`HTMLRewriter` to stamp nonces into the markup. The need here is narrower:
the site's own scripts stay hash-pinned and the markup is untouched; only the
**header** needs a fresh value, for the one script we do not author.

## Decision

Every HTML response leaves the Worker with a per-request nonce appended to
`script-src`. The build-time hashes, the per-route-family rules, the `<meta>`
CSP in `404.html`, and every other directive are unchanged.

- **`apps/web/src/worker.ts` is the Worker entry** (`main` in
  `wrangler.toml`). It keeps the platform's serving order — assets first,
  then the app — but performs it itself: a GET/HEAD is offered to the assets
  binding with `redirect: 'manual'`, and whatever the asset layer decides is
  passed through verbatim (a page with its `_headers` policy, a `_redirects`
  301, the trailing-slash 307, a 304); only a 404 from the binding reaches
  the adapter's `handle`. The adapter's own asset fallback fetches with
  redirect-follow, which would turn a legacy 301 into a 200 at its target.
  Every response then passes through `applyScriptNonce`
  (`src/lib/csp-nonce.ts`): when it is HTML and carries a policy with a
  `script-src` directive, a copy is returned with
  `'nonce-<128 random bits, base64>'` inserted into that directive. Non-HTML
  responses, and HTML without a policy, are returned as the same object. The
  body stream is passed through unread.
- **HTML is routed through the Worker.** `run_worker_first` in the `assets`
  table (production and staging alike) sends every request to the Worker
  except the asset families that never carry a policy — `/_astro/*`,
  `/logos/*`, `/og/*`, and the image, font, script, style, and data
  extensions. For a static page the adapter's handler serves the file
  from the assets binding, so `_headers` still supplies the per-family policy
  the nonce is added to; on-demand routes keep their middleware-set policy
  ([ADR 0017](0017-stakeholder-grievance-intake.md) §2) and gain the nonce
  the same way. The site's markup is not rewritten.
- **The contract is enforced three ways.** Unit tests pin the pure
  functions (`csp-nonce.test.ts`: one nonce source, in `script-src` only,
  fresh per response, non-HTML untouched). The Playwright `worker` project
  drives the built Worker under `wrangler dev` and asserts the shape on a
  static page, a nested static route, the grievance page, and an asset, and
  that a legacy `_redirects` 301 and the trailing-slash 307 still pass
  through (`tests/e2e/csp-nonce.spec.ts`). The post-deploy smoke asserts on the live
  site that the header carries a nonce, that the edge-injected bootstrap runs
  under it, and that the page raises no `script-src` violation
  (`tests/e2e/production.spec.ts`). The same was verified on staging on
  2026-09-06, ahead of the merge, with this version promoted there: a browser
  holding no `cf_clearance` cookie received the bootstrap carrying the
  header's nonce, logged no violation, and was issued the cookie the
  detection script sets — so its next load was not injected at all. Bot Fight
  Mode skips the injection for a visitor who already holds `cf_clearance`,
  which is why a browser that has passed a managed challenge on the zone shows
  nothing either way.

## Consequences

- The strict-CSP claim stays true and gains its last missing piece: the one
  script we do not author now runs under the policy instead of being silently
  blocked, visitors' consoles are clean, and Cloudflare's bot scoring sees
  the JavaScript signal it expects from our traffic.
- The nonce is per response, unpredictable, and appears nowhere in the
  markup, so it grants nothing to markup injection: an attacker who can
  inject a `<script>` still does not know the value. `'strict-dynamic'` is
  still not used; the host allowlist keeps covering Turnstile and Cloudflare
  Insights.
- **HTML is no longer served as a pure static asset, and it does not
  matter.** Each HTML request costs one Worker invocation that fetches the
  page from the assets binding and rewrites one header — no `HTMLRewriter`,
  no body parsing. The page body still comes from the edge asset cache: the
  binding's response carries the asset layer's own `CF-Cache-Status: HIT`
  through to the visitor, with a fresh nonce beside it. Measured on
  2026-09-06 against two unpromoted staging preview versions built from the
  same commit, one asset-first and one Worker-first, interleaved, 30 samples
  per cell: medians within a few milliseconds of each other in both
  directions on `/`, `/work`, and `/contact`, and identical best-case TTFB
  (58–62 ms). The zone cache rule for HTML documents (`quarry-cache-rules`,
  5-minute TTL) was redundant with the asset cache before and stayed so — and
  in fact never applied at all: zone cache configuration has no effect on
  Worker responses, so that whole ruleset was retired on 2026-09-19 (ADR 0008).
  Assets under the negative patterns never touch the Worker and keep the asset
  layer’s own long-lived cache. This is the trade ADR 0015 declined for the whole
  document; for the header alone it has no measurable cost.
- `wrangler.toml` now sets `main`. The adapter honours a user-set entry
  (`main ?? '@astrojs/cloudflare/entrypoints/server'`); the wrapper imports
  the same `handle` the default entry uses, so adapter upgrades continue to
  flow through unchanged. The `run_worker_first` list is capped at 100
  entries by Cloudflare; a new non-HTML asset family needs a negative entry
  or it merely costs a Worker invocation.
- **The post-deploy smoke is now a bot in Cloudflare's eyes.** The first
  production deploy of this decision (2026-09-06) rolled back: the nonce
  assertions passed, but with the detection script finally executing in the
  smoke's headless Chromium, Bot Fight Mode classified the session as
  automated and answered its second navigation with a managed-challenge
  interstitial (403). A first visit in a fresh session passes, so the smoke
  probes each backbone route as its own test with its own context; every
  other smoke test already loads a single page. The Free plan cannot exempt
  the smoke — Bot Fight Mode ignores WAF skip rules, and GitHub-hosted runners
  have no stable egress for an IP Access Rule — so this holds only while the
  verdict is per session. If Cloudflare ever correlates it by IP, the proper
  exemption is a Super Bot Fight Mode skip rule keyed on a smoke header.
- The 404 copies served at unmatched paths are governed by the `<meta>` CSP
  the injector writes into `404.html`, which the edge does not read; those
  responses keep today's behaviour (the bootstrap is blocked there). They are
  not visitor pages.

## Alternatives considered

- **Turn Bot Fight Mode off.** Stops the injection with no code change, but
  forfeits the automatic blocking and the `cf_clearance` path that spares
  real submitters a challenge. Kept as the fallback if the Worker path ever
  has to be withdrawn.
- **Super Bot Fight Mode (Pro plan) with JavaScript Detections disabled.**
  Removes the injection while keeping bot verdicts, at a subscription and
  without the JavaScript signal. Answers a different question.
- **A Cloudflare Transform Rule rewriting the header at the edge**
  (`http_response_headers_transform` with `uuidv4(cf.random_seed)`). The
  attractive option: HTML would stay on the asset path with its CDN cache
  hit, and the rule would live in Terraform. Tested on the live zone on
  2026-09-06 with two temporary rules and then removed. The value expression
  can read the response's own policy and the nonce is fresh on every cached
  hit — but the bot injection stamps nothing: the edge reads the policy as
  the Worker or asset layer returned it, before transform rules run, so a
  nonce added there is never seen by the script it is meant to cover. Two
  further constraints on the Free plan: `regex_replace` needs Business, and
  `uuidv4` may be called once per expression, so the only nonce shape
  available is a hyphenated UUID or a 48-bit slice of one. Rejected on the
  ordering alone; the same test shows a CDN-cached HTML response and a
  per-request nonce cannot coexist, because the injection would reuse the
  cached header's nonce for every hit.
- **`'unsafe-hashes'`, a constant nonce in `_headers`, or `'unsafe-inline'`.**
  A constant nonce is public in every response, so it is `'unsafe-inline'`
  with extra steps; the others are the expressions ADR 0015 exists to
  exclude. Rejected.
- **`HTMLRewriter` nonces on our own scripts too (drop the hashes).** The
  full strict-CSP-by-nonce model. It rewrites every document on every request
  for no gain over hashes on a static site, and it is exactly the cost ADR
  0015 rejected. Not needed: hashes and a nonce coexist in `script-src`.

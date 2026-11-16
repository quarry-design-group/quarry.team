# 13. Pre-cutover staging environment and per-PR preview deployments

- **Status:** Accepted
- **Date:** 2026-06-09
- **Deciders:** Engineering, Platform
- **Relates to:** [ADR-0014](0014-forms-and-data-tier-on-cloudflare-d1.md) (D1 data tier), [ADR-0006](0006-hosting-cloudflare-edge.md) (Cloudflare hosting), [ADR-0009](0009-ci-cd-github-actions.md) (CI/CD)

## Context

The original go-live plan was a big-bang cutover: nothing deployed anywhere
until launch day, when the Worker would be published and apex/www DNS flipped
in one step. That concentrates all deployment risk — first-ever production
deploy, first real form submission, first edge-rule contact — into the launch
window.

The `quarry.team` zone already lives on Cloudflare (Terraform looks it up;
apex/www at the time pointed at the legacy host). Workers supports multiple
environments per config, custom-domain routes on any zone hostname, and
**version preview URLs** (`wrangler versions upload` publishes a version
without promoting traffic, served at an ephemeral hash-prefixed URL). All the
pieces for a pre-cutover soak exist — only the apex/www routes actually need
to wait for launch.

## Decision

1. **A `staging` Worker environment** (`[env.staging]` in `wrangler.toml`)
   deploys as `quarry-web-staging` on **`staging.quarry.team`** with its own
   D1 database (`marketing-site-form-submissions-staging`), so test
   submissions never touch production data. Every push to `main` that
   touches the site deploys staging once the repo variable
   `STAGING_DEPLOY_ENABLED=true` is set — independent of (and well before) the
   production `DEPLOY_ENABLED` gate.
2. **Per-PR previews** upload a Worker _version_ of the staging environment
   (`wrangler versions upload`; `preview_urls = true`) and post the ephemeral
   preview URL as a sticky PR comment. No traffic promotion, no routes.
3. **Environment selection happens at build time.** The `@astrojs/cloudflare`
   adapter resolves `wrangler.toml` for the environment named by
   `CLOUDFLARE_ENV` and emits the deployable config to
   `dist/server/wrangler.json`; all wrangler commands target that emitted
   file. The source `apps/web/wrangler.toml` carries `main = "src/worker.ts"`
   and an `[assets]` table of serving options; the emitted file is the
   deployable one because it carries `assets.directory` (the built
   `dist/client`) and the resolved environment.
4. **Staging is noindexed at the edge** — a zone response-header-transform
   rule (Terraform-owned) sets `X-Robots-Tag: noindex, nofollow` for
   `http.host eq staging.quarry.team`. Builds differ by `SITE_URL` and
   `CLOUDFLARE_ENV`; because indexing control is edge-owned, no environment
   needs a special build or a robots meta tag for it. PR previews on
   `workers.dev` never pass through the zone; Cloudflare stamps
   `X-Robots-Tag: noindex` on every `workers.dev` preview response at its
   edge, and the Worker entry (`apps/web/src/worker.ts`) sets
   `noindex, nofollow` on every response to a `*.workers.dev` host, so the
   posture does not rest on the platform header.
5. **The D1 store is named `marketing-site-form-submissions`**
   (staging: `…-staging`), table `form_submissions` — named for what it
   holds, not the marketing concept around it.

> **Amendment (2026-06-09): staging behind Cloudflare Access.** The whole
> `staging.quarry.team` host sits behind a Cloudflare Access self-hosted
> application with the `quarry-staging-team` allow policy (both
> Terraform-owned). An unauthenticated request gets the Access login, a
> one-time passcode sent to an `@quarry.team` address; pages and the
> same-origin `/api/*` routes are both gated. PR previews on `workers.dev` sit
> outside that policy (see Consequences).

## Consequences

**Positive**

- The DNS cutover stopped being a launch event: by launch day the same Worker,
  D1 schema, WAF/rate-limit rules, Turnstile, and email dispatch had been serving
  staging traffic; go-live consisted of enabling the apex/www routes
  (`DEPLOY_ENABLED=true` → `wrangler deploy`) and retiring the legacy host.
- Rollback paths shrink: `wrangler rollback` (versions) or re-pointing two
  DNS records.
- Reviewers get a clickable preview per PR instead of building locally, and
  preview versions are free.

**Negative / costs**

- A second (tiny) D1 database. Turnstile's widget must list the staging hostname
  (Terraform).
- Preview URLs live on `workers.dev`. The URL is posted in the PR's sticky
  comment, and a preview serves staging data only. Previews sit outside the
  zone's WAF, rate limits, Cloudflare Access and the staging noindex rule, and
  are noindexed at the edge and the Worker (Decision 4). The unguessable hash-prefixed
  hostname is their guard, and a preview stays reachable for as long as
  Cloudflare retains its version. The staging
  hostname is the parity target.

## Alternatives considered

- **Big-bang cutover.** Nothing deployed until launch day, then the Worker
  published and apex/www flipped in one step. Concentrates the first
  production deploy, the first real submission and the first edge-rule contact
  into the launch window. Rejected.
- **Cloudflare Pages previews.** A second hosting product with its own build
  and configuration; a Pages preview exercises a different runtime
  configuration from the Worker that ships. Rejected: previews upload versions
  of the production Worker's own staging environment.
- **A second zone for staging.** Isolates staging DNS and edge rules, at the
  cost of a duplicated WAF, rate-limit and Turnstile configuration that can
  drift from the production zone's. Rejected: a hostname on the production
  zone inherits the same rules.

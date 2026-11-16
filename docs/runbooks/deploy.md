# Runbook: Deploy

How a deploy works end to end, and how to roll back. Architecture: [ADR 0009 (CI/CD)](../adr/0009-ci-cd-github-actions.md), [ADR 0008 (IaC)](../adr/0008-infrastructure-as-code-terraform.md), [ADR 0006 (Cloudflare)](../adr/0006-hosting-cloudflare-edge.md), [ADR 0014 (data tier)](../adr/0014-forms-and-data-tier-on-cloudflare-d1.md), [ADR 0013 (staging + previews)](../adr/0013-pre-cutover-staging-and-pr-previews.md).

## Environments

One Worker codebase, two environments + ephemeral previews ([ADR 0013](../adr/0013-pre-cutover-staging-and-pr-previews.md)):

| Environment    | Host                                                                                  | Gate (repo variable)          | Data tier                                                                  |
| -------------- | ------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| **staging**    | `staging.quarry.team` (noindex, behind Cloudflare Access — `@quarry.team` OTP)        | `STAGING_DEPLOY_ENABLED=true` | D1 `marketing-site-form-submissions-staging`; staging Notion grievance log |
| **production** | `quarry.team` / `www`                                                                 | `DEPLOY_ENABLED=true`         | D1 `marketing-site-form-submissions`; production Notion grievance log      |
| PR previews    | ephemeral `*.workers.dev` URL (noindexed at the edge and by the Worker entry; public) | follows the staging gate      | staging's (versions upload — no deploy, no traffic promotion)              |

The environment is selected at **build time**: the `@astrojs/cloudflare` adapter reads
`apps/web/wrangler.toml` for the environment named by `CLOUDFLARE_ENV` (unset = production,
`staging` = `[env.staging]`) and emits the fully-resolved deployable config to
`dist/server/wrangler.json`. **Every wrangler command that ships or migrates a build targets the
emitted config** (`-c dist/server/wrangler.json`): it carries the `assets.directory` the adapter
injects, `main` resolved to the built Worker, and the selected environment resolved to top level.
The source toml names the entry (`main = "src/worker.ts"`) and pins the `[assets]` serving options
only; `wrangler rollback` reads it directly (see [Rollback](#rollback)).

PR previews are reachable by anyone who has the URL while the PR is open (the URL is posted in the
PR's comment). They serve staging data and are noindexed twice over: Cloudflare marks every
`workers.dev` preview response `X-Robots-Tag: noindex` at its edge (the value a `curl -sI` shows),
and the Worker entry (`apps/web/src/worker.ts`) sets `noindex, nofollow` on every response to a
`*.workers.dev` host, so the posture does not rest on the platform header. They sit outside the
zone's WAF, rate limits and the staging Access policy, which apply only to traffic through the
`quarry.team` zone.

## Principle: two independent tracks

Infrastructure and the application ship on **separate, independently triggered** tracks. `wrangler deploy` ships the Worker on push to `main`; Terraform owns the durable Cloudflare config plane (zone, D1, R2, Turnstile, WAF/rate-limit — **not** cache: zone cache configuration has no effect on Worker responses, so cache headers live in `apps/web/public/_headers`, see ADR-0008) and is reconciled on its own cadence: `terraform plan` on infra PRs for review, a weekly drift check, and a **deliberate, gated manual `apply`**. Keeping `apply` off the push path is intentional — an auto-applied plan could destroy stateful resources (a D1 database, an R2 bucket), so an infra change is applied by a human who has read the plan, not on every merge. Nothing is deployed by hand to dashboards on an ongoing basis — the one standing exception is enabling **Cloudflare Web Analytics** for the zone, a one-time dashboard action (carried over from the legacy site; the edge injects the beacon automatically, so it is not Terraform-managed and has no in-repo snippet — see `infra/README.md`). A from-zero rebuild must enable it once.

## End-to-end flow

1. **Open a PR.** CI runs the validate suite: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (Vitest), `pnpm test:e2e` (Playwright), axe a11y, Lighthouse CI budgets, the token-freshness check, and `terraform plan` for any changed environment. All required checks must pass. The site is built once, in **Lint · Typecheck · Build · Test**; Playwright and Lighthouse then run as parallel shard jobs against that build's `web-dist` artifact, and each suite reports through one gate job under its required name ([ADR 0009, amendment](../adr/0009-ci-cd-github-actions.md#amendment-2026-11-14-e2e-and-lighthouse-run-sharded-against-one-build)). A red suite names its failing shard: Lighthouse prints its assertion failures in that shard's log, and E2E's merged report is the gate's `playwright-report` artifact.
2. **Review the preview.** The `Preview Web (PR)` workflow uploads a Worker **version** of the staging environment (`wrangler versions upload`) and posts its ephemeral preview URL as a sticky PR comment. Reviewers inspect the actual deployed result against staging's D1.
3. **Merge to `main`.** On push to `main`, the **Deploy Web** workflow (`.github/workflows/deploy-web.yml`) ships the site — there is no Terraform step in this path:
   - `pnpm build` (builds `@quarry/ui` tokens then `@quarry/web`), then `wrangler deploy -c dist/server/wrangler.json` ships the Worker and its static assets after applying any pending D1 migrations (`apps/web/migrations/`). **Staging deploys on every push to `main` that touches the site** — the Deploy Web `paths` filter: `apps/web/`, `packages/ui/`, the lockfile, and the workflow and post-deploy smoke files it names (read the `paths` block, not a copy of it) — once `STAGING_DEPLOY_ENABLED=true`; the **production** job runs the same steps behind its own `DEPLOY_ENABLED` gate, and only from `main` (the `production` environment's deployment branch policy enforces the same rule).
     - Each deploy delivers the Worker's runtime secrets from its GitHub environment (`staging` or `production`): the `worker-secrets` map in the workflow names each `WORKER_*` secret, `.github/scripts/worker-secrets.mjs` writes them to a file, and `wrangler deploy --secrets-file` attaches them to the new version under the same names the code reads. No other secret reaches that step. A secret the environment does not hold keeps its current value ([infra README → Worker runtime secrets](../../infra/README.md#worker-runtime-secrets)).
     - The `@quarry/web` `postbuild` step runs `scripts/inject-csp-hashes.mjs`, which pins the SHA-256 hashes of every inline script **and style** the site emits into `script-src`/`style-src` of `dist/client/_headers` (replacing the `__CSP_SCRIPT_HASHES__`/`__CSP_STYLE_HASHES__` tokens in `public/_headers`) so the shipped CSP is strict — no `'unsafe-*'` anywhere ([ADR 0015](../adr/0015-strict-csp-via-build-time-script-hashes.md)). It **fails the build** if a token is missing or no inline scripts/styles are found, and the e2e suite (`tests/e2e/csp.spec.ts`) loads every backbone route under the built policy and fails on any violation. Edit the CSP in `public/_headers`, never the built copy. At serve time the Worker entry (`src/worker.ts`) adds a per-request `'nonce-…'` to `script-src` of every HTML response so the bot-detection script Cloudflare injects at the edge runs under the policy ([ADR 0019](../adr/0019-per-request-csp-nonce-for-edge-injected-scripts.md)); the nonce is never in `_headers`.
   - **The deploy runs on the push itself, independent of CI's result on that commit.** A deploy triggered by the merge does not wait for the `CI` workflow on `main`, which keeps the `paths` filter (a `workflow_run` trigger carries none). Correctness rests on two controls: branch protection makes the CI checks required before merge (the checks named in [bootstrap §0](bootstrap.md#0-prerequisites)), so the merged commit is the commit those checks passed on; and the production job's post-deploy smoke rolls the Worker back on failure (below).
   - **Infrastructure is a separate track**, not triggered by the merge. `terraform apply` runs only by gated manual dispatch (`.github/workflows/infra.yml` → `workflow_dispatch` → `apply`), with `terraform plan` on infra PRs (the required **Terraform plan** check; strict for Dependabot provider bumps, which must plan `No changes` to merge on their own) and a weekly drift check. State is in Cloudflare R2 (S3-compatible). Reconcile infra deliberately — ahead of a deploy that depends on new resources — rather than on every push.
4. **Post-deploy verification** (see checklist).

**Staging from a branch.** A manual run of Deploy Web (`workflow_dispatch`, `target: staging`, the default) builds the branch it runs on and deploys it to `staging.quarry.team`, D1 migrations included, with the staging environment's secrets — the way to exercise a change against the real staging Worker and database before it merges. Staging serves that branch until the next push to `main` deploys over it. `target: staging-and-production` runs both jobs and is honoured only on `main`.

## Docs site (`docs.quarry.team`)

The Starlight docs app (`apps/docs`) deploys separately from the marketing site, via the **`Deploy Docs`** workflow (`.github/workflows/deploy-docs.yml`):

- **The site is a generated mirror of `docs/`.** `apps/docs/scripts/sync-docs.mjs` projects the canonical Markdown under `docs/` (ADRs, BRD, guides, runbooks) into `apps/docs/src/content/docs/**`, rewriting cross-doc links to site routes and everything else to GitHub URLs. It runs as `prebuild`/`predev`, so any build reflects the current `docs/`. **Never hand-edit the generated sections** — edit `docs/`, run `pnpm --filter @quarry/docs sync`, and commit. CI (`ci.yml`) regenerates and **fails on drift**, so the mirror can't fall out of step with the source, and then **builds the docs app** (`pnpm --filter @quarry/docs build`) in the same job, so a change that breaks the Starlight build (a lockfile bump included) fails CI before it can reach `main` and the push-triggered docs deploy.
- It is a **pure-static, assets-only Worker** named `quarry-docs` (`apps/docs/wrangler.toml`): no `main`, no D1/KV, no secrets, no build-time env — just `astro build` output served on `docs.quarry.team`. Cloudflare creates the custom-domain DNS record on deploy, so **there is no Terraform record** for the docs host (same pattern as apex/www).
- **What the Worker serves beyond the pages:** an unknown path gets Starlight's `404.html` with a 404 status (`not_found_handling = "404-page"`); `apps/docs/public/` supplies the favicon and a `_headers` file whose security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security`, and a CSP) apply to every response.
- **The docs CSP is weaker than the marketing site's.** Starlight and Pagefind ship inline scripts and styles that change with every release, so the docs policy allows `'unsafe-inline'` in `script-src` and `style-src` alongside `'self'`, and Pagefind search compiles WebAssembly in a same-origin worker, so `script-src` also carries `'wasm-unsafe-eval'`; the marketing site pins build-time hashes and allows neither ([ADR 0015](../adr/0015-strict-csp-via-build-time-script-hashes.md)). Everything else is locked down: `default-src 'self'`, no framing, no plugins, no third-party origins. The docs site has no forms, no server code and no data store; the policy is a defense-in-depth layer over static documentation.
- The job triggers on pushes to `main` touching `apps/docs/**` **or `docs/**`** (an edit to the canonical docs must redeploy the mirror) and is gated on the repo variable **`DOCS_DEPLOY_ENABLED=true`** (unset until the first deliberate go-live). It needs the same `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets and a `docs` environment.
- **PR previews:** `Preview Docs (PR)` (`.github/workflows/preview-docs.yml`) uploads a Worker _version_ of the docs site (`wrangler versions upload`, `preview_urls = true`) on PRs touching `apps/docs/**` or `docs/**` and posts its ephemeral URL as a sticky comment under a marker (`quarry-docs-preview-url`) distinct from the web preview's — so the two never collide. Same gate/guards as the web preview (`DOCS_DEPLOY_ENABLED`, same-repo human PRs only).
- Manual deploy: `pnpm deploy:docs` (builds then `wrangler deploy` from `apps/docs`).
- First-time go-live: set `DOCS_DEPLOY_ENABLED=true`, ensure the Cloudflare token may create the `docs.quarry.team` custom domain, then run the workflow (`workflow_dispatch`) or push a docs change.
- Rollback: `wrangler rollback` in `apps/docs`, or revert the commit and let the workflow redeploy.

## Pre-deploy checklist

- [ ] Validate suite green on the PR (types, lint, format, unit, e2e, axe, Lighthouse, token freshness).
- [ ] `terraform plan` reviewed — no unexpected resource destruction.
- [ ] Content frontmatter valid (build would fail otherwise); no unintended `draft: true`/`false` flips.
- [ ] Secrets present in GitHub; none added to the repo. The Worker's runtime secrets are in the `staging` and `production` environments (the deploy ships them; [infra README → Worker runtime secrets](../../infra/README.md#worker-runtime-secrets)). For the grievance intake ([ADR 0017](../adr/0017-stakeholder-grievance-intake.md)): `PUBLIC_TURNSTILE_GRIEVANCES_SITE_KEY` (Actions), and in both environments `WORKER_TURNSTILE_GRIEVANCES_SECRET` (published by the Infra apply), `WORKER_GRIEVANCE_SIGNING_KEY`, `WORKER_NOTION_TOKEN`, `WORKER_GRIEVANCE_NOTIFY_BACKUP_TO` (the backup's own inbox; the only recipient for concerns that involve the owner), optional `WORKER_GRIEVANCE_NOTIFY_TO`; the Notion ids filled in `apps/web/wrangler.toml` `[vars]`. Production builds run strict: a missing signing key serves the form as a 503, a missing Turnstile secret quarantines every submission.
- [ ] Contact and careers secrets in both environments: `WORKER_TURNSTILE_SECRET` (published by the Infra apply) — a deployed build without it answers every contact and careers POST with a 503 and logs `[form-submissions] WORKER_TURNSTILE_SECRET is not set; refusing submissions`, so the post-deploy smoke's bare POST fails and the deploy rolls back; and `WORKER_FORM_SUBMISSIONS_IP_HASH_KEY` (any long random string, distinct from `WORKER_GRIEVANCE_SIGNING_KEY`) — without it each row keeps the address prefix only and the Worker logs `[form-submissions] WORKER_FORM_SUBMISSIONS_IP_HASH_KEY is not set`.
- [ ] Infra applied ahead of a deploy that needs new resources (the invisible Turnstile widget, the rate-limit rule covering `/policies/grievances`).
- [ ] Redirect map for `/cases/* → /work/*` current ([ADR 0011](../adr/0011-seo-url-strategy-and-redirects.md)).

## Post-deploy verification

- [ ] Production loads; home, a `/work/<slug>`, and a `/blog/<slug>` render correctly.
- [ ] A sample legacy `/cases/<slug>` returns **301** to `/work/<slug>`.
- [ ] Contact and careers forms submit end to end (Turnstile passes, record persists).
- [ ] `curl -si -X POST https://quarry.team/api/contact` answers a JSON **400** carrying `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` (the smoke asserts both). A **503** with `{"ok":false,"error":"unavailable"}` means `WORKER_TURNSTILE_SECRET` is missing on that Worker, or Turnstile's verifier is unreachable; the Worker log says which.
- [ ] The retention cron is registered: the deploy registers the daily 03:17 UTC trigger from `apps/web/wrangler.toml` `[triggers]`; confirm it under Workers → `quarry-web` → Settings → Triggers, and after the first run find a `[retention] purged {…}` line in the Worker logs ([data retention → The daily job](data-retention.md#the-daily-job)).
- [ ] Grievance form end to end: `/policies/grievances` renders (200, not 503 — a 503 means `WORKER_GRIEVANCE_SIGNING_KEY` is missing on that Worker; `Cache-Control: no-store`); a test submission 303s to `/received?ref=GRV-…`, the row lands in D1 (`wrangler d1 execute … "SELECT ref, outcome FROM grievances ORDER BY id DESC LIMIT 1"`), the page appears in the Notion log, and the acknowledgment arrives when a contact was given. Then mark the test row `Withdrawn` in the log.
- [ ] `curl -sI https://quarry.team/policies/grievances | grep -i content-security-policy` shows a hash-pinned policy with no `unsafe-` — the Worker-set headers, not `_headers`.
- [ ] `/privacy` and `/terms` return **301** to `/policies/privacy` and `/policies/terms`.
- [ ] `curl -sI https://quarry.team | grep -i content-security-policy` shows hash-pinned `script-src` and `style-src` and **no `unsafe-` anywhere in the policy** (strict CSP intact; [ADR 0015](../adr/0015-strict-csp-via-build-time-script-hashes.md)), plus a `'nonce-…'` source in `script-src` that differs between two requests ([ADR 0019](../adr/0019-per-request-csp-nonce-for-edge-injected-scripts.md)). In a browser, the console on `/` shows no `script-src` violation for `/cdn-cgi/challenge-platform/` — the smoke asserts the same.
- [ ] The contact page's "Book a 30-min meet & greet" dialog opens and the Calendly booking page loads inside it (the iframe is our only Calendly surface; their widget JS must stay gone).
- [ ] `sitemap-index.xml`, `robots.txt`, `llms.txt` resolve.
- [ ] Cloudflare Web Analytics receiving data — assumes the one-time zone enablement (see the two-tracks principle); on a fresh account, enable Web Analytics for `quarry.team` in the dashboard first. No console errors (other than the intentional easter egg).
- [ ] Lighthouse spot-check within budget.

## Post-deploy verification and automatic rollback

Every production deploy verifies itself ([ADR 0018](../adr/0018-dependency-update-policy.md)). The `Deploy production` job records the live Worker version before deploying, deploys, then runs `tests/e2e/production.spec.ts` against `https://quarry.team` (every backbone route, `sitemap-index.xml` / `robots.txt` / `llms.txt` / `service-worker.js`, the strict-CSP header, a rejected-not-errored POST to `/api/contact`, axe on the home page). If the smoke fails:

1. `wrangler rollback <recorded version>` restores the previous Worker (assets and code together); the smoke re-runs against the restored site.
2. An issue labelled `incident` is opened with the run link and whether the rollback succeeded.
3. The Playwright report is attached to the run as `production-smoke-report`.

A failed smoke is a stop-the-line event even though the rollback already happened: fix forward on a branch and let the workflow redeploy. On the very first deploy there is no prior version, so the job can only open the issue.

## Rollback

The Worker and its data tier roll back independently.

**Site (Cloudflare Worker + assets):**

- Roll back to the previous Worker version — from `apps/web/`, run `wrangler rollback` for **production** (`quarry-web`) or `wrangler rollback --env staging` for **staging** (`quarry-web-staging`). Rollback reads the Worker name from the source `wrangler.toml` and needs no build, so — unlike `deploy` — it does **not** take `-c dist/server/wrangler.json`; the `--env` flag alone selects the target (omitting it acts on production). The deploy workflow does this automatically when its post-deploy smoke fails (above). Or promote a prior deployment from the Cloudflare dashboard, or
- Revert the offending commit and let the pipeline redeploy the prior build via `wrangler deploy`.

**Infrastructure (Terraform):**

- Revert the infrastructure change and `terraform apply` to reconcile back to the prior known-good state (single Cloudflare provider). Inspect `plan` carefully for destructive changes before applying.

**Database (Cloudflare D1):**

- Schema issues are handled by rolling forward a corrective migration; data issues are recovered via D1 Time Travel (point-in-time restore). Treat data-tier rollback as an incident; the restore sequence is in [incident response → Restoring D1 data (Time Travel)](incident-response.md#restoring-d1-data-time-travel).

## Rollback decision guide

| Symptom                                      | First action                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Bad content/markup, site up                  | Roll back the Worker (`wrangler rollback` from `apps/web/`; add `--env staging` for staging)                                         |
| Form submissions failing                     | Roll back the Worker; check Turnstile/secrets                                                                                        |
| Grievance form 400s/429s for real visitors   | Check `grievance_events` reasons; verify `WORKER_GRIEVANCE_SIGNING_KEY` is set on the Worker; relax the throttle only by code change |
| Infra misconfiguration (DNS, WAF, redirects) | Revert infra change, `terraform apply`                                                                                               |
| Data corruption / bad migration              | Invoke incident response; corrective migration / D1 Time Travel                                                                      |
| `[retention]` error in the Worker logs       | Run the purge by hand per [data retention → The daily job](data-retention.md#the-daily-job); the next day's run retries on its own   |

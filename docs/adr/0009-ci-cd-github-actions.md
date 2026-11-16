# 9. CI/CD with GitHub Actions

- **Status:** Accepted; amended 2026-11-14 (E2E and Lighthouse sharded behind gate checks, see [Amendment](#amendment-2026-11-14-e2e-and-lighthouse-run-sharded-against-one-build))
- **Date:** 2026-06-06
- **Deciders:** Engineering, Platform

## Context

The repo is a pnpm monorepo on GitHub (`quarry-design-group/quarry.team`). Deploying the site depends on Cloudflare infrastructure (single provider, [ADR 0008](0008-infrastructure-as-code-terraform.md)) being provisioned and current, but that infrastructure changes rarely and holds stateful resources — a D1 form_submissions database, R2 buckets — that an unreviewed apply must never destroy. We need quality gates that protect the craft bar (types, lint, tests, a11y, performance budgets), per-PR previews so reviewers see real output, fast application deploys on merge, and infrastructure changes that are reviewed and applied deliberately rather than on every push.

## Decision

CI/CD runs on **GitHub Actions** as two intentionally decoupled tracks: application deploys on push to `main`, and infrastructure reconciled through a reviewed, manually gated Terraform workflow.

### Pipeline shape

1. **Validate (every PR).** Install with pnpm (frozen lockfile, cached store), then run:
   - `pnpm typecheck` (TypeScript strict + `astro check`)
   - `pnpm lint`, `pnpm format:check`
   - `pnpm test` (Vitest unit) and `pnpm test:e2e` (Playwright) — [ADR 0012](0012-testing-strategy.md)
   - axe accessibility checks and **Lighthouse CI** against the performance/a11y budgets
   - **token freshness:** rebuild tokens and fail if `tokens.css` is stale ([ADR 0003](0003-design-tokens-single-source-of-truth.md))
   - **the docs-site build** (`pnpm --filter @quarry/docs build`), after the docs-mirror drift check, so a change that breaks the Starlight build — a lockfile bump included — fails before merge and before the push-triggered docs deploy
   - **`terraform plan`** on PRs that touch `infra/` (no apply on PRs)
2. **Preview deploy (PRs that touch the site or the docs).** The preview workflows are path-filtered. Each builds its app in Actions and uploads a **Worker version**; the version's preview URL is posted in a sticky PR comment so reviewers inspect the actual deployed result.
3. **Deploy application (push to `main`).** A push to `main` that touches the site runs the Deploy Web workflow, which is path-filtered (`apps/web`, `packages/ui`, the lockfile, the workflow itself and the post-deploy smoke): `pnpm build`, then `wrangler deploy` ships the Astro site as a single Cloudflare Worker (static assets + the same-origin `/api/contact` and `/api/careers` routes) and applies any pending D1 migrations. Staging deploys on every push that touches the site, behind `STAGING_DEPLOY_ENABLED`; production runs the same job behind `DEPLOY_ENABLED`. Each deploy ships the Worker's runtime secrets from its GitHub environment with the new version. A manual run deploys any branch to staging (`target: staging`), so a change can be exercised on the staging Worker and database before it merges.
4. **Reconcile infrastructure (manual, out of band).** `terraform apply` runs only by gated manual `workflow_dispatch` — never on push — backed by `terraform plan` on infra PRs and a weekly scheduled drift check. Infrastructure is reconciled deliberately, ahead of any deploy that depends on new resources.

### Gating

- Required status checks (validate suite + budgets, named in the [bootstrap runbook](../runbooks/bootstrap.md)) must pass before merge.
- Deploys trigger on the push to `main` itself and run independently of that commit's CI run. Their correctness rests on branch protection requiring the CI checks before the merge, and on the post-deploy smoke with automatic rollback ([ADR 0018](0018-dependency-update-policy.md)).
- Production deploys run only from `main`, behind `DEPLOY_ENABLED`, and the `production` environment's deployment branch policy admits only `main`. Staging deploys on every push to `main` that touches the site, behind `STAGING_DEPLOY_ENABLED`, and from any branch by manual run. `terraform apply` runs only by manual `workflow_dispatch` from `main`, never automatically — an unreviewed auto-apply could destroy stateful infrastructure.
- Secrets/credentials come from GitHub Actions encrypted secrets — repository secrets for CI, environment secrets for the Worker's runtime — never the repo ([ADR 0008](0008-infrastructure-as-code-terraform.md), `SECURITY.md`).

## Consequences

**Positive**

- Application and infrastructure changes are each auditable in CI, and their separation keeps a routine app deploy from ever triggering an unreviewed infrastructure change.
- Every PR that touches the site or the docs gets a real preview URL; every PR must clear the full quality bar.
- Performance, a11y, and token-freshness regressions are caught before merge, not after.

**Negative / costs**

- Splitting deploys across a push-triggered app track and a manually gated infrastructure track means the two must be sequenced by hand when a deploy depends on new infrastructure.
- Full gates add minutes to CI (mitigated by caching, and by sharding the two long suites against one build — see the amendment).
- Preview deploys consume Cloudflare preview capacity.

## Alternatives considered

- **Provider-native CI (Cloudflare Workers Git integration / Wrangler auto-deploy) only.** Convenient, but can't enforce our full unified quality gates or a reviewed Terraform workflow. Rejected as the orchestrator. Previews are built in Actions and served as Worker version preview URLs.
- **GitLab CI / CircleCI / Jenkins.** Capable, but the repo is on GitHub and Actions is the lowest-friction, best-integrated choice. Rejected.
- **Manual deploys.** Unauditable and error-prone; defeats the purpose. Rejected.

## Amendment (2026-11-14): E2E and Lighthouse run sharded against one build

**Context.** A CI run took about 19 minutes, and Lighthouse set that time: 17 URLs at three runs each ran one after another in one job for about 16 minutes, about 5 of them on `/team/`, whose WebGL globe keeps the main thread busy for about 100 seconds per run on a GPU-less runner. E2E ran its 166 tests in about 3 minutes on one Playwright worker. Each of the two jobs also rebuilt the site, about a minute each, although **Lint · Typecheck · Build · Test** had already built it and uploaded it as `web-dist`. Branch protection requires PRs to be up to date with `main` ([ADR 0018](0018-dependency-update-policy.md)), so CI time is paid again for every PR behind each merge.

**Decision.**

- **One build.** The E2E and Lighthouse jobs download `web-dist` from **Lint · Typecheck · Build · Test** instead of rebuilding, so every suite tests the exact output the build job checked (`check-asset-refs`, the CSP hash injection). The upload includes hidden files: `dist/client` carries `.assetsignore` and `.well-known/security.txt`, which `actions/upload-artifact` drops by default.
- **Sharded suites.** Lighthouse runs as a three-job matrix. `lighthouserc.cjs` reads `LIGHTHOUSE_SHARD=i/n` and keeps shard _i_'s URLs, packing them by measured cost: heaviest first onto the lightest shard, with `/team/` costed at eight typical pages, so it runs alone. A URL never splits, so all of its runs, its median and its `assertMatrix` entry stay in one shard, and the assertions are exactly those of an unsharded run (LHCI asserts per URL, and an entry that matches no URL in a shard yields no result). E2E runs as a two-job matrix with Playwright's `--shard` and the blob reporter.
- **Gate jobs keep the required names.** **E2E (Playwright)** and **Lighthouse CI (CWV budgets)** are now gate jobs that need their shards, always run, and pass only if every shard succeeded. A shard that was skipped because the build job failed, or cancelled, fails its gate; a gate that skipped itself would count as a passing required check. The E2E gate also merges the shards' blob reports into the one `playwright-report` artifact. The shard jobs (`E2E · shard i/n`, `Lighthouse CI · shard i/n`) are never required, so changing a shard count changes nothing in branch protection.
- **Guarded split.** `apps/web/src/lib/lighthouse-shards.test.ts` checks that the Lighthouse split is a partition (every URL in exactly one shard, none empty) for every shard count, that both `ci.yml` matrices number their shards 1..n and pass each job its shard, and that each gate keeps its required name, runs `always()` and passes only on its shards' success.

**Consequences.** The critical path drops from about 19 minutes to about 9: the build job, then the slowest Lighthouse shard (about 5½ minutes of Lighthouse plus setup). E2E finishes inside that time. Runner minutes stay about the same: five shard jobs and two gates replace two jobs, but the two rebuilds and the Lighthouse shards' `pnpm install` are gone. A Lighthouse failure now shows in one shard's log, and each shard uploads its own reports to temporary public storage. A new Lighthouse URL needs no shard assignment, only a `COST` entry if it is much slower than a typical page. Adding a shard is a one-line matrix change; while `/team/` dominates, more than three shards stop helping, because one URL's runs never split.

**Alternatives considered.** _Shard jobs that build the site themselves, with no `needs`:_ about a minute faster on the critical path, but seven builds instead of one, and the suites would no longer test the artifact the build job checked. Rejected. _More Playwright workers in one job:_ the runner has two vCPUs, which also host `sirv`, `wrangler dev` and the browser, so this risks timing flakes that sharding avoids. Rejected. _Fewer Lighthouse runs per URL, or a shorter wait for the team page:_ these change what the gate measures, not how fast CI runs it, and belong in a budget decision ([ADR 0012](0012-testing-strategy.md)), not this one. Rejected here. _Require the shard checks directly:_ every change to a shard count would then need a change to branch protection. Rejected.

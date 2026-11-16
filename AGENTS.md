# AGENTS.md — operating guide for AI agents

**Read this before touching the repo.** This is the canonical instruction set for
autonomous/AI agents working on `quarry.team`. It tells you how to work here and —
critically — **which sidecar documents you must keep in sync** when you change code,
behavior, or decisions. This repo holds itself to the standard the firm sells:
fast, accessible, correct, and _documented_. Stale docs are a defect.

> Humans: the contributor workflow (branching, PRs, review) lives in
> [`CONTRIBUTING.md`](CONTRIBUTING.md). This file is the superset agents operate by.

---

## 1. Prime directives

1. **Work on a branch; open a PR; never push to `main` directly.** `main` is
   protected and ships via the pipeline. Every change is a focused PR that passes
   the full gate (§4) and CI before a **squash** merge (linear history — one signed,
   conventional commit per PR; the signed-commits ruleset rejects rebase merges, so
   the PR title becomes the commit subject). Mirrors [`CONTRIBUTING.md`](CONTRIBUTING.md).
2. **Decide significant or hard-to-reverse changes _with the maintainer_ first.**
   Architecture, dependencies, data model, infra, workflows — propose and agree
   before building. Don't cowboy; don't churn the design in `main`'s history.
3. **Keep the sidecars in sync (§3).** A code/behavior/decision change that lands
   without its doc update is incomplete. This is the #1 reason this file exists.
4. **Never hand-edit generated artifacts (§5).**
5. **Respect ownership boundaries.** Content in `apps/web/src/content`, tokens in
   `packages/ui/tokens`, infra in `infra/`, deploy config in `apps/web/wrangler.toml`
   (site) and `apps/docs/wrangler.toml` (docs site).
6. **No secrets in git. No scratch files in commits.** (§6)

---

## 2. Repo map

| Path                                                                  | What it is                                                                                                                                                                                                | Canonical guide                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/web/`                                                           | The Astro site (static pages + same-origin `/api/*`)                                                                                                                                                      | ADR-0002, ADR-0006                                     |
| `apps/web/src/content/`                                               | Cases, posts, team, services, roles, policies (MDX/JSON + Zod)                                                                                                                                            | ADR-0004, ADR-0016, `docs/guides/content-authoring.md` |
| `apps/web/src/pages/api/`                                             | Form-submission endpoints (`contact`, `careers`) → `src/lib/form-submissions.ts` → **Cloudflare D1** (`form_submissions`)                                                                                 | ADR-0014                                               |
| `apps/web/src/pages/policies/grievances*` + `src/middleware.ts`       | On-demand grievance intake (signed token, quarantine, D1 + Notion mirror); Worker-set security headers                                                                                                    | ADR-0017                                               |
| `apps/web/src/pages/search.astro` + `src/lib/search/`                 | Site search: the prerendered MiniSearch index (`src/pages/search-index.json.ts`) and the on-demand, rate-limited `/search` route with its fragment mode                                                   | ADR-0021                                               |
| `apps/web/wrangler.toml`                                              | Worker deploy config (bindings, routes)                                                                                                                                                                   | `infra/README.md`, ADR-0006                            |
| `apps/web/migrations/`                                                | D1 SQL migrations (`0001_form_submissions.sql`, …)                                                                                                                                                        | ADR-0014                                               |
| `apps/web/public/_headers` + `apps/web/scripts/inject-csp-hashes.mjs` | The strict CSP: the tokenized header template and the `postbuild` hash injector for static assets; `src/middleware.ts` sets the same headers with a per-request nonce on Worker-served routes             | ADR-0015, ADR-0019                                     |
| `packages/ui/tokens/`                                                 | **Design tokens** — the design-system source of truth                                                                                                                                                     | ADR-0003, ADR-0007, `docs/guides/design-system.md`     |
| `apps/docs/`                                                          | Starlight docs site → **docs.quarry.team** (`apps/docs/wrangler.toml`)                                                                                                                                    | `docs/runbooks/deploy.md`                              |
| `infra/`                                                              | Terraform (Cloudflare config plane; the generated Worker secrets in GitHub environments)                                                                                                                  | `infra/README.md`, ADR-0008                            |
| `tests/e2e/`                                                          | Playwright specs (a11y, SEO, CSP, smoke, submission form, search, work filters, select, image zoom, architecture diagram) + `production.spec.ts`, the post-deploy smoke; config in `playwright.config.ts` | ADR-0012, ADR-0018                                     |
| `scripts/`                                                            | Repo tooling: `images.mjs`, `check-asset-refs.mjs`, `check-redundant-overrides.mjs`, `clean.mjs`, `generate-og.mjs`                                                                                       | —                                                      |
| `.github/`                                                            | Workflows (CI, previews, deploys, Security, CodeQL, Dependabot auto-merge, machine-token expiry), `dependabot.yml`                                                                                        | ADR-0009, ADR-0018                                     |
| `docs/adr/`                                                           | Architecture Decision Records                                                                                                                                                                             | ADR-0001 + `docs/adr/README.md`                        |
| `docs/brd/`                                                           | Business / product / non-functional requirements                                                                                                                                                          | —                                                      |
| `docs/guides/`                                                        | How-to guides (content authoring, design system)                                                                                                                                                          | —                                                      |
| `docs/runbooks/`                                                      | Operational runbooks (bootstrap, dev, content, deploy, incident, data retention)                                                                                                                          | —                                                      |
| Root `*.md`                                                           | README, SECURITY, CONTRIBUTING, CoC                                                                                                                                                                       | —                                                      |

The stack is **Cloudflare-only**: the site (static assets + on-demand `/api/*`)
is one Worker deployed by `wrangler`; submissions persist in **D1**; Terraform manages
the config plane (zone, D1, R2, Turnstile, WAF). No DigitalOcean, no Postgres.

---

## 3. The sidecar-maintenance contract ⭐

When you make a change of the kind on the left, update the documents on the right
**in the same commit/PR**. Do not defer it.

| When you change…                                                                                                                                                                   | You MUST update…                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A **significant or hard-to-reverse architecture decision** (stack, hosting, data tier, build, testing, security posture)                                                           | **Write or revise an ADR** (`docs/adr/`) per [ADR-0001](docs/adr/0001-record-architecture-decisions.md), and update the index in `docs/adr/README.md`. Reverse a decision by superseding, not deleting.                                                                                                                                                                                                                                                                                      |
| **Product scope, features, or acceptance criteria**                                                                                                                                | `docs/brd/product-requirements.md` (and `business-requirements.md` if goals/risks shift).                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Performance / a11y / SEO / security budgets or targets**                                                                                                                         | `docs/brd/non-functional-requirements.md` (+ `lighthouserc.cjs` if numeric budgets change).                                                                                                                                                                                                                                                                                                                                                                                                  |
| **The design system** — any token, font, color, or component primitive                                                                                                             | Edit `packages/ui/tokens/tokens.json` → `pnpm tokens` (commit all three files) → update `docs/guides/design-system.md`; keep ADR-0003/0007 true; sync Figma Variables from the same `tokens.json`.                                                                                                                                                                                                                                                                                           |
| **Content model / collections / authoring workflow**                                                                                                                               | `docs/guides/content-authoring.md`, `docs/runbooks/content-editing.md`, and the schema in `apps/web/src/content.config.ts` (ADR-0004).                                                                                                                                                                                                                                                                                                                                                       |
| **Content images** (new or replaced rasters under `apps/web/src/{content,assets}`)                                                                                                 | Run `pnpm images:fix` (or let the pre-commit hook); they must pass `pnpm images:check` (≤2560px, ≤900 KB, carry no EXIF/XMP, and roster avatars black-and-white). An animated WebP also gets its `<name>.poster.webp` from `images:fix` — commit both and place the clip with `<Motion>` (never `![]()` or `hero`); the check enforces the pairing and that the poster's dimensions match the clip's, so re-run `images:fix` after re-encoding a clip. Tool + budgets: `scripts/images.mjs`. |
| **Local dev setup, scripts, prerequisites**                                                                                                                                        | `docs/runbooks/local-development.md` and `CONTRIBUTING.md` (Prerequisites).                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Deploy / build / CI pipeline** (workflows, wrangler, build output)                                                                                                               | `docs/runbooks/deploy.md`, `infra/README.md`, ADR-0009, and `docs/runbooks/bootstrap.md`.                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Infra** (Terraform resources, providers, bindings)                                                                                                                               | `infra/README.md`, the relevant ADR (0006/0008/0014), and `apps/web/wrangler.toml` if a binding changed.                                                                                                                                                                                                                                                                                                                                                                                     |
| **The forms / submission system** (`apps/web/src/lib/form-submissions.ts`, the `/api/*` routes, the D1 schema)                                                                     | A new `apps/web/migrations/NNNN_*.sql` (applied migrations are immutable), ADR-0014, `.env.example` if a secret or binding changed, and `docs/runbooks/deploy.md` / `docs/runbooks/incident-response.md` (the migration and data-restore steps). The vocabulary is `form_submissions` (table, database, secrets) — never "leads".                                                                                                                                                            |
| **Inline scripts/styles or the CSP** (`apps/web/public/_headers`, `apps/web/scripts/inject-csp-hashes.mjs`, `src/lib/style-scope.ts`)                                              | ADR-0015 (the mechanism and its constraints) and `SECURITY.md` if the posture claim changes; `src/lib/csp-hashes.test.ts` and `tests/e2e/csp.spec.ts` must stay green. Hashes are a build output (§5) — never paste them into `_headers`.                                                                                                                                                                                                                                                    |
| **Dependency policy** (`.github/dependabot.yml`, `.github/workflows/dependabot-automerge.yml`, the post-deploy smoke/rollback in `deploy-web.yml`, `tests/e2e/production.spec.ts`) | ADR-0018/ADR-0020 and the Dependabot paragraph in `CONTRIBUTING.md` (Branch strategy).                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Failure modes / ops procedures** (rollback, data restore, incidents)                                                                                                             | `docs/runbooks/incident-response.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Env vars / secrets / bindings**                                                                                                                                                  | `.env.example`, `infra/README.md` (CI and Worker runtime secrets tables), `docs/runbooks/bootstrap.md`, and for a Worker secret (`WORKER_*`) its line in the `worker-secrets` map of `deploy-web.yml`.                                                                                                                                                                                                                                                                                       |
| **The stack, tooling, or repo layout**                                                                                                                                             | `README.md` (stack table + tree) and the repo map in this file (§2).                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Anything under `docs/`** (ADRs, BRD, guides, runbooks) that the **docs site** publishes                                                                                          | Nothing extra to hand-edit: `apps/docs` is a **generated mirror** of `docs/` (`apps/docs/scripts/sync-docs.mjs`, run at `prebuild`). Edit `docs/` only; **never** edit the generated `apps/docs/src/content/docs/**` sections. Re-run `pnpm --filter @quarry/docs sync` and commit the regenerated files — CI fails on drift.                                                                                                                                                                |
| Any **first-class artifact** above (ADR, BRD/PRD, design spec, guide, runbook)                                                                                                     | The **Notion artifact registry** (§3.1) — in the same unit of work, not deferred.                                                                                                                                                                                                                                                                                                                                                                                                            |

**Rule of thumb:** if a reviewer reading only the docs would now be _misinformed_,
the docs are part of your change.

### 3.1 The Notion artifact registry — always keep it updated ⭐

Quarry maintains an **artifact registry in Notion** (internal, outside this
repo) that indexes the first-class artifacts — ADRs, BRD/PRD, design specs,
guides, runbooks — with their status, notes, and links. It is a sidecar like
any other row above, **not a nice-to-have**. Whenever you produce or
meaningfully change a first-class artifact or ship a scope-level change to the
site:

1. **Update the relevant registry row** (status, notes, link), and/or
2. **Append a dated change record** to the registry — it carries
   commit-stamped batch sections; follow that pattern and include the
   PR/commit reference.

Do this **in the same unit of work** as the repo change. Only if you genuinely
lack Notion access may you fall back to flagging the required update
prominently in your summary and the PR description so a maintainer can apply
it — silently skipping it is not an option.

---

## 4. The gate (run before every push)

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm --filter @quarry/web build      # the adapter build must succeed
```

CI (`.github/workflows/ci.yml`) runs that same gate as **Lint · Typecheck · Build · Test** — plus the docs-mirror and token freshness diffs, the **image-budget check** (`pnpm images:check` — content rasters ≤2560px / ≤900 KB and carry no EXIF/XMP, roster avatars (`apps/web/src/content/team/avatars/`) black-and-white, and the motion contract: every animated WebP is paired with a same-size `<name>.poster.webp` and placed with `<Motion>`; the pre-commit hook auto-normalizes, `pnpm images:fix` repairs and writes posters), `node scripts/check-asset-refs.mjs` against the built output, and the docs-site build (`pnpm --filter @quarry/docs build`) — then **E2E (Playwright)** (`pnpm test:e2e`) and **Lighthouse CI (CWV budgets)** ([ADR-0012](docs/adr/0012-testing-strategy.md)). Both run as parallel shard jobs against the build job's `web-dist` artifact (never a rebuild), and each required name is a gate job that passes only when all of its shards did; the Lighthouse split lives in `lighthouserc.cjs` (`LIGHTHOUSE_SHARD`), guarded by `src/lib/lighthouse-shards.test.ts` ([ADR-0009, amendment](docs/adr/0009-ci-cd-github-actions.md#amendment-2026-11-14-e2e-and-lighthouse-run-sharded-against-one-build)). `Security` (`pnpm audit`, `pnpm audit:overrides`, secret scan) and `CodeQL` run alongside.
If you changed the API/submission logic, the `apps/web` Vitest suite (incl. `src/lib/form-submissions.test.ts`) must stay green. If you added or changed an inline script or style, `src/lib/csp-hashes.test.ts` and `tests/e2e/csp.spec.ts` must stay green ([ADR-0015](docs/adr/0015-strict-csp-via-build-time-script-hashes.md)).

Open the PR and **watch its checks to green** (`gh run watch`). Then — before merging —
**request a smoke test from the maintainer and wait for their explicit go-ahead**; green CI
alone is not merge authorization unless the maintainer has waived the smoke test for that
change. Only squash-merge a green, maintainer-approved PR. A red `main` is a
stop-the-line event — fix forward immediately.

---

## 5. Generated artifacts — never hand-edit

- **`packages/ui/tokens/tokens.css`** and **`packages/ui/tokens/figma.tokens.json`** — both generated from `tokens.json` by `pnpm tokens` (the code and Figma/Tokens Studio projections). CI fails if either is stale. Edit the JSON, run the build, commit all three.
- **`apps/docs/src/content/docs/{architecture,requirements,guides,runbooks}/**`** — the docs-site mirror, generated from `docs/` by `apps/docs/scripts/sync-docs.mjs` (`pnpm --filter @quarry/docs sync`, also run at `prebuild` and `predev`). CI fails if stale. Edit `docs/`, re-run the sync, commit the regenerated files. Only `apps/docs/src/content/docs/index.mdx` (the splash) and `apps/docs/src/content.config.ts` are hand-authored.
- **The CSP script/style hashes in `dist/client/_headers`** — computed at `postbuild` by `apps/web/scripts/inject-csp-hashes.mjs` from the emitted HTML, replacing the `__CSP_SCRIPT_HASHES__` / `__CSP_STYLE_HASHES__` tokens the source `apps/web/public/_headers` carries ([ADR-0015](docs/adr/0015-strict-csp-via-build-time-script-hashes.md)). Never paste a hash into the source file; change the inline script/style and rebuild.
- **`apps/web/dist/`** — build output (gitignored). Never commit it. The `@astrojs/cloudflare` adapter also writes `dist/server/wrangler.json`; the source of truth is `apps/web/wrangler.toml`. `postbuild` also copies `apps/web/migrations/` to `dist/server/migrations/` for the deploy's `d1 migrations apply`.
- **`pnpm-lock.yaml`** — regenerated by pnpm. If you add/remove a dependency you **must** run `pnpm install` and commit the updated lockfile (CI uses `--frozen-lockfile`).
- **`infra/.terraform.lock.hcl`** — the exact Terraform provider versions and hashes. Dependabot raises it; by hand, run `terraform init -upgrade` then `terraform providers lock` for linux_amd64, windows_amd64, darwin_arm64, and darwin_amd64 (`infra/README.md`), and commit it.
- **`apps/web/public/og/{default,work,careers}.png`** — committed, but generated by `pnpm generate:og` (`scripts/generate-og.mjs`). Regenerate; don't retouch.
- **`search-index.json`, `_astro/*`, sitemap** — build outputs, not source.

---

## 6. Conventions

- **Branches:** [Conventional Branch](https://conventionalbranch.org/) names — `<type>/<kebab-case-desc>`, where `<type>` is any Conventional Commit type below (e.g. `fix/dev-group-92`, `ci/shard-e2e-and-lighthouse`). Name the branch **before its first push**: a repository ruleset rejects non-conforming refs at push (`dependabot/**` is machine-exempt). Auto-generated session branch names (`claude/…` and the like) never leave the machine — rename first.
- **Commits:** Conventional Commits (`feat`, `fix`, `docs`, `refactor`, `chore`, `ci`, `content`, …) with a scope (`web`, `ui`, `infra`, `tokens`, `forms`, …). See `CONTRIBUTING.md`.
- **Narrative voice:** all engineering narrative — commit messages, PR titles/bodies, review and issue comments, ADRs, runbooks, guides, release notes, code comments — is clinical and written in the author's voice: state what changed and why. Never write as an agent addressing the author ("as requested", "I've implemented…"), and never reference the conversation, session, or prompt that produced a change. Agent identity lives in the `Co-Authored-By:` trailer and nowhere else.
- **AI attribution:** end agent-authored commit messages with a `Co-Authored-By:` trailer identifying the model.
- **No scratch in commits:** throwaway scripts and screenshots are gitignored (`_*.mjs`, `_build/`, `dist/`). Verify `git status` before committing — never stage them.
- **Secrets:** never commit tokens/keys. GitHub holds them all: CI secrets as repository secrets, the Worker's runtime secrets as `staging`/`production` environment secrets named `WORKER_*` — the same name in GitHub, in the deploy workflow's `worker-secrets` map, on the Worker, and in the code — that each deploy ships; `worker-secrets-map.test.ts` fails CI when they drift. See `SECURITY.md`.
- **TypeScript strict; ESLint + Prettier are law.** Don't fight the formatter.

---

## 7. Non-negotiable product properties

These are the value proposition — guard them in every change:

- **Accessibility (WCAG 2.2 AA):** semantics, keyboard, focus, contrast. Verify new color pairings.
- **Zero-JS by default:** add a client island only when interactivity truly requires it, and justify the cost (ADR-0002).
- **Design tokens only:** no raw hex/px in components or MDX — add to `tokens.json` instead (ADR-0003, design-system guide).
- **Form primitives:** a dropdown renders through `Select` (`apps/web/src/components/Select.astro`), never a bare `<select>`; `src/lib/form-primitives.test.ts` and `tests/e2e/select.spec.ts` enforce it (design-system guide, Components).
- **Creative as SVG with live text:** cut new charts, diagrams and illustrations as SVG with live text, not raster: accessible (`role="img"` with a `<title>`), translatable (i18n), crisp at any size, set in the site fonts. Raster is for photographs, product screenshots and third-party logos; never bake text into pixels. Where a medium only takes raster (OG/social cards), generate it from a live-text source, as `scripts/generate-og.mjs` does (content-authoring guide, inline SVG heroes).
- **Performance budgets:** ~100 Lighthouse, CWV "good" (ADR-0012, NFR doc).
- **SEO continuity:** keep migrated slugs stable; legacy `/blog/<slug>` and `/cases/<slug>` redirects intact (ADR-0011).
- **Privacy:** privacy-first analytics; minimal data; PII only in D1, client addresses stored as a network prefix and a keyed hash, and deleted on the terms in `docs/runbooks/data-retention.md` (form submissions 36 months after receipt, grievances three years after closure) (ADR-0010, ADR-0014, ADR-0017).

---

## 8. Where to look first

- New here → `docs/runbooks/local-development.md`, then skim `docs/adr/README.md` for the _why_.
- Changing a decision → `docs/adr/0001-record-architecture-decisions.md` (the ADR process).
- Touching the design → `docs/guides/design-system.md`.
- Writing content → `docs/guides/content-authoring.md`.
- Deploying / on-call → `docs/runbooks/deploy.md`, `docs/runbooks/incident-response.md`, `infra/README.md`.

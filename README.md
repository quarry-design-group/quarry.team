<div align="center">

# quarry.team

**The next-generation marketing site for [Quarry](https://quarry.team) — an elite, globally-distributed product & engineering firm.**

_Your external, in-house product team._

[![CI](https://github.com/quarry-design-group/quarry.team/actions/workflows/ci.yml/badge.svg)](https://github.com/quarry-design-group/quarry.team/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-source--available-1f2933)](LICENSE)
[![Made by Quarry](https://img.shields.io/badge/made%20by-Quarry-0C53C7)](https://quarry.team)
[![Astro](https://img.shields.io/badge/Astro-7-BC52EE)](docs/adr/0002-frontend-framework-astro.md)
[![Node](https://img.shields.io/badge/Node-24%20LTS-339933)](.nvmrc)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6)](tsconfig.base.json)
[![WCAG 2.2 AA](https://img.shields.io/badge/a11y-WCAG%202.2%20AA-2e7d32)](docs/brd/non-functional-requirements.md)

</div>

---

## What this is

A static, content-first marketing site: best-in-class Core Web Vitals, WCAG 2.2 AA accessibility, a 1:1 design-to-code token contract, typed git-based content, and reproducible infrastructure on the Cloudflare edge, with the form-submissions data tier on Cloudflare D1.

This is a deliberate departure from the firm's previous, self-managed marketing-site stack. The reasoning behind every significant choice is recorded as an [Architecture Decision Record](docs/adr/).

## Architecture at a glance

| Concern        | Choice                                                                                                                | ADR                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework      | **Astro 7** + TypeScript (strict), zero-JS by default, islands on demand                                              | [0002](docs/adr/0002-frontend-framework-astro.md)                                                                                                                     |
| Content        | Typed **git-based content collections** (MDX + Zod) — no CMS server                                                   | [0004](docs/adr/0004-git-based-content-collections.md)                                                                                                                |
| Design system  | **"Quarried"** — design tokens (`tokens.json` → `tokens.css` + Figma Variables)                                       | [0003](docs/adr/0003-design-tokens-single-source-of-truth.md)                                                                                                         |
| Styling        | **Tailwind v4** bridged to the design tokens                                                                          | [0007](docs/adr/0007-styling-tailwind-v4-plus-tokens.md)                                                                                                              |
| Hosting        | **Cloudflare edge** — Worker + Static Assets, build-optimized images, WAF, Turnstile, DNS, hash-pinned strict CSP     | [0006](docs/adr/0006-hosting-cloudflare-edge.md), [0015](docs/adr/0015-strict-csp-via-build-time-script-hashes.md)                                                    |
| Data tier      | **Cloudflare D1** + same-origin Worker API routes for contact/careers form submissions                                | [0014](docs/adr/0014-forms-and-data-tier-on-cloudflare-d1.md)                                                                                                         |
| Governance     | `/policies` collection; stakeholder grievance intake on demand, quarantine-first, D1 + Notion                         | [0016](docs/adr/0016-policies-section-and-collection.md) · [0017](docs/adr/0017-stakeholder-grievance-intake.md)                                                      |
| Infrastructure | **Terraform**, state in Cloudflare R2 (S3-compatible)                                                                 | [0008](docs/adr/0008-infrastructure-as-code-terraform.md)                                                                                                             |
| CI/CD          | **GitHub Actions** — PR quality gates + previews, push-to-deploy, gated Terraform apply, tiered Dependabot auto-merge | [0009](docs/adr/0009-ci-cd-github-actions.md), [0018](docs/adr/0018-dependency-update-policy.md), [0020](docs/adr/0020-platform-updates-move-as-one-reviewed-unit.md) |
| Analytics      | **Cloudflare Web Analytics** — cookieless, no consent banner                                                          | [0010](docs/adr/0010-analytics-privacy-first.md)                                                                                                                      |
| SEO            | `/cases → /work` 301s, sitemap, JSON-LD, `llms.txt`                                                                   | [0011](docs/adr/0011-seo-url-strategy-and-redirects.md)                                                                                                               |
| Search         | **Worker-rendered** — build-time MiniSearch index, on-demand `/search`, results as you type, CSP unchanged            | [0021](docs/adr/0021-site-search-on-the-worker.md)                                                                                                                    |
| Testing        | Vitest, Playwright e2e, axe (WCAG 2.2 AA), Lighthouse CI budgets                                                      | [0012](docs/adr/0012-testing-strategy.md)                                                                                                                             |

```
Visitor ──► Cloudflare Worker + Static Assets (static site, WAF, Web Analytics)
                │  same-origin form POST to /api/* (Turnstile + honeypot)
                ▼
        Worker API routes (contact/careers) ──► Cloudflare D1 (form submissions)
                │  on-demand /policies/grievances (no-JS form, signed token)
                ▼
        Grievance intake ──► Cloudflare D1 (grievances) ──► Notion log (mirror) + Resend
```

## Monorepo layout

pnpm-workspace monorepo (`quarry-design-group/quarry.team`):

```
apps/
  web/        @quarry/web  — the Astro marketing site (content collections incl. policies, pages,
              components, same-origin /api/* submission routes, the on-demand grievance and
              search routes + middleware, src/lib/{form-submissions,grievances,search}, D1 migrations)
  docs/       @quarry/docs — Starlight docs site, deployed to docs.quarry.team
packages/
  ui/         @quarry/ui   — design tokens (tokens.json -> tokens.css + figma.tokens.json) and typed token exports
infra/        Terraform (modules + environments), state in Cloudflare R2
tests/        cross-cutting tests
docs/         ADRs, BRD/PRD/NFR, runbooks, guides
scripts/      repo tooling — asset-reference and image checks, OG image generation, override audit, clean
.github/      workflows (CI, previews, deploys, security, CodeQL, Dependabot auto-merge) and templates
```

## Quickstart

Requires Node `24` LTS (`.nvmrc`) and pnpm `10.14.0` (Corepack honors `packageManager`).

```bash
nvm use            # or ensure Node >= 22.23.4
corepack enable    # ensures the pinned pnpm
pnpm install       # install all workspaces
pnpm tokens        # build design tokens (tokens.json -> tokens.css + figma.tokens.json)
pnpm dev           # run the Astro site locally
```

Full setup and troubleshooting: [`docs/runbooks/local-development.md`](docs/runbooks/local-development.md).

## Scripts

| Script                               | Purpose                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                           | Run the web app dev server (`@quarry/web`)                                                                                                                          |
| `pnpm dev:docs`                      | Run the docs app dev server                                                                                                                                         |
| `pnpm build`                         | Build tokens (`@quarry/ui`) then the web app                                                                                                                        |
| `pnpm build:web` / `pnpm build:docs` | Build a single app                                                                                                                                                  |
| `pnpm preview`                       | Serve the built static site (`apps/web/dist/client`) with sirv after `pnpm build`; static pages only (`pnpm --filter @quarry/web preview:worker` drives the Worker) |
| `pnpm tokens`                        | Rebuild design tokens (`tokens.json` → `tokens.css` + `figma.tokens.json`)                                                                                          |
| `pnpm typecheck`                     | TypeScript strict (packages and the Playwright suite) + `astro check` (apps)                                                                                        |
| `pnpm lint`                          | ESLint (cached)                                                                                                                                                     |
| `pnpm format` / `pnpm format:check`  | Prettier write / check                                                                                                                                              |
| `pnpm test`                          | Vitest unit tests                                                                                                                                                   |
| `pnpm test:e2e`                      | Playwright end-to-end tests against the built output (run `pnpm build` first)                                                                                       |

## Deployment

Deployment runs on two independently triggered tracks. **On every PR**, CI runs the quality gates; a PR that touches the site or the docs also gets an ephemeral Cloudflare Workers preview. **On a push to `main` that touches the site**, `wrangler deploy` publishes the Worker + static assets (behind the `STAGING_DEPLOY_ENABLED` / `DEPLOY_ENABLED` gate variables) and applies any pending D1 migrations. **Infrastructure** is reconciled separately: `terraform plan` on infra PRs, a weekly drift check, and a gated manual `terraform apply` over the Cloudflare config plane (zone, D1, R2, Turnstile, WAF/rate-limit — cache headers are not Terraform-managed; see ADR-0008). See [`docs/runbooks/deploy.md`](docs/runbooks/deploy.md).

## Documentation

- **Docs site:** [docs.quarry.team](https://docs.quarry.team) — the Starlight docs (architecture + guides), also browsable as Markdown below.
- **Decisions:** [`docs/adr/`](docs/adr/README.md) — why the stack is what it is.
- **Product:** [BRD](docs/brd/business-requirements.md) · [PRD](docs/brd/product-requirements.md) · [NFR](docs/brd/non-functional-requirements.md).
- **Runbooks:** [bootstrap](docs/runbooks/bootstrap.md) · [deploy](docs/runbooks/deploy.md) · [content editing](docs/runbooks/content-editing.md) · [incident response](docs/runbooks/incident-response.md) · [data retention](docs/runbooks/data-retention.md) · [local development](docs/runbooks/local-development.md).
- **Guides:** [content authoring](docs/guides/content-authoring.md) · [design system](docs/guides/design-system.md).
- **Contributing:** [`CONTRIBUTING.md`](CONTRIBUTING.md) (source-available — external PRs aren't accepted; issues welcome) · **Security:** [`SECURITY.md`](SECURITY.md) · **Conduct:** [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Why this repo is built the way it is

Zero unused JavaScript on content pages, a single source of truth that keeps design and code in lockstep, content that is typed and reviewed like code, privacy that needs no consent banner, and infrastructure you can rebuild from a `terraform apply`. The [ADRs](docs/adr/README.md) record the trade-offs behind each of those choices.

> _One more thing: the live site has a small easter egg in the browser console. Open dev tools and say hello._

---

<div align="center">
<sub>© Quarry Design Group, LLC — Medford, Oregon. Source-available; see <a href="LICENSE">LICENSE</a>. Built with care.</sub>
</div>

# Business Requirements Document — quarry.team (next-gen)

- **Status:** Accepted
- **Owner:** Leadership / Marketing
- **Last updated:** 2026-10-04

## 1. Background

Quarry (Quarry Design Group, LLC; established 2016; Medford, Oregon) is an elite, globally-distributed product and engineering firm — an "external, in-house product team" for our clients. The firm's previous `quarry.team` ran on an aging, self-managed stack that no longer reflected our craft, our positioning, or our standards for performance and accessibility.

The next-gen site is a ground-up rebuild. Its audiences read closely: prospective clients evaluating our taste and rigor, and engineers considering joining us — the architecture, the repository, and these documents are written with that in mind.

## 2. Goals

1. **Generate qualified inquiries** — the site's primary commercial purpose.
2. **Attract and convert engineering/design talent** via a credible careers path.
3. **Demonstrate craft** — performance, accessibility, design fidelity, and engineering discipline that a discerning visitor can feel and an engineer can verify by reading the repo.
4. **Tell the work clearly** through a curated, outcome-led case-study library.
5. **Own our data and our platform** — privacy-respecting by default, no third-party tracking burden, infrastructure we control and can reproduce.

## 3. Market and ICP

**What we sell:** product strategy, design, and engineering delivered as an embedded, senior, in-house-grade team.

**Primary ICP (clients):** founders and product/engineering leaders (CEO, CPO, CTO, VP Product/Eng) at funded startups and scale-ups, plus innovation leaders at established companies, who need a senior team to design and build a product (or rescue/level-up an existing one) and value craft, ownership, and outcomes over staff-augmentation headcount.

**Secondary ICP (talent):** senior, globally-distributed product designers and engineers who want high-craft work and will judge us by the quality of our own site and repo.

## 4. Scope

### In scope

- Public marketing site: home, services/capabilities, how-we-use-AI, work (case-study library and detail), about/team, blog, contact, careers (listing + application).
- AI services offering page (`/ai-services`): AI development & integration positioned as AI as a product and AI as a feature.
- Curated case studies and editorial blog, authored as typed git-based content ([ADR 0004](../adr/0004-git-based-content-collections.md)).
- Form-submission capture: contact (qualified inquiry) and careers application, persisted to the controlled data tier ([ADR 0014](../adr/0014-forms-and-data-tier-on-cloudflare-d1.md)).
- Site search on the Worker ([ADR 0021](../adr/0021-site-search-on-the-worker.md)), privacy-first analytics ([ADR 0010](../adr/0010-analytics-privacy-first.md)), SEO continuity from the legacy site ([ADR 0011](../adr/0011-seo-url-strategy-and-redirects.md)).
- Design system ("Quarried") driven by design tokens ([ADR 0003](../adr/0003-design-tokens-single-source-of-truth.md)).

### Out of scope (this phase)

- Authenticated client portals or dashboards.
- E-commerce / payments.
- Multi-language localization (the build is i18n-_ready_; no translated content shipped — see `non-functional-requirements.md`).
- A public-facing content API.

## 5. Success metrics / KPIs

- **Primary conversion:** qualified inquiry submitted via the contact form.
- **Secondary conversion:** careers application submitted.
- **Quality bar (gating, not vanity):**
  - **Lighthouse ~100** across performance, accessibility, best practices, SEO, enforced in CI ([ADR 0012](../adr/0012-testing-strategy.md)).
  - **WCAG 2.2 AA** conformance.
  - Core Web Vitals within budget on real-user data (Cloudflare Web Analytics).
- **SEO continuity:** retain rankings/equity through the `/cases/* → /work/*` 301 migration; no loss of inbound link value; `/blog/*` rankings preserved.

> We intentionally do not invent traffic or conversion-rate targets here; KPIs are the conversion events above and the quality gates. Numeric targets are set by Marketing against live baselines.

## 6. Constraints

- **Stack is decided** (see ADRs): Astro 7 + TypeScript strict; git-based MDX/Zod content; Tailwind v4 on design tokens; prerendered output shipped as a single Cloudflare Worker; Cloudflare D1 data tier for form submissions; Terraform IaC; GitHub Actions CI/CD.
- **Privacy-first:** no cookie banner, no third-party tracking; personal data confined to the Cloudflare D1 data tier with defined retention: form submissions 36 months after receipt, grievances three years after closure ([data-retention runbook](../runbooks/data-retention.md)).
- **Brand:** "Quarried" design system — Fraunces / Hanken Grotesk / JetBrains Mono; Quarry Blue `#0C53C7`; Stone neutrals; Ember accent.
- **Repo:** the `quarry-design-group/quarry.team` monorepo (pnpm workspaces) — public and source-available.
- **The site must hold its own quality bar** — it is a public demonstration of our standards.

## 7. Risks

| Risk                                                           | Impact                        | Mitigation                                                                                                                                                                    |
| -------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEO regression during `/cases → /work` migration               | Loss of inbound traffic/leads | Edge 301s, redirect audit in deploy runbook, sitemap + structured data ([ADR 0011](../adr/0011-seo-url-strategy-and-redirects.md))                                            |
| Content migration off the legacy site loses or mangles content | Editorial gaps, broken media  | One-time import into typed MDX, reviewed in PRs, media committed under an enforced size budget and build-optimized ([ADR 0004](../adr/0004-git-based-content-collections.md)) |
| Non-dev editors blocked by git workflow                        | Slower publishing             | Git-CMS layer (Decap/Sveltia), _planned_ (ADR 0004); MDX-direct + content runbook is the current path                                                                         |
| Performance/a11y budgets slip over time                        | Erodes the core value prop    | Lighthouse CI + axe budgets as merge gates ([ADR 0012](../adr/0012-testing-strategy.md))                                                                                      |
| Operational complexity: PR gates, push-to-deploy, gated apply  | Deploy/ops friction           | Terraform IaC, PR previews, post-deploy rollback, runbooks ([ADR 0008](../adr/0008-infrastructure-as-code-terraform.md), [ADR 0009](../adr/0009-ci-cd-github-actions.md))     |
| PII handling for form submissions                              | Privacy/compliance exposure   | One D1 store, fail-closed Turnstile, IP prefix + hash, [36-month retention](../runbooks/data-retention.md) ([ADR 0014](../adr/0014-forms-and-data-tier-on-cloudflare-d1.md))  |
| Vendor concentration on Cloudflare                             | Platform lock-in              | Output is portable static; DNS movable; D1 is standard SQLite, exportable via `wrangler d1 export`                                                                            |

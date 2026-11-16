---
title: "Testing strategy"
description: "The site's value proposition is craft: it must be fast, accessible, correct, and visually exact. Those properties degrade silently without automated…"
sidebar:
  order: 12
---

<!-- GENERATED from docs/adr/0012-testing-strategy.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/adr/0012-testing-strategy.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/adr/0012-testing-strategy.md). Edit there; this page is generated.
:::

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Engineering, Design Systems

## Context

The site's value proposition is craft: it must be fast, accessible, correct, and visually exact. Those properties degrade silently without automated guards. We need a layered strategy that protects logic, user flows, accessibility (WCAG 2.2 AA), performance budgets (toward ~100 Lighthouse), and visual fidelity — and that runs in CI ([ADR 0009](/architecture/0009-ci-cd-github-actions/)) as a merge gate.

## Decision

A layered automated testing strategy, enforced in CI (layers 1–4 today; layer 5
is planned — see the implementation-status note below):

1. **Unit / component — Vitest.** Pure logic, content-schema helpers, utilities, and component logic. Fast feedback, runs on every PR (`pnpm test`).
2. **End-to-end — Playwright.** Critical user journeys in a real browser (Chromium, desktop + mobile-emulation projects): navigation of every backbone route (derived from `src/pages`, so new pages are under contract automatically), case-study/blog/position detail rendering, and the contact/careers form flows exercised at the network boundary — the client contract (payload shape, honeypot, success/error status regions) is asserted against an intercepted `/api/*`; the Worker-side validation is unit-tested in `apps/web/src/lib/form-submissions.test.ts`, and Turnstile runs only in deployed environments ([ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/)) (`pnpm test:e2e`).
3. **Accessibility — axe.** Automated a11y assertions (via `@axe-core/playwright`, in the e2e suite) on every backbone route and a detail page per dynamic template in the light palette, with the dark palette sampled on `/`, `/work` and `/contact`, holding the **WCAG 2.2 AA** bar; complemented by manual audits for what automation can't catch.
4. **Performance — Lighthouse CI with budgets.** Budgets asserted against the static build (`staticDistDir` — the shipped HTML/asset weight, not the dev server) in CI, configured per page _class_ in `lighthouserc.cjs` as an `assertMatrix`: one representative URL per template, with mutually-exclusive URL patterns so each page gets exactly one gate. The default gate makes a11y and SEO regressions **fail the build** (error at minScore 1) along with performance below 0.95 (median of 3 runs — the typical throttled run must clear the bar, with the run count absorbing runner noise); best-practices warns at 0.95. Three page classes carry deliberate exceptions where the composite score is environment noise rather than signal, so the gate binds the metrics CI _can_ measure faithfully: **/team/** (headless CI has no GPU for the brand's WebGL globe, so the composite reads in the 60s for a page that scores 93+ on real hardware) drops the composite and gates LCP ≤ 3000 ms and CLS ≤ 0.1 plus strict a11y/SEO; the **blog index** (Lighthouse's simulated render delay for its full-width cover pins the composite near 0.90 regardless of image bytes) holds a coarse 0.85 composite floor as a disaster net and gates the metric that actually moves on regression, LCP ≤ 4000 ms; and the **404** (intentionally `noindex`, so the is-crawlable SEO audit fails by design) turns the SEO gate off while keeping performance and a11y. Together these defend Core Web Vitals and the JS budget (see `docs/brd/non-functional-requirements.md`).
5. **Visual regression — planned.** Screenshot-based comparison (Playwright snapshots) on representative pages and design-system components, so the 1:1 design contract ([ADR 0003](/architecture/0003-design-tokens-single-source-of-truth/)) doesn't drift unnoticed. Not yet in CI; the curated-baseline workflow is the cost noted below and we'd rather ship no gate than a flaky one.

Plus the static guards from the toolchain: TypeScript strict + `astro check` (`pnpm typecheck`), ESLint (`pnpm lint`), Prettier (`pnpm format:check`), and the token-freshness check (ADR 0003).

> **Implementation status (2026-07-02).** Layers 1–4 run in CI as required
> merge checks. The axe layer landed with the public-readiness pass — its
> first run caught real WCAG 2.2 AA violations (undistinguished in-text
> links, a nested-anchor bug in role postings, and an invisible-content
> window for reduced-motion users), all fixed in the same change. Layer 5
> (visual regression) is deliberately deferred, not quietly missing.
>
> **Implementation status (2026-09-05).** Layer 2 gained a third Playwright
> project, `worker`, which runs the built Worker under `wrangler dev` with a
> local D1 for the on-demand grievance routes — the static `sirv` server cannot
> serve them. It carries their header contract (the runtime-hashed CSP) and the
> brief's automated-submission acceptance test ([ADR 0017](/architecture/0017-stakeholder-grievance-intake/)).

## Consequences

**Positive**

- Each property that defines "craft" — correctness, flows, a11y, performance, visual fidelity — has a dedicated, automated guard.
- Regressions are caught in CI on every PR — the e2e, a11y, and Lighthouse suites run against the freshly built static output (Playwright via `sirv`, LHCI via `staticDistDir`), not in production.

**Negative / costs**

- A multi-layer suite takes effort to build and maintain (visual baselines especially need curation to avoid flakiness).
- Full e2e + Lighthouse + visual runs add CI minutes (mitigated by caching, by running each suite against the already-built static `dist` rather than spinning up deploys, and by sharding e2e and Lighthouse across parallel jobs that share the build job's `dist` — [ADR 0009, amendment](/architecture/0009-ci-cd-github-actions/#amendment-2026-11-14-e2e-and-lighthouse-run-sharded-against-one-build)).
- Visual snapshots require deliberate baseline updates on intentional design changes.

## Alternatives considered

- **Unit tests only.** Misses flows, a11y, performance, and visual regressions — the things this site is judged on. Rejected.
- **Manual QA only.** Doesn't scale, isn't repeatable, can't gate merges. Retained as a complement, rejected as the strategy.
- **Cypress instead of Playwright.** Capable; Playwright chosen for first-class multi-browser support, parallelism, and its tight fit with axe and screenshot testing. Reasonable alternative.
- **No performance budgets in CI.** Lets CWV erode commit by commit. Rejected — budgets are central to the project's goal.


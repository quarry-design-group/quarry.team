---
title: "Non-Functional Requirements — quarry.team (next-gen)"
description: "These are the quality attributes the site must satisfy. They are enforced as CI gates where possible (ADR 0012, ADR 0009)."
sidebar:
  order: 3
---

<!-- GENERATED from docs/brd/non-functional-requirements.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/brd/non-functional-requirements.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/brd/non-functional-requirements.md). Edit there; this page is generated.
:::

- **Status:** Accepted
- **Owner:** Engineering
- **Last updated:** 2026-10-04

These are the quality attributes the site must satisfy. They are enforced as CI gates where possible ([ADR 0012](/architecture/0012-testing-strategy/), [ADR 0009](/architecture/0009-ci-cd-github-actions/)).

## 1. Performance

- **Lighthouse ~100** for Performance (and the other categories), enforced via Lighthouse CI budgets against the built static output in CI. Regressions fail the build.
- **Core Web Vitals** within "good" thresholds on real-user data (Cloudflare Web Analytics):
  - **LCP** ≤ 2.5 s
  - **INP** ≤ 200 ms
  - **CLS** ≤ 0.1
- **JavaScript budget:** content pages ship **zero framework runtime by default**; client JS is limited to explicit islands (mobile nav, the search page's results-as-you-type module, form widgets) and kept minimal ([ADR 0002](/architecture/0002-frontend-framework-astro/), [ADR 0021](/architecture/0021-site-search-on-the-worker/)). Any new island that increases the shipped JS budget is justified in review.
- **Delivery:** static output, edge-cached globally on Cloudflare ([ADR 0006](/architecture/0006-hosting-cloudflare-edge/)); responsive, optimized images generated at build by Astro's image pipeline from git-committed sources kept under a byte budget ([ADR 0004](/architecture/0004-git-based-content-collections/)); modern formats; fonts loaded without layout shift.

> This document sets the intent (zero-JS-by-default, CWV "good", Lighthouse ~100); the numeric gates live in CI. Lighthouse CI (`lighthouserc.cjs`) enforces category-score thresholds and the CWV metric caps above, per page class; the raster byte budget is enforced separately by the image-pipeline check (`scripts/images.mjs`, run in CI as `pnpm images:check`). We do not restate those numeric budgets here.

## 2. Accessibility

- **WCAG 2.2 AA** conformance is the bar.
- Automated **axe** checks on key templates run in CI; failures gate merges.
- Requirements include: semantic landmarks and heading order; full keyboard operability with a visible focus indicator; color contrast meeting AA against the "Quarried" palette; meaningful `alt` text; accessible form labels, errors, and status messaging; respect for `prefers-reduced-motion`; motion that would run longer than five seconds starts only at the reader's request (WCAG 2.2.2 Pause, Stop, Hide).
- The grievance form ([ADR 0017](/architecture/0017-stakeholder-grievance-intake/)) is held to the brief's stricter bar: it must pass WCAG 2.2 AA **including the bot-challenge step** (invisible, no puzzle or checkbox), and it must be usable with JavaScript disabled — server-side validation with a focused error summary, `aria-invalid`/`aria-describedby`, and the visitor's text preserved.
- Automation is necessary but not sufficient — periodic manual audits (keyboard + screen reader) supplement it.

## 3. Security

- **No secrets in the repository.** Credentials live in GitHub Actions secrets: repository secrets for CI, and environment secrets for the Worker's runtime (e.g. `WORKER_TURNSTILE_SECRET`, `WORKER_RESEND_API_KEY`), which each deploy attaches to the Worker version — see `SECURITY.md`, [ADR 0008](/architecture/0008-infrastructure-as-code-terraform/).
- **Cloudflare WAF** in front of the site and form endpoints, including rate-limiting on `/api/*`; **Turnstile** on all submissions, verified server-side and failing closed in deployed builds: a missing `WORKER_TURNSTILE_SECRET` or an unreachable verifier answers 503 and logs the cause; only `astro dev` accepts submissions without the secret.
- **Server-side validation** on the `/api/*` form routes; no public read endpoints on the data tier ([ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/)). Their JSON responses carry HSTS, `X-Content-Type-Options`, and `Referrer-Policy` from the site's header source and are `Cache-Control: no-store`.
- **Grievance intake hardening** ([ADR 0017](/architecture/0017-stakeholder-grievance-intake/)): honeypot, server-signed dwell-time token, WAF burst limit plus a D1 throttle with progressive backoff, invisible Turnstile, conservative content heuristics; only unambiguous automation is rejected (and logged with its reason), everything else flagged is quarantined for human review; Astro's cross-site POST check (`Origin` must match) and the CSP's `form-action 'self'` cover the origin requirement. The two on-demand routes set the full security-header set themselves, with the CSP hash-pinned at runtime to the same contract as the static build, and are `Cache-Control: no-store`. Production builds run strict: a missing signing key takes the form offline (503) and a missing Turnstile secret quarantines, so misconfiguration never degrades silently. Acknowledgment emails go only to accepted submissions (a quarantined address is unverified), and a concern that involves the grievance owner is emailed to the backup's own inbox or to nobody, never to the shared alias.
- **Transport:** HTTPS everywhere (automatic TLS at the edge); a strict, reviewed **Content-Security-Policy** with **no `'unsafe-*'` source expression in any directive** — every inline script and style is SHA-256 hash-pinned at build, `object-src 'none'`, third-party UI confined to allowlisted iframes ([ADR 0015](/architecture/0015-strict-csp-via-build-time-script-hashes/)), and the one script Cloudflare injects at the edge (bot detection) running under a per-request nonce the Worker adds to `script-src` ([ADR 0019](/architecture/0019-per-request-csp-nonce-for-edge-injected-scripts/)) — plus standard security headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`) on every response, static and Worker-generated. Enforced as a CI gate (unit + build + e2e). Because the form endpoints are same-origin `/api/*` routes on the Worker, the CSP needs no cross-origin API allowance.
- **Dependencies:** pnpm with a committed frozen lockfile; Dependabot updates grouped, cooled down, and auto-merged by tier with post-deploy verification and rollback ([ADR 0018](/architecture/0018-dependency-update-policy/), [ADR 0020](/architecture/0020-platform-updates-move-as-one-reviewed-unit/)); majors and every platform update are human-reviewed.
- **Responsible disclosure:** security@quarry.team (`SECURITY.md`).

## 4. Privacy

- **No cookie/consent banner; no third-party tracking.** Analytics is cookieless Cloudflare Web Analytics ([ADR 0010](/architecture/0010-analytics-privacy-first/)).
- **Personal data** (contact/careers form submissions) is confined to the Cloudflare D1 data tier (the `form_submissions` table), with **point-in-time recovery via D1 Time Travel**, and is never exposed via a public endpoint. Each row stores the network prefix of the client address (IPv4 /24, IPv6 /48) and an HMAC of the full address keyed by `WORKER_FORM_SUBMISSIONS_IP_HASH_KEY`, never the address itself. **Retention:** 36 months after receipt, for the row and for the notification emails that relayed it; the Worker's daily retention job deletes the rows and the quarterly procedure the emails, both in the [data-retention runbook](/runbooks/data-retention/).
- **Grievance data** ([ADR 0017](/architecture/0017-stakeholder-grievance-intake/)) lives in D1 (`grievances`, `grievance_events`, `grievance_throttle`) and is mirrored to the Notion tracking log, which is restricted to the leadership group. Contact details are optional and anonymous submission is supported; raw IPs are never stored (an HMAC-keyed hash only). **Retention:** grievance records are kept three years after the concern is closed; event and throttle rows thirteen months. The daily retention job deletes event and throttle rows; grievance records are deleted by the quarterly procedure once the owner confirms closure; both are in the [data-retention runbook](/runbooks/data-retention/). Acknowledgments and notices never carry the submitted description.
- Data handling is consistent with Quarry's own client-facing data-practice positioning.

## 5. SEO

- Per-page canonical URLs, titles, meta descriptions, OG/Twitter cards.
- Valid **JSON-LD** (`Organization`, article/creative-work, breadcrumbs where relevant).
- Generated `sitemap-index.xml` referenced by `robots.txt`; `llms.txt` for AI discoverability.
- **URL continuity:** legacy `/cases/* → /work/*` 301s; `/blog/*` unchanged ([ADR 0011](/architecture/0011-seo-url-strategy-and-redirects/)).

## 6. i18n-readiness

- The site ships **English-only** in this phase, but is built to not preclude localization: no hardcoded copy baked into logic where avoidable, locale-tolerant routing assumptions, and a content model that could be extended per-locale. **No translated content is in scope now** (see PRD scope).

## 7. Browser support

- Current and previous major versions of evergreen browsers: **Chrome, Edge, Firefox, Safari** (desktop and mobile), including iOS Safari and Android Chrome.
- Progressive enhancement: core content and navigation work without JavaScript; islands enhance rather than gate; the grievance form submits and confirms with scripting disabled (asserted in e2e). No support obligation for legacy non-evergreen browsers (e.g. IE11).

## 8. Reliability & operability

- Public site has **no single point of failure** — prerendered assets served from Cloudflare's global edge.
- Infrastructure is reproducible via Terraform; deploys are automated and **rollback is defined** (`docs/runbooks/deploy.md`).
- The data tier (Cloudflare D1) has point-in-time recovery via Time Travel and a documented incident path (`docs/runbooks/incident-response.md`).


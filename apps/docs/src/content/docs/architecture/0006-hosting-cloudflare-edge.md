---
title: "Hosting on the Cloudflare edge"
description: "The legacy site ran as a single DigitalOcean droplet — one box that was a single point of failure, a patching obligation, and a CWV ceiling…"
sidebar:
  order: 6
---

<!-- GENERATED from docs/adr/0006-hosting-cloudflare-edge.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/adr/0006-hosting-cloudflare-edge.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/adr/0006-hosting-cloudflare-edge.md). Edit there; this page is generated.
:::

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Engineering, Platform

## Context

The legacy site ran as a single DigitalOcean droplet — one box that was a single point of failure, a patching obligation, and a CWV ceiling (single-region origin, manual TLS/cache config). For a static, globally-distributed firm whose site must rank and load fast everywhere, origin-on-a-box is the wrong shape.

Astro produces a static bundle ([ADR 0002](/architecture/0002-frontend-framework-astro/)), with images optimized at build from git-committed sources ([ADR 0004](/architecture/0004-git-based-content-collections/)). We want that bundle served from a global edge with first-class caching and a WAF — and we want the form endpoints and their data tier ([ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/)) on that same edge.

## Decision

The static site is hosted on the **Cloudflare edge**:

- The Astro site (built with the **@astrojs/cloudflare adapter**) deploys as a **Cloudflare Worker with Static Assets** — content pages are prerendered to static HTML and edge-cached, TLS and HTTP/3 are automatic. The same Worker also serves the same-origin form endpoints ([ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/)), backed by Cloudflare D1.
- **Cloudflare R2** holds the Terraform remote state backend ([ADR 0008](/architecture/0008-infrastructure-as-code-terraform/)).
- **Images** are optimized at build by Astro's image pipeline from git-committed sources ([ADR 0004](/architecture/0004-git-based-content-collections/)) and served as immutable hashed static assets by the Worker, edge-cached.
- **Cloudflare WAF + Turnstile** protect the site and the form endpoints.
- **Cloudflare DNS** is authoritative for the zone.
- **Cloudflare Web Analytics** provides privacy-first measurement ([ADR 0010](/architecture/0010-analytics-privacy-first/)).
- Redirects (legacy `/cases/<slug>` → `/work/<slug>` 301s — [ADR 0011](/architecture/0011-seo-url-strategy-and-redirects/)) are configured at the edge.

The stack is now fully Cloudflare: the same Worker that serves the static assets also handles the same-origin form endpoints, backed by Cloudflare D1 ([ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/)). There is no other runtime.

## Consequences

**Positive**

- Global, low-latency delivery with no origin server to patch or scale — directly serves our CWV goal.
- DNS, WAF, analytics, and redirects are one integrated, scriptable platform (Terraform-managed).
- No single point of failure for the public site; static assets are inherently resilient.
- Cost scales with traffic, not with an always-on droplet.

**Negative / costs**

- Concentration on one vendor for the public tier (mitigated: output is plain static and portable; DNS could move).
- Some Cloudflare features (Web Analytics, R2 state backend) have their own configuration and quotas to learn and codify.
- Form POSTs are now **same-origin** (handled by the same Worker), so there is no cross-origin CORS to configure and the CSP needs no `api.quarry.team` allowance.

## Alternatives considered

- **Keep the DigitalOcean droplet.** Single point of failure, manual ops, single-region latency, CWV ceiling. The status quo we left. Rejected.
- **Netlify / Vercel static hosting.** Both excellent for static/Astro. Cloudflare wins here because we also want the Workers runtime for the same-origin form endpoints, WAF, Turnstile, DNS, R2 (Terraform state), and Web Analytics from the _same_ provider, edge-integrated and Terraform-managed.
- **AWS (S3 + CloudFront).** Capable but more assembly and IAM overhead for the same outcome; weaker integrated privacy-analytics and Turnstile story. Rejected.
- **GitHub Pages.** No WAF, no Workers runtime for the same-origin form endpoints and D1 data tier, no redirects-as-config of the kind we need. Rejected.


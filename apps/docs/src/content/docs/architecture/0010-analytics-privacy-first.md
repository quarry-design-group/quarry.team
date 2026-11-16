---
title: "Privacy-first analytics"
description: "We need enough measurement to understand traffic, top content, and conversion funnels (qualified inquiry, careers application) without compromising…"
sidebar:
  order: 10
---

<!-- GENERATED from docs/adr/0010-analytics-privacy-first.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/adr/0010-analytics-privacy-first.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/adr/0010-analytics-privacy-first.md). Edit there; this page is generated.
:::

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Engineering, Design, Leadership

## Context

We need enough measurement to understand traffic, top content, and conversion funnels (qualified inquiry, careers application) without compromising visitor privacy or our own positioning. Quarry advises clients on responsible data practice; shipping a cookie-laden, third-party tracking stack — and the consent banner it forces — would contradict that and degrade the site's experience and Core Web Vitals.

## Decision

We use **Cloudflare Web Analytics** as the site's analytics, with **no cookie/consent banner**.

- Cloudflare Web Analytics is **cookieless** and does not fingerprint or track individuals across sites; it reports aggregate page and Core Web Vitals data via a lightweight beacon.
- Because no personal data is stored on the device and no cross-site tracking occurs, **no cookie-consent banner is required**, keeping the UI clean and CWV unaffected.
- It is already part of our Cloudflare platform ([ADR 0006](/architecture/0006-hosting-cloudflare-edge/)) — no third-party tag, no extra vendor.
- Conversion outcomes (inquiry, careers application) are recorded server-side in the data tier — the `/api/*` form routes on the Worker, persisting to Cloudflare D1 ([ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/)) — not via client-side tracking pixels.

## Consequences

**Positive**

- Aggregate traffic and real-user CWV without cookies, fingerprinting, or cross-site tracking.
- No consent banner — better UX, no CWV/CLS hit from a banner, simpler compliance posture.
- Analytics is first-party to our hosting platform; no third-party script in the critical path.
- Consistent with Quarry's data positioning — the site practices what we advise.

**Negative / costs**

- Less granular than a full product-analytics suite (no per-user journeys, cohorts, or session replay). Accepted — appropriate for a marketing site and aligned with our values.
- Funnel analysis must be assembled from edge analytics plus server-side conversion records rather than a single behavioral tool.

## Alternatives considered

- **Google Analytics 4.** Cookies/consent-banner burden, third-party data sharing, weight in the critical path, and a privacy story at odds with our brand. Rejected.
- **Self-hosted Plausible / Umami / Fathom.** Genuinely privacy-respecting and a fine choice; rejected only because Cloudflare Web Analytics gives us the same cookieless outcome with zero additional infrastructure, already inside our platform.
- **No analytics at all.** Leaves us blind to traffic and content performance for a conversion-driven site. Rejected.


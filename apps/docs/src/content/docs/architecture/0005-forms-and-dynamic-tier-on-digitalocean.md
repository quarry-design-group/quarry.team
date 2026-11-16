---
title: "Forms and the dynamic data tier on DigitalOcean"
description: "The site is static, but two flows are inherently dynamic and carry personal data: the contact / qualified-inquiry form (our primary conversion) and the…"
sidebar:
  order: 5
---

<!-- GENERATED from docs/adr/0005-forms-and-dynamic-tier-on-digitalocean.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/adr/0005-forms-and-dynamic-tier-on-digitalocean.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/adr/0005-forms-and-dynamic-tier-on-digitalocean.md). Edit there; this page is generated.
:::

- **Status:** Superseded by [ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/)
- **Date:** 2026-06-06
- **Deciders:** Engineering, Platform, Security

> **Superseded (2026-06-09) by [ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/).**
> The data tier moved from DigitalOcean App Platform + Managed Postgres to
> Cloudflare D1 + a same-origin Worker — one platform, a same-origin form
> endpoint (no cross-origin CORS), and effectively zero cost for a tiny,
> append-only lead log. This record is preserved unchanged as the original
> decision; see ADR 0014 for the current architecture and the reasoning behind
> the change.

## Context

The site is static, but two flows are inherently dynamic and carry personal data: the **contact / qualified-inquiry form** (our primary conversion) and the **careers application** (our secondary conversion). These produce leads we must capture reliably, store durably, protect, and operate against (review, export, retention).

We need a small, well-understood server tier with a real relational database — not a pile of serverless glue. We already operate DigitalOcean and have institutional familiarity with it.

## Decision

The controlled dynamic tier is a **Hono API on DigitalOcean App Platform** (`apps/api`), backed by **DigitalOcean Managed Postgres**.

- The static site posts form submissions to the Hono API over HTTPS.
- Submissions are protected by **Cloudflare Turnstile** (privacy-respecting CAPTCHA; token verified server-side) and server-side validation.
- Leads (contact + careers) are persisted in Managed Postgres — the single durable store for personal data, with backups and a defined retention policy (see `docs/brd/non-functional-requirements.md`).
- The API is intentionally small: validate, verify Turnstile, rate-limit, persist, notify. No public read endpoints.
- Cloudflare's WAF sits in front; secrets are injected via App Platform env vars, never committed ([ADR 0008](/architecture/0008-infrastructure-as-code-terraform/)).

## Consequences

**Positive**

- Personal data lives in one managed, backed-up relational store with clear ownership and retention.
- Familiar, debuggable operational model (App Platform + Managed Postgres) the team already runs.
- Clean separation: the public site stays fully static and edge-cached; only form POSTs touch the data tier.
- Turnstile gives spam protection without cookies or a third-party tracking surface, consistent with our privacy posture ([ADR 0010](/architecture/0010-analytics-privacy-first/)).

**Negative / costs**

- A second cloud (DigitalOcean) alongside Cloudflare to provision and monitor — accepted, and codified in Terraform ([ADR 0008](/architecture/0008-infrastructure-as-code-terraform/)).
- A managed Postgres instance to operate for a low write volume.
- Cross-origin POST from the edge site to the DO API requires explicit CORS and CSP allowances.

## Alternatives considered

- **Pure-edge with Cloudflare D1 + Workers.** Keeps everything on one platform and is attractive operationally. Rejected for the system of record because we want a mature, fully managed relational database with established backup/restore, familiar Postgres tooling, and no SQLite-at-edge constraints for the one place we store personal data. (We still use Cloudflare for everything stateless.)
- **Third-party form SaaS (Formspree, Basin, etc.).** Sends leads — including PII — through an external processor, weakening our data-control story for the exact flow that is our primary conversion. Rejected.
- **Email-only submission (mailto / SMTP relay).** No durable, queryable store; lossy; poor for careers pipeline. Rejected.
- **Serverless function + ad-hoc datastore.** Reintroduces glue and a less-owned data model than Managed Postgres. Rejected.


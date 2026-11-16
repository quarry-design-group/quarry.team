---
title: "Forms and the data tier on Cloudflare (D1 + Worker)"
description: "The site is static, but two flows are inherently dynamic and carry personal data: the contact / qualified-inquiry form (our primary conversion) and the…"
sidebar:
  order: 14
---

<!-- GENERATED from docs/adr/0014-forms-and-data-tier-on-cloudflare-d1.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/adr/0014-forms-and-data-tier-on-cloudflare-d1.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/adr/0014-forms-and-data-tier-on-cloudflare-d1.md). Edit there; this page is generated.
:::

- **Status:** Accepted
- **Date:** 2026-06-09
- **Deciders:** Engineering, Platform, Security

> **Supersedes [ADR 0005](/architecture/0005-forms-and-dynamic-tier-on-digitalocean/).** The
> original 2026-06-06 decision put the data tier on **DigitalOcean App Platform
> (a Hono Node service) backed by Managed Postgres**. The form-submissions store is a tiny,
> low-write, append-only, read-rarely workload; a managed Postgres on a _second_
> cloud was over-built for it. D1 keeps everything on one platform, makes the
> form endpoint same-origin (no cross-origin CORS), has Time Travel
> point-in-time backups, and costs ~nothing at this volume. Crucially, the
> privacy argument that rejected third-party form SaaS does **not** apply to D1:
> the data stays in infrastructure we own (Cloudflare), not a third-party
> processor. The `apps/api` package was deleted in this change.

## Context

The site is static, but two flows are inherently dynamic and carry personal data: the **contact / qualified-inquiry form** (our primary conversion) and the **careers application** (our secondary conversion). These produce submissions we must capture reliably, store durably, protect, and operate against (review, export, retention).

The workload itself is small and well-bounded: a handful of writes a day, append-only, read rarely (review/export). We want a durable, owned store and a minimal server surface — not a pile of serverless glue, but also not a managed relational database on a second cloud for what is effectively an append-only submission log.

## Decision

The data tier lives entirely on **Cloudflare**: the form endpoints are **same-origin Astro API routes** served by the site's **Cloudflare Worker**, and submissions persist in **Cloudflare D1** (SQLite at the edge).

- The Astro site uses the **@astrojs/cloudflare adapter** and deploys as a **Cloudflare Worker with Static Assets** ([ADR 0006](/architecture/0006-hosting-cloudflare-edge/)). Content pages stay prerendered to static HTML; only the form endpoints are on-demand.
- The two endpoints are same-origin API routes — `apps/web/src/pages/api/contact.ts` and `apps/web/src/pages/api/careers.ts` (both `export const prerender = false`), each exporting the `POST` and `ALL` handlers that `makeSubmissionRoute(kind)` in `apps/web/src/lib/submission-route.ts` builds. The browser POSTs to `/api/contact` and `/api/careers` on the **same origin** — no separate `api.quarry.team` subdomain, no cross-origin CORS, and no `api.quarry.team` allowance in the CSP.
- Shared submission logic lives in `apps/web/src/lib/form-submissions.ts` (Zod validation, honeypot check, Turnstile verification, D1 insert, Resend email + optional webhook notify), unit-tested in `form-submissions.test.ts`. Both forms render through `apps/web/src/components/SubmissionForm.astro`, whose one submit handler disables the button while a request is in flight and resets the Turnstile widget after each attempt.
- Submissions persist in **Cloudflare D1**, table `form_submissions` (schema in `apps/web/migrations/0001_form_submissions.sql` and `0003_form_submissions_ip_prefix_and_hash.sql`), bound to the Worker as `DB` and read from the `env` export of `cloudflare:workers`. This is the single durable store for personal data, with **Time Travel** backups.
- The client address is stored as two derived values: its network prefix in `ip` (IPv4 /24, IPv6 /48) and an HMAC-SHA256 of the full address in `ip_hash`, keyed by the Worker secret `WORKER_FORM_SUBMISSIONS_IP_HASH_KEY`. The key is distinct from the grievance intake's `WORKER_GRIEVANCE_SIGNING_KEY`, so hashes from the two stores never correlate; together the values support abuse triage without holding the address. A deployed Worker without the key stores the prefix, leaves `ip_hash` null, and logs an error.
- **Retention:** rows are deleted 36 months after receipt by a daily scheduled job: the Worker's cron trigger (`[triggers]` in `apps/web/wrangler.toml`) runs the `scheduled` handler in `apps/web/src/worker.ts`, which deletes every D1 row past its date-based term (`apps/web/src/lib/retention.ts`) and logs the counts. The notification emails that relayed them are deleted on the same term by the quarterly procedure; both are in the [data-retention runbook](/runbooks/data-retention/), and the NFR (§4) records the term.
- Spam protection is layered: **Cloudflare Turnstile** (privacy-respecting CAPTCHA; token verified server-side), a **honeypot** field, and **WAF rate-limiting** on the form endpoints. Verification fails closed in deployed builds: a Worker without `WORKER_TURNSTILE_SECRET` answers every submission 503 and logs the missing secret, and an unreachable verifier answers 503; only a development build (`import.meta.env.DEV`) skips verification. (Rate-limiting belongs at the WAF — a per-isolate in-memory limiter is a no-op across Worker isolates.)
- Notifications are **Resend email + an optional webhook**, env-gated and non-blocking. The email subject is plain text built from the raw values; HTML escaping applies to the body.
- Every on-demand JSON response carries HSTS, `X-Content-Type-Options`, and `Referrer-Policy` from the `/*` block of `public/_headers`, stamped by `src/middleware.ts`, and `Cache-Control: no-store`.
- Secrets are injected as Worker/Cloudflare secrets, never committed ([ADR 0008](/architecture/0008-infrastructure-as-code-terraform/)).

## Consequences

**Positive**

- Personal data lives in one owned, backed-up store (D1, Time Travel) with clear ownership and retention — and on the **same platform** as the rest of the stack.
- The form endpoint is **same-origin**: no CORS, no `api.quarry.team` subdomain, and a simpler CSP.
- One platform, one provider, one deploy model — no second cloud to provision, secure, or monitor.
- Clean separation is preserved: content pages stay fully static and edge-cached; only form POSTs hit the Worker and D1.
- Turnstile gives spam protection without cookies or a third-party tracking surface, consistent with our privacy posture ([ADR 0010](/architecture/0010-analytics-privacy-first/)).
- Cost is effectively zero at our volume.

**Negative / costs**

- D1 is SQLite-at-edge: fine for a low-write append-only submission log, but not the tool to reach for if this store ever grows into a high-write or heavily-relational workload (revisit then).
- Rate-limiting is no longer in app code — it must be configured deliberately at the WAF ([ADR 0008](/architecture/0008-infrastructure-as-code-terraform/)).
- The Worker now has an on-demand surface (the two endpoints) alongside static assets, versus a purely static deploy.

## Alternatives considered

- **DigitalOcean App Platform (Hono service) + Managed Postgres.** The original decision ([ADR 0005](/architecture/0005-forms-and-dynamic-tier-on-digitalocean/)). A mature, fully managed relational database is real, but it is over-built for a tiny, low-volume, append-only submission store: it adds a **second cloud** to provision and monitor, forces the form endpoint **cross-origin** (CORS + CSP allowances for `api.quarry.team`), and costs more than the workload warrants. Superseded by Cloudflare D1 + a same-origin Worker.
- **Third-party form SaaS (Formspree, Basin, etc.).** Sends submissions — including PII — through an external processor, weakening our data-control story for the exact flow that is our primary conversion. Rejected. (Note this objection does **not** apply to D1, where data stays in infrastructure we own.)
- **Email-only submission (mailto / SMTP relay).** No durable, queryable store; lossy; poor for the careers pipeline. Rejected.


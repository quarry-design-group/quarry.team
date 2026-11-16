---
title: "Stakeholder grievance intake: on-demand routes, quarantine over rejection, D1 with a Notion mirror"
description: "B Lab's PSG 3.1 requires a grievance procedure any stakeholder can access: safe, accessible, transparent; issues tracked and resolved; results reported…"
sidebar:
  order: 17
---

<!-- GENERATED from docs/adr/0017-stakeholder-grievance-intake.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/adr/0017-stakeholder-grievance-intake.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/adr/0017-stakeholder-grievance-intake.md). Edit there; this page is generated.
:::

- **Status:** Accepted
- **Date:** 2026-09-05
- **Deciders:** Principal, Engineering, Security

## Context

B Lab's PSG 3.1 requires a grievance procedure any stakeholder can access: safe, accessible, transparent; issues tracked and resolved; results reported to leadership; protection from retaliation. The internal brief (Notion, _Stakeholder Grievance Mechanism — Brief_) translates that into a public policy page with a native submission form, a tracking log in Notion with a defined status workflow, and a set of hard constraints on the form:

- usable by anyone, with no account and no existing relationship; anonymous submission explicitly allowed; WCAG 2.2 AA including the bot-challenge step; **usable without JavaScript where feasible**;
- hardened against a public, anonymous-capable endpoint's inevitable spam and bad-faith use, **without introducing barriers that exclude legitimate users**: no visual CAPTCHA, no account, no mandatory contact details;
- **quarantine, not silent deletion**: anything a filter flags goes to a queue a person reviews; every rejection is logged with its reason; the site never publicly confirms whether a submission was filtered;
- a grievance owner on the leadership team who is not the founder, a named backup for conflicts of interest, and a defined path when the concern involves the owner;
- acknowledgment within five business days, resolution or a substantive update within 30, and quarterly and annual reporting.

The existing form pipeline ([ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/)) is a static page whose inline script `fetch`es JSON to a same-origin `/api/*` route. It cannot meet the brief: without JavaScript the form does nothing, a validation error has nowhere to render, and a confirmation carrying a reference number has no way to reach a no-JS visitor. The site also had no server-rendered HTML routes at all, and its strict CSP ([ADR 0015](/architecture/0015-strict-csp-via-build-time-script-hashes/)) is delivered by a static `_headers` file that Cloudflare applies to static assets only, never to Worker responses.

## Decision

### 1. The grievance page and its confirmation render on demand

`/policies/grievances` and `/policies/grievances/received` are the site's first server-rendered HTML routes (`prerender = false`). The page owns its own POST:

- every GET stamps a **server-signed dwell-time token** (`<issued-at>.<HMAC over issued-at + hashed source address>`) into the form, so the timing check is a real signal rather than a client-set field, and a token harvested once cannot be replayed from another address (a visitor whose address changes mid-form gets the form back with their text intact and a fresh token);
- a POST is validated server-side; on error the page re-renders with an error summary (`role="alert"`, focused, linking to each field), `aria-invalid` and `aria-describedby` on the fields, and **the visitor's text intact**;
- on success it answers **303 → `/received?ref=GRV-…`** (POST → redirect → GET, so a refresh never resubmits) and the confirmation page renders the reference number as real HTML.

JavaScript is progressive enhancement only: it prevents a double submit and moves focus to the error summary. Everything else works with scripting disabled, which the e2e suite asserts in a `javaScriptEnabled: false` context.

### 2. Worker responses set their own security headers, with a runtime-hashed CSP

`apps/web/src/middleware.ts` (on-demand routes only) sets every header from the `/*` block of `public/_headers` on each HTML response, with the CSP's `__CSP_SCRIPT_HASHES__` / `__CSP_STYLE_HASHES__` tokens filled from the document's own inline scripts and styles (`apps/web/src/lib/csp-runtime.ts`, Web Crypto). The `_headers` source is inlined at build (`__HEADERS_SOURCE__` via `vite.define`), so it remains the single source of truth; a unit test pins the runtime collectors to the build injector's selection and encoding byte-for-byte, and the worker e2e project asserts a strict, violation-free policy on the served response. Responses are `Cache-Control: no-store`: each render carries a fresh token.

### 3. Intake: three rejections, everything else quarantined

`apps/web/src/lib/grievances.ts` runs honeypot → token → throttle → validation → Turnstile → content heuristics → persist → mirror → notify. Only three conditions **reject** a submission, each unambiguous evidence of automation or abuse and each **logged with its reason** to `grievance_events`:

| Rejected outright    | Why it is safe to reject                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| honeypot filled      | the field is hidden from humans and assistive technology; each hit also spends the source's hourly budget, so a run of hits ends in the throttle's backoff while a single hit (browser autofill can cause one) costs only the retry. The re-render echoes the posted value into the field, so resubmitting the re-rendered form trips it again. Autofill is kept off it on every axis autofill uses: the field is `display: none` (browsers do not fill invisible fields), its name and label match no address, identity, or URL heuristic, `autocomplete="off"` is set, and it carries the 1Password, LastPass, and Bitwarden ignore attributes |
| token missing/forged | every real render carries one; a stale token re-renders the form with the text preserved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| throttle exceeded    | progressive backoff (below), never a hard lockout; the page offers the email channel instead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Everything else a filter flags **quarantines**: the record is stored and mirrored with its reasons (`no_turnstile`, `turnstile_failed`, `turnstile_error`, `too_fast`, `link_heavy`, `blocklist`, `unexpected_script`) for the monthly human review, and the visitor sees the same confirmation either way. A **missing Turnstile token is a quarantine signal, not a rejection** — that is what makes the no-JS path honest.

- **Turnstile** is a **dedicated widget in invisible mode** (Terraform, `cloudflare_turnstile_widget.grievances`): the brief forbids any puzzle or checkbox on this form, and the managed widget used by the contact forms may show one. Without a configured secret verification is skipped only in `astro dev` and the local e2e run (matching the contact forms' dev behaviour); every built Worker, PR previews and staging included, runs in **strict mode** (unless the `GRIEVANCE_STRICT=0` var is set, which only the local e2e run does), where a missing Turnstile secret yields `turnstile_error` and a missing `WORKER_GRIEVANCE_SIGNING_KEY` takes the form offline with a 503 rather than signing tokens and hashing addresses with the public dev key. Misconfiguration is loud, never silent.
- **Rate limiting** is two layers: the WAF rule (3 POSTs / 10 s per IP, extended to this route) for bursts, and a D1-backed **per-source throttle** for the sustained rate: 5 **valid** submissions per rolling hour (validation mistakes never spend the budget, and the throttle runs after validation for that reason), then cooldowns of 15 min → 1 h → 6 h → 24 h that decay after a quiet day. When a cooldown ends the window starts fresh, so "try again in 15 minutes" is literally true and only a further burst escalates. A legitimate visitor on a shared network is slowed and told when to retry, never locked out.
- **Content heuristics** are conservative (≥3 links, a short spam vocabulary, a body whose letters are mostly non-Latin) and only ever quarantine.
- **Validation** is a person's mistake, not a signal: field-level messages, nothing logged.
- **Origin.** Astro's built-in cross-site POST protection (`security.checkOrigin`, on by default for on-demand routes) rejects a form POST whose `Origin` header does not match the request origin with a 403 before the intake runs — the brief's origin/CSRF requirement, with `form-action 'self'` in the CSP as the browser-side half.

### 4. D1 is the durable store; the Notion log is a working mirror

Every accepted or quarantined submission is written to D1 first (`grievances`, `grievance_events`, `grievance_throttle`; migration `0002_grievances.sql`), the one step that must succeed; a D1 failure re-renders the form with the visitor's text intact and a 503 notice rather than an error page. The Notion page (`Stakeholder Grievance Log`, written via the Notion API with a `data_source_id` parent) and the emails (Resend: a metadata-only notice to the owner, and an acknowledgment to the submitter when a contact was given **and the submission was accepted**) are best-effort; their failures are logged as events and the submission stands. A quarantined submission's address is unverified, so its acknowledgment — which says "this email counts" — is not sent by the machine but deferred to the human review (`ack_deferred` event); the procedure has the reviewer send it on release. Notices and acknowledgments never carry the description, which stays where access is controlled.

- **Reference numbers** are `GRV-YYYY-XXXXX` in Crockford base32, random rather than sequential, so the id leaks no volume.
- **Raw IPs are never stored.** `ip_hash` is an HMAC keyed by `WORKER_GRIEVANCE_SIGNING_KEY`: enough to correlate abuse, useless alone. An **anonymous** row carries no hash at all; the throttle table already holds it.
- **Retention** (recorded in the NFR): grievance records three years after closure, deleted from D1 and the log by the quarterly procedure once the owner confirms closure; events and throttle rows thirteen months, deleted by the Worker's daily retention job. Both are in the [data-retention runbook](/runbooks/data-retention/).

### 5. Conflicts of interest are routed by the form

The grievance owner is the Principal; the backup is the Principal Delivery Manager, who handles any concern that involves the Principal personally. The brief's draft asked for an owner who is not the founder. B Lab's PSG3.1 does not require that, and what the line was meant to secure, an alternate route when a concern involves the person handling grievances, is provided by the form instead: it carries an explicit **"this concern involves our Principal personally"** checkbox. When set, the Notion page's Owner is the backup and the notice goes to the backup's **own** inbox (`WORKER_GRIEVANCE_NOTIFY_BACKUP_TO`), never to the shared alias, which the owner reads; if that inbox is not configured, no email is sent at all and a `notify_skipped` event is logged, so misconfiguration fails towards silence rather than towards the owner. The log procedure restricts the page. The public wording is "it is not sent to the Principal": a routing commitment the code enforces, not a guarantee about what a Notion workspace owner could open, which the procedure says plainly. The public page names roles and an address, never people.

### 6. Deliberately out of scope for v1

File attachments (the brief requires a type allowlist, a size cap, and **malware scanning** before anything reaches the log; Cloudflare offers no native scanning for Worker uploads, so this means R2 plus a scanning vendor), multilingual versions, a whistleblower hotline, and third-party arbitration. Two further deviations from the brief's §5 controls: **per-fingerprint rate limiting** is not implemented — this zone has no Bot Management, so no JA4 or fingerprint fields are available to rules or to the Worker; the throttle keys on the hashed source address, with Turnstile and the content heuristics standing in. **Optional email verification** is not implemented; acknowledgments are sent only for accepted submissions, which removes the backscatter case, and click-to-verify stays on the improvement path. The page tells submitters that supporting documents are requested through a secure channel after acknowledgment. Recorded as the improvement path B Lab looks for.

### 7. Testing

A third Playwright project, `worker`, runs the built Worker under `wrangler dev` with a local D1 (migrations applied first) and covers what the static suite cannot: the on-demand render and token, server-side validation with preserved text, the 303 and the reference, the Worker-set headers and a violation-free CSP, the no-JS flow, the honeypot rejection with its logged reason, the legacy 301s, and the brief's acceptance criterion in the literal: **a scripted flood puts zero entries in the live log** (quarantined for `too_fast`, then throttled). Unit tests cover validation, the token, triage, the throttle policy, the Notion payload, the emails, and the handler's paths with an in-memory D1.

## Consequences

**Positive**

- The mechanism meets the brief as written: anonymous, no-JS, WCAG-conformant, hardened without barriers, quarantine rather than deletion, every rejection auditable, and the visitor never learns whether a submission was filtered.
- The static architecture is unchanged for every other page: two routes are dynamic, and they are the two that must be.
- One header contract for static and server-rendered HTML, verified by a parity test and by the e2e run against the real Worker.
- D1 ownership means a Notion or Resend outage loses nothing; the procedure covers reconciling the log from D1.

**Negative / costs**

- The Worker now serves HTML, not only JSON: two routes cost compute per request and cannot be edge-cached (by design). They are also outside the Lighthouse `staticDistDir` gate; the worker e2e project carries their contract instead.
- Two Turnstile widgets, two site keys, two secrets, one more Terraform apply, and three new Worker secrets (`WORKER_GRIEVANCE_SIGNING_KEY`, `WORKER_NOTION_TOKEN`, `WORKER_TURNSTILE_GRIEVANCES_SECRET`) plus the Notion vars in `wrangler.toml`.
- The e2e suite now depends on `wrangler dev` starting in CI (no auth needed in local mode).
- Quarantine only works if someone reviews it: the monthly review is a standing operational commitment, documented in the internal procedure — and since the machine does not acknowledge quarantined submissions, that review is also where a released concern gets its acknowledgment.
- The throttle's read-then-upsert is not atomic across concurrent POSTs from one source; the WAF burst rule bounds the overshoot.
- Strict mode means a production Worker missing `WORKER_GRIEVANCE_SIGNING_KEY` serves a 503 form instead of a working one. Loud by design.

## Alternatives considered

- **Static page + JSON `fetch` to `/api/grievances`, like the contact forms.** Simplest to build; fails the brief on no-JS (no validation re-render, no confirmation with a reference) and forces a client-set, forgeable timing field. Rejected.
- **Hybrid: static page, native POST to an API route that redirects on error.** Loses the visitor's text on every validation error — unacceptable for a grievance someone spent twenty minutes writing. Rejected.
- **Embedded form service or Notion Forms.** PII through a third-party processor (the objection in ADR 0014), no control over the accessibility of the challenge step, no quarantine model, no no-JS story. Rejected.
- **Reject everything the filters flag.** Cheaper to operate; explicitly forbidden by the brief, and a real grievance lost to a false positive is the worst outcome the mechanism can produce. Rejected.
- **Reuse the managed Turnstile widget with `appearance=interaction-only`.** No infra change, but managed mode can still surface a checkbox, and the brief wants invisible. Rejected.
- **Per-request nonces for the whole site via a Worker.** Would remove the runtime-hash step but regresses the static architecture (ADR 0015 already rejected it). Only the two dynamic routes need runtime hashing; the middleware does exactly that.
- **hCaptcha.** Comparable accessibility posture; Turnstile is already in the stack and its secret is synced by the Infra apply. Not adopted.
- **R2 uploads with a scanning vendor for attachments.** The right v1.1 design; deferred so v1 ships without a new storage tier and a new vendor relationship.


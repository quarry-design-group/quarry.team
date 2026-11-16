# Security Policy

Quarry takes the security of `quarry.team` and the data entrusted to it seriously. This document explains how to report a vulnerability and the practices we hold ourselves to.

## Reporting a vulnerability

**Please report security issues privately. Do not open a public GitHub issue or pull request for a vulnerability.**

- Email **security@quarry.team** with:
  - a description of the issue and its potential impact,
  - steps to reproduce (proof of concept if possible),
  - affected URL(s), component(s), or commit, and
  - any suggested remediation.

We aim to acknowledge reports promptly, keep you updated as we investigate, and credit good-faith researchers where appropriate.

### Responsible disclosure

We ask that you:

- give us a reasonable opportunity to investigate and remediate before any public disclosure;
- avoid privacy violations, data destruction, or service disruption while testing;
- only interact with accounts and data you own or have explicit permission to test;
- never access, modify, or exfiltrate other people's data (notably the contact/careers form-submission data).

Good-faith research conducted under this policy will not be pursued or reported.

## Supported versions

`quarry.team` is a continuously deployed site, not a versioned product. **Only the currently deployed production site is supported.** Fixes are rolled forward through the standard deploy pipeline ([ADR 0009](docs/adr/0009-ci-cd-github-actions.md)); there are no maintained legacy branches.

## Our practices

- **No secrets in the repository.** Credentials and keys live in GitHub Actions encrypted secrets, never in source: CI credentials as repository secrets, and the Worker's runtime secrets (e.g. `WORKER_TURNSTILE_SECRET`, `WORKER_RESEND_API_KEY`) as `staging`/`production` environment secrets that each deploy attaches to the Worker version ([ADR 0008](docs/adr/0008-infrastructure-as-code-terraform.md), [NFR §3](docs/brd/non-functional-requirements.md)).
- **Edge protection:** Cloudflare WAF in front of the site and form endpoints, with rate-limiting on `/api/*`; **Turnstile** on all submissions, verified server-side and failing closed in deployed environments: a Worker without its Turnstile secret, or a verifier it cannot reach, refuses the submission with a 503 ([ADR 0006](docs/adr/0006-hosting-cloudflare-edge.md), [ADR 0014](docs/adr/0014-forms-and-data-tier-on-cloudflare-d1.md)).
- **Data tier:** personal data (contact/careers form submissions) is confined to Cloudflare D1 (the `form_submissions` table) with point-in-time recovery via D1 Time Travel. Each row keeps the network prefix of the client address and an HMAC of it under a dedicated key, never the address itself, and is deleted 36 months after receipt by the Worker's daily retention job ([data-retention runbook](docs/runbooks/data-retention.md)); the same-origin `/api/*` routes expose no public read endpoints and apply server-side validation. Stakeholder grievances ([ADR 0017](docs/adr/0017-stakeholder-grievance-intake.md)) follow the same model (`grievances` tables, raw IPs never stored, three-year retention after closure under the same runbook) and are mirrored to an access-restricted Notion log; the intake is hardened by honeypot, a signed dwell-time token, two-layer rate limiting, invisible Turnstile, and content heuristics, and holds what it flags in quarantine for human review.
- **Transport & headers:** HTTPS everywhere with automatic TLS; a strict, reviewed Content-Security-Policy with **no `'unsafe-*'` source expression in any directive** — every inline script and style is SHA-256 hash-pinned at build, `object-src` is `'none'`, and third-party UI runs only in allowlisted iframes, never in our document ([ADR 0015](docs/adr/0015-strict-csp-via-build-time-script-hashes.md)); the one script Cloudflare injects at the edge (bot detection) runs under a per-request nonce the Worker adds to `script-src` ([ADR 0019](docs/adr/0019-per-request-csp-nonce-for-edge-injected-scripts.md)) — plus standard security headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors 'none'`) on every response, static and Worker-generated: `_headers` covers static assets, and the Worker stamps the same set on on-demand HTML and the transport, sniffing, and referrer headers on every other on-demand response, the `/api/*` JSON included; all of them are `no-store`. The policy is enforced by unit, build, and e2e gates, so a change that would weaken it fails CI.
- **Dependencies:** pnpm with a committed frozen lockfile. Dependabot keeps dependencies current under the policy in [ADR 0018](docs/adr/0018-dependency-update-policy.md) and [ADR 0020](docs/adr/0020-platform-updates-move-as-one-reviewed-unit.md): updates are grouped along coupling lines, held back by a cooldown (3/7/14 days for patch/minor/major; security updates skip it), and auto-merged only in tiers that the required checks and a post-deploy smoke with automatic rollback make safe — majors and every platform update always get a human. A Terraform provider bump merges on its own only when its pre-merge `terraform plan` shows no changes; that plan runs with read-only Dependabot credentials, so a provider Dependabot proposes never holds write credentials before it merges. The Cloudflare toolchain (`wrangler`, `miniflare`, `@cloudflare/*`) is exempt from cooldown, because its transitive vite plugin requires the newest wrangler; human review of every platform PR takes the place of the soak period. Every GitHub Action is pinned to a commit SHA. The `Security` workflow runs `pnpm audit --audit-level=high` on every push/PR and weekly. Where a patched version is only reachable transitively, we add a **vulnerable-range-scoped** `pnpm.overrides` entry (e.g. `"undici@>=7.0.0 <7.29.1": ">=7.29.1 <8"`) so it self-deactivates once upstream catches up; a weekly `Redundant override check` job (`pnpm audit:overrides`) flags any override the tree no longer needs so it can be removed rather than calcify. An advisory with **no patched release** is accepted only when the vulnerable code path is shown to be unreachable in how we run the package; it is then ignored by GHSA ID in `pnpm.auditConfig.ignoreGhsas`, recorded below, and removed as soon as a patch ships.
  - **Peer-provider pin:** `apps/web` and `apps/docs` declare `@emnapi/runtime` `^1.11.3` as a devDependency although no code imports it. `@astrojs/check` → `@astrojs/language-server` → `@astrojs/astro2tsx` pins `@emnapi/core` at exactly 1.11.3 and reaches the runtime only as a peer of `@napi-rs/wasm-runtime`. Without a provider in the importer, pnpm can fill that peer with the `@emnapi/runtime` 2.0 prerelease that rolldown's wasm32 binding brings into the graph. It did so in `apps/web` with astro 7.4.7, and `apps/docs` carries the same pin defensively. The cross-major core/runtime pair then throws when `@astrojs/check` loads, and `astro check` reports it as the package being missing. Keep the runtime on the same major as the core `astro2tsx` pins. Close a Dependabot major for `@emnapi/runtime` until `astro2tsx` moves to core 2.x. Remove the pin once no `@emnapi/runtime` ahead of that core's major remains in the lockfile, or once `@astrojs/check` no longer depends on `astro2tsx`.
  - **Accepted advisories:**
    - [`GHSA-ch52-4w7c-c8xp`](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) — `http-cache-semantics` ≤4.2.0 (all published versions) can serve one user's zeroed shared-cache entry to another via `max-stale`. Astro uses it only in `assets/build/remote.js`, to cache remote-image fetches during the build (imported solely by `assets/build/generate.js`); it is absent from the deployed Worker bundle, so no shared HTTP cache built on it serves visitors. Remove the ignore when a patched version is released.
- **Privacy by default:** cookieless analytics, no third-party tracking, no consent banner ([ADR 0010](docs/adr/0010-analytics-privacy-first.md)).
- **Email harvesting resistance:** addresses in page markup render through the zero-JS `Email.astro` component (HTML entity-encoded address + `mailto:`), backed by Cloudflare Scrape Shield email obfuscation at the edge — so plain-text scrapers and `mailto:` crawlers see encoded markup, not the address. The JSON-LD `Organization` record carries the general inbox by design, as the site's machine-readable contact point.

## If you accidentally commit a secret

Rotate the credential immediately in the appropriate provider/secret store, then notify the team. Removing it from history is necessary but **not** sufficient — assume any committed secret is compromised and rotate it. See [`docs/runbooks/incident-response.md`](docs/runbooks/incident-response.md).

---
title: Architecture
description: Architecture Decision Records for the quarry.team next-gen site.
sidebar:
  order: 0
  label: Overview
---

<!-- GENERATED from docs/adr/ — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored docs]
These records are generated from [`docs/adr/`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/adr). Edit the ADRs there; this index is generated.
:::

The significant, hard-to-reverse decisions behind the next-gen quarry.team site, captured as records in a lightweight Nygard-style format (Context / Decision / Consequences / Alternatives). The ADR process is defined in [ADR 0001](/architecture/0001-record-architecture-decisions/).

| #    | Decision | Status |
| ---- | -------- | ------ |
| 0001 | [Record architecture decisions](/architecture/0001-record-architecture-decisions/) | Accepted |
| 0002 | [Frontend framework: Astro](/architecture/0002-frontend-framework-astro/) | Accepted |
| 0003 | [Design tokens as the single source of truth](/architecture/0003-design-tokens-single-source-of-truth/) | Accepted |
| 0004 | [Git-based content collections](/architecture/0004-git-based-content-collections/) | Accepted |
| 0005 | [Forms and the dynamic data tier on DigitalOcean](/architecture/0005-forms-and-dynamic-tier-on-digitalocean/) | Superseded by [ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/) |
| 0006 | [Hosting on the Cloudflare edge](/architecture/0006-hosting-cloudflare-edge/) | Accepted |
| 0007 | [Styling: Tailwind v4 bridged to design tokens](/architecture/0007-styling-tailwind-v4-plus-tokens/) | Accepted |
| 0008 | [Infrastructure as code with Terraform](/architecture/0008-infrastructure-as-code-terraform/) | Accepted |
| 0009 | [CI/CD with GitHub Actions](/architecture/0009-ci-cd-github-actions/) | Accepted; amended 2026-11-14 (E2E and Lighthouse sharded behind gate checks, see [Amendment](/architecture/0009-ci-cd-github-actions/#amendment-2026-11-14-e2e-and-lighthouse-run-sharded-against-one-build)) |
| 0010 | [Privacy-first analytics](/architecture/0010-analytics-privacy-first/) | Accepted |
| 0011 | [SEO: URL strategy and redirects](/architecture/0011-seo-url-strategy-and-redirects/) | Accepted |
| 0012 | [Testing strategy](/architecture/0012-testing-strategy/) | Accepted |
| 0013 | [Pre-cutover staging environment and per-PR preview deployments](/architecture/0013-pre-cutover-staging-and-pr-previews/) | Accepted |
| 0014 | [Forms and the data tier on Cloudflare (D1 + Worker)](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/) | Accepted |
| 0015 | [A strict, hash-pinned Content-Security-Policy](/architecture/0015-strict-csp-via-build-time-script-hashes/) | Accepted |
| 0016 | [A `/policies` section for governance documents](/architecture/0016-policies-section-and-collection/) | Accepted |
| 0017 | [Stakeholder grievance intake: on-demand routes, quarantine over rejection, D1 with a Notion mirror](/architecture/0017-stakeholder-grievance-intake/) | Accepted |
| 0018 | [Dependency update policy: grouped, cooled-down Dependabot with tiered auto-merge and post-deploy rollback](/architecture/0018-dependency-update-policy/) | Accepted; §1 and the `platform` tier superseded by [ADR 0020](/architecture/0020-platform-updates-move-as-one-reviewed-unit/); amended 2026-10-25 (Terraform PRs must plan clean, see [Amendment](/architecture/0018-dependency-update-policy/#amendment-2026-10-25-terraform-provider-bumps-must-plan-clean)) |
| 0019 | [A per-request CSP nonce for the script Cloudflare injects at the edge](/architecture/0019-per-request-csp-nonce-for-edge-injected-scripts/) | Accepted |
| 0020 | [Platform updates move as one reviewed unit: explicit group exclusions, an uncooled Cloudflare toolchain](/architecture/0020-platform-updates-move-as-one-reviewed-unit/) | Accepted |
| 0021 | [Site search on the Worker, progressively enhanced](/architecture/0021-site-search-on-the-worker/) | Accepted |

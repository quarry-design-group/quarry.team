---
title: "Infrastructure as code with Terraform"
description: "Our infrastructure runs on a single provider — Cloudflare (Workers + Static Assets, D1, R2, Images, WAF, Turnstile, DNS, Web Analytics — ADR 0006, ADR…"
sidebar:
  order: 8
---

<!-- GENERATED from docs/adr/0008-infrastructure-as-code-terraform.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/adr/0008-infrastructure-as-code-terraform.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/adr/0008-infrastructure-as-code-terraform.md). Edit there; this page is generated.
:::

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Platform, Engineering, Security

## Context

Our infrastructure runs on a **single provider — Cloudflare** (Workers + Static Assets, D1, R2, Images, WAF, Turnstile, DNS, Web Analytics — [ADR 0006](/architecture/0006-hosting-cloudflare-edge/), [ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/)). Click-ops in the dashboard is unreviewable, undocumented, irreproducible, and a security risk (drift, orphaned resources, ad-hoc secrets). We need infrastructure that is versioned, reviewed, and reproducible across environments.

## Decision

All infrastructure is defined as **Terraform** in the `infra/` workspace: **one root configuration** (`infra/*.tf`: `main.tf` composes two reusable **modules**, `infra/modules/cloudflare-storage` and `infra/modules/cloudflare-web`; `github.tf` holds the generated environment secrets), with **one state file** (`quarry-team/production.tfstate`). `infra/environments/` holds the tfvars template.

- **Provider:** the **Cloudflare** provider for the whole stack, plus the **GitHub** provider (`integrations/github`) for one resource family: the Worker runtime secrets Terraform itself generates (the Turnstile widget secrets), written into the repository's `staging` and `production` environments, authenticated as an organization GitHub App installed on this repository alone, so no user token or expiry is involved (revised 2026-09-28). Terraform manages the stateful/config plane — zone, **D1 database**, R2 buckets, Turnstile widget, and the WAF + rate-limit rulesets. It does **not** manage cache policy: every hostname on this zone is Worker-served, and zone cache configuration has no effect on Worker responses, so cache headers are owned by `apps/web/public/_headers` (revised 2026-09-19; the zone cache ruleset this ADR previously claimed was retired as inert). The **Worker itself (plus its static assets and D1 binding) is deployed by `wrangler deploy` in CI** ([ADR 0009](/architecture/0009-ci-cd-github-actions/)), not by Terraform; DNS for the apex/`www` custom domains is bound by the Worker's custom-domain routes (wrangler), not a discrete DNS record.
- **State backend:** **Cloudflare R2** via its S3-compatible API (an `s3` backend pointed at R2). State stays inside infrastructure we already own; no extra state SaaS.
- **Environments:** production and staging share the root configuration and its state. Staging is co-provisioned inside the shared `cloudflare-web` module next to its production counterparts: the staging D1 database, the `staging_noindex` response-header ruleset, and the staging Access application and policy ([ADR 0013](/architecture/0013-pre-cutover-staging-and-pr-previews/)). One plan reviews both environments.
- **Secrets:** never committed. GitHub is the one inventory: provider credentials are repository secrets, and the Worker's runtime secrets are **environment secrets** (`staging`, `production`) that every deploy delivers with the Worker version (`wrangler deploy --secrets-file`; revised 2026-09-28). Secrets Terraform generates (the Turnstile widget secrets) are written into both environments as `github_actions_environment_secret` resources; the provider encrypts each value client-side, and plans read only metadata. Like every sensitive attribute, they are stored in state (R2). Terraform variables are marked `sensitive`.
- **Execution:** Terraform runs in CI ([ADR 0009](/architecture/0009-ci-cd-github-actions/)) — `plan` on pull requests for review, a weekly scheduled drift check, and `apply` only by deliberate manual `workflow_dispatch` from `main`. Application deploys (`wrangler deploy`) run independently on push to `main`; infrastructure is reconciled deliberately rather than on every merge, so an unreviewed plan can never destroy stateful resources.

## Consequences

**Positive**

- The entire config plane is reproducible, reviewable, and diffable in PRs.
- Staging and production are provisioned from one plan, so their resources change together in the same reviewed step.
- State lives in R2, inside owned infrastructure, S3-compatible and versionable.
- Onboarding and disaster recovery become "run the code," not "remember the clicks."

**Negative / costs**

- Terraform is still a learning and maintenance surface, though a single Cloudflare provider keeps it small.
- Two deploy tools split the source of truth: Terraform owns the config plane (zone, D1, R2, Turnstile, WAF/rate-limit) while `wrangler deploy` owns the Worker + static assets, including the cache headers in `apps/web/public/_headers`. The boundary must stay clear so neither fights the other over the same resource.
- State in R2 requires careful locking discipline (and the operational care any remote state demands).
- Provider schema changes occasionally require module updates.

## Alternatives considered

- **Click-ops in the dashboard.** Unreviewable, drift-prone, irreproducible, a security liability. Rejected — it is the problem.
- **Pulumi (IaC in TypeScript).** Attractive given our TS stack, but Terraform's Cloudflare provider maturity and the team's familiarity win for infra we must trust. Reasonable future revisit.
- **Wrangler-only (no Terraform for the config plane).** Wrangler deploys the Worker well, but it is not a substitute for reviewable plan/apply over the zone, D1, R2, Turnstile, and the WAF/rate-limit rulesets. We keep wrangler for the Worker and Terraform for the stateful/config plane. Rejected as the _sole_ tool.
- **Terraform Cloud / separate state SaaS.** Works, but adds a vendor when R2 (already in our stack) serves as an S3-compatible backend. Rejected for now.

Note: the prior two-cloud setup (Cloudflare + DigitalOcean) was simplified to a single Cloudflare provider when the data tier moved to D1 ([ADR 0014](/architecture/0014-forms-and-data-tier-on-cloudflare-d1/)).


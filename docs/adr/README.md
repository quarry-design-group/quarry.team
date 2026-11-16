# Architecture Decision Records

This directory holds the Architecture Decision Records (ADRs) for the next-gen `quarry.team` site. ADRs capture the _why_ behind the significant, hard-to-reverse choices in this repository.

Records use a lightweight Nygard-style format (Context / Decision / Consequences / Alternatives). The process itself — when to write an ADR, the lifecycle, and the conventions — is defined in [ADR 0001](0001-record-architecture-decisions.md).

## Index

| #    | Title                                                                                                                                                         | Status                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 0001 | [Record architecture decisions](0001-record-architecture-decisions.md)                                                                                        | Accepted                                                |
| 0002 | [Frontend framework: Astro](0002-frontend-framework-astro.md)                                                                                                 | Accepted                                                |
| 0003 | [Design tokens as the single source of truth](0003-design-tokens-single-source-of-truth.md)                                                                   | Accepted                                                |
| 0004 | [Git-based content collections](0004-git-based-content-collections.md)                                                                                        | Accepted                                                |
| 0005 | [Forms and the dynamic data tier on DigitalOcean](0005-forms-and-dynamic-tier-on-digitalocean.md)                                                             | Superseded by 0014                                      |
| 0006 | [Hosting on the Cloudflare edge](0006-hosting-cloudflare-edge.md)                                                                                             | Accepted                                                |
| 0007 | [Styling: Tailwind v4 bridged to design tokens](0007-styling-tailwind-v4-plus-tokens.md)                                                                      | Accepted                                                |
| 0008 | [Infrastructure as code with Terraform](0008-infrastructure-as-code-terraform.md)                                                                             | Accepted                                                |
| 0009 | [CI/CD with GitHub Actions](0009-ci-cd-github-actions.md)                                                                                                     | Accepted; amended 2026-11-14                            |
| 0010 | [Privacy-first analytics](0010-analytics-privacy-first.md)                                                                                                    | Accepted                                                |
| 0011 | [SEO: URL strategy and redirects](0011-seo-url-strategy-and-redirects.md)                                                                                     | Accepted                                                |
| 0012 | [Testing strategy](0012-testing-strategy.md)                                                                                                                  | Accepted                                                |
| 0013 | [Pre-cutover staging environment and per-PR preview deployments](0013-pre-cutover-staging-and-pr-previews.md)                                                 | Accepted                                                |
| 0014 | [Forms and the data tier on Cloudflare (D1 + Worker)](0014-forms-and-data-tier-on-cloudflare-d1.md)                                                           | Accepted                                                |
| 0015 | [A strict, hash-pinned Content-Security-Policy](0015-strict-csp-via-build-time-script-hashes.md)                                                              | Accepted                                                |
| 0016 | [A `/policies` section for governance documents](0016-policies-section-and-collection.md)                                                                     | Accepted                                                |
| 0017 | [Stakeholder grievance intake: on-demand routes, quarantine over rejection, D1 with a Notion mirror](0017-stakeholder-grievance-intake.md)                    | Accepted                                                |
| 0018 | [Dependency update policy: grouped, cooled-down Dependabot with tiered auto-merge and post-deploy rollback](0018-dependency-update-policy.md)                 | Accepted; partly superseded by 0020; amended 2026-10-25 |
| 0019 | [A per-request CSP nonce for the script Cloudflare injects at the edge](0019-per-request-csp-nonce-for-edge-injected-scripts.md)                              | Accepted                                                |
| 0020 | [Platform updates move as one reviewed unit: explicit group exclusions, an uncooled Cloudflare toolchain](0020-platform-updates-move-as-one-reviewed-unit.md) | Accepted                                                |
| 0021 | [Site search on the Worker, progressively enhanced](0021-site-search-on-the-worker.md)                                                                        | Accepted                                                |

## Authoring a new ADR

1. Copy the structure of an existing record (Title, Status, Date, Deciders, Context, Decision, Consequences, Alternatives considered).
2. Name it `NNNN-kebab-title.md` with the next number in sequence.
3. Open it as `Proposed` in a pull request; move to `Accepted` on merge.
4. Add a row to the index above.
5. Accepted records are append-only. A dated, clearly marked amendment or status note may be added to an Accepted record, and version-currency edits (a framework major, a renamed file) are made in place. A reversal is a new ADR, and the old record's status becomes `Superseded by NNNN`.

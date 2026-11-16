# 18. Dependency update policy: grouped, cooled-down Dependabot with tiered auto-merge and post-deploy rollback

- **Status:** Accepted; §1 and the `platform` tier superseded by [ADR 0020](0020-platform-updates-move-as-one-reviewed-unit.md); amended 2026-10-25 (Terraform PRs must plan clean, see [Amendment](#amendment-2026-10-25-terraform-provider-bumps-must-plan-clean))
- **Date:** 2026-09-05
- **Deciders:** Engineering, Platform

> **Partly superseded (2026-10-04) by [ADR 0020](0020-platform-updates-move-as-one-reviewed-unit.md).**
> The grouping in §1 did not hold: Dependabot's specificity scoring let the
> `prod` and `dev` groups take `@astrojs/*` and `@cloudflare/*` from `platform`,
> and cooldown kept wrangler behind the transitive vite plugin it must match.
> ADR 0020 adds explicit group exclusions, exempts the Cloudflare toolchain from
> cooldown, and makes every `platform` update review-tier. The rest of this
> record stands.

> **Amended (2026-10-25).** The `immediate` tier's Terraform row now waits for a
> clean `terraform plan`. Dependabot's Terraform PRs used to merge without one,
> and a provider default reached `main` unplanned. See the
> [Amendment](#amendment-2026-10-25-terraform-provider-bumps-must-plan-clean)
> at the end of this record.

## Context

Dependabot opens the dependency PRs for this repo ([ADR 0009](0009-ci-cd-github-actions.md) covers the pipeline they run through). Until now every one of them waited for a human to review, rebase, and merge, and three properties of the repo made that expensive:

- **Branch protection requires PRs to be up to date with `main`.** Each merge puts every other open PR behind, so N dependency PRs cost N full CI cycles (~17 minutes each, Lighthouse dominating) run one after another by an operator.
- **The Astro platform is coupled across Dependabot's groups.** `@astrojs/cloudflare` pins `@cloudflare/vite-plugin`, whose `wrangler` peer floor moves every few weeks; `wrangler` sat in the dev group, so the astro group PR failed typecheck until a separate bump landed. Three of the last four astro PRs failed this way.
- **`main` deploys straight to production.** Merging is shipping. Whatever merges without a human must be verified after it is live, and reversible without one.

Meanwhile the site has strong pre-merge gates (types, lint, unit, Playwright e2e, axe, Lighthouse budgets, strict CSP contract), a real staging environment, and versioned Workers with one-command rollback — the ingredients of a safe automated policy were already here.

## Decision

Dependency updates are automated with three layers, each defensible on its own; together they let most updates ship with no operator while keeping a human on the changes that have bitten before.

### 1. Grouping by coupling, and cooldowns

`.github/dependabot.yml` groups npm updates along coupling lines, not just dependency type:

| Group       | Members                                                             | Scope       |
| ----------- | ------------------------------------------------------------------- | ----------- |
| `platform`  | `astro`, `@astrojs/*`, `wrangler`, `@cloudflare/*`, `miniflare`     | minor+patch |
| `prod`      | every other production dependency                                   | minor+patch |
| `dev`       | every other development dependency                                  | minor+patch |
| `actions`   | all GitHub Actions (SHA-pinned; Dependabot maintains pin + comment) | all         |
| `terraform` | all providers (raises the committed `infra/.terraform.lock.hcl`)    | minor+patch |

Majors are never grouped; each arrives as its own PR. `@types/node` tracks the Node runtime line (`.nvmrc`), so Dependabot ignores its majors and the types move with the runtime upgrade. Cooldowns hold a release back until the ecosystem has had time to report regressions: 3 days for patches, 7 for minors, 14 for majors, 7 for actions and providers. Dependabot security updates bypass cooldown by design.

### 2. Tiered auto-merge with a bake window

`.github/workflows/dependabot-automerge.yml` classifies every Dependabot PR from `dependabot/fetch-metadata` and labels it `automerge:<tier>`:

| Tier        | Applies to                                                                           | Behaviour                                                                              |
| ----------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `immediate` | Actions minor/patch · Terraform minor/patch · dev minor/patch · any production patch | Auto-merge (squash) enabled on open. Required checks still gate the merge.             |
| `baked`     | Production minors outside the `platform` group                                       | A nightly job arms auto-merge once the PR has been open ≥ 3 days with no `hold` label. |
| `review`    | All majors · `platform` minors                                                       | Nothing automated. A human reviews and merges.                                         |

`hold` on any PR blocks arming at every tier. The bake window is a veto window, not a gate: nobody waits, but there is time to notice. Because branch protection requires up-to-date branches, a `nudge` job asks Dependabot to rebase any armed PR that is behind. It runs on every push to `main` — so one Dependabot PR merging rebases the rest and a queue drains in a single cascade — and again on the nightly schedule immediately after `bake`, so a PR armed overnight does not wait for unrelated repo activity to unstick it. The nudge comments as the `quarry-ci-cd` machine account through a fine-grained token scoped to this repository's pull requests (`DEPENDABOT_NUDGE_TOKEN`), because Dependabot acts on its comment commands only from a user with push access. The token expires within a year; the daily Machine token expiry workflow (`machine-token-expiry.yml`) reads its expiry and opens a `maintenance` issue once 30 days remain, or at once when the token is unset or rejected, and a rejected token fails the nudge. The train therefore advances without an operator and without depending on anything else being merged. Squash merges are used throughout because the signed-commits ruleset rejects rebase merges (GitHub cannot sign them).

### 3. Post-deploy verification with automatic rollback

The production deploy job records the live Worker version, deploys, then runs a short smoke against `https://quarry.team` (`tests/e2e/production.spec.ts`: every backbone route, crawl surface, strict-CSP header, the on-demand API route and grievance page, axe on the home page). On failure it rolls the Worker back to the recorded version with `wrangler rollback`, re-checks the site, and opens an `incident` issue with the run link. This protects human merges exactly as much as automated ones.

### Pinning

Every action reference in `.github/workflows` is pinned to a commit SHA with the version in a trailing comment. Dependabot updates the SHA and the comment together.

## Consequences

**Positive**

- Routine updates (the large majority) land with zero operator time; the platform and every major still get eyes.
- The coupling that broke the astro group is expressed in the config, so those bumps arrive as one green PR.
- Cooldowns mean the repo tracks the ecosystem at a small lag instead of at the edge.
- Production gains an automatic safety net for every deploy, not just dependency bumps.

**Negative / costs**

- Serial rebases still cost one CI cycle per open Dependabot PR after each merge. This is accepted: it runs asynchronously with nobody waiting. Grouping and cooldowns keep the PR count low.
- The bake window measures from PR creation; when Dependabot supersedes a PR (new number), the clock restarts. Conservative, and acceptable.
- A `hold` label is the only manual brake. Reviewers must know it exists (`CONTRIBUTING.md`).
- The smoke's rollback target is the newest deployment before the deploy; on the very first deploy there is none and the job can only open the issue.
- The nudge depends on a machine-account token with a one-year lifetime. Rotation is a yearly chore, prompted by the issue the Machine token expiry workflow opens; an expired token stops the train until it is replaced.

## Alternatives considered

- **Merge queue.** Solves the up-to-date serialisation properly, and is the natural successor to this design. Not adopted yet; revisit if the rebase cycles become the bottleneck.
- **Drop the up-to-date requirement.** Removes the serial cost but lets untested combinations reach `main`. Rejected; the cost of rebase cycles is accepted instead.
- **Nudge with the Actions token or a GitHub App.** Dependabot answers both with "only users with push access can use that command" ([dependabot-core#9147](https://github.com/dependabot/dependabot-core/issues/9147) tracks App support). Rejected by the platform; hence the machine-account token.
- **Update the branch ourselves.** The update-branch API needs no Dependabot permission, but a push by any other actor ends Dependabot's maintenance of that PR: no further rebases or supersedes without `@dependabot recreate`. Rejected.
- **Renovate.** More expressive (per-package rules, native `minimumReleaseAge`, automerge tiers in config). Rejected for now: Dependabot is already integrated with the security alerts, the ruleset exemptions, and the release-drafter label mapping, and the missing expressiveness is recovered by the small classification workflow.
- **Auto-merge production minors immediately.** Rejected: the platform's minors have shipped behaviour changes; the bake window and the platform carve-out capture most of the benefit with a veto.
- **No automation.** The status quo: an operator spends an hour a week walking a merge train. Rejected.

## Amendment (2026-10-25): Terraform provider bumps must plan clean

**Context.** The Infra workflow skipped Dependabot PRs, because a Dependabot-triggered run gets no Actions secrets, and none of the required checks touch Terraform. A Terraform minor or patch therefore auto-merged with no plan at all. Cloudflare provider 5.26.0 did, and it added defaulted `page`/`per_page` attributes to `cloudflare_turnstile_widget`. Every plan on `main` then proposed an in-place update that cascaded to the four Turnstile environment secrets. The first plan on the new provider was the weekly drift check, which went red twice before anyone noticed.

**Decision.** Terraform minors and patches stay in the `immediate` tier, but a clean plan now gates their merge:

- The Infra workflow's job is a **required status check**, **Terraform plan**. It runs on every PR, with no `paths` filter, because a path-filtered workflow never reports on the PRs it skips. Its first step plans only a same-repository PR that touches `infra/` or `infra.yml`, and passes every other PR in seconds. That step can fail, and the check with it, so the gate fails closed.
- A Dependabot PR (by PR author) that touches `infra/` or `infra.yml` gets a **strict** plan: `terraform plan -lock=false -detailed-exitcode`. Any diff exits 2, which fails the required check and holds the auto-merge that classification armed. This covers the `terraform` group, and also `actions` bumps of the actions in `infra.yml`. Human PR plans stay informational.
- The credentials for those plans are **Dependabot secrets** with the same names as the Actions secrets, and they hold **read-only** values: a Cloudflare token with every permission at Read, an R2 token with Object Read only on the state bucket, and a separate **Terraform Plan** GitHub App with Environments: read only. PR plans skip the state lock, so they never write to the bucket. `infra/README.md` lists the set.
- When the diff is expected provider churn, a maintainer reads the plan, merges the PR by hand past the red check, and dispatches `apply` from `main`. Unrelated live drift also fails the plan, and the PR waits until that drift is reconciled.

**Consequences.** A provider bump that changes nothing still lands with no operator. One that changes something stops at the PR, with its plan in the check's log, instead of turning the drift check red after the fact. The new provider binary runs with live credentials before merge, verified against the lockfile's registry hashes. After merge it already runs with read-write credentials (drift check, applies), so the pre-merge exposure is narrower than the post-merge one, not new. A release that is malicious at the publisher is caught by none of this. The Infra workflow now starts on every PR, about ten seconds for the gate step. The read-only credentials are three more things to rotate and keep in step with the read-write ones. A missing or rejected Dependabot secret fails the check rather than skipping it.

**Alternatives considered.** _`pull_request_target` or `workflow_run` with the full Actions secrets:_ both run privileged and still have to check out and initialise the PR head, the "pwn request" pattern. An actor check under `pull_request_target` can be spoofed, and a `workflow_run` result attaches to `main`'s commit rather than the PR's, so gating the merge would need hand-written commit statuses. Rejected. _Move Terraform to the `review` or `baked` tier:_ it brings back an operator step for every provider bump. The missed signal here was a red check nobody read, so a gate that waits on a human repeats the failure. Rejected.

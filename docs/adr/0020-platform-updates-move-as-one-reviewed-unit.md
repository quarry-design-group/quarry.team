# 20. Platform updates move as one reviewed unit: explicit group exclusions, an uncooled Cloudflare toolchain

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Engineering, Platform

> **Supersedes part of [ADR 0018](0018-dependency-update-policy.md):** its
> grouping and cooldown rules (§1) and its `platform` tier. The rest of ADR 0018
> (the bake window, the nudge, the post-deploy smoke and rollback, SHA pinning)
> stands.

## Context

[ADR 0018](0018-dependency-update-policy.md) created a `platform` Dependabot group (`astro`, `@astrojs/*`, `wrangler`, `@cloudflare/*`, `miniflare`) so that the Astro adapter and wrangler, whose versions are coupled through `@cloudflare/vite-plugin`, would always arrive in one pull request. In practice that never happened, for two independent reasons.

**1. Dependabot does not assign a dependency to the first matching group.** The documented rule is "if a dependency matches more than one rule, it's included in the first group that it matches." Since [dependabot-core#13044](https://github.com/dependabot/dependabot-core/pull/13044) (September 2025), the updater instead scores each group's _specificity_ for a dependency ([`pattern_specificity_calculator.rb`](https://github.com/dependabot/dependabot-core/blob/main/updater/lib/dependabot/updater/pattern_specificity_calculator.rb)). The behavior is undocumented and reported as a bug in [dependabot-core#14576](https://github.com/dependabot/dependabot-core/issues/14576).

| Group's match for the dependency         | Score |
| ---------------------------------------- | ----- |
| Exact name pattern (`astro`, `wrangler`) | 1000  |
| No `patterns` at all (`prod`, `dev`)     | 500   |
| `@cloudflare/*`                          | 98    |
| `@astrojs/*`                             | 95    |

A group drops a dependency when another group that contains it scores higher. A group without `patterns` never runs this check, so it never drops anything. With ADR 0018's configuration, that meant:

- Every `@astrojs/*` and `@cloudflare/*` package was taken from `platform` by `prod` or `dev`. The updater log for a run that opened a `prod` PR bumping the adapter records "Skipping @astrojs/cloudflare for group 'platform' - belongs to more specific group 'prod'", and the same for `@astrojs/mdx`, `starlight`, `rss`, `sitemap` and `check`. None of them has appeared in a `platform` PR since the policy took effect; four successive `prod` PRs carried them instead.
- `astro` and `wrangler` stayed in `platform` but were _also_ bumped by the type groups: `astro` 7.2.10 → 7.3.2 was proposed by both a `platform` PR and a `prod` PR, and `wrangler` 4.135.0 → 4.136.0 arrived through `dev`.

So `platform` in effect held only `astro`, `wrangler` and `miniflare`, and the adapter and wrangler never travelled together.

**2. Cooldown cannot hold a coupled pair together when one side is transitive.** `@astrojs/cloudflare` declares `@cloudflare/vite-plugin: ^1.53.0`. Any lockfile change to the adapter re-resolves the plugin to its newest release. Cooldown applies only to direct dependencies, so that newest release is taken immediately. Each plugin release raises its `wrangler` peer floor to the wrangler published alongside it (1.62.4 required `^4.146.0`; 1.62.5 `^4.147.0`). Wrangler, a direct dependency, waits out its 7-day minor cooldown, and Cloudflare releases it most days. So an adapter bump required a wrangler that cooldown was still withholding, and it would keep doing so. That adapter PR failed `astro check` on all five CI runs until wrangler was raised by hand.

The `platform` tier rule had a gap of its own: in `dependabot-automerge.yml` it came after the rule that marks direct development dependencies `immediate`, so a `platform` minor that `fetch-metadata` reports as `direct:development` (wrangler is a dev dependency) was armed for auto-merge instead of held for review.

## Decision

1. **The type groups exclude the platform set explicitly.** `prod` and `dev` carry `exclude-patterns` listing the same five patterns as `platform`. Exclusion is documented ("if a dependency matches both a pattern and an exclude-pattern, then it is excluded from the group") and is applied before Dependabot assigns any dependency to a group, so it does not depend on the specificity scoring. The platform set therefore lives in three lists in `.github/dependabot.yml`, and a comment there requires them to change together.
2. **The Cloudflare toolchain skips cooldown.** `cooldown.exclude` lists `wrangler`, `miniflare` and `@cloudflare/*`, so the weekly `platform` PR always carries the newest wrangler that a freshly resolved vite plugin can require. Everything else keeps the 3/7/14-day cooldowns.
3. **Every `platform` update is review-tier, patches included.** The classifier checks the `platform` group before any other npm rule. This replaces cooldown as the safeguard on the toolchain that runs in the deploy job with the Cloudflare API token: a person reads each update before it merges, instead of it shipping on green.

## Consequences

**Positive**

- The adapter, its integrations, Astro and wrangler arrive together in one PR. The peer-floor break that ADR 0018 set out to prevent, and that blocked the adapter PR, cannot occur through Dependabot.
- No dependency is proposed by two groups at once, which removes the duplicate PRs and the CI cycles they cost.
- The tier table matches what the classifier does.

**Negative / costs**

- A human now merges every `platform` PR, including patches that previously auto-merged. Expect about one a week; the platform group is small and weekly.
- Wrangler and the Cloudflare packages are taken without a soak period. A bad release can reach a PR the day it is published. The review tier and the required checks gate it, and the post-deploy smoke and rollback from ADR 0018 back it up.
- The platform patterns are repeated three times in `dependabot.yml`. A pattern added to `platform` but not to both `exclude-patterns` lists recreates the original problem for that package.
- The fix relies on documented `exclude-patterns` behavior, not on the specificity scoring. If Dependabot later honors first-match order as documented, the exclusions become redundant but harmless.

**Verification**

The first scheduled npm run after this lands should log `Checking specificity for @astrojs/cloudflare in group 'platform'` with no "Skipping … belongs to more specific group" line for any platform package, and should open no `prod` or `dev` PR containing one.

## Alternatives considered

- **Give `prod` and `dev` a `patterns: ['*']` entry.** This is the workaround suggested in dependabot-core#14576: the universal wildcard scores 1, so `platform` would win. Rejected because it depends on the undocumented scoring, which may change again.
- **Declare `@cloudflare/vite-plugin` as a direct dependency** so cooldown and the `platform` group cover it. Rejected: its patch releases (3-day cooldown) still raise the floor to a wrangler minor (7-day cooldown), so the two would still drift apart.
- **One cooldown for every semver level.** Rejected: it slows every other dependency to fix one coupled pair.
- **Drop cooldown altogether.** Rejected: cooldown protects the rest of the tree, and the toolchain gets a reviewer instead.
- **Renovate**, whose per-package rules and `minimumReleaseAge` express this directly. Still rejected for the reasons in ADR 0018. This change keeps Dependabot workable.

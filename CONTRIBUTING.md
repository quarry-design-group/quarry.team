# Contributing to quarry.team

Thanks for working on the next-gen `quarry.team`. This repo holds itself to the standard we sell — so contributions go through a deliberate, reviewed workflow. This guide covers how we work.

New to the codebase? Start with [`docs/runbooks/local-development.md`](docs/runbooks/local-development.md), then skim [`docs/adr/`](docs/adr/README.md) for the _why_.

## Contribution policy (external readers)

This repository is **source-available, not open source** ([LICENSE](LICENSE)): the code is public to be read, not to be reused, and **we do not accept external pull requests**. That said, eyes are welcome — if you spot a bug on the live site, a docs error, or broken behavior, please [open an issue](https://github.com/quarry-design-group/quarry.team/issues). Security findings go to [`SECURITY.md`](SECURITY.md) (security@quarry.team), never a public issue. Everything below this section describes how **Quarry engineers** work in this repo.

## Prerequisites

- Node `24` LTS (`.nvmrc`; `engines` requires `>= 22.23.4`). Use `nvm use`.
- pnpm `10.14.0` (pinned via `packageManager`; run `corepack enable`).
- Write access to `quarry-design-group/quarry.team` (Quarry engineers; external readers can clone and run everything locally without it).

```bash
pnpm install
pnpm tokens
pnpm dev
```

## Workflow

1. **Branch** off the default branch (don't commit to it directly).
2. **Make focused changes** — one logical change per PR.
3. **Run the gates locally** before pushing:
   ```bash
   pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
   ```
4. **Open a PR.** CI runs the full validate suite. A PR that touches the site or the docs also gets an ephemeral **Cloudflare Workers preview** (a `versions upload`, served at a per-PR preview URL; the preview workflows are path-filtered) ([ADR 0013](docs/adr/0013-pre-cutover-staging-and-pr-previews.md)).
5. **Get a review**, address feedback, and squash-merge once required checks pass. A merge to `main` that touches the site triggers a `wrangler deploy` behind the environment gate variables, followed by a post-deploy smoke that rolls the Worker back on failure ([ADR 0018](docs/adr/0018-dependency-update-policy.md)); infrastructure changes are applied separately via a gated manual Terraform run ([deploy runbook](docs/runbooks/deploy.md)).

## Branch strategy

- `main` (default) is protected; it ships via the pipeline. No direct pushes. PRs land by **squash merge** — one signed commit per PR, titled from the PR title; the signed-commits ruleset rejects rebase merges.
- Branch names follow [Conventional Branch](https://conventionalbranch.org/): `<type>/<short-kebab-desc>`, where `<type>` is any Conventional Commit type below — `feat/`, `fix/`, `perf/`, `docs/`, `style/`, `refactor/`, `test/`, `build/`, `ci/`, `chore/`, `content/`.
- A repository ruleset rejects non-conforming branch names at push (`dependabot/**` is exempt) — name the branch before its first push.
- **Dependabot PRs** are labelled by tier and mostly merge themselves ([ADR 0018](docs/adr/0018-dependency-update-policy.md), [ADR 0020](docs/adr/0020-platform-updates-move-as-one-reviewed-unit.md)): `automerge:immediate` merges on green, `automerge:baked` arms after a 3-day soak, `automerge:review` waits for you (majors, and every `platform` update: Astro, its integrations, wrangler, and the Cloudflare toolchain, which skips cooldown). Add `hold` to any Dependabot PR to stop it merging. A Dependabot PR that touches `infra/` must also plan `No changes`: its **Terraform plan** check is strict, so a provider bump that would change anything stops red; read the plan, and if the diff is expected, merge by hand and dispatch `apply` from `main` ([infra/README.md](infra/README.md#provider-versions)). When you add a pattern to the `platform` group in `.github/dependabot.yml`, add it to the `exclude-patterns` of `prod` and `dev` too. The tier labels and `hold` live in the repository's settings; a from-zero rebuild creates them in [bootstrap §1](docs/runbooks/bootstrap.md#1-create-the-repository-secrets). `@types/node` tracks the Node runtime line, so its majors are ignored and move with the runtime upgrade.
- Keep branches small, short-lived, and rebased on the latest default branch.

## Conventional Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <summary>

[optional body]
[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `content`.

Examples:

```
feat(work): add filterable case-study index
fix(forms): verify Turnstile token before persisting submission
docs(adr): add ADR 0011 for SEO url strategy
content(blog): publish "zero-JS by default"
```

Scopes commonly map to workspaces/areas: `web`, `ui`, `api`, `infra`, `tokens`, `forms`, `work`, `blog`, `docs`.

## Engineering narrative

All engineering narrative — commit messages, PR titles and bodies, review and issue comments, ADRs, runbooks, release notes, code comments — is clinical and written in the author's voice: state what changed and why. Text that addresses the author as if by an assistant ("as requested", "I've implemented…"), or that references the conversation or session that produced a change, does not ship. AI-agent involvement is recorded solely as a `Co-Authored-By:` commit trailer (`AGENTS.md` §6).

## PR checklist

Before requesting review, confirm:

- [ ] Branch is focused and rebased on the latest default branch.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` pass locally.
- [ ] e2e/a11y/Lighthouse implications considered; budgets respected ([ADR 0012](docs/adr/0012-testing-strategy.md)).
- [ ] No secrets, keys, or credentials added (see [`SECURITY.md`](SECURITY.md)).
- [ ] `tokens.css` / `figma.tokens.json` not hand-edited; if tokens changed, `pnpm tokens` was run and all three files committed.
- [ ] If anything under `docs/` changed, `pnpm --filter @quarry/docs sync` was run and the regenerated `apps/docs` pages committed (CI fails on drift).
- [ ] Did not modify generated artifacts by hand (`AGENTS.md` §5).
- [ ] Content images within budget (`pnpm images:check`; the pre-commit hook normalizes staged images automatically).
- [ ] Docs/ADRs updated if behavior or decisions changed.
- [ ] Conventional Branch name and Conventional Commit messages; PR narrative is clinical, author-voice, and explains the _why_.
- [ ] Preview deploy reviewed where one was published.

## Code style

- **TypeScript strict** everywhere: the apps extend `astro/tsconfigs/strict`; the packages and the Playwright suite extend [`tsconfig.base.json`](tsconfig.base.json) (the suite through the root [`tsconfig.json`](tsconfig.json)). `pnpm typecheck` covers all of them. No `any` escape hatches without justification.
- **ESLint + Prettier** are the law; `lint-staged` auto-fixes staged files on commit via the Husky hook. Don't fight the formatter.
- **Design system:** use semantic design tokens, never raw hex/px ([ADR 0003](docs/adr/0003-design-tokens-single-source-of-truth.md), [design system guide](docs/guides/design-system.md)).
- **Zero-JS by default:** add a client island only when interactivity genuinely requires it, and justify the JS cost ([ADR 0002](docs/adr/0002-frontend-framework-astro.md)).
- **Accessibility is not optional:** semantics, keyboard support, focus states, contrast (WCAG 2.2 AA).
- **Respect ownership boundaries:** content in `apps/web/src/content`, tokens in `packages/ui/tokens`, infra in `infra/`, etc.

## Adding a case study or blog post

Content is git-based MDX validated by Zod ([ADR 0004](docs/adr/0004-git-based-content-collections.md)). Two paths:

- **Directly (current path):** add an `.mdx` file under `apps/web/src/content/{cases,posts}` per the [content authoring guide](docs/guides/content-authoring.md), run `pnpm typecheck`, and open a PR.
- **Git-CMS UI** (non-developers) — _planned, not yet built_ (ADR 0004): a form-and-preview admin route that commits and opens a PR for you. Until it ships, use the direct path.

Rules: keep slugs stable (migrated blog slugs must match legacy `/blog/<slug>`), provide `alt` text on all images, commit images under the enforced size budget (≤2560px long edge, ≤900 KB — the pre-commit hook and CI's `Image budgets` check enforce it; run `pnpm images:fix`), and set `draft: false` only when ready to publish. The build generates the optimized, display-sized derivatives. Full workflow: [`docs/runbooks/content-editing.md`](docs/runbooks/content-editing.md).

## Reporting issues

- **Bugs / features:** open an issue with clear repro steps or rationale.
- **Security vulnerabilities:** do **not** open a public issue — see [`SECURITY.md`](SECURITY.md) (security@quarry.team).

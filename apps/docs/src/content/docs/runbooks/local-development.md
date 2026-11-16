---
title: "Runbook: Local development"
description: "Get the next-gen quarry.team running locally."
sidebar:
  order: 2
---

<!-- GENERATED from docs/runbooks/local-development.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/runbooks/local-development.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/runbooks/local-development.md). Edit there; this page is generated.
:::

Get the next-gen `quarry.team` running locally.

## Prerequisites

- **Node.js** — use the version pinned in `.nvmrc` (`24`, the current LTS line). `engines` requires `node >= 22.23.4`. With nvm: `nvm use`.
- **pnpm** — this repo pins `pnpm@10.14.0` via `packageManager` (Corepack will honor it). `engines` requires `pnpm >= 9`. Enable Corepack with `corepack enable` if needed.
- **Git**, and a clone of `quarry-design-group/quarry.team`.

## First-time setup

```bash
# from the repo root
pnpm install            # installs all workspaces (frozen lockfile in CI)
pnpm tokens             # build design tokens: tokens.json -> tokens.css + figma.tokens.json
```

`pnpm install` runs `husky` to set up git hooks (`prepare`). `lint-staged` will lint/format staged files on commit.

## Running the site

```bash
pnpm dev                # @quarry/web Astro dev server
pnpm dev:docs           # @quarry/docs (apps/docs) dev server
```

Open the URL Astro prints. Editing content in `apps/web/src/content` or components hot-reloads.

## Common scripts

| Command                                    | What it does                                                                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                 | Run the web app dev server (`@quarry/web`)                                                                                                                                                      |
| `pnpm build`                               | Build tokens (`@quarry/ui`) then the web app (`@quarry/web`)                                                                                                                                    |
| `pnpm build:web` / `pnpm build:docs`       | Build a single app                                                                                                                                                                              |
| `pnpm preview`                             | Serve the built static site (`dist/client`) with sirv — run `pnpm build` first; static pages only                                                                                               |
| `pnpm --filter @quarry/web preview:worker` | Run the built Worker under `wrangler dev` on port 8788 against a local D1 — the on-demand routes (`/api/*`, `/policies/grievances`) and the Worker-set headers included; run `pnpm build` first |
| `pnpm tokens`                              | Rebuild design tokens (`tokens.json` → `tokens.css` + `figma.tokens.json`)                                                                                                                      |
| `pnpm typecheck`                           | TypeScript strict + `astro check`, all packages                                                                                                                                                 |
| `pnpm lint`                                | ESLint (cached)                                                                                                                                                                                 |
| `pnpm format` / `pnpm format:check`        | Prettier write / check                                                                                                                                                                          |
| `pnpm test`                                | Vitest unit tests (`@quarry/web`, `@quarry/ui`)                                                                                                                                                 |
| `pnpm test:e2e`                            | Playwright end-to-end tests — run `pnpm build` first: both web servers (sirv for the static site, `wrangler dev` for the Worker) serve the built `apps/web/dist`                                |
| `pnpm images:check` / `pnpm images:fix`    | Check / normalize committed content rasters (≤2560px, ≤900 KB, no EXIF/XMP, black-and-white roster avatars)                                                                                     |
| `pnpm --filter @quarry/docs sync`          | Regenerate the docs-site mirror from `docs/`                                                                                                                                                    |
| `pnpm sync`                                | `astro sync` — regenerate content-collection types                                                                                                                                              |
| `pnpm audit:overrides`                     | Flag `pnpm.overrides` the lockfile no longer needs                                                                                                                                              |
| `pnpm generate:og`                         | Regenerate the Open Graph images under `apps/web/public/og/`                                                                                                                                    |
| `pnpm clean`                               | Remove build output and caches                                                                                                                                                                  |

## Editing design tokens

Tokens are the source of truth ([ADR 0003](/architecture/0003-design-tokens-single-source-of-truth/)). Edit `packages/ui/tokens/tokens.json`, then `pnpm tokens` to regenerate `tokens.css` and `figma.tokens.json` (the pre-commit hook does this when `tokens.json` is staged). **Never hand-edit the generated files** — CI checks they are fresh. Details: [design system guide](/guides/design-system/).

## Editing docs

`docs/` is the source; the docs site under `apps/docs/src/content/docs/` is a generated mirror. After editing anything under `docs/`, run `pnpm --filter @quarry/docs sync` and commit the regenerated pages — CI fails on drift. Never edit the mirror by hand.

## Before you push

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm --filter @quarry/web build      # the adapter build (and the CSP hash injection) must succeed
```

This mirrors the core CI validate gates ([ADR 0009](/architecture/0009-ci-cd-github-actions/)) and saves a round trip.

CI shards the two long suites. To reproduce one shard against a local build, pass the same split: `pnpm test:e2e --shard=1/2` for Playwright, and `LIGHTHOUSE_SHARD=1/3 pnpm dlx @lhci/cli@0.15.1 autorun` for Lighthouse (unset, it runs every URL). The shard counts are the `shard` matrices in `.github/workflows/ci.yml`. See [`../../CONTRIBUTING.md`](https://github.com/quarry-design-group/quarry.team/blob/main/CONTRIBUTING.md) for branch and commit conventions.

## Troubleshooting

- **Type errors about content frontmatter** → a Zod schema mismatch; fix the frontmatter (see [content authoring guide](/guides/content-authoring/)).
- **`tokens.css` / `figma.tokens.json` shows as changed in git unexpectedly** → run `pnpm tokens` and commit the regenerated files; don't edit them by hand.
- **`apps/docs/src/content/docs/**` shows as changed, or CI's "Docs mirror is in sync" step fails** → run `pnpm --filter @quarry/docs sync` and commit; the mirror is generated from `docs/`.
- **Wrong Node/pnpm version** → `nvm use`; `corepack enable`.
- **Playwright "browser not installed"** → run `pnpm exec playwright install`.
- **`pnpm test:e2e` waits, then fails with a webServer timeout** → there is no `apps/web/dist` to serve; run `pnpm build`, then re-run the tests.


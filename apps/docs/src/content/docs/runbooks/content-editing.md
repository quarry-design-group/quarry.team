---
title: "Runbook: Content editing"
description: "How to author and edit case studies and blog posts. Content is git-based (ADR 0004); there is no CMS server and no external content API. Authoring…"
sidebar:
  order: 3
---

<!-- GENERATED from docs/runbooks/content-editing.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/runbooks/content-editing.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/runbooks/content-editing.md). Edit there; this page is generated.
:::

How to author and edit case studies and blog posts. Content is git-based ([ADR 0004](/architecture/0004-git-based-content-collections/)); there is no CMS server and no external content API. Authoring today is done by editing MDX directly (Path A); a git-CMS UI for non-developers is **planned but not yet built** (Path B). Field-level reference: [`../guides/content-authoring.md`](/guides/content-authoring/).

## Where content lives

```
apps/web/src/content/
  cases/     # case studies  -> /work/<slug>
  posts/     # blog posts     -> /blog/<slug>
  roles/     # open roles     -> /careers/<slug>
  services/  # capabilities   (services.json)
  team/      # people / authors (team.json)
  policies/  # governance + legal documents -> /policies/<slug>
```

Cases, posts, roles and policies are MDX files whose frontmatter is validated by a Zod schema (`apps/web/src/content.config.ts`); services and team are JSON data files (`services.json`, `team.json`) validated by the same schemas. **Invalid or missing required fields fail the build** — broken content cannot ship.

## Path A — Edit MDX directly (current path)

1. Create a branch.
2. Add or edit an `.mdx` file in the correct collection folder. Use an existing entry as a template.
3. Fill in frontmatter per the [authoring guide](/guides/content-authoring/). Set `draft: true` while a piece is in progress.
4. Add images alongside the entry — they're committed to the repo under an enforced size budget (see the guide); the build generates the optimized derivatives.
5. Run locally: `pnpm dev` to preview, `pnpm typecheck` to validate frontmatter against the schema.
6. Open a PR. CI validates and publishes a preview. Merge to publish.

## Path B — Git-CMS UI (planned; not yet available)

> **Not implemented yet.** [ADR 0004](/architecture/0004-git-based-content-collections/) adopts a git-based CMS (Decap CMS, with Sveltia CMS as the alternative) mounted at an admin route, to give non-developers a form-and-preview UI. It has not been built — there is no admin route or CMS dependency in the repo today. Until it ships, use Path A. The intended flow, once implemented, is:

1. Sign in to the admin route.
2. Pick a collection (Cases, Posts, …) and **New** or edit an existing entry.
3. Fill the form fields (these map 1:1 to frontmatter), write the body, and add images.
4. Save. The CMS commits to a branch and opens/updates a pull request.
5. A reviewer approves; merge triggers the deploy pipeline. A preview deploy is available on the PR before publish.

The design goal: non-developers never touch git directly, but every change still flows through review and history.

## Adding images

- Images are committed to the repo alongside content (`apps/web/src/{content,assets}`) under an enforced size budget; **Astro's build generates the optimized, display-sized derivatives**, served as immutable hashed static assets by the Worker ([ADR 0004](/architecture/0004-git-based-content-collections/), [ADR 0006](/architecture/0006-hosting-cloudflare-edge/)).
- Provide meaningful `alt` text for every image (accessibility is a gate — see the NFR doc).
- **Image budgets are enforced.** Committed content rasters (`apps/web/src/{content,assets}`) must be ≤2560px long edge and ≤900 KB each — sources feed Astro's pipeline, which generates the display-sized derivatives, so oversized originals only bloat the repo. The pre-commit hook auto-normalizes staged images; if CI's `Image budgets` check ever flags one, run `pnpm images:fix` and re-commit. (Genuine exceptions go in the ALLOWLIST in `scripts/images.mjs`, with a reason.)
- **No animated GIF.** A GIF costs materially more bytes than the same clip as animated WebP and looks worse doing it (256-colour palette), so the `Image budgets` check **rejects any `.gif`**. Ship motion as animated WebP instead (same ≤900 KB budget), placed with the `<Motion>` component so the reader starts it. See [content-authoring](/guides/content-authoring/) for how.

## Publishing checklist

- [ ] Required frontmatter complete and valid (`pnpm typecheck` passes).
- [ ] `draft: false` when ready to publish.
- [ ] Slug is correct and stable. For blog posts migrated from the legacy site, the slug **must** match the legacy `/blog/<slug>` to preserve SEO.
- [ ] For a policy: `updated` bumped, `summary` inside the 70-160 window, `owner` is a role not a name.
- [ ] Images have alt text and pass the size budget (run `pnpm images:fix` if CI's `Image budgets` check flags one).
- [ ] Preview deploy reviewed.

## Common pitfalls

- **Build fails after editing frontmatter** → a required field is missing or mistyped; read the schema error and the authoring guide.
- **Post not appearing** → still `draft: true`. The date field is `publishedDate`, and there is no scheduled publishing: a post with a future `publishedDate` renders as soon as it merges, so keep unpublished work at `draft: true`.
- **Broken blog URL after migration** → slug changed; restore the legacy slug or add a redirect ([ADR 0011](/architecture/0011-seo-url-strategy-and-redirects/)).


# 4. Git-based content collections

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Engineering, Content, Design Systems

## Context

The legacy site sourced content from an external, server-backed CMS. That gave us: a server to patch and secure, a database to back up, a plugin surface to audit, a render step coupled to an external API, and content that lived outside the repository's review and history. For a static, craft-first site, most of that was liability without matching benefit.

Our content is structured and relatively low-volume but high-care: curated **case studies** (`apps/web/src/content/cases`), **blog posts** (`posts`), open **roles** (`roles`), governance **policies** (`policies`), **services** (`services`), and **team** profiles (`team`). It must be typed (no broken frontmatter shipping to production), versioned, and reviewable in the same flow as code.

## Decision

Content lives **in the repository in Astro Content Collections**, with **Zod schemas** validating every entry at build time. Six collections are defined in `apps/web/src/content.config.ts`: `cases`, `posts`, `roles` and `policies` are MDX files with Zod-validated frontmatter ([ADR 0016](0016-policies-section-and-collection.md) covers `policies`); `services` and `team` are JSON data collections validated by the same schema mechanism.

- Each collection has a Zod schema; an invalid or missing required field fails `astro check` / the build, not production.
- MDX lets editorial content embed a constrained set of design-system components while staying mostly prose. The subset is two components: `<Motion>`, an animated clip the reader starts and stops, shown as its poster until played (posts), and `<Email>`, an address and its `mailto:` link encoded as HTML character references (policies).
- Content changes flow through pull requests: diffable, reviewable, revertible, attributable.
- Media is committed alongside the content and optimized at build by Astro's image pipeline into hashed static assets served by the Worker ([ADR 0006](0006-hosting-cloudflare-edge.md)). Committed source rasters are held to an enforced budget (≤2560px, ≤900 KB — the build generates the display-sized derivatives, so oversized originals only weigh down the repo): a required CI check (`scripts/images.mjs check`) plus a pre-commit auto-normalize keep the corpus lean over time.
- The legacy content corpus was migrated once into MDX as a one-time import.

### Editor experience

We recognize not every author wants to edit MDX in a code editor. We therefore intend to adopt a **git-based CMS layer (Decap CMS, with Sveltia CMS as the leading alternative)** mounted at an admin route, configured against the same collections. It would give non-developers a form-and-preview UI whose commits land in the same git history — no separate datastore, no new backend to secure. See `docs/runbooks/content-editing.md`.

> **Implementation status (2026-07-03):** the git-CMS layer is **planned, not yet built** — there is no CMS dependency or admin route in the tree. MDX-direct editing is the only authoring path today; this ADR records the intent to add the CMS form path. Until it ships, treat the "git-CMS" references below as forward-looking.

## Consequences

**Positive**

- No CMS server, database, or plugin surface to run, patch, or breach.
- Content is typed and validated before it can ship.
- Full history, review, and rollback for content, identical to code.
- Authoring is designed to work both ways: MDX in an editor (today), or a git-CMS form for non-devs (planned — see the status note above).

**Negative / costs**

- A one-time migration off the legacy CMS.
- Git-CMS preview of an Astro static build is less instantaneous than a server-rendered CMS's live preview; mitigated by per-PR preview deploys ([ADR 0009](0009-ci-cd-github-actions.md)).
- Very high-frequency, many-author publishing would strain a git workflow — not our profile.

## Alternatives considered

- **Keep the external, server-backed CMS.** Retains a server, DB, plugin/security surface, and out-of-repo content. Rejected.
- **A new headless SaaS CMS (Sanity, Contentful, Storyblok).** Strong editor UX, but reintroduces an external datastore, API coupling, vendor lock-in, and cost — for a content set that fits comfortably in git. Rejected.
- **Database-backed content.** Overkill for curated marketing content; the only data tier we keep is form submissions, stored in Cloudflare D1 behind the same-origin `/api/*` form routes ([ADR 0014](0014-forms-and-data-tier-on-cloudflare-d1.md)).
- **Plain Markdown without Zod.** No type safety; broken frontmatter reaches production. Rejected.

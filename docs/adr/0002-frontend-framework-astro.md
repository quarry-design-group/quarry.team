# 2. Frontend framework: Astro

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Engineering, Design Systems

## Context

`quarry.team` is a content-and-craft marketing site: a homepage, services, a curated case-study library (`/work/<slug>`), an editorial blog (`/blog/<slug>`), an about/team section, and submission-capture forms (contact, careers). The dominant requirements are:

- **Best-in-class Core Web Vitals.** The site is itself an argument for our engineering taste; near-zero unused JavaScript on content pages is the target (see `docs/brd/non-functional-requirements.md`).
- **Content-first authoring** via typed, git-based collections (MDX + Zod) — see [ADR 0004](0004-git-based-content-collections.md).
- **A real design system** sourced from design tokens — see [ADR 0003](0003-design-tokens-single-source-of-truth.md) and [ADR 0007](0007-styling-tailwind-v4-plus-tokens.md).
- **Static output** deployed to Cloudflare's edge — see [ADR 0006](0006-hosting-cloudflare-edge.md).
- **Islands of interactivity** where genuinely needed (mobile nav, lightweight form widgets, the search page's results-as-you-type enhancement — [ADR 0021](0021-site-search-on-the-worker.md)) without shipping a SPA runtime to every visitor.

The legacy site was Gridsome (Vue 2). Gridsome was effectively unmaintained, Vue 2 was end-of-life, and the architecture coupled content to a WordPress instance we have since retired.

## Decision

The marketing site (`apps/web`) is built on **Astro with TypeScript in strict mode** (Astro 5 at the time of this decision; the project tracks the current major and runs on **Astro 7**, a version-currency edit).

Rationale:

- **Zero-JS by default, islands on demand.** Astro ships HTML/CSS and hydrates only the components we explicitly mark, which maps directly onto our CWV budget. Most pages ship no framework runtime at all.
- **First-class content layer.** Astro Content Collections give us typed MDX + Zod schemas out of the box — the exact content model we want (ADR 0004) — with no separate CMS to run.
- **Static-first, edge-friendly.** Pages prerender to static HTML, deployed as a single Cloudflare Worker via the `@astrojs/cloudflare` adapter (ADR 0006); the on-demand routes are the same-origin `/api/*` form endpoints, the grievance pages ([ADR 0017](0017-stakeholder-grievance-intake.md)), and `/search` ([ADR 0021](0021-site-search-on-the-worker.md)). `@astrojs/sitemap` fits cleanly, and the search index is built from the same collections.
- **Framework-agnostic islands.** If we ever need a React/Svelte/Vue island, Astro supports it without committing the whole site to one runtime.
- **Authoring ergonomics.** `.astro` components are close to HTML, which keeps the markup honest and the design-token mapping legible.

## Consequences

**Positive**

- Content pages ship essentially no JavaScript; CWV headroom is large.
- The content model, framework, and search are one coherent toolchain.
- TypeScript strict + `astro check` catches content-schema and template errors at build time.

**Negative / costs**

- Astro's island model is a different mental model than an SPA; complex client-side state is deliberately awkward (acceptable — this is a marketing site, and the controlled dynamic tier is just the same-origin `/api/*` form routes on the Worker, backed by D1, [ADR 0014](0014-forms-and-data-tier-on-cloudflare-d1.md)).
- Smaller ecosystem than Next.js for app-style features we don't need here.

## Alternatives considered

- **Next.js.** Excellent, but optimized for app-shaped React products. Reaching the same "no unused JS on a content page" baseline requires fighting the defaults (RSC payloads, hydration). Heavier than the problem.
- **Remix / React Router.** Server-rendering-first; great for dynamic apps, but we want static output and minimal client JS. Wrong center of gravity.
- **SvelteKit.** Closest competitor on the "lean output" axis and genuinely good. Astro wins on the content-collection story and the explicit islands-everywhere-else model for a multi-framework-tolerant marketing site.
- **Keep Gridsome (Vue 2).** Unmaintained, EOL runtime, coupled to WordPress. Non-starter.

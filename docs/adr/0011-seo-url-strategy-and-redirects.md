# 11. SEO: URL strategy and redirects

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Engineering, Content, Marketing

## Context

The legacy site had earned ranking and backlinks, notably for its case studies under `/cases/<slug>` and its blog under `/blog/<slug>`. The next-gen site renames the case-study section to **`/work/<slug>`** (reflected in `apps/web/src/pages/work`). A rename without redirects would forfeit accumulated SEO equity and break inbound links. We also want the site to be maximally legible to search engines and to AI agents.

## Decision

We adopt an explicit URL-continuity and discoverability strategy.

### Redirects

- **Legacy `/cases/<slug>` → `/work/<slug>` as permanent (301) redirects**, configured at the Cloudflare edge ([ADR 0006](0006-hosting-cloudflare-edge.md)), preserving link equity and inbound links.
- **Trailing-slash legacy URLs chain through two hops — accepted.** The legacy site's canonicals ended in `/`, so `/cases/<slug>/` is a common backlink form. It redirects `301 → /work/<slug>/`, then the asset layer's `drop-trailing-slash` normalization adds a `307 → /work/<slug>`. Cloudflare's production `_redirects` engine ignores trailing-slash distinctions in rules and preserves the request's slash on the destination (verified live 2026-06), so the chain cannot be collapsed at this layer; zone-level Bulk Redirects could, but were judged not worth the extra infra surface — search engines reindex the slash-less canonicals quickly, making the chain short-lived in practice. Slash-less `/cases/<slug>` redirects in a single 301. All of this is evaluated in Cloudflare's static-asset layer — no Worker invocation, no compute cost.
- **`/blog/<slug>` URLs are unchanged** — no redirect, no equity loss.
- Redirect mappings are part of reviewed configuration, not ad-hoc dashboard edits.

### Discoverability

- A generated **`sitemap-index.xml`** (plus `sitemap-0.xml`) via `@astrojs/sitemap`, referenced from `robots.txt`.
- **JSON-LD structured data**: `Organization` site-wide; appropriate types for case studies and blog posts (e.g. `Article`/`CreativeWork`) and `BreadcrumbList` where relevant.
- Canonical URLs, descriptive titles/meta, and Open Graph / Twitter cards per page.
- **`llms.txt`** at the site root to describe the site and surface key URLs for AI agents and LLM-based crawlers — a forward-looking discoverability signal consistent with the site's craft positioning.
- **Discipline views of the case library** (`/work/discipline/<discipline>`) are indexable landing pages: prerendered, self-canonical, in the sitemap, with `CollectionPage` and `BreadcrumbList` structured data ([ADR 0021](0021-site-search-on-the-worker.md)). **`/search`** result pages carry `noindex, follow` and, being rendered on demand, are absent from the sitemap.

## Consequences

**Positive**

- SEO equity from `/cases/*` carries to `/work/*`; no broken inbound links.
- Blog URLs remain stable, retaining their rankings outright.
- Rich results eligibility via structured data; clean canonical/OG metadata.
- `llms.txt` makes the site first-class for AI-driven discovery.

**Negative / costs**

- The legacy→new slug map must be maintained and verified (a redirect audit belongs in the deploy runbook).
- JSON-LD and metadata add per-template work and must be validated to avoid invalid structured data.
- `llms.txt` is an emerging convention, not a ratified standard; low cost, low risk.

## Alternatives considered

- **302 (temporary) redirects for `/cases/*`.** Do not pass full link equity and signal impermanence. Rejected — the move is permanent.
- **Keep the `/cases/*` path to avoid redirects.** Sacrifices the clearer `/work` IA the new site is built around. Rejected; redirects preserve equity cheaply.
- **Client-side redirects (meta refresh / JS).** Worse for SEO and UX than edge 301s, and inconsistent with our static/edge model. Rejected.
- **Skip `llms.txt`.** Costs us a cheap, on-brand discoverability signal. Rejected.

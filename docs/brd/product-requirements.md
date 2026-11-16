# Product Requirements Document — quarry.team (next-gen)

- **Status:** Accepted
- **Owner:** Product / Engineering
- **Last updated:** 2026-10-04

This PRD defines the pages, features, content model, and acceptance criteria for the next-gen site. It assumes the architecture in `docs/adr/`. Non-functional targets (performance, a11y, security, SEO) live in [`non-functional-requirements.md`](non-functional-requirements.md).

## 1. Pages

| Page                    | Route                                                | Purpose                                                                                                                                          | Primary CTA         |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Home                    | `/`                                                  | Position Quarry; route to work, services, contact                                                                                                | Start an inquiry    |
| Services / Capabilities | `/services` (single page)                            | What we do and how we engage; capabilities come from the `services` data collection                                                              | Start an inquiry    |
| AI Services             | `/ai-services`                                       | AI development & integration offering (AI as a product, AI as a feature)                                                                         | Start an inquiry    |
| Compliance              | `/compliance`                                        | Evidence of delivery in regulated environments                                                                                                   | Start an inquiry    |
| How we use AI           | `/how-we-use-ai`                                     | How Quarry applies AI: leverage, with discipline                                                                                                 | Start an inquiry    |
| Track record            | `/track-record`                                      | Formulas, inputs, and limits behind every homepage track-record figure (marketing truth policy)                                                  | Start an inquiry    |
| Work (index)            | `/work`                                              | Curated case-study library                                                                                                                       | Open a case         |
| Work (detail)           | `/work/<slug>`                                       | Outcome-led case study                                                                                                                           | Start an inquiry    |
| About / Team            | `/team`, team profiles                               | Who we are; credibility                                                                                                                          | Careers / Contact   |
| Blog (index)            | `/blog`                                              | Editorial / POV                                                                                                                                  | Read a post         |
| Blog (detail)           | `/blog/<slug>`                                       | Article                                                                                                                                          | Subscribe / Contact |
| Contact                 | `/contact`                                           | Qualified inquiry capture (primary conversion)                                                                                                   | Submit inquiry      |
| Careers (index)         | `/careers`                                           | Open roles, culture                                                                                                                              | Apply               |
| Careers (application)   | `/careers/<role>` or apply form                      | Application capture (secondary conversion)                                                                                                       | Submit application  |
| Policies (index)        | `/policies`                                          | Governance and legal documents, grouped and dated ([ADR 0016](../adr/0016-policies-section-and-collection.md))                                   | Read a policy       |
| Policy (detail)         | `/policies/<slug>`                                   | Responsible Marketing & PR, Climate Action Plan, Responsible Lobbying, JEDI & Human Rights, Privacy, Terms, and future statements (static prose) | —                   |
| Grievances & Concerns   | `/policies/grievances` (+ `/received`)               | Stakeholder grievance mechanism: the policy and its intake form, on demand ([ADR 0017](../adr/0017-stakeholder-grievance-intake.md))             | Submit concern      |
| Search                  | `/search`                                            | Site-wide search over every public page, rendered on the Worker ([ADR 0021](../adr/0021-site-search-on-the-worker.md))                           | —                   |
| System                  | `404`, `robots.txt`, `sitemap-index.xml`, `llms.txt` | Errors & discoverability                                                                                                                         | —                   |

Legacy `/cases/<slug>` issues a 301 to `/work/<slug>`; `/blog/<slug>` is unchanged ([ADR 0011](../adr/0011-seo-url-strategy-and-redirects.md)). `/privacy` and `/terms` 301 to their `/policies/*` homes ([ADR 0016](../adr/0016-policies-section-and-collection.md)).

## 2. Features

- **Curated case-study library** with a prerendered view per discipline (`/work/discipline/<discipline>`), a zero-JS filter bar, and rich, outcome-led detail pages ([ADR 0021](../adr/0021-site-search-on-the-worker.md)).
- **Editorial blog** with MDX authoring. MDX content embeds a two-component design-system subset: `<Motion>` (animated clips in posts) and `<Email>` (encoded addresses in policies).
- **Site search** on the Worker: a build-time MiniSearch index of every public page, an on-demand `/search` route that renders ranked results as HTML, and a results-as-you-type enhancement over the same route; rate-limited per address ([ADR 0021](../adr/0021-site-search-on-the-worker.md)).
- **Form-submission capture** (contact, careers) → same-origin `/api/*` routes on the Worker → Cloudflare D1, protected by Turnstile and server-side validation ([ADR 0014](../adr/0014-forms-and-data-tier-on-cloudflare-d1.md)).
- **Stakeholder grievance mechanism** (B Lab PSG 3.1): a public policy page with a native, anonymous-capable, no-JS-capable form rendered on demand; hardened by honeypot, signed dwell-time token, two-layer rate limiting, invisible Turnstile, and content heuristics, with quarantine rather than deletion; persisted to D1 and mirrored to the Notion tracking log, with a reference number, acknowledgment, and owner/backup routing ([ADR 0017](../adr/0017-stakeholder-grievance-intake.md)).
- **Policies collection** — governance and legal documents as typed MDX with a shared template, index, footer entry points, and sitemap handling ([ADR 0016](../adr/0016-policies-section-and-collection.md)).
- **Responsive, optimized images** generated at build by Astro's image pipeline from git-committed sources ([ADR 0004](../adr/0004-git-based-content-collections.md), [ADR 0006](../adr/0006-hosting-cloudflare-edge.md)).
- **Privacy-first analytics**, no cookie banner ([ADR 0010](../adr/0010-analytics-privacy-first.md)).
- **SEO**: per-page metadata, canonical URLs, OG/Twitter cards, JSON-LD, sitemap, `llms.txt`.
- **Design system** components driven by tokens ([ADR 0003](../adr/0003-design-tokens-single-source-of-truth.md), [ADR 0007](../adr/0007-styling-tailwind-v4-plus-tokens.md)).
- A tasteful **browser-console easter egg** on the live site (non-functional).

## 3. Content model

Content lives in Astro Content Collections under `apps/web/src/content`, validated by Zod ([ADR 0004](../adr/0004-git-based-content-collections.md)). Authoritative field reference: [`../guides/content-authoring.md`](../guides/content-authoring.md).

### `cases`

Curated case studies (folder-per-entry MDX). Indicative fields: `title`, `client`, `summary`, `disciplines[]` (enum), `industry?`, `outcome` (`kicker?`/`headline`/`stat?`/`supporting[]`), `role?`/`duration?`/`team?`, `releasedDate`, `updatedDate?`, `hero` (+ `heroAlt`/`heroCredit?`), `featured` (bool), `order`, `comingSoon` (bool), `draft` (bool), `seo` (title/description). Body = MDX.

### `posts`

Editorial blog (folder-per-entry MDX). Indicative fields: `title`, `description`, `publishedDate`, `updatedDate?`, `author` (plain string, default `Quarry`), `category?`, `tags[]`, `hero` (+ `heroAlt`/`heroCredit?`), `draft`. Body = MDX. Slugs map 1:1 to legacy `/blog/<slug>`.

### `services`

Capabilities (data collection, `services/services.json`). Indicative fields: `id`, `title`, `summary`, `capabilities[]`, `discipline?` (enum), `order`.

### `roles`

Open careers roles (MDX). Indicative fields: `title`, `team`, `location`, `type`, `summary`, `datePosted`, `validThrough?`, `order`, `draft`. Body = MDX.

### `team`

People (data collection, `team/team.json`). Indicative fields: `id`, `name`, `role`, `location?`, `bio?`, `avatar?`, `lat?`/`lng?` (city-level, ≤1 decimal), `order`. Used for authorship and the team page.

### `policies`

Governance and legal documents (flat MDX, `policies/<slug>.mdx` → `/policies/<slug>`). Indicative fields: `title`, `summary` (index blurb + meta description, 70–160 chars), `category` (`governance` | `legal`), `updated`, `owner?` (the accountable role, never a name), `order`, `interactive` (rendered by a dedicated on-demand route), `sitemap` (false keeps thin legal boilerplate out), `draft`. Body = MDX.

> Field names above are indicative; the Zod schemas in `apps/web/src` are authoritative. The authoring guide is kept in sync with those schemas.

## 4. Acceptance criteria

### Global

- [ ] Every page passes TypeScript strict + `astro check`, lint, and format checks.
- [ ] Every page meets the performance and a11y budgets in the NFR doc (Lighthouse ~100, WCAG 2.2 AA) and passes axe checks in CI.
- [ ] Content with invalid/missing required frontmatter **fails the build** (does not ship).
- [ ] `draft: true` content is excluded from production builds, sitemap, and search.
- [ ] Every page has canonical URL, title, meta description, OG/Twitter tags; relevant JSON-LD present and valid.
- [ ] Images are responsive, lazy where appropriate, and carry meaningful `alt` text.

### Work

- [ ] `/work` lists every published case; each discipline with a published case has its own prerendered view with the same grid, a filter bar marking the current view, and a visible count; `featured` cases surface appropriately.
- [ ] `/work/<slug>` renders hero, body (MDX), outcomes, and a contact CTA.
- [ ] `/cases/<slug>` 301-redirects to the matching `/work/<slug>`; the redirect map is reviewed in the deploy checklist.

### Blog

- [ ] `/blog` lists published posts (newest first) with author and date.
- [ ] `/blog/<slug>` renders MDX, including `<Motion>` clips; URLs match legacy slugs.

### Search

- [ ] The build emits a search index of every published page (drafts and `comingSoon` cases excluded); `/search` returns ranked results with JavaScript off, refreshes them as the reader types with it on, carries `noindex, follow`, and answers 429 past its per-address budget.

### Contact (primary conversion)

- [ ] Valid submissions reach the `/api/contact` route on the Worker, pass Turnstile + server-side validation, and persist to Cloudflare D1.
- [ ] Invalid input yields accessible, field-level error messaging; the form is fully keyboard-operable and screen-reader labeled.
- [ ] Spam/bot submissions are blocked by Turnstile without a cookie banner.
- [ ] Success and failure states are clearly communicated to the user.

### Careers (secondary conversion)

- [ ] `/careers` lists open roles; each role links to an accessible application flow.
- [ ] Applications persist to the data tier with the same validation/Turnstile guarantees as contact.

### Grievances & Concerns (governance)

- [ ] `/policies/grievances` renders the policy and form on demand; the form submits, validates, and confirms **with JavaScript disabled**, preserving the visitor's text on a validation error.
- [ ] A valid submission redirects (303) to a confirmation carrying a `GRV-YYYY-XXXXX` reference, persists to D1, mirrors to the Notion log, and (when a contact was given) sends an acknowledgment; concerns marked as involving the grievance owner route to the backup only.
- [ ] The form passes WCAG 2.2 AA including the challenge step (invisible Turnstile; no puzzle or checkbox); a missing challenge token quarantines rather than rejects.
- [ ] A scripted automated-submission run puts zero entries in the live log (quarantined, then throttled); a legitimate manual submission from a fresh session succeeds with no friction beyond the form.
- [ ] Every rejection (honeypot, bad token, throttle) is logged with its reason; the visitor is never told whether a submission was filtered.
- [ ] Server-rendered responses carry the full security-header set with a hash-pinned CSP (no `unsafe-*`) and `Cache-Control: no-store`.
- [ ] `/privacy` and `/terms` 301 to `/policies/privacy` and `/policies/terms`; `/policies` lists every published policy by category.

### SEO / system

- [ ] `sitemap-index.xml` lists all public, non-draft pages and is referenced by `robots.txt`.
- [ ] `llms.txt` is present and describes the site/key URLs.
- [ ] `404` is branded and offers navigation back into the site.

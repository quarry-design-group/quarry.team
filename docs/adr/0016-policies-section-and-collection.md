# 16. A `/policies` section for governance documents

- **Status:** Accepted
- **Date:** 2026-09-05
- **Deciders:** Principal, Engineering

## Context

B Corp certification (B Lab's Purpose & Stakeholder Governance requirements) obliges the firm to publish a class of documents the site never had a home for: a stakeholder grievance mechanism first, with a responsible-marketing policy, an accessibility statement, and impact reporting to follow. The site's only documents of this kind were two legal pages at top-level slugs, `/privacy` and `/terms`, each a hand-authored `.astro` page with an eyebrow reading "Legal", no index, and a footer strip as their only entry point.

Adding the grievance page as a third top-level slug would have been the path of least resistance and the wrong information architecture: three unrelated slugs, three page templates, no way to enumerate the class for the footer or the sitemap, and nothing to tell a visitor that these documents belong together. The class is small today and will grow; the decision is where it lives and how it is modelled.

## Decision

Governance and legal documents live under **one section, `/policies`**, backed by **one content collection**.

- **Routes.** `/policies` is an index that lists every published policy grouped by category. Each document is `/policies/<slug>`. The grievance mechanism is `/policies/grievances`, with its confirmation at `/policies/grievances/received` ([ADR 0017](0017-stakeholder-grievance-intake.md)).
- **Content model.** A `policies` collection (`apps/web/src/content/policies/<slug>.mdx`, flat MDX, Zod-validated per [ADR 0004](0004-git-based-content-collections.md)): `title`, `summary` (the index blurb and meta description, held to the 70–160-character hygiene rule), `category` (`governance` | `legal`, extensible), `updated`, `owner` (the accountable **role**, never a person's name — people change and a name on a policy page rots), `order`, `interactive`, `sitemap`, `draft`. Category labels and order live in `apps/web/src/lib/policies.ts`.
- **Templates.** One layout, `apps/web/src/layouts/Policy.astro`: category eyebrow with a route back to the index, title, "last updated" stamp, accountable role, prose body. `pages/policies/[...slug].astro` prerenders every non-interactive entry. An `interactive: true` entry (a document with a live process, such as the grievance form) is excluded from the static template and rendered by its own on-demand route under the same directory, while remaining a collection entry so the index, footer, and sitemap treat it as one of the class.
- **Privacy and Terms move** into the collection at `/policies/privacy` and `/policies/terms`. The old paths issue **301** redirects from `apps/web/public/_redirects`, the same edge mechanism as the `/cases/*` continuity in [ADR 0011](0011-seo-url-strategy-and-redirects.md), so contracts and inbound links that cite the old URLs stay whole. Both keep `sitemap: false`: thin legal boilerplate never needs to rank. The sitemap integration reads that flag (and `updated`, for `lastmod`) from the collection's frontmatter, and lists the on-demand grievance page explicitly, since on-demand routes are invisible to it.
- **Entry points.** Governance documents are ways to reach us, not boilerplate, so they sit with the contact channels: the footer's contact column gains **Raise a concern**; the footer's legal strip becomes Privacy · Terms · **All policies**; the contact page routes non-project intent ("Have a concern rather than a project?") to the mechanism; the careers page does the same for candidates and staff; the privacy policy describes and links the grievance data handling; `llms.txt` lists the section. Nothing enters the header: these are not marketing destinations.

## Consequences

**Positive**

- Adding a policy is adding one MDX file. The index, the footer strip's "All policies" link, the sitemap, and the docs all follow from the collection; no new page template per document.
- The class is legible: a visitor who finds one policy can find them all, and every document carries its category, its last-updated date, and the role that owns it.
- Interactive documents and static prose share a shell and a URL scheme, so the grievance mechanism reads as a policy with a form in it, not as a separate product.
- The static `/policies` index joins the backbone-route contract automatically (e2e, axe, SEO); the static policy template is Lighthouse-gated via `/policies/privacy`.

**Negative / costs**

- Two published URLs change. Slash-less `/privacy` and `/terms` redirect in one 301; trailing-slash forms chain through the edge's slash normalization exactly as [ADR 0011](0011-seo-url-strategy-and-redirects.md) describes for `/cases/*`. Both pages were already excluded from the sitemap, so the search cost is negligible.
- `summary` is held to the meta-description window, which constrains how a policy is described on the index. That is the intent.

## Alternatives considered

- **More top-level slugs (`/grievances`, `/accessibility`, …).** Zero migration, but no grouping, no index, and a footer that grows a link per document. Rejected: the class needs a home.
- **`/legal/`.** The natural home for privacy and terms, but a grievance mechanism, an accessibility statement, and an impact report are not legal documents, and the label would misdescribe most of the class. Rejected.
- **`/governance/` or `/impact/`.** B Lab's own vocabulary, but opaque to the general public the grievance page is for, and "impact" describes reports rather than policies. Rejected; either may later appear as a category inside `/policies`.
- **Leave privacy and terms where they were, cross-listed on the index.** Avoids the redirects, at the price of a class whose members live at two depths. Rejected in favour of one consistent scheme; the redirect cost is small and already paid for by the ADR 0011 mechanism.
- **Hand-authored `.astro` pages per policy, no collection.** What the two legal pages were. Rejected: it is the situation this record replaces.

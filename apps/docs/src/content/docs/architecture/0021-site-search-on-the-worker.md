---
title: "Site search on the Worker, progressively enhanced"
description: "The product requirements promise site-wide search and a filterable case-study"
sidebar:
  order: 21
---

<!-- GENERATED from docs/adr/0021-site-search-on-the-worker.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/adr/0021-site-search-on-the-worker.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/adr/0021-site-search-on-the-worker.md). Edit there; this page is generated.
:::

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Engineering, Security

## Context

The product requirements promise site-wide search and a filterable case-study
index (`docs/brd/product-requirements.md`). Pagefind was the intended search
engine: the build ran `pagefind --site dist/client` and shipped the index it
produced. Pagefind's browser runtime compiles WebAssembly, and a page that
instantiates WebAssembly needs `'wasm-unsafe-eval'` in `script-src`. The
site's published posture is a strict Content-Security-Policy with no
`'unsafe-*'` source anywhere ([ADR 0015](/architecture/0015-strict-csp-via-build-time-script-hashes/)),
and that posture does not bend for a feature, route-scoped or otherwise.

Two further constraints shape the design. The site is zero-JS by default
([ADR 0002](/architecture/0002-frontend-framework-astro/)): a client island has to earn its
place, and a feature that only works with JavaScript on is not acceptable.
And the site already runs a Worker in the request path for every HTML
response ([ADR 0019](/architecture/0019-per-request-csp-nonce-for-edge-injected-scripts/)),
with on-demand routes that set their own security headers through the
middleware ([ADR 0017](/architecture/0017-stakeholder-grievance-intake/)).

## Decision

Search runs on the Worker; the browser enhances it.

1. **One index, built once.** A prerendered endpoint,
   `src/pages/search-index.json.ts`, reads the content collections and emits
   one document per public page — `url`, `title`, `kind` (`case`, `post`,
   `service`, `role`, `policy`, `page`), `summary`, `disciplines`,
   `headings`, and the body with MDX and markup stripped. The backbone pages
   (home, services, AI services, compliance, how we use AI, team, careers,
   contact) come from a hand-maintained list in `src/lib/search/pages.ts`.
   Drafts, cases marked `comingSoon`, and the interactive grievance pages
   are left out. The endpoint serializes a MiniSearch index with the stored
   fields the results template needs; it lands in `dist/client` as a static
   asset that browsers never fetch.
2. **A baseline route.** `src/pages/search.astro` is rendered on demand, so
   the middleware stamps the per-request CSP nonce and the security headers.
   It reads `q` (and an optional `kind`) from the query string,
   loads the index through the assets binding once per isolate and holds it
   in module scope, ranks the query through one shared function
   (`src/lib/search/query.ts`), and renders the form and the results inside
   the layout. With no query it renders the form and a prompt. Matched terms
   are wrapped in `<mark>` on the server; every other string is escaped. The
   page carries `<meta name="robots" content="noindex, follow">`, and as an
   on-demand route it is absent from the sitemap.
3. **A fragment mode.** The same route answers `?q=…&fragment=1` with the
   results block alone, as `text/html`, under the same headers. One template
   (`src/lib/search/render.ts`) serves both modes.
4. **An enhancement island.** A bundled module on `/search` only — an
   Astro-processed `<script>`, emitted as an external file under
   `script-src 'self'` (the build's inlining threshold is bypassed for it),
   with no inline script, no `eval`, and no WebAssembly. It debounces the
   input (200 ms; the route ignores queries under two characters), aborts the
   in-flight request with an `AbortController`, fetches the fragment, swaps
   it into the results container, and updates the address bar with
   `history.replaceState` so the URL stays shareable. The form keeps working
   as a plain `GET`; pressing Enter without JavaScript lands on the same
   results. A polite live region announces the result count from a summary
   the fragment carries as a data attribute. The swapped markup carries no
   scripts or inline handlers, so the policy holds unchanged.
5. **A per-address budget.** A Workers Rate Limiting binding declared in
   `apps/web/wrangler.toml` (`[[ratelimits]]`, production and staging) keys
   on `cf-connecting-ip` at 60 requests per 60 seconds: enough for debounced
   typing with room to spare, and a stop for a scripted loop. Over the
   budget the route answers 429 with `Retry-After` in the same layout
   (fragment mode: one line). The empty page costs nothing against it. The
   zone's single WAF rate-limit rule is POST-only at three per ten seconds
   and stays as it is.
6. **Routing.** `/search-index.json` stays on the asset path under the
   `*.json` family rule already in `run_worker_first`; `/search` reaches the
   Worker like every other HTML route.
7. **Entry points.** A search link in the header — an icon with the
   accessible name "Search" on desktop, an icon with a visible label in the
   mobile menu — and a link from the 404 page. The header stays zero-JS.
8. **Pagefind leaves the build**: the `postbuild` step, the devDependency,
   the `data-pagefind-body` hook in the layout, the ignore rules, and the
   `/pagefind/*` routing exclusion.

**The case library** gains a prerendered view per discipline,
`src/pages/work/discipline/[discipline].astro`, for every discipline with at
least one published case. Each view is self-canonical, carries its own title
and description, `CollectionPage` and `BreadcrumbList` structured data, and
sits in the sitemap. The grid is one component (`WorkGrid.astro`) shared with
`/work`, so publication and ordering are defined once (`src/lib/work.ts`), and
every view carries a zero-JS filter bar — a `<nav>` of links with "All work"
first, `aria-current="page"` on the active one, and a visible case count.
The discipline tags on a case study link to the matching view.

## Consequences

- **Search works everywhere the site does.** With JavaScript off it is a
  form and a page; with it on, results appear as the reader types. Both
  paths run the same ranking and the same template, so they cannot
  disagree.
- **The CSP is unchanged.** No `'wasm-unsafe-eval'`, no inline script on
  the search page beyond the layout's hash-pinned ones, no new host. The
  route inherits the nonce-based policy every on-demand route already sets
  ([ADR 0017](/architecture/0017-stakeholder-grievance-intake/),
  [ADR 0019](/architecture/0019-per-request-csp-nonce-for-edge-injected-scripts/)),
  and the fragment responses carry the same headers.
- **One more on-demand route, and a budget for it.** Every keystroke past
  the debounce is an edge request that loads nothing new: the index is in
  module scope after the isolate's first search, and a query over the
  site's few dozen documents takes well under a millisecond. The binding
  is the guard; without it the route stays available and logs the gap
  rather than turning a missing table into an outage.
- **A new runtime dependency.** `minisearch` runs in the Worker and at
  build. Dependabot's prod group covers it, and the serialized index carries
  a version so an index built under one shape is refused by code expecting
  another.
- **The index is a build output.** `search-index.json` regenerates on every
  build from the collections; it is never edited, and the `*.json` family
  rule in `run_worker_first` leaves it on the asset path.
- **The discipline views are landing pages.** Five more URLs in the
  sitemap, each with the crawl signals of a real page; `/search` result
  pages are kept out of the index deliberately.
- **The static test projects cannot reach `/search`.** The route never
  exists in `dist/client`, so the backbone-route derivation excludes it and
  the `worker` Playwright project covers it end to end — the no-JS submit,
  the typed enhancement, the header link, the headers, the fragment, the
  429 path, and axe with results and with none. The discipline views are
  static and run under the static projects and Lighthouse CI.

## Alternatives considered

- **Pagefind with a path-scoped `'wasm-unsafe-eval'`.** Keeps the
  build-time index and the no-server model, at the cost of the one
  expression the policy exists to exclude — on the search page, and on any
  page that hosts the search UI. Rejected: the posture is site-wide or it is
  a claim with an asterisk.
- **An in-browser index with a JavaScript island.** A MiniSearch index
  fetched by the page and queried in the browser, no WebAssembly. It ships
  the whole index (hundreds of kilobytes) to every reader who searches,
  needs JavaScript to return a single result, and puts the ranking where it
  cannot be tested against the served site. Rejected on the no-JS
  requirement alone.
- **Worker-only search.** The baseline route without the island: a form,
  a submit, a page. Correct and complete, and every refinement is a full
  navigation. The island costs one small module on one page and gives
  results as the reader types; the baseline is what remains when it is
  absent. Adopted as the fallback, not the ceiling.
- **A search API under `/api/search` returning JSON, rendered by the
  island.** Two templates for one result list (server HTML for the no-JS
  page, client rendering for the enhancement), and a JSON contract to keep
  in step. Rejected: fragment HTML from the same template is one contract.


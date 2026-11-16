# 15. A strict, hash-pinned Content-Security-Policy

- **Status:** Accepted
- **Date:** 2026-07-12
- **Deciders:** Engineering, Security

## Context

`SECURITY.md` and the [non-functional requirements](../brd/non-functional-requirements.md)
describe the site as shipping "a strict, reviewed Content-Security-Policy." The
policy in `apps/web/public/_headers`, however, carried `'unsafe-inline'` in
both `script-src` and `style-src`:

```
script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://assets.calendly.com https://static.cloudflareinsights.com
style-src 'self' 'unsafe-inline' https://assets.calendly.com
```

`'unsafe-inline'` in `script-src` permits any injected inline `<script>` to
run, which defeats the XSS protection that is the point of a CSP. Under the
accepted definition — the [Google/W3C strict-CSP guidance](https://web.dev/articles/strict-csp),
nonce- or hash-based with no `'unsafe-inline'` — this policy was **not**
strict, and the gap was disprovable with a single `curl -I`. For the firm's own
security page, an inaccurate claim is itself a defect (AGENTS.md §7).

The site is `output: 'static'` served by Cloudflare Workers Static Assets, with
the CSP delivered as a response header via the static `_headers` file. That
constraint rules out the options that suit dynamic origins:

- **Per-request nonces** (`strict-dynamic` + a fresh nonce per response) need a
  server in the request path. Our HTML is static assets served directly by the
  edge; routing every page through Worker code (`run_worker_first` +
  `HTMLRewriter`) to stamp nonces would add per-request CPU, latency, and cost
  to an intentionally zero-JS, statically-served site — a poor trade.
- **Cloudflare Page Shield** manages CSP from the dashboard, but it generates
  **host-allowlist** directives and monitors/report-only; it does not emit the
  nonces or hashes that remove `'unsafe-inline'`. It is a monitoring and
  tamper-alerting layer, not a mechanism for a strict policy, and it is
  dashboard-managed, at odds with our git + Terraform posture.
- **Astro's built-in CSP** (`csp: true`, stable in Astro 6+) hashes inline
  scripts at build, but delivers them via a per-page `<meta>` tag. A `<meta>`
  CSP cannot express `frame-ancestors`/`report-uri`, and — decisively — it does
  **not** change the response header, so `curl -I` would still show
  `'unsafe-inline'`. The Cloudflare adapter's `experimentalStaticHeaders`
  (which would write hashes into `_headers`) is not yet shipped.

Two site-specific obstacles stood between the old policy and a strict one:

1. **Inline style attributes.** Six surfaces stamped per-instance CSS custom
   properties as `style=""` attributes (stack-wall brand/icon vars, the
   tools-band depth tiers, stat-band discipline tints, logo-marquee geometry,
   the team-page starfield, the hero pit SVG's stroke lengths). CSP can only
   pin style _attributes_ with `'unsafe-hashes'` — itself a weakening
   expression — so hashes alone couldn't cover them.
2. **The Calendly popup widget.** `widget.js`/`widget.css` from
   `assets.calendly.com` power the contact page's booking popup, and Calendly's
   embed officially requires `'unsafe-inline'` (and `'unsafe-eval'`) with no
   nonce/hash support offered — a vendor dead end for any strict policy while
   their code runs in our document.

## Decision

The CSP is made **fully strict: no `'unsafe-*'` source expression anywhere.**
Every inline `<script>` and `<style>` is pinned by SHA-256 hash, generated at
build:

- `apps/web/public/_headers` carries `__CSP_SCRIPT_HASHES__` and
  `__CSP_STYLE_HASHES__` placeholders. A `postbuild` step,
  `apps/web/scripts/inject-csp-hashes.mjs`, hashes every executable inline
  `<script>` and every `<style>` element in the emitted `dist/client/**/*.html`
  and expands the tokenized template in the deployed `dist/client/_headers`.
  It **fails the build** if a placeholder is missing or no inline
  scripts/styles are found, so a hashless (broken) strict CSP can never ship
  silently.
- The policy is emitted **per route family, not as one global rule**:
  Cloudflare caps `_headers` lines at 2000 characters (API error 100324),
  which a global hash union exceeds — and page-scoped policies are tighter
  anyway, since a page can only use its own inline content. The rules are
  **overlap-free by construction**: `/*` carries no CSP, and every HTML route
  family (`/`, `/404`, `/work` + `/work/*`, …) gets one plain rule with only
  its own hashes. A first iteration used a `/*` fallback that family rules
  detached (`! Content-Security-Policy`); local workerd (`wrangler dev`)
  honored it, but the **production `_headers` pipeline served the fallback
  policy anyway** — so nothing in this design may depend on detach or rule
  precedence. Unmatched paths, which serve `404.html` with no matching rule,
  are covered by a `<meta http-equiv>` CSP the injector writes into `404.html`
  itself (fetch directives only; `frame-ancestors` is meta-invalid and is
  stripped — `X-Frame-Options` and HSTS still arrive via `/*`'s other
  headers). The injector fails the build before Cloudflare's line (2000 chars)
  or rule-count (100) limits can bite.
- **Style attributes are eliminated rather than excused.** Components that
  stamped per-instance custom properties inline now emit generated
  per-instance `<style>` blocks targeted by a deterministic scope class
  (`src/lib/style-scope.ts` — a pure hash of the instance's data, so identical
  props yield identical blocks and stable CSP hashes). Enum-keyed styling
  (stat-band discipline tints) uses `data-*` attributes with one static rule
  per value. The hero SVG's hand-authored constants moved into the page's
  scoped stylesheet.
- **Calendly's code is evicted from our document.** The booking popup is a
  native `<dialog>` we own, framing a **lazy iframe** to `calendly.com` — CSP
  governs our document, not the iframe's interior, so the booking flow is
  unchanged while `assets.calendly.com` leaves `script-src` and `style-src`
  and `calendly.com` leaves `connect-src` entirely. Only
  `frame-src https://calendly.com` remains. The iframe's `src` is set on first
  open, so no request reaches Calendly until a visitor asks to book (a privacy
  and page-weight win over the always-loaded widget).
- **One vetted runtime carve-out.** cobe 2.0.1 (the `/team` globe) injects a
  constant `:root{}` `<style>` for its anchor-positioning feature; its
  re-writes also pass through an empty-text state that CSP checks separately.
  Both constants are pinned as two static hashes in `_headers` with a comment;
  an empty stylesheet styles nothing, and mutating it afterward is CSSOM,
  which the locked `script-src` already gates.
- External scripts (Turnstile, Cloudflare Insights) stay covered by the host
  allowlist; `strict-dynamic` is deliberately **not** used, so those
  `src`-based loaders keep working. JSON-LD and import-map blocks are not
  governed by `script-src` and are skipped. The same pass set
  **`object-src 'none'`** explicitly and tightened **`img-src`** to
  `'self' data:` (`data:` is required by the globe's WebGL texture; the old
  `https:` any-host wildcard matched nothing the site renders).

The contract is enforced three ways: unit tests on the hash collectors
(`src/lib/csp-hashes.test.ts`), the postbuild failure modes above, and a
Playwright e2e spec (`tests/e2e/csp.spec.ts`) that applies the built header to
every backbone route and asserts **zero CSP violations**, that the policy
contains no `unsafe-*`, and that served HTML ships no `style=""` attributes.

## Consequences

- The deployed `Content-Security-Policy` header carries no `'unsafe-*'`
  anywhere; the "strict" claim is true and curl-verifiable.
- Adding, removing, or editing an inline script or style re-pins its hash on
  the next build — no manual `_headers` maintenance, no drift. A new inline
  script/style without a hash, a reintroduced style attribute, or a dependency
  changing its runtime injection is caught by the e2e CSP gate before merge.
- Per-instance styling must use the generated-block pattern
  (`src/lib/style-scope.ts`) or enum-keyed `data-*` rules — never `style=""`
  attributes. This is now a build-verified convention, not a preference.
- Third-party UI code does not run in the document. Embeds that cannot meet
  the policy (Calendly-style widgets) are integrated as iframes; their pages
  are governed by their own CSP inside the frame.
- `astro dev` does not apply `_headers`, so the strict policy is exercised
  against the built site (e2e, preview, deploy), consistent with how the other
  headers already behave.
- No new runtime dependency and no per-request cost: the work happens once at
  build, and pages are still served as pure static assets.
- If we later adopt Cloudflare Page Shield in report-only, it complements this
  policy as a monitoring layer; it does not replace the build-time hashing.

## Alternatives considered

- **Reword the docs, drop "strict."** Truthful and zero-risk, but it forfeits a
  real security property the static architecture can support cheaply. Rejected
  in favour of actually being strict.
- **Per-request nonces via a Worker.** The strongest model, but it regresses
  the static-serving architecture (ADR-0002, ADR-0006). Rejected.
- **Cloudflare Page Shield policies.** Host-allowlist + monitoring only; cannot
  remove `'unsafe-inline'`. Kept in reserve as a complementary monitor.
- **Astro built-in CSP (`<meta>`) or `astro-static-headers`.** The former does
  not fix the response header; the latter does not integrate with Astro's CSP
  hashing (it captures `Astro.response.headers` only), needs a
  `prerenderEnvironment: 'node'` adapter change, and adds a third-party build
  dependency against the repo's hermetic-build preference. A small in-repo
  postbuild step is simpler and fully owned.
- **Keep `style-src 'unsafe-inline'` as a documented exception.** Defensible
  (style injection is a far weaker vector than script injection) and common
  practice — but the refactor cost was bounded, the Calendly dependency was
  the only true blocker, and a policy with zero `unsafe-*` is categorically
  easier to defend on a security page than one with a footnote.
- **`'unsafe-hashes'` for the style attributes.** Narrower than
  `'unsafe-inline'`, but it still weakens the policy and reads as exactly the
  kind of qualifier the audit flagged. Eliminating the attributes was cheap
  enough to make it moot.
- **Patching cobe (pnpm patch) to remove its stylesheet injection.** Total, but
  adds patch-maintenance for a constant, harmless string; two documented
  static hashes achieve the same containment with less machinery.

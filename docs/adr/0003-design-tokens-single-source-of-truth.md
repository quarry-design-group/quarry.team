# 3. Design tokens as the single source of truth

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Design Systems, Engineering

## Context

Quarry sells design and engineering craft; our own site must demonstrate a 1:1 contract between design and code. "Quarried" — our design system — is warm-serious editorial: Fraunces (display), Hanken Grotesk (text), JetBrains Mono (labels); Quarry Blue `#0C53C7`; a Stone neutral ramp; an Ember accent.

If Figma and the codebase keep independent copies of color, type, spacing, and radii, they drift. Drift is exactly the failure mode a craft studio cannot ship on its own marketing site.

## Decision

A single machine-readable token file, **`packages/ui/tokens/tokens.json`, is the source of truth** for the design system's primitives and semantic tokens.

- A build step (`packages/ui/src/build-tokens.ts`, run via `pnpm tokens`) generates two projections of `tokens.json`. The **code side** is **`packages/ui/tokens/tokens.css`** — CSS custom properties consumed by the web app and bridged into Tailwind v4 ([ADR 0007](0007-styling-tailwind-v4-plus-tokens.md)).
- The **design side** is **`packages/ui/tokens/figma.tokens.json`** — the same tokens in the [Tokens Studio](https://tokens.studio) single-file format, which the Tokens Studio plugin pulls from Git to apply as Figma Variables (no Enterprise API). So the design file and the shipped CSS resolve to the same values, both derived from `tokens.json`; see [the design-system guide](../guides/design-system.md) for the plugin setup.
- Tokens are layered: **primitives** (raw scales — `stone-100`, `blue-600`, type sizes) and **semantic** tokens (`color-surface`, `color-text`, `color-accent`, `space-*`, `radius-*`) that reference primitives. Application code consumes semantic tokens, never raw hex.
- `tokens.css` and `figma.tokens.json` are **generated artifacts**: never hand-edited. Changing a value means editing `tokens.json` and rebuilding.

### How 1:1 is enforced

1. **Generated CSS, not authored CSS.** `tokens.css` is produced by the build; a hand edit is a review-time red flag and is overwritten on the next `pnpm tokens` run.
2. **Both sides derive from one file.** `tokens.css` (code) and `figma.tokens.json` (design) are generated from `tokens.json` by the same build; neither is authored independently, so Figma and code cannot hold divergent values.
3. **CI guard.** CI runs the token build and fails if either committed projection (`tokens.css`, `figma.tokens.json`) differs from the freshly generated output — the same pattern as a "generated code is stale" check ([ADR 0009](0009-ci-cd-github-actions.md)).
4. **Component usage lint.** Components reference semantic token variables; raw hex/`px` color and spacing literals in `apps/web/src` are discouraged and flagged in review.

## Consequences

**Positive**

- Design and code cannot silently diverge; a token change is one edit that propagates everywhere.
- Theming, contrast tuning, and future modes (e.g. a dark surface) are token edits, not search-and-replace.
- The pipeline is itself a portfolio artifact.

**Negative / costs**

- Requires a token-build step in local dev and CI.
- A naming discipline (primitive vs semantic) the whole team must hold.
- Keeping Figma current is a deliberate pull (Tokens Studio) after a token change, not an automatic push — and values must originate in `tokens.json`, never ad-hoc in Figma.

## Alternatives considered

- **Tailwind config as the source of truth.** Ties the contract to one tool and gives Figma nothing to consume. Rejected; instead Tailwind reads the tokens (ADR 0007).
- **Hand-authored `tokens.css` only.** No structured source for Figma, no validation, easy to drift. Rejected.
- **A hosted token platform (e.g. a tokens SaaS).** Overhead and an external dependency for a token set this size. A small in-repo build is leaner and fully owned.
- **Style Dictionary.** Reasonable and battle-tested; our token set is small enough that a focused in-repo transformer (`build-tokens.ts`) is simpler to read and own. Revisit if the token graph grows.

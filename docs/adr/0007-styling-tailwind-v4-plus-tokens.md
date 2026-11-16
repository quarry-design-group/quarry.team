# 7. Styling: Tailwind v4 bridged to design tokens

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Design Systems, Engineering

## Context

We need a styling approach that is fast to write, produces lean CSS, and — critically — does not become a _second_ source of truth competing with our design tokens ([ADR 0003](0003-design-tokens-single-source-of-truth.md)). The system is "Quarried": Fraunces / Hanken Grotesk / JetBrains Mono, Quarry Blue `#0C53C7`, a Stone neutral ramp, an Ember accent. Those values must come from `tokens.json` → `tokens.css`, not be re-typed into a utility config.

## Decision

We use **Tailwind CSS v4**, configured to **consume the generated `tokens.css`** rather than define its own scales.

- Tailwind v4's CSS-first configuration reads the design tokens (the CSS custom properties emitted by the token build) as the theme. Utilities resolve to token-backed variables, so `bg-surface`, `text-accent`, spacing, and radii all trace back to `tokens.json`.
- Tailwind handles layout, spacing, state variants, and responsive composition; the design system's _values_ remain owned by the tokens.
- Component-level structure lives in `.astro` components; Tailwind utilities express their styling; tokens supply the constants.
- Tailwind's content-aware build ships only the utilities actually used, keeping CSS small — consistent with our performance budget.

The hierarchy is explicit: **tokens are the vocabulary; Tailwind is the grammar.**

## Consequences

**Positive**

- One source of truth for design values; Tailwind never forks the palette or scale.
- Fast, consistent authoring with a tiny shipped CSS payload.
- Token changes propagate through Tailwind automatically — no config sync.
- Tailwind v4's CSS-first model removes the heavy JS config and aligns naturally with CSS custom properties.

**Negative / costs**

- Requires wiring Tailwind v4 to the token variables — a deliberate setup, not the default `tailwind.config` happy path.
- Contributors must resist defining new raw values in utilities; new design constants belong in `tokens.json`.
- Tailwind v4 is newer; some third-party plugins lag the v4 config model.

## Alternatives considered

- **Tailwind owning the theme (values in the Tailwind config).** Creates a second source of truth that drifts from Figma and `tokens.json`. Rejected — inverts ADR 0003.
- **Vanilla CSS / CSS Modules against `tokens.css` directly.** Fully viable and token-pure, but slower to author and loses Tailwind's variant/responsive ergonomics. Rejected as the default; raw CSS is still used for the rare bespoke case.
- **CSS-in-JS (styled-components, Emotion).** Adds runtime/JS cost antithetical to our zero-JS-by-default goal ([ADR 0002](0002-frontend-framework-astro.md)). Rejected.
- **A component library with baked-in styling (e.g. a UI kit).** Imposes someone else's design language on a bespoke craft brand. Rejected.

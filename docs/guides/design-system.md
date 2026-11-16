# Guide: Design system ("Quarried")

"Quarried" is Quarry's design system — **warm-serious editorial**. This guide covers how to use it: tokens, type, color, and components. The values are owned by design tokens ([ADR 0003](../adr/0003-design-tokens-single-source-of-truth.md)) and consumed through Tailwind v4 ([ADR 0007](../adr/0007-styling-tailwind-v4-plus-tokens.md)).

## The token contract

The single source of truth is **`packages/ui/tokens/tokens.json`**. A build step (`pnpm tokens`, `packages/ui/src/build-tokens.ts`) generates two projections from it — **`tokens.css`** (CSS custom properties, the code side) and **`figma.tokens.json`** (a Tokens Studio file the design side pulls, [below](#syncing-tokens-to-figma-tokens-studio)) — so design and code resolve to identical values.

- **Primitives** = raw scales (color ramps, type sizes, spacing steps).
- **Semantic tokens** = intent-named tokens that reference primitives (`color-surface`, `color-text`, `color-accent`, `space-*`, `radius-*`).
- **Section rhythm** = `--space-section` (`space.section` in `tokens.json`), the single vertical padding for full-width page bands (`.section`, `ToolsSection`, the 404). Adjacent sections stack to exactly 2× this value — never hand-roll a section's `padding-block`.
- **Header height** = `--header-height` (`size.header-height`), the sticky header's height; the header bar, the heroes pulled up beneath it, sticky rails, and the mobile menu's max height all offset by it.
- **Application code uses semantic tokens, never raw hex/px.**
- `tokens.css` and `figma.tokens.json` are **generated** — never hand-edit them. CI fails if either is stale.

To change a value: edit `tokens.json` → `pnpm tokens` → commit the regenerated files. The Figma side follows from the same source — see below.

## Syncing tokens to Figma (Tokens Studio)

Figma **consumes** the tokens; it is not a second source of truth. `pnpm tokens` emits `packages/ui/tokens/figma.tokens.json` — the same tokens in the [Tokens Studio](https://tokens.studio) single-file format (one `core` set) — and CI fails if it drifts from `tokens.json`. The [Tokens Studio Figma plugin](https://www.figma.com/community/plugin/843461159747178978/tokens-studio-for-figma) pulls that file from Git and applies it as Figma Variables. This works on a Figma **Pro** seat — no Enterprise Variables API.

**One-time setup (per file):**

1. Install the **Tokens Studio** plugin in the Figma file.
2. Create a GitHub **fine-grained PAT** with **read-only** access to this repo (Contents: Read) — pull-only sync needs nothing more.
3. In the plugin: **Settings → Sync providers → Add → GitHub**, then set **Personal Access Token** to your PAT, **Repository** `quarry-design-group/quarry.team`, **Branch** `main`, **File path** `packages/ui/tokens/figma.tokens.json`.
4. **Pull** — the `core` set loads. Then **Styles & Variables → Export to Figma → Variables** creates/updates the Variable collection from the tokens.

**On every token change** thereafter: values change in `tokens.json`, CI regenerates `figma.tokens.json`, and a designer clicks **Pull → Export to Figma** to refresh the Variables — never hand-editing variables in Figma.

**What maps, and what doesn't.** Colors, spacing, radii, and sizes become first-class Figma Variables. `space.section` (a `clamp()`), the font stacks, and the easing curves have no native Figma variable type, so they import as string variables or are skipped — they live on the code side only. Light/dark is a CSS semantic-alias concern, not primitive Variables, so a single-mode collection is correct (multi-mode would need Tokens Studio Pro).

## Typography

- **Display:** **Fraunces** — for headings and expressive editorial moments. Carries the "serious editorial" tone.
- **Text:** **Hanken Grotesk** — body and UI copy; clean, readable. Upright and italic faces both ship, so emphasis renders as true italics under the global `font-synthesis: none`.
- **Labels / mono:** **JetBrains Mono** — labels, metadata, code, and small technical accents. The discipline tags set their uppercase labels in `text-2xs`, a fixed 0.7rem below the fluid scale's `xs` floor.

Use the type scale from the tokens; respect heading hierarchy (a11y depends on correct heading order). Long-form bodies (posts, cases, roles, and policies, through `Prose`) step one token per heading level above their `text-lg` body copy: title `4xl`, `h2` `3xl`, `h3` `2xl`, `h4` `xl`. Load fonts without layout shift (NFR: CLS ≤ 0.1).

## Color

- **Quarry Blue `#0C53C7`** — the primary brand color.
- **Stone** — the neutral ramp (surfaces, text, borders) that gives the system its warm-serious base.
- **Ember** — the accent, used sparingly for emphasis/CTA.
- **Discipline (categorical)** — one hue for each of the five disciplines (strategy, design, engineering, ecommerce, data), each with a `-tint` (pale chip background) and `-ink` (AA-darkened text on that tint) pair, used by the discipline tags.

Always reference colors via semantic tokens (`color-surface`, `color-text`, `color-accent`, …), not raw hex. All foreground/background pairings must meet **WCAG 2.2 AA** contrast — verify when introducing a new combination.

## Components

- Components live as `.astro` components (in `apps/web`), structured markup styled with Tailwind utilities that resolve to tokens.
- Reuse existing components before creating new ones; new components should compose tokens, not introduce new raw values.
- **`CtaBand`** is the closing call-to-action band (blue panel, display title, optional sub, primary CTA); marketing pages (home, services, team, AI services, compliance, how we use AI) end with it, and index and utility pages end with their content.
- **`Prose`** is the reading column for rendered MDX bodies (posts, cases, roles, policies). It owns the heading, paragraph, image, link, photo-credit, and pullquote rules, so every long-form template sets the same typography; a pullquote's closing paragraph takes the attribution style only when the quote runs to more than one paragraph.
- **`Select`** is the only way to render a dropdown. A native `<select>` draws the platform's arrow, which ignores the field's padding (Chrome sets it against the border) and takes the platform's color and weight, and it ignores line-height, so it renders shorter than the inputs beside it. `Select` hides the platform arrow, draws a chevron in the text color inside a reserved right padding, and sets a minimum height of one line plus the field's padding and border. `size` matches the form's text inputs (`md` for the contact and grievance forms, `lg` for search); `fieldClass` carries the form's skin. `src/lib/form-primitives.test.ts` fails CI on a bare `<select>` anywhere else in the site source, and `tests/e2e/select.spec.ts` measures every rendered dropdown at phone and desktop widths: arrow hidden, chevron clear of the border and the text, height equal to the neighbouring input.
- **`ImageZoom`** enlarges case-study images on request. The case template renders it once and marks the hero and the MDX body with `data-zoom-scope`; a small bundled script turns each eligible image (alt text, not linked, not a Motion clip, and a source at least 1.25× its rendered width) into a button that opens a native modal `<dialog>`: fitted to the screen, an actual-size mode the reader pans by scrolling, and a link to the file. It is a deliberate client island (ADR-0002): the reading column cannot show a 2,400–2,560px chart or diagram legibly, and the native dialog keeps the cost to one small script with focus trap, Escape and focus return for free. Without JavaScript the images render exactly as before. A raster hero opens a wider derivative than it renders (`data-zoom-src` / `data-zoom-width`); an inline `hero.svg` (see the content authoring guide) is vector with live text and is never wrapped. `tests/e2e/image-zoom.spec.ts` covers it, including an axe pass on the open dialog.
- **`ArchitectureDiagram`** draws an explorable architecture diagram from a typed data file (`src/lib/diagram.ts`: lanes, nodes, flows, and optionally containers), at build time, as inline SVG. A backwards step in a flow draws as a dashed return path through a channel beneath the lanes; containers (boundary, network, zone, group) draw as nested boxes behind the nodes and are named in each node's card and in the text alternative. The AAA reveal, pharmacy data-platform, HIPAA and cookieless cases use it. Node labels are HTML buttons in `foreignObject`, so they wrap and stay real text; colours are the semantic tokens, so it follows the theme; the faces are the brand's. Without JavaScript every node opens a detail card through the native Popover API; hovering or focusing a node highlights the node, and while its card is open every path through it lights with `:has()` (each flow is a class slot `f1`…`f16` that sets `--dg-lit`; off-path connectors fade but node text never does, so contrast holds); a faint dot grid covers the whole card as background texture (never in front of text; dropped under forced colours); connectors leave and enter nodes level and stop at the arrowhead's base; a disclosure lists the paths as text; a detail card is a sheet docked to the bottom of the viewport, and the script keeps it off the path it lights by moving the diagram (in the page it scrolls the lit path clear of the sheet without pushing it under the header; in the expanded view it pads the viewport by the sheet's height so the diagram re-centres above it); and below its 64rem floor the diagram scrolls in its own region, with a container-query hint saying so. One small bundled script adds Expand: the diagram moves into a full-screen modal `<dialog>` (the `ImageZoom` pattern) with zoom controls, the + − 0 keys, Ctrl/⌘-wheel and trackpad pinch (capped per event, so a mouse notch is one modest step), and mouse drag-to-pan; touch and arrow keys keep native scrolling and pinch. Zoom is a percentage of the design size, from fit-to-screen up to 4× the fit or 200%, and Expand opens at the larger of fit and the in-page size, so it never shrinks the diagram. The script also returns focus explicitly on close, since Safari does not focus a clicked button. It is a deliberate client island (ADR-0002): a fitted vector diagram has no "actual size" to switch to, so zoom steps take that role, with no dependency. Geometry is SVG attributes and styling is classes, so the markup carries no style attributes and no generated style block (ADR-0015); the script sets two sizes through CSSOM while a card or the expanded view is open (the home region's height, the viewport's bottom padding), which the CSP permits. At extreme zoom (a 320 × 256 CSS px viewport) there is no room for both the sheet and the lit path; the card stays readable and the path shows once it closes. It is held to WCAG 2.2 AAA where the criterion is measurable, above the site's AA bar: its text inks are the semantic colours pulled toward `--color-text` with `color-mix()` (`--dg-ink-muted`, `--dg-ink-primary`, `--dg-ink-accent`, all at least 7:1 in both themes); every control is at least 44 × 44 px; under forced colours a node on a lit path takes an outline, since borders and shadows are forced; the focus ring is an SVG stroke with `vector-effect: non-scaling-stroke`, so it stays 3 px at any zoom; faded connectors stop at 65% opacity, which keeps 3:1; node labels never clip under reader text spacing; each lane (and each node group) is a named group, read in order; and under forced colours the SVG paint maps to system colours. `tests/e2e/architecture-diagram.spec.ts` covers it: axe (AA and AAA rules) in both themes on the figure, an open card and the expanded view, the AAA checks axe cannot run, and a pass without JavaScript.
- A constrained subset is available inside MDX for editorial content: `<Motion>` (an animated clip with its poster, in posts), `<ArchitectureDiagram>` (in cases) and `<Email>` (an encoded address, in policies) — see the [content authoring guide](content-authoring.md).
- Respect `prefers-reduced-motion`; keep interactivity to genuine islands ([ADR 0002](../adr/0002-frontend-framework-astro.md)).

## Rules of thumb

- **Tokens are the vocabulary; Tailwind is the grammar.** Express layout/state with utilities; pull every constant from tokens.
- **No raw hex or magic spacing** in components or MDX — if a value is missing, add it to `tokens.json`.
- **Don't fork the palette** in a Tailwind config — Tailwind reads the tokens.
- **Accessibility is part of the design**, not a later pass: contrast, focus states, semantics, reduced motion.
- **Lists keep their markers by default.** The base layer restores what Tailwind's preflight strips, so a `<ul>` or `<ol>` in a page, a component, or rendered markdown shows bullets or numbers with no extra classes. A layout list (nav, cards, a logo track) opts out explicitly with `list-none p-0` and carries `role="list"`, which keeps its list semantics in Safari once the markers are gone. Never rely on the reset to hide markers.
- When in doubt, the **Figma file and `tokens.json` are the same contract** — they should never disagree.

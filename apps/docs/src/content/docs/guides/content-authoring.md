---
title: "Guide: Content authoring"
description: "Reference for authoring case studies and blog posts as MDX in the git-based content collections (ADR 0004). For the workflow (git-CMS vs MDX,…"
sidebar:
  order: 1
---

<!-- GENERATED from docs/guides/content-authoring.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/guides/content-authoring.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/guides/content-authoring.md). Edit there; this page is generated.
:::

Reference for authoring case studies and blog posts as MDX in the git-based content collections ([ADR 0004](/architecture/0004-git-based-content-collections/)). For the _workflow_ (git-CMS vs MDX, publishing), see [`../runbooks/content-editing.md`](/runbooks/content-editing/).

> The **Zod schemas in `apps/web/src` are authoritative.** This guide documents the intended shape; if a field here disagrees with the schema, the schema wins (and this guide should be updated). Required fields are enforced at build time — missing/invalid frontmatter fails the build.

## Where things live

```
apps/web/src/content/
  cases/<slug>/index.mdx    ->  /work/<slug>      (folder-per-entry; images sit beside index.mdx)
  posts/<slug>/index.mdx    ->  /blog/<slug>      (folder-per-entry; images sit beside index.mdx)
  roles/<slug>.mdx          ->  /careers/<slug>   (flat MDX)
  policies/<slug>.mdx       ->  /policies/<slug>  (flat MDX; governance + legal documents)
  services/services.json                          (one data file, not per-service MDX)
  team/team.json                                  (one data file, not per-member MDX)
```

Cases and posts are **folder-per-entry** so their images live beside the entry; the folder
name is the URL slug. `services` and `team` are **data collections** (one JSON file each).
Keep slugs lowercase, hyphenated, and **stable**: changing a published slug breaks links and SEO.

## Frontmatter reference

### Case study (`cases/<slug>/index.mdx`)

```mdx
---
title: 'Rebuilding checkout for Acme'
client: 'Acme, Inc.'
summary: 'A short, outcome-led one-liner shown on the work index. When no seo.description is set it also becomes the meta description, so keep it 70-160 characters with no trailing ellipsis.'
disciplines: ['engineering', 'data'] # any of: strategy | design | engineering | ecommerce | data
industry: 'Fintech' # optional
# The outcome model: a declarative headline, an optional 1-2 word kicker, and
# genuine numerals ONLY (no words-as-stats). `supporting` requires `stat`.
outcome:
  kicker: 'Acquired.' # optional 1-2 word opener with real punctuation
  headline: 'A falsifiable, declarative sentence sourced from the body.' # required
  stat: { value: '10×', label: 'revenue growth' } # optional; genuine numerals only
  supporting: # optional, max 2
    - { value: '500k', label: 'avg weekly pageviews' }
role: 'Embedded product & engineering team' # optional
duration: '5 years' # optional
team: 'Two engineers, one designer' # optional
releasedDate: 2026-05-01 # required
updatedDate: 2026-06-01 # optional
hero: ./hero.jpg # optional; a local image beside index.mdx (run through the image pipeline)
heroAlt: "Acme's redesigned checkout on mobile" # required when hero is set
heroCredit: 'Photo by Someone on Unsplash' # optional caption rendered under the hero
featured: true
order: 6 # sort weight on the work index
comingSoon: false
draft: false
seo: # optional; falls back to title + summary
  title: 'Acme checkout rebuild — Quarry'
  description: "How we rebuilt Acme's checkout as an embedded team, in 70-160 characters."
---

Body in MDX. Lead with the outcome, then the approach.
```

### Blog post (`posts/<slug>/index.mdx`)

```mdx
---
title: 'Why we ship zero JavaScript by default'
description: 'The required meta description shown on the index and as the SERP snippet. Must be 70-160 characters with no trailing ellipsis.'
publishedDate: 2026-05-15
updatedDate: 2026-05-20 # optional
author: 'Quarry' # a plain string; defaults to 'Quarry'
category: 'Engineering' # optional
tags: ['engineering', 'performance']
hero: ./hero.jpg # optional; a local image beside index.mdx
heroAlt: 'Descriptive alt text' # required when hero is set
heroCredit: 'Photo by Someone on Unsplash' # optional
draft: false
---

Body in MDX.
```

> Blog slugs migrated from the legacy site **must** match the existing `/blog/<slug>` to preserve SEO ([ADR 0011](/architecture/0011-seo-url-strategy-and-redirects/)).

### Role (`roles/<slug>.mdx`)

Open roles for the careers page. The MDX body is the full description.

```mdx
---
title: 'Senior Full-Stack Engineer'
team: 'Engineering'
location: 'Remote — global' # optional; this is the default
type: 'Full-time' # optional; this is the default
summary: 'One-line teaser for the careers index.'
datePosted: 2026-05-01
validThrough: 2026-07-01 # optional
order: 1
draft: false
---

Body in MDX.
```

### Policy (`policies/<slug>.mdx`)

Governance and legal documents — the `/policies` section ([ADR 0016](/architecture/0016-policies-section-and-collection/)). The MDX body is the document; the shared `Policy` layout renders the category, title, last-updated stamp, and owning role.

```mdx
---
title: 'Accessibility Statement'
summary: 'The index blurb and meta description: 70-160 characters, no trailing ellipsis, saying what the document is.'
category: governance # governance | legal
updated: 2026-09-05 # the "last updated" stamp; bump it with every substantive edit
owner: 'Grievance owner (Principal)' # optional; the accountable ROLE, never a person's name
order: 5 # sort weight within its category on /policies
interactive: false # true = rendered by its own on-demand route (see grievances.mdx), not the static template; a drafted interactive entry 404s and leaves the sitemap
sitemap: true # false keeps thin legal boilerplate (privacy, terms) out of the sitemap
draft: false
---

import Email from '@/components/Email.astro';
import { site } from '@/lib/site';

Body in MDX. Plain language; `##` sections; dates stated, not implied.
```

> `interactive: true` is for a document that carries a live process (the grievance form). Its page lives at `apps/web/src/pages/policies/<slug>.astro` with `prerender = false`, renders the entry's body through the same layout, and owns the behaviour. The prose still lives in the collection.

### Service (`services/services.json`)

Services are a **data collection** — one JSON array, not per-service MDX. Each entry:

```json
{
  "id": "engineering",
  "title": "Full-Stack Engineering",
  "summary": "One-line description of the capability.",
  "capabilities": ["Product ownership & discovery", "UX research & UI design"],
  "discipline": "engineering",
  "order": 2
}
```

`discipline` is optional, one of `strategy | design | engineering | ecommerce | data`.

### Team (`team/team.json`)

Team members are a **data collection** — one JSON file, not per-member MDX:

```json
{
  "id": "jane-doe",
  "name": "Jane Doe",
  "role": "Principal Engineer",
  "location": "Portland, OR",
  "bio": "Short bio.",
  "avatar": "./avatars/jane-doe.jpg",
  "lat": 45.5,
  "lng": -122.7,
  "order": 1
}
```

`role` for an engineer defaults to **Senior Software Engineer** — use it unless the
maintainer specifies another title. Don't carry over a stack- or platform-specific title
from the Team Directory (e.g. "Magento Developer"); the specialty belongs in the `bio`.

`lat`/`lng` place the globe pin and are **city-level only: at most one decimal place** (a
~10 km privacy floor enforced at build, so a finer coordinate fails the build). Never commit
a geocoded address for a named person.

`avatar` is a path **relative to `team.json`** — put the photo in
`apps/web/src/content/team/avatars/` (not `public/`). It runs through Astro's
image pipeline and is rendered with the `<Image>` component at display size,
so commit a reasonably sized original and let the build do the rest.

**Roster avatars are black-and-white.** Fully desaturate every avatar before
committing (e.g. `sharp(src).grayscale()`) — the whole roster carries the same
monochrome treatment, and a color avatar is a visual defect. The `Image budgets`
check (`pnpm images:check`) enforces it: any raster under
`apps/web/src/content/team/avatars/` whose pixels differ across R, G and B by
more than 2 levels fails, with the file and its measured spread named. The
pre-commit hook and `pnpm images:fix` desaturate a color avatar in place. A
face-centered square crop (~800×800 JPEG) keeps the 72px roster circle sharp at
2× density.

## Image handling

- **A case hero can be an inline SVG.** Put a `hero.svg` beside the case's `index.mdx` and the case page inlines it in place of the raster hero, so any text in it is live (selectable, crisp at every size, set in the site fonts) rather than baked into pixels: use it for charts and diagrams. Keep the raster `hero` in frontmatter, text-free: the work cards and the social image still use it. The SVG must carry `role="img"` and a `<title>` (its alt text), and no `style` attributes or `<style>` elements (the strict CSP blocks them): colour the art with presentation attributes and give text a class, styled in the case template.
- **Case-study images enlarge on click.** Any body image (`![]()`) or hero with alt text and a source at least 1.25× its rendered width becomes an enlarge button (`ImageZoom`, see the design-system guide). Nothing to author: commit charts at full resolution (within the budget below) so the enlarged view has detail to show, and give them real alt text, which is also what makes them eligible.
- **Architecture diagrams are data, not images.** Draw a system or flow diagram with `<ArchitectureDiagram>` ([below](#architecturediagram)) rather than exporting a raster: its text stays real, it follows the theme, and the reader can open each step and expand the whole.
- Images live **beside the entry** and are committed to the repo: put them in the case/post folder and reference them relatively (`hero: ./hero.jpg`, `gallery` `src: ./image-1.jpg`, avatars `./avatars/<id>.jpg`). Astro's image pipeline generates optimized, responsive variants at build ([ADR 0006](/architecture/0006-hosting-cloudflare-edge/)).
- Every image needs meaningful **`alt`** text — accessibility (WCAG 2.2 AA) is a CI gate. Use `alt: ""` only for purely decorative images.
- Provide appropriately sized sources; let the image pipeline generate responsive variants. **Committed content images are held to a budget (≤2560px long edge, ≤900 KB)** — the pipeline only downscales, so bigger sources just weigh down the repo. The pre-commit hook auto-normalizes staged images; `pnpm images:fix` fixes anything the CI `Image budgets` check flags.
- **Motion uses animated WebP, not GIF, and the reader starts it.** The same clip as GIF costs materially more bytes at lower fidelity (a 256-colour palette, 1-bit transparency), and the motion contract below is defined on `.webp`, so the `Image budgets` check **rejects any `.gif`** in `apps/web/src/{content,assets}`. Author motion as animated WebP (e.g. `sharp(src, { animated: true }).webp()` or `gif2webp`), held to the same ≤900 KB byte budget as any other raster, and place it with the `<Motion>` component ([below](#motion)). Never reach it with `![]()` syntax, as a `hero`, or through a plain `<Image>`: each of those autoplays it. Motion that starts on its own and runs longer than five seconds fails WCAG 2.2.2 (Pause, Stop, Hide), a Level A criterion beneath the site's AA bar. `pnpm images:fix` writes the clip's still beside it as `<name>.poster.webp`; commit both. The `Image budgets` check enforces the pairing, that the poster matches the clip's dimensions, and that nothing but `<Motion>` reaches either file.

## Using components in MDX

MDX entries embed a constrained subset of design-system components: `<Motion>` places an animated clip in a post ([below](#motion)), `<ArchitectureDiagram>` draws an explorable architecture diagram in a case ([below](#architecturediagram)), and `<Email>` renders an address and its `mailto:` link as HTML character references in a policy (`<Email address={site.email} />`). Keep editorial content mostly prose; reach for components for structure, not decoration. Components inherit the design tokens — never hardcode colors or spacing.

### Motion

An animated WebP renders as its still with a play control; the animation is fetched only when the reader asks for it, and the same control returns to the still. Import the clip and its poster beside the entry:

```mdx
import Motion from '@/components/Motion.astro';
import clip from './image-3.webp';
import clipPoster from './image-3.poster.webp';

<Motion src={clip} poster={clipPoster} alt="A hand waving a small white flag" caption="Surrender" />
```

`alt` describes the clip as it would any image: what a reader who cannot see it would need, including any words burned into the frames. It is not a label for the section it sits in, and it is not the caption. `caption` is optional and renders as the figure's `<figcaption>` — use it for the line that would otherwise sit loose under the image, so the caption is not read out twice.

The still is displayed at the clip's own size and never upscaled, so commit a clip at the size it should appear (these are small, 178–500px wide). The control stays under `prefers-reduced-motion`: motion the reader starts is theirs to start.

`pnpm images:check` enforces the pairing and the poster's dimensions, not its currency: **re-encode a clip and re-run `pnpm images:fix`**, which rewrites the poster and, when the pre-commit hook passes it a clip, stages it too.

### ArchitectureDiagram

An architecture or data-flow diagram is authored as a typed data file beside the entry and drawn at build time as inline SVG. Each step is a button: hovering or focusing it highlights the step, and activating it opens a detail card and lights every path through the step for as long as the card is open; a "Read the diagram as text" disclosure lists each path in order; and, with JavaScript, an Expand button opens it full-screen with zoom. The data model and its validation live in `apps/web/src/lib/diagram.ts`; a malformed diagram fails the build.

```mdx
import ArchitectureDiagram from '@/components/ArchitectureDiagram.astro';
import architecture from './architecture';

<ArchitectureDiagram diagram={architecture} />
```

```ts
// architecture.ts, beside index.mdx
import { defineDiagram } from '@/lib/diagram';

export default defineDiagram({
  id: 'launch-stack', // unique on the page, kebab-case
  kicker: 'Architecture · Launch stack',
  title: 'Two paths, one platform.',
  subtitle: 'Requests and consented data.',
  lanes: [
    { id: 'traffic', label: 'Site traffic' },
    { id: 'data', label: 'Marketing data', rows: 3 },
  ],
  nodes: [
    {
      id: 'visitor',
      lane: 'traffic',
      col: 0,
      kind: 'actor',
      title: 'Visitor',
      detail: 'Browser or phone',
      description: ['…'],
    },
    // …
  ],
  groups: [{ label: 'Destinations', nodes: ['ad-platforms', 'crm', 'analytics'] }],
  flows: [
    { id: 'requests', label: 'Site requests', steps: ['visitor', 'firewall', 'cdn', 'sites'] },
  ],
  footer: { label: 'Foundation', items: ['Infrastructure as code', 'Audit trail'] },
});
```

- **Layout is a grid read left to right.** Lanes stack top to bottom; a node sits in a lane at a `col` (shared across lanes) and a `row` within the lane (`rows` sets a lane's height). Two nodes may not share a cell. A lane's heading sits over the row its leftmost node is on (so it reads with its path, as with a fan-out centred between destinations above and below), unless a node on an earlier row would sit under the heading; then it stays at the lane's top.
- **Flows are the paths, and the connectors come from them.** Each flow lists node ids in order; each consecutive pair becomes an arrow, and a shared arrow is drawn once. A flow runs left to right (or straight down within a column). At most sixteen flows. Model a fan-out (or a fan-in) as one flow per branch, so a card lights only its own branch.
- **A step backwards is a return path.** A step to an earlier column, or up its own column, is drawn dashed: down into a channel beneath the lanes, across, and into its target from the left, so a feedback loop (a reverse-ETL write-back) reads as one. Give the flow a `returnLabel` to name it along the channel (the pharmacy case: "Flagged accounts written back to the CRM"). Keep the column below the step's source clear, since the path drops straight down from it.
- **Containers frame what belongs together.** `containers` lists labelled boxes around nodes and other containers, each with a `kind`: `boundary` (a compliance or trust boundary, tinted), `network` (a VPC, solid), `zone` (an availability zone, dashed) or `group` (a set of services, dotted). They nest but may not partly overlap, and a box may not cover a node it does not hold; either fails the build. A box is never narrower than its label. Give the grid room for them with `geometry` (`colGap`, `rowGap`, `laneGap`, `colWidth`); the HIPAA case uses `{ colWidth: 210, colGap: 96, rowGap: 88, laneGap: 96 }`. Containers are decorative to assistive technology: each node's card names the containers around it, and the text alternative lists every boundary with its nodes.
- **Wide diagrams.** A diagram of six or more columns can set `floor: 'wide'`: it keeps a higher in-page width so its text stays legible, and scrolls (with the hint) below it.
- **`kind`:** `actor` (dashed: a person or device outside the system), `step` (the default), `key` (accented: the one or two steps the story turns on). `badge` tags a node's top edge ("Gate"); `note` puts one short line under it (`tone: 'accent'` for a warning-weight note).
- **`description`** is the node's card: one string per paragraph, plain sentences. It may repeat figures from the entry but must not introduce new ones, and in an anonymized case it follows the same rules as the body (no client, title, vendor or place names).
- **Keep labels short.** Titles and details wrap inside their box, but a two-line title with a two-line detail overflows it: shorten them, or widen the columns with `geometry.colWidth`. Notes and lane labels do not wrap, and a note longer than about two columns runs into its neighbour. A lane already names its context, so node titles need not repeat it (the HIPAA staging lane uses "Database", with "RDS · staging" as the detail). The spec checks every case's labels fit.
- **More than one diagram per entry** is fine (the cookieless case shows a before and an after): give each its own `id`. A data file may export several (`export const before = defineDiagram(...)`).
- The text alternative is generated from the flows (with any return label), containers, notes and footer, so nothing extra is written for screen readers. Open the disclosure to check it reads sensibly.

### ScrollTable

A wide markdown table (more than two or three columns of real prose) overflows a phone screen. Wrap it in `<ScrollTable>` so it scrolls inside its own bordered box instead of pushing the page sideways. The wrapper is a labelled region, keyboard-focusable when it can scroll, so keyboard users can scroll it too; the table keeps native table semantics. Leave a blank line after the opening tag and before the closing one, or MDX won't parse the table as markdown:

```mdx
import ScrollTable from '@/components/ScrollTable.astro';

<ScrollTable label="Reduction actions" wide>

| Action | Owner | Timeline |
| ------ | ----- | -------- |
| ...    | ...   | ...      |

</ScrollTable>
```

`label` is the region's accessible name: name what the table is about, as you would a caption. The first row is the header row; keep it.

Add `wide` when the table has more than two columns or its rows are long: the box breaks out of the reading measure to the site container width (centred on the text column, inside the page gutters), so cells wrap at sensible points instead of a word or two per line. At phone widths it falls back to the column and scrolls. Without `wide`, the table fits the reading column at every width and its cells wrap; it never scrolls, so reserve it for tables of two or three short columns that read well at that width. Keep short labels that must not split (`Scope 1`, `Not started`, `Q1 2027`) on one line with `&nbsp;` between the words.

## Do's and don'ts

**Do**

- Lead case studies with the **outcome**, then the approach.
- Keep slugs stable; set `draft: true` while drafting.
- Write specific `alt` text and accurate `summary`/`description` (they become meta descriptions, held to 70-160 characters).
- Run `pnpm typecheck` to validate frontmatter before opening a PR.

**Don't**

- Don't commit oversized images — keep them within the budget (the pre-commit hook and `pnpm images:fix` normalize staged images).
- Don't change a published slug without a redirect.
- Don't hardcode brand colors/spacing in MDX — use components/tokens.
- Don't ship `draft: true` content expecting it to appear (it's excluded from build, sitemap, and search).
- Don't rely on frontmatter fields the schema doesn't define: Zod silently strips unknown keys, so they do nothing (no build error, but no effect either). Missing or malformed **required** fields do fail the build.

## Punctuation: the em-dash rule

The rule governs editorial content: posts, cases and policies. Heavy em-dash
use is a calling card of machine-written prose.

- An em dash must mark a true interruption or pivot that no other mark can
  carry. If the dash could be deleted or swapped for a period, comma, colon,
  or parentheses without loss, swap it.
- Never more than one em dash per screen of copy.
- Never end a sentence with a dash-coda ("...— and it shows."). Give the
  payoff its own sentence.
- Page `<title>` separators (`Page — Quarry`) are exempt; that is hardware,
  not prose.


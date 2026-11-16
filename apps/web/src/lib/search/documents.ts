/**
 * Site search — the document model and the build-time extraction that feeds
 * it (ADR-0021). One document per public page: the cases, posts, services,
 * roles and policies from the content collections, plus the backbone pages
 * listed in `pages.ts`. Pure and runtime-agnostic: the prerendered endpoint
 * (`src/pages/search-index.json.ts`) reads the collections and hands plain
 * records in; everything here unit-tests without Astro.
 */

export const searchKinds = ['case', 'post', 'service', 'role', 'policy', 'page'] as const;
export type SearchKind = (typeof searchKinds)[number];

/** Reader-facing label per document kind (result chips, the kind filter). */
export const searchKindLabels: Record<SearchKind, string> = {
  case: 'Case study',
  post: 'Insight',
  service: 'Service',
  role: 'Open role',
  policy: 'Policy',
  page: 'Page',
};

/** The kind filter's option labels and the scope in the count line ("in
 *  insights"): plural, and "Other pages" for the backbone pages. */
export const searchKindFilterLabels: Record<SearchKind, string> = {
  case: 'Case studies',
  post: 'Insights',
  service: 'Services',
  role: 'Open roles',
  policy: 'Policies',
  page: 'Other pages',
};

/** One indexed page. `text` is the body with MDX and markup stripped. */
export type SearchDocument = {
  /** Root-relative URL; doubles as the document id. */
  url: string;
  title: string;
  kind: SearchKind;
  summary: string;
  disciplines: string[];
  /** Section headings, in document order. */
  headings: string[];
  text: string;
};

/** A candidate for the index, before the publication filter. */
export type SearchSource = {
  url: string;
  title: string;
  kind: SearchKind;
  summary: string;
  disciplines?: string[];
  /** Raw MDX (or plain text) body; may be absent for data-collection entries. */
  body?: string;
  draft?: boolean;
  comingSoon?: boolean;
  /** Policies rendered by a dedicated on-demand route (the grievance intake). */
  interactive?: boolean;
};

/** Every `## …` / `### …` heading in an MDX body, markup removed. */
export function extractHeadings(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) out.push(stripInline(m[1]));
  }
  return out;
}

/** Inline markdown → plain text: links keep their label, images their alt,
 *  emphasis and code marks are dropped, HTML tags removed. */
function stripInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * An MDX body as searchable prose. ESM `import`/`export` statements, JSX
 * elements (opening, closing and self-closing), fenced code, headings' `#`
 * marks, list bullets, blockquote marks and inline markup are removed; the
 * words stay. Good enough to rank on and to cut a snippet from; the rendered
 * page is never reproduced.
 */
export function stripMdx(body: string): string {
  const withoutFences = body.replace(/```[\s\S]*?```/g, ' ');
  const lines: string[] = [];
  for (const raw of withoutFences.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(import|export)\s/.test(line)) continue;
    if (/^\{\/\*[\s\S]*\*\/\}$/.test(line)) continue;
    lines.push(
      line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^>\s?/, '')
        .replace(/^([-*+]|\d+\.)\s+/, ''),
    );
  }
  return (
    lines
      .join('\n')
      // JSX / HTML elements, including multi-line opening tags with props.
      .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
      .replace(/\{[^{}]*\}/g, ' ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * The publishable subset of `sources` as index documents: drafts, cases
 * marked `comingSoon`, and interactive policies are left out. Order is the
 * caller's; ids (urls) must be unique.
 */
export function buildDocuments(sources: SearchSource[]): SearchDocument[] {
  const seen = new Set<string>();
  const docs: SearchDocument[] = [];
  for (const s of sources) {
    if (s.draft || s.comingSoon || s.interactive) continue;
    if (seen.has(s.url)) throw new Error(`search: duplicate document url ${s.url}`);
    seen.add(s.url);
    const body = s.body ?? '';
    docs.push({
      url: s.url,
      title: s.title.trim(),
      kind: s.kind,
      summary: s.summary.trim(),
      disciplines: [...(s.disciplines ?? [])],
      headings: extractHeadings(body),
      text: stripMdx(body),
    });
  }
  return docs;
}

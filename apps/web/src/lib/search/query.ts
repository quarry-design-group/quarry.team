/**
 * Site search — one query function for both render modes (ADR-0021). Reads
 * the query string, ranks against the index, and returns hits whose display
 * strings are already HTML: every string escaped, matched terms wrapped in
 * `<mark>`. The templates emit these verbatim and nothing else unescaped.
 */
import type { SearchResult } from 'minisearch';
import { searchKinds, type SearchDocument, type SearchKind } from './documents';
import { rankingOptions, type SearchIndex } from './engine';

/** Queries shorter than this render the prompt, on both sides. */
export const MIN_QUERY_LENGTH = 2;
/** Query text beyond this is cut before ranking. */
export const MAX_QUERY_LENGTH = 100;
/** The page shows this many hits at most. */
export const MAX_RESULTS = 25;

export type SearchParams = {
  q: string;
  kind?: SearchKind;
};

export type SearchHit = {
  url: string;
  kind: SearchKind;
  disciplines: string[];
  /** Escaped, matches marked. */
  titleHtml: string;
  /** Escaped, matches marked: the summary when it carries a match, else a
   *  window of body text around the first match. */
  snippetHtml: string;
};

export type SearchOutcome = {
  params: SearchParams;
  /** Matches before the display cap. */
  total: number;
  hits: SearchHit[];
};

const KIND_SET = new Set<string>(searchKinds);

/** `q` and `kind` from a query string, normalized. An unknown kind is dropped
 *  rather than echoed. */
export function parseSearchParams(params: URLSearchParams): SearchParams {
  const q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
  const kind = params.get('kind') ?? '';
  return { q, ...(KIND_SET.has(kind) ? { kind: kind as SearchKind } : {}) };
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Text as HTML text content. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `text`, escaped, with every occurrence of a matched term wrapped in
 * `<mark>`. Terms are matched at word starts (the index matches by prefix),
 * case-insensitively, on the raw text; each segment is escaped on its way
 * out, so an entity is never split by a mark and a term that contains markup
 * characters can never assemble a tag.
 */
export function highlight(text: string, terms: string[]): string {
  const words = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 2))];
  if (words.length === 0) return escapeHtml(text);
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${words.map(escapeRegExp).join('|')})`, 'giu');
  let html = '';
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const lead = m[1] ?? '';
    const word = m[2] ?? '';
    const start = m.index + lead.length;
    html += `${escapeHtml(text.slice(last, start))}<mark>${escapeHtml(word)}</mark>`;
    last = start + word.length;
  }
  return html + escapeHtml(text.slice(last));
}

/** Characters of body text either side of the first match. */
const SNIPPET_BEFORE = 60;
const SNIPPET_AFTER = 120;

/** The summary when it carries a match; otherwise the body text around the
 *  first matched term; otherwise the summary (a title-only match). */
export function snippetFor(doc: Pick<SearchDocument, 'summary' | 'text'>, terms: string[]): string {
  const lower = (s: string) => s.toLowerCase();
  const words = terms.filter((t) => t.length >= 2).map(lower);
  const summary = lower(doc.summary);
  if (words.some((w) => summary.includes(w))) return highlight(doc.summary, terms);

  const text = lower(doc.text);
  let at = -1;
  for (const w of words) {
    const i = text.indexOf(w);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return highlight(doc.summary, terms);

  let start = Math.max(0, at - SNIPPET_BEFORE);
  let end = Math.min(doc.text.length, at + SNIPPET_AFTER);
  if (start > 0) {
    const space = doc.text.indexOf(' ', start);
    if (space !== -1 && space < at) start = space + 1;
  }
  if (end < doc.text.length) {
    const space = doc.text.lastIndexOf(' ', end);
    if (space > at) end = space;
  }
  const window = doc.text.slice(start, end);
  return `${start > 0 ? '…' : ''}${highlight(window, terms)}${end < doc.text.length ? '…' : ''}`;
}

/**
 * Rank `params` against `index`. Every query term must match (AND); when
 * nothing does, the query is rerun so that any term may match (OR), which
 * keeps a long query from returning an empty page. `kind` narrows the
 * candidates before ranking.
 */
export function runQuery(index: SearchIndex, params: SearchParams): SearchOutcome {
  const { q, kind } = params;
  if (q.length < MIN_QUERY_LENGTH) return { params, total: 0, hits: [] };

  // Results carry the stored fields; MiniSearch types them loosely.
  const filter = (r: SearchResult) => !kind || (r as Partial<SearchDocument>).kind === kind;
  let results = index.search(q, { ...rankingOptions, filter });
  if (results.length === 0) {
    results = index.search(q, { ...rankingOptions, combineWith: 'OR', filter });
  }

  const hits = results.slice(0, MAX_RESULTS).map((r) => {
    const doc = r as unknown as SearchDocument;
    return {
      url: doc.url,
      kind: doc.kind,
      disciplines: doc.disciplines,
      titleHtml: highlight(doc.title, r.terms),
      snippetHtml: snippetFor(doc, r.terms),
    };
  });
  return { params, total: results.length, hits };
}

/**
 * Site search — the results template (ADR-0021). One function renders the
 * results block for the full page and for the fragment the island swaps in,
 * so the two modes cannot drift. The root element carries the result count
 * and the query as data attributes for the island's live region. The markup
 * has no scripts, no inline handlers and no style attributes; every string
 * that is not already escaped HTML from `query.ts` is escaped here.
 */
import { searchKindFilterLabels, searchKindLabels, type SearchKind } from './documents';
import { escapeHtml, MAX_RESULTS, MIN_QUERY_LENGTH, type SearchOutcome } from './query';

export type ResultsState =
  { status: 'prompt' } | { status: 'results'; outcome: SearchOutcome } | { status: 'rate-limited' };

/** Reader-facing discipline names on result rows. */
const DISCIPLINE_LABELS: Record<string, string> = {
  strategy: 'Strategy',
  design: 'Design',
  engineering: 'Engineering',
  ecommerce: 'eCommerce',
  data: 'Data',
};

const kindLabel = (kind: SearchKind) => searchKindLabels[kind] ?? kind;

/** "12 results for “data” in case studies" — the visible count line and the
 *  live-region text, from one place. */
export function describeOutcome(outcome: SearchOutcome): string {
  const { total, params } = outcome;
  const noun = total === 1 ? 'result' : 'results';
  const scope = params.kind ? ` in ${searchKindFilterLabels[params.kind].toLowerCase()}` : '';
  if (total === 0) return `No results for “${params.q}”${scope}`;
  const shown = total > MAX_RESULTS ? `Top ${MAX_RESULTS} of ${total} ${noun}` : `${total} ${noun}`;
  return `${shown} for “${params.q}”${scope}`;
}

/** The root element: the count, query and one-line summary ride along as
 *  data attributes so the island can announce a swap without re-deriving
 *  the sentence. */
const root = (attrs: Record<string, string>, inner: string) => {
  const data = Object.entries(attrs)
    .map(([k, v]) => ` data-${k}="${escapeHtml(v)}"`)
    .join('');
  return `<div id="search-results" class="mt-10"${data}>${inner}</div>`;
};

const muted = 'text-(--color-text-muted)';

const RATE_LIMITED_MESSAGE = 'Too many searches in a short time. Wait a minute and try again.';

export function renderResults(state: ResultsState): string {
  if (state.status === 'prompt') {
    return root(
      { count: '0', query: '', summary: '' },
      `<p class="measure ${muted}">Type at least ${MIN_QUERY_LENGTH} characters to search case studies, insights, services, open roles and policies.</p>`,
    );
  }
  if (state.status === 'rate-limited') {
    return root(
      { count: '0', query: '', summary: RATE_LIMITED_MESSAGE, status: 'rate-limited' },
      `<p class="measure ${muted}" role="status">${RATE_LIMITED_MESSAGE}</p>`,
    );
  }

  const { outcome } = state;
  const summary = describeOutcome(outcome);
  const count = `<p class="font-mono text-sm tracking-[0.06em] ${muted} uppercase">${escapeHtml(summary)}</p>`;
  if (outcome.hits.length === 0) {
    return root(
      { count: '0', query: outcome.params.q, summary },
      `${count}<p class="measure mt-4 ${muted}">Try a shorter word, a client name, or a discipline such as “data” or “ecommerce”.</p>`,
    );
  }

  const items = outcome.hits
    .map((hit) => {
      const meta = [
        kindLabel(hit.kind),
        ...hit.disciplines.map((d) => DISCIPLINE_LABELS[d] ?? d),
      ].join(' · ');
      return (
        `<li class="border-t border-(--color-border) py-6">` +
        `<article>` +
        `<p class="m-0 font-mono text-xs tracking-[0.08em] ${muted} uppercase">${escapeHtml(meta)}</p>` +
        `<h2 class="mt-2 text-2xl"><a class="text-(--color-text) no-underline hover:underline hover:underline-offset-4" href="${escapeHtml(hit.url)}">${hit.titleHtml}</a></h2>` +
        `<p class="mt-2 max-w-[70ch] ${muted}">${hit.snippetHtml}</p>` +
        `</article>` +
        `</li>`
      );
    })
    .join('');

  return root(
    { count: String(outcome.total), query: outcome.params.q, summary },
    `${count}<ol class="m-0 mt-6 list-none border-b border-(--color-border) p-0" role="list">${items}</ol>`,
  );
}

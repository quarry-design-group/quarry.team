import { describe, expect, it } from 'vitest';
import { describeOutcome, renderResults } from './render';
import { MAX_RESULTS, type SearchOutcome } from './query';

const outcome = (over: Partial<SearchOutcome> = {}): SearchOutcome => ({
  params: { q: 'data' },
  total: 1,
  hits: [
    {
      url: '/work/pharmacy',
      kind: 'case',
      disciplines: ['data', 'engineering'],
      titleHtml: 'A <mark>data</mark> platform',
      snippetHtml: 'Single source of truth for <mark>data</mark>.',
    },
  ],
  ...over,
});

describe('renderResults', () => {
  it('renders the prompt with an empty count', () => {
    const html = renderResults({ status: 'prompt' });
    expect(html).toMatch(/^<div id="search-results"[^>]*data-count="0"/);
    expect(html).toContain('Type at least 2 characters');
  });

  it('renders hits as a list with kind, disciplines, marked title and snippet', () => {
    const html = renderResults({ status: 'results', outcome: outcome() });
    expect(html).toContain('data-count="1"');
    expect(html).toContain('data-query="data"');
    expect(html).toContain('1 result for “data”');
    expect(html).toContain('Case study · Data · Engineering');
    expect(html).toContain('href="/work/pharmacy"');
    expect(html).toContain('A <mark>data</mark> platform');
    expect(html).toContain('for <mark>data</mark>.');
  });

  it('renders the empty state with the query echoed safely', () => {
    const html = renderResults({
      status: 'results',
      outcome: outcome({ params: { q: '<b>x</b>' }, total: 0, hits: [] }),
    });
    expect(html).toContain('No results for “&lt;b&gt;x&lt;/b&gt;”');
    expect(html).toContain('data-query="&lt;b&gt;x&lt;/b&gt;"');
    expect(html).not.toContain('<b>');
  });

  it('renders the rate-limited notice as a status', () => {
    const html = renderResults({ status: 'rate-limited' });
    expect(html).toContain('data-status="rate-limited"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Too many searches');
  });

  it('ships no scripts, handlers or style attributes', () => {
    for (const state of [
      renderResults({ status: 'prompt' }),
      renderResults({ status: 'results', outcome: outcome() }),
      renderResults({ status: 'rate-limited' }),
    ]) {
      expect(state).not.toMatch(/<script|\son\w+=|\sstyle=/i);
    }
  });
});

describe('describeOutcome', () => {
  it('counts, pluralizes, scopes by kind and notes the display cap', () => {
    expect(describeOutcome(outcome())).toBe('1 result for “data”');
    expect(describeOutcome(outcome({ total: 4 }))).toBe('4 results for “data”');
    expect(describeOutcome(outcome({ total: 0, params: { q: 'x', kind: 'post' } }))).toBe(
      'No results for “x” in insights',
    );
    expect(describeOutcome(outcome({ total: MAX_RESULTS + 3 }))).toBe(
      `Top ${MAX_RESULTS} of ${MAX_RESULTS + 3} results for “data”`,
    );
  });
});

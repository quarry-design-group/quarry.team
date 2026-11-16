import { describe, expect, it } from 'vitest';
import { buildDocuments, type SearchSource } from './documents';
import { buildIndex, loadIndex, serializeIndex, SEARCH_INDEX_VERSION } from './engine';
import {
  escapeHtml,
  highlight,
  MAX_RESULTS,
  parseSearchParams,
  runQuery,
  snippetFor,
} from './query';

const sources: SearchSource[] = [
  {
    url: '/work/shark-tank',
    kind: 'case',
    title: 'Launching a DTC Shark Tank brand on Shopify to $80k in week-one sales',
    summary: 'A storefront built for a television launch spike.',
    disciplines: ['design', 'engineering', 'ecommerce', 'strategy'],
    body: '## The challenge\n\nThe brand aired on Shark Tank. Shopify handled the traffic.',
  },
  {
    url: '/work/pharmacy-data',
    kind: 'case',
    title: 'A data platform and self-serve BI for a pharmacy group',
    summary: 'From siloed tools to a single source of truth.',
    disciplines: ['engineering', 'data', 'strategy'],
    body: '## What we did\n\nWarehouse, orchestration, and dashboards the pharmacists run themselves.',
  },
  {
    url: '/blog/rush-fees',
    kind: 'post',
    title: 'Why we charge rush fees',
    summary: 'Urgency has a cost, and the estimate should say so.',
    body: 'A rush request reshuffles a whole team. The fee pays for the disruption.',
  },
  {
    url: '/services#ecommerce',
    kind: 'service',
    title: 'eCommerce Engineering',
    summary: 'Revenue-moving commerce on Shopify, Magento, and BigCommerce.',
    disciplines: ['ecommerce'],
    body: 'Storefront engineering. Conversion optimization. Incident response.',
  },
];

// The round trip the site performs: build at build time, serialize to the
// static asset, load in the Worker.
const index = loadIndex(
  JSON.parse(JSON.stringify(serializeIndex(buildIndex(buildDocuments(sources))))),
);

describe('the serialized index', () => {
  it('carries its version and document count', () => {
    const s = serializeIndex(buildIndex(buildDocuments(sources)));
    expect(s.version).toBe(SEARCH_INDEX_VERSION);
    expect(s.count).toBe(sources.length);
  });

  it('is refused under another version', () => {
    expect(() => loadIndex({ version: SEARCH_INDEX_VERSION + 1, index: {} })).toThrow(/version/);
    expect(() => loadIndex(null)).toThrow(/version/);
  });
});

describe('parseSearchParams', () => {
  it('normalizes whitespace and caps the length', () => {
    const p = parseSearchParams(new URLSearchParams({ q: '  shark   tank ' }));
    expect(p).toEqual({ q: 'shark tank' });
    expect(parseSearchParams(new URLSearchParams({ q: 'x'.repeat(500) })).q).toHaveLength(100);
  });

  it('keeps a known kind and drops the rest of the query string', () => {
    expect(parseSearchParams(new URLSearchParams({ q: 'a', kind: 'case' }))).toEqual({
      q: 'a',
      kind: 'case',
    });
    expect(parseSearchParams(new URLSearchParams({ q: 'a', kind: 'nope' }))).toEqual({ q: 'a' });
    expect(parseSearchParams(new URLSearchParams({ q: 'a', discipline: 'data' }))).toEqual({
      q: 'a',
    });
  });
});

describe('runQuery', () => {
  it('ranks a known case first for a query in its title', () => {
    const { hits, total } = runQuery(index, { q: 'shark tank' });
    expect(total).toBeGreaterThan(0);
    expect(hits[0].url).toBe('/work/shark-tank');
  });

  it('matches by prefix as the reader types', () => {
    expect(runQuery(index, { q: 'pharm' }).hits[0].url).toBe('/work/pharmacy-data');
  });

  it('requires every term, then falls back to any term', () => {
    const strict = runQuery(index, { q: 'shopify pharmacy' });
    expect(strict.hits.map((h) => h.url)).toEqual(
      expect.arrayContaining(['/work/shark-tank', '/work/pharmacy-data']),
    );
  });

  it('narrows by kind', () => {
    expect(runQuery(index, { q: 'shopify', kind: 'service' }).hits.map((h) => h.url)).toEqual([
      '/services#ecommerce',
    ]);
    expect(runQuery(index, { q: 'shopify' }).hits.map((h) => h.url)).toEqual(
      expect.arrayContaining(['/work/shark-tank', '/services#ecommerce']),
    );
  });

  it('renders the prompt state for a query under the minimum length', () => {
    expect(runQuery(index, { q: 's' })).toEqual({ params: { q: 's' }, total: 0, hits: [] });
  });

  it('caps the hits it returns and reports the full total', () => {
    const many = buildIndex(
      buildDocuments(
        Array.from({ length: MAX_RESULTS + 5 }, (_, i) => ({
          url: `/blog/post-${i}`,
          kind: 'post' as const,
          title: `Post ${i} about pricing`,
          summary: 'Pricing.',
          body: 'Pricing pricing pricing.',
        })),
      ),
    );
    const { hits, total } = runQuery(many, { q: 'pricing' });
    expect(total).toBe(MAX_RESULTS + 5);
    expect(hits).toHaveLength(MAX_RESULTS);
  });

  it('marks the matched terms in the title and snippet', () => {
    const [hit] = runQuery(index, { q: 'shark' }).hits;
    expect(hit.titleHtml).toContain('<mark>Shark</mark> Tank');
    expect(hit.snippetHtml).toMatch(/<mark>Shark<\/mark>/);
  });
});

describe('escaping', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('escapes every segment, so a term cannot assemble a tag', () => {
    const html = highlight('<script>alert(1)</script> script', ['<script>', 'script']);
    expect(html).not.toContain('<script>');
    expect(html).toContain('<mark>&lt;script&gt;</mark>');
    expect(html).toContain('&lt;/<mark>script</mark>&gt;');
    expect(html).toContain(' <mark>script</mark>');
  });

  it('matches the raw text, so a term never splits an entity', () => {
    expect(highlight('Q&A with the team', ['amp'])).toBe('Q&amp;A with the team');
    expect(highlight("the team's <b>plan</b>", ['39', 'lt', 'plan'])).toBe(
      'the team&#39;s &lt;b&gt;<mark>plan</mark>&lt;/b&gt;',
    );
  });

  it('marks at word starts only, case-insensitively', () => {
    expect(highlight('Data and metadata', ['data'])).toBe('<mark>Data</mark> and metadata');
    expect(highlight('x', ['x'])).toBe('x');
  });

  it('never echoes markup from a query through the hits', () => {
    const { hits } = runQuery(index, { q: '<img src=x onerror=alert(1)>' });
    for (const h of hits) {
      expect(h.titleHtml).not.toMatch(/<(?!\/?mark>)/);
      expect(h.snippetHtml).not.toMatch(/<(?!\/?mark>)/);
    }
  });
});

describe('snippetFor', () => {
  const doc = {
    summary: 'A summary without the term.',
    text: `${'word '.repeat(40)}the needle sits here ${'word '.repeat(60)}`.trim(),
  };

  it('prefers the summary when it carries a match', () => {
    expect(snippetFor({ ...doc, summary: 'Needle in the summary.' }, ['needle'])).toBe(
      '<mark>Needle</mark> in the summary.',
    );
  });

  it('cuts a window around the first match in the body, on word boundaries', () => {
    const s = snippetFor(doc, ['needle']);
    expect(s).toMatch(/^…/);
    expect(s).toMatch(/…$/);
    expect(s).toContain('the <mark>needle</mark> sits here');
    expect(s).not.toMatch(/…wor\b/);
  });

  it('falls back to the summary when the match is in the title only', () => {
    expect(snippetFor(doc, ['absent'])).toBe('A summary without the term.');
  });
});

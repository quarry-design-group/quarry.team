import { describe, expect, it } from 'vitest';
import { buildDocuments, extractHeadings, stripMdx, type SearchSource } from './documents';
import { backbonePages } from './pages';

const MDX = `import Motion from '@/components/Motion.astro';
import clip from './clip.webp';

## The challenge

A **beloved** but niche membership product had plateaued. See [the storefront](https://example.com).

<Motion
  src={clip}
  alt="Clip"
/>

\`\`\`ts
const secret = 'code fences are not prose';
\`\`\`

### What we did

- Rebuilt core flows for conversion
- Hardened infrastructure to absorb 500k+ weekly pageviews

> Quote from the client.
`;

describe('stripMdx', () => {
  const text = stripMdx(MDX);

  it('keeps the prose and drops imports, JSX, fences and markup', () => {
    expect(text).toContain('A beloved but niche membership product had plateaued.');
    expect(text).toContain('See the storefront.');
    expect(text).toContain('Rebuilt core flows for conversion');
    expect(text).toContain('Quote from the client.');
    expect(text).not.toContain('import');
    expect(text).not.toContain('Motion');
    expect(text).not.toContain('{clip}');
    expect(text).not.toContain('code fences');
    expect(text).not.toMatch(/[<>*#`]/);
  });

  it('collapses whitespace to single spaces', () => {
    expect(text).not.toMatch(/\s{2}/);
  });
});

describe('extractHeadings', () => {
  it('lists every heading in order without its marks or inline markup', () => {
    expect(extractHeadings(MDX)).toEqual(['The challenge', 'What we did']);
    expect(extractHeadings('## A *bold* [link](/x) ##')).toEqual(['A bold link']);
  });
});

const source = (over: Partial<SearchSource>): SearchSource => ({
  url: '/work/x',
  title: ' Title ',
  kind: 'case',
  summary: ' Summary ',
  body: '## Heading\n\nBody text.',
  ...over,
});

describe('buildDocuments', () => {
  it('excludes drafts, coming-soon cases and interactive policies', () => {
    const docs = buildDocuments([
      source({ url: '/work/published' }),
      source({ url: '/work/draft', draft: true }),
      source({ url: '/work/soon', comingSoon: true }),
      source({ url: '/policies/grievances', kind: 'policy', interactive: true }),
    ]);
    expect(docs.map((d) => d.url)).toEqual(['/work/published']);
  });

  it('trims titles and summaries, extracts headings and strips the body', () => {
    const [doc] = buildDocuments([source({})]);
    expect(doc).toMatchObject({
      url: '/work/x',
      title: 'Title',
      summary: 'Summary',
      kind: 'case',
      disciplines: [],
      headings: ['Heading'],
      text: 'Heading Body text.',
    });
  });

  it('refuses two documents with one url', () => {
    expect(() => buildDocuments([source({}), source({})])).toThrow(/duplicate/);
  });

  it('indexes every backbone page with a 70–160 character summary', () => {
    const docs = buildDocuments(backbonePages);
    expect(docs.map((d) => d.url)).toEqual([
      '/',
      '/services',
      '/ai-services',
      '/compliance',
      '/how-we-use-ai',
      '/track-record',
      '/team',
      '/careers',
      '/contact',
    ]);
    for (const d of docs) {
      expect(d.kind).toBe('page');
      expect(d.summary.length).toBeGreaterThanOrEqual(70);
      expect(d.summary.length).toBeLessThanOrEqual(170);
    }
  });
});

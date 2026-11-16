/**
 * Site search — the MiniSearch index: built once at build time from the
 * documents, serialized as a static asset, and loaded once per Worker isolate
 * (ADR-0021). The options object is the contract between the two sides: a
 * serialized index only loads under the options it was built with, so both
 * the prerendered endpoint and the on-demand route import this one module.
 */
import MiniSearch, { type Options, type SearchOptions } from 'minisearch';
import type { SearchDocument } from './documents';

/** Bump when the document shape or the options change: an index serialized
 *  under another version is refused rather than loaded into the wrong shape. */
export const SEARCH_INDEX_VERSION = 1;

/** Where the prerendered endpoint lands in `dist/client`. */
export const SEARCH_INDEX_PATH = '/search-index.json';

export type SerializedSearchIndex = {
  version: number;
  generated: string;
  count: number;
  index: ReturnType<MiniSearch<SearchDocument>['toJSON']>;
};

/**
 * Field weights: a term in the title outranks the same term in a heading,
 * which outranks the summary, which outranks body text. Disciplines are
 * indexed so "ecommerce" finds every ecommerce case, at body weight.
 */
export const rankingOptions: SearchOptions = {
  prefix: true,
  fuzzy: 0.2,
  boost: { title: 3, headings: 2, summary: 1.5 },
  combineWith: 'AND',
};

// Array fields (headings, disciplines) tokenize through their string form,
// which the default tokenizer splits on the commas; they are stored as arrays.
export const searchOptions: Options<SearchDocument> = {
  idField: 'url',
  fields: ['title', 'summary', 'headings', 'disciplines', 'text'],
  storeFields: ['url', 'title', 'kind', 'summary', 'disciplines', 'text'],
  searchOptions: rankingOptions,
};

export type SearchIndex = MiniSearch<SearchDocument>;

/** A fresh index over `docs`. */
export function buildIndex(docs: SearchDocument[]): SearchIndex {
  const index = new MiniSearch<SearchDocument>(searchOptions);
  index.addAll(docs);
  return index;
}

/** The index as the JSON document the endpoint emits. */
export function serializeIndex(index: SearchIndex, generated = new Date()): SerializedSearchIndex {
  return {
    version: SEARCH_INDEX_VERSION,
    generated: generated.toISOString(),
    count: index.documentCount,
    index: index.toJSON(),
  };
}

/** The index back from its JSON document; refuses another version. */
export function loadIndex(serialized: unknown): SearchIndex {
  const data = serialized as Partial<SerializedSearchIndex> | null;
  if (!data || typeof data !== 'object' || data.version !== SEARCH_INDEX_VERSION || !data.index) {
    throw new Error(
      `search: index version ${String(data?.version)} does not match ${SEARCH_INDEX_VERSION}`,
    );
  }
  return MiniSearch.loadJS<SearchDocument>(data.index, searchOptions);
}

/** The static-assets binding, as the Worker sees it. */
export type AssetsBinding = { fetch(request: Request | URL | string): Promise<Response> };

let cached: Promise<SearchIndex> | undefined;

/**
 * The site's index, fetched from the assets binding once per isolate and
 * held in module scope after that: one asset, one cache entry, whichever
 * host (apex, www, a preview) the request arrived on. A failed fetch is not
 * cached, so the next request retries. `origin` only makes the asset URL
 * absolute; the binding resolves it to its path.
 */
export function loadSiteIndex(assets: AssetsBinding, origin: string): Promise<SearchIndex> {
  if (cached) return cached;
  const index = (async () => {
    const res = await assets.fetch(new URL(SEARCH_INDEX_PATH, origin));
    if (!res.ok) throw new Error(`search: ${SEARCH_INDEX_PATH} answered ${res.status}`);
    return loadIndex(await res.json());
  })();
  cached = index;
  index.catch(() => {
    if (cached === index) cached = undefined;
  });
  return index;
}

/** Test seam: forget the isolate-scoped index. */
export function resetSiteIndexCache(): void {
  cached = undefined;
}

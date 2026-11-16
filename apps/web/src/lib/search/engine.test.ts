import { afterEach, describe, expect, it } from 'vitest';
import { buildDocuments } from './documents';
import {
  buildIndex,
  loadSiteIndex,
  resetSiteIndexCache,
  SEARCH_INDEX_PATH,
  serializeIndex,
  type AssetsBinding,
} from './engine';

const serialized = JSON.stringify(
  serializeIndex(
    buildIndex(
      buildDocuments([
        { url: '/blog/a', kind: 'post', title: 'Alpha', summary: 'First.', body: 'alpha' },
      ]),
    ),
  ),
);

/** An assets binding that answers the index path and counts its fetches. */
const assets = (status = 200): AssetsBinding & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    async fetch(request) {
      const url = new URL(request instanceof Request ? request.url : String(request));
      calls.push(url.pathname);
      return new Response(status === 200 ? serialized : 'nope', {
        status,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
};

afterEach(() => resetSiteIndexCache());

describe('loadSiteIndex', () => {
  it('fetches the index from the assets binding once and reuses it', async () => {
    const a = assets();
    const first = await loadSiteIndex(a, 'https://quarry.team');
    const second = await loadSiteIndex(a, 'https://quarry.team');
    const www = await loadSiteIndex(a, 'https://www.quarry.team');
    expect(second).toBe(first);
    expect(www).toBe(first);
    expect(a.calls).toEqual([SEARCH_INDEX_PATH]);
    expect(first.search('alpha')[0].id).toBe('/blog/a');
  });

  it('does not cache a failed fetch', async () => {
    const bad = assets(404);
    await expect(loadSiteIndex(bad, 'https://quarry.team')).rejects.toThrow(/404/);
    const good = assets();
    await expect(loadSiteIndex(good, 'https://quarry.team')).resolves.toBeDefined();
    expect(good.calls).toHaveLength(1);
  });
});

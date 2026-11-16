import { afterEach, describe, expect, it, vi } from 'vitest';
import { withinBudget, type RateLimiter } from './ratelimit';

const limiter = (success: boolean): RateLimiter & { keys: string[] } => {
  const keys: string[] = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      return { success };
    },
  };
};

afterEach(() => vi.restoreAllMocks());

describe('withinBudget', () => {
  it('keys the binding on the connecting address and passes its verdict through', async () => {
    const ok = limiter(true);
    expect(await withinBudget({ SEARCH_RATE_LIMITER: ok }, '203.0.113.7')).toBe(true);
    expect(ok.keys).toEqual(['203.0.113.7']);

    const over = limiter(false);
    expect(await withinBudget({ SEARCH_RATE_LIMITER: over }, '203.0.113.7')).toBe(false);
  });

  it('uses a fixed key when the address header is absent', async () => {
    const ok = limiter(true);
    await withinBudget({ SEARCH_RATE_LIMITER: ok }, '');
    expect(ok.keys).toEqual(['unknown']);
  });

  it('stays open, with a warning, when the binding is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await withinBudget({}, '203.0.113.7')).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });
});

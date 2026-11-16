import { describe, it, expect } from 'vitest';
import { formatDate } from './dates';

describe('formatDate', () => {
  // A bare frontmatter date, as z.coerce.date() parses it: midnight UTC.
  const d = new Date('2026-10-03');

  it('keeps the calendar day regardless of the build machine’s zone', () => {
    expect(formatDate(d)).toBe('October 3, 2026');
  });
  it('supports the short month used on post cards', () => {
    expect(formatDate(d, 'short')).toBe('Oct 3, 2026');
  });
});

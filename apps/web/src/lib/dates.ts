/**
 * Display formatting for content dates. Frontmatter dates (`2026-10-03`) are
 * coerced to midnight UTC, so they must be formatted in UTC: formatting in the
 * build machine's zone renders the previous day anywhere west of Greenwich
 * (a local build in Pacific time, say), while CI's UTC runners hide the bug.
 */
export const formatDate = (d: Date, month: 'long' | 'short' = 'long'): string =>
  d.toLocaleDateString('en-US', { year: 'numeric', month, day: 'numeric', timeZone: 'UTC' });

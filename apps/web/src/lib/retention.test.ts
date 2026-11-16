import { describe, it, expect } from 'vitest';
import { purgeExpired, RETENTION_TERMS, type D1Purgeable } from './retention';

/** D1 stub that records each statement and answers with a fixed change count. */
function fakeDb(changes: Record<string, number>, failOn?: string) {
  const calls: { query: string; values: unknown[] }[] = [];
  const db: D1Purgeable = {
    prepare: (query) => ({
      bind: (...values) => ({
        run: async () => {
          calls.push({ query, values });
          const table = /DELETE FROM (\w+)/.exec(query)?.[1] ?? '';
          if (table === failOn) throw new Error('D1_ERROR: no such table');
          return { meta: { changes: changes[table] ?? 0 } };
        },
      }),
    }),
  };
  return { db, calls };
}

describe('purgeExpired', () => {
  it('deletes each table past its term and reports the counts', async () => {
    const { db, calls } = fakeDb({ form_submissions: 3, grievance_events: 40 });
    const counts = await purgeExpired(db);
    expect(counts).toEqual({ form_submissions: 3, grievance_events: 40, grievance_throttle: 0 });
    expect(calls).toEqual([
      {
        query: "DELETE FROM form_submissions WHERE created_at < datetime('now', ?)",
        values: ['-36 months'],
      },
      {
        query: "DELETE FROM grievance_events WHERE at < datetime('now', ?)",
        values: ['-13 months'],
      },
      {
        query: "DELETE FROM grievance_throttle WHERE updated_at < datetime('now', ?)",
        values: ['-13 months'],
      },
    ]);
  });

  it('holds the published terms', () => {
    expect(RETENTION_TERMS.map(({ table, months }) => [table, months])).toEqual([
      ['form_submissions', 36],
      ['grievance_events', 13],
      ['grievance_throttle', 13],
    ]);
  });

  it('never touches the grievance records, whose term runs from closure', async () => {
    const { db, calls } = fakeDb({});
    await purgeExpired(db);
    expect(calls.some((c) => /\bgrievances\b/.test(c.query))).toBe(false);
  });

  it('throws when a statement fails, so the cron run records the failure', async () => {
    const { db } = fakeDb({}, 'grievance_events');
    await expect(purgeExpired(db)).rejects.toThrow('D1_ERROR');
  });
});

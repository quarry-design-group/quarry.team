/**
 * The scheduled retention purge (docs/runbooks/data-retention.md). The Worker's
 * daily cron trigger (`src/worker.ts` `scheduled`) deletes every row past its
 * date-based term:
 *
 * - `form_submissions`: 36 months after receipt (ADR-0014)
 * - `grievance_events` and `grievance_throttle`: thirteen months (ADR-0017)
 *
 * Grievance records are kept three years after the concern is closed, and
 * closure is recorded in the Notion log, so their deletion is the runbook's
 * quarterly step with the grievance owner's confirmation.
 *
 * Runtime-agnostic (a structural D1 type) so it unit-tests without a Worker.
 */

/** Structural D1 type — the `run()` result carries the deleted-row count. */
export interface D1Purgeable {
  prepare(query: string): {
    bind(...values: unknown[]): { run(): Promise<{ meta?: { changes?: number } }> };
  };
}

/** Each purged table, the timestamp column its term runs from, and the term. */
export const RETENTION_TERMS = [
  { table: 'form_submissions', column: 'created_at', months: 36 },
  { table: 'grievance_events', column: 'at', months: 13 },
  { table: 'grievance_throttle', column: 'updated_at', months: 13 },
] as const;

export type PurgeCounts = Record<(typeof RETENTION_TERMS)[number]['table'], number>;

/** Delete every row past its term; returns the deleted count per table. A
 *  failing statement throws, so the cron invocation records the failure. */
export async function purgeExpired(db: D1Purgeable): Promise<PurgeCounts> {
  const counts = {} as PurgeCounts;
  for (const { table, column, months } of RETENTION_TERMS) {
    const result = await db
      .prepare(`DELETE FROM ${table} WHERE ${column} < datetime('now', ?)`)
      .bind(`-${months} months`)
      .run();
    counts[table] = result.meta?.changes ?? 0;
  }
  return counts;
}

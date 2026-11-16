import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CI shards Lighthouse (lighthouserc.cjs, LIGHTHOUSE_SHARD=i/n) and Playwright
 * (--shard=i/n) across matrix jobs in .github/workflows/ci.yml. A shard that
 * silently drops a URL would ungate that page class, so these guards hold the
 * split to a partition: every URL in exactly one shard, every shard non-empty,
 * and the matrix numbering exactly 1..n for both suites. Branch protection
 * requires each suite's gate job by name, so the gate contract is pinned too:
 * the required name, `always()`, and a pass only on every shard's success.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

type LhciConfig = {
  URLS: string[];
  partition: (urls: string[], total: number) => string[][];
  select: (urls: string[], spec?: string) => string[];
  ci: { collect: { url: string[] } };
};
const require = createRequire(import.meta.url);
const lhci = require(join(ROOT, 'lighthouserc.cjs')) as LhciConfig;

/** The body of job `job` in ci.yml: its lines below `  job:`. */
function jobBody(job: string): string {
  const lines = WORKFLOW.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${job}:`);
  expect(start, `ci.yml defines job \`${job}\``).toBeGreaterThan(-1);
  const end = lines.findIndex((l, i) => i > start && /^ {2}\S/.test(l));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

/** The `shard: [...]` matrix of job `job` in ci.yml. */
function matrixShards(job: string): number[] {
  const m = /^\s+shard: \[([\d,\s]+)\]\s*$/m.exec(jobBody(job));
  expect(m, `\`${job}\` has a \`shard: [1, 2, …]\` matrix`).not.toBeNull();
  return m![1].split(',').map((n) => Number(n.trim()));
}

const oneToN = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('Lighthouse shards', () => {
  it('runs every URL when unsharded (local autorun)', () => {
    expect(lhci.select(lhci.URLS, undefined)).toEqual(lhci.URLS);
    expect(lhci.select(lhci.URLS, '')).toEqual(lhci.URLS);
  });

  it('lists each URL once', () => {
    expect(new Set(lhci.URLS).size).toBe(lhci.URLS.length);
  });

  const shards = matrixShards('lighthouse-shard');

  it('numbers the ci.yml matrix 1..n', () => {
    expect(shards).toEqual(oneToN(shards.length));
  });

  it(`partitions the URLs across the ${shards.length} CI shards with none empty`, () => {
    const n = shards.length;
    const parts = shards.map((i) => lhci.select(lhci.URLS, `${i}/${n}`));
    for (const part of parts) expect(part.length).toBeGreaterThan(0);
    expect(parts.flat().sort()).toEqual([...lhci.URLS].sort());
  });

  it('is a partition for every shard count up to one URL per shard', () => {
    for (let n = 1; n <= lhci.URLS.length; n++) {
      const parts = lhci.partition(lhci.URLS, n);
      expect(parts).toHaveLength(n);
      for (const part of parts) expect(part.length, `${n} shards`).toBeGreaterThan(0);
      expect(parts.flat().sort()).toEqual([...lhci.URLS].sort());
      // Deterministic: every job computes the same split from the same list.
      expect(lhci.partition(lhci.URLS, n)).toEqual(parts);
    }
  });

  it('hands each CI shard its LIGHTHOUSE_SHARD', () => {
    expect(jobBody('lighthouse-shard')).toContain(
      'LIGHTHOUSE_SHARD: ${{ matrix.shard }}/${{ strategy.job-total }}',
    );
  });

  it('rejects a malformed or out-of-range LIGHTHOUSE_SHARD', () => {
    for (const spec of ['3', '0/3', '4/3', '1/0', 'a/b', '1/3 ', `1/${lhci.URLS.length + 1}`]) {
      expect(() => lhci.select(lhci.URLS, spec), spec).toThrow(/LIGHTHOUSE_SHARD/);
    }
  });
});

describe('Playwright shards', () => {
  it('numbers the ci.yml matrix 1..n', () => {
    const shards = matrixShards('e2e-shard');
    expect(shards).toEqual(oneToN(shards.length));
  });

  it('runs each CI shard with its --shard', () => {
    expect(jobBody('e2e-shard')).toContain(
      'pnpm test:e2e --shard=${{ matrix.shard }}/${{ strategy.job-total }}',
    );
  });
});

describe('gate jobs (the required checks)', () => {
  const gates = [
    { gate: 'e2e', shard: 'e2e-shard', name: 'E2E (Playwright)' },
    { gate: 'lighthouse', shard: 'lighthouse-shard', name: 'Lighthouse CI (CWV budgets)' },
  ];
  for (const { gate, shard, name } of gates) {
    it(`${gate} keeps the required name and passes only if every ${shard} passed`, () => {
      const lines = jobBody(gate).split('\n');
      expect(lines).toContain(`    name: ${name}`);
      expect(lines).toContain(`    needs: ${shard}`);
      // always(): a gate skipped by its own `if` would pass as a required check.
      expect(lines).toContain('    if: always()');
      // …and on the verdict step: its implicit success() is false once the run
      // is cancelled, which would leave the gate asserting nothing.
      const verdict = lines.indexOf('      - name: Every shard passed');
      expect(verdict, 'gate has an "Every shard passed" step').toBeGreaterThan(-1);
      expect(lines[verdict + 1]).toBe('        if: always()');
      const body = lines.join('\n');
      expect(body).toContain(`RESULT: \${{ needs.${shard}.result }}`);
      expect(body).toContain('[ "$RESULT" = success ]');
    });
  }
});

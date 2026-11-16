import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The Worker's runtime secrets reach the deploy step through one named map in
 * .github/workflows/deploy-web.yml (`env: &worker-secrets`), so the step sees
 * the Worker's secrets and no other. These guards keep that map, the code, the
 * Terraform-written secrets, and the infra README's table naming the same
 * WORKER_* secrets: a secret the code reads but the map omits would never ship.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SRC = join(ROOT, 'apps/web/src');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/deploy-web.yml'), 'utf8');
const NAME = /^WORKER_[A-Z0-9_]+$/;

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

/** The `env: &worker-secrets` block: each entry as written. */
function workerSecretsMap(): { key: string; ref: string }[] {
  const lines = WORKFLOW.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*env: &worker-secrets\s*$/.test(l));
  expect(start, 'deploy-web.yml defines `env: &worker-secrets`').toBeGreaterThan(-1);
  const indent = lines[start].search(/\S/);
  const entries: { key: string; ref: string }[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    if (line.search(/\S/) <= indent) break;
    const m = /^\s*([A-Za-z0-9_]+):\s*(.+?)\s*$/.exec(line);
    expect(m, `map entry is \`NAME: value\`: ${line.trim()}`).not.toBeNull();
    entries.push({ key: m![1], ref: m![2] });
  }
  return entries;
}

const mapNames = () => workerSecretsMap().map((e) => e.key);

/** WORKER_* names the web app reads (tests included: they exercise real names). */
function codeNames(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of walk(SRC).filter((f) => /\.(ts|astro|mjs)$/.test(f))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\bWORKER_[A-Z0-9_]+\b/g)) {
      if (!found.has(m[0])) found.set(m[0], relative(ROOT, file));
    }
  }
  return found;
}

describe('Worker secrets map (deploy-web.yml)', () => {
  it('maps each name to the secret of the same name, and only WORKER_* names', () => {
    const entries = workerSecretsMap();
    expect(entries.length).toBeGreaterThan(0);
    for (const { key, ref } of entries) {
      expect(key, 'a Worker secret is named WORKER_*').toMatch(NAME);
      expect(ref, `${key} reads the secret of the same name`).toBe(`\${{ secrets.${key} }}`);
    }
    expect(new Set(mapNames()).size, 'no name is mapped twice').toBe(entries.length);
  });

  it('lists every WORKER_* name the web app reads', () => {
    const mapped = new Set(mapNames());
    const missing = [...codeNames()]
      .filter(([name]) => !mapped.has(name))
      .map(([name, file]) => `${name} (read in ${file})`);
    expect(
      missing,
      `Add each to the \`env: &worker-secrets\` map in .github/workflows/deploy-web.yml:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('lists every WORKER_* secret Terraform writes (infra/github.tf)', () => {
    const tf = readFileSync(join(ROOT, 'infra/github.tf'), 'utf8');
    const written = [...tf.matchAll(/^\s*(WORKER_[A-Z0-9_]+)\s*=/gm)].map((m) => m[1]);
    expect(written.length).toBeGreaterThan(0);
    const mapped = new Set(mapNames());
    expect(written.filter((n) => !mapped.has(n))).toEqual([]);
  });

  it('feeds both deploy jobs from the one map, and no step reads the whole secrets context', () => {
    expect(WORKFLOW.match(/env: &worker-secrets\b/g)).toHaveLength(1);
    expect(WORKFLOW.match(/env: \*worker-secrets\b/g)).toHaveLength(1);
    for (const file of readdirSync(join(ROOT, '.github/workflows'))) {
      const text = readFileSync(join(ROOT, '.github/workflows', file), 'utf8');
      expect(text, `${file} passes toJSON(secrets)`).not.toMatch(/toJSON\(\s*secrets\s*\)/);
    }
  });

  it('matches the infra README table of Worker runtime secrets', () => {
    const readme = readFileSync(join(ROOT, 'infra/README.md'), 'utf8');
    const section = readme.slice(readme.indexOf('### Worker runtime secrets'));
    const table = section.slice(0, section.indexOf('\n\n', section.indexOf('| Secret')));
    const documented = [...table.matchAll(/^\| `(WORKER_[A-Z0-9_]+)`/gm)].map((m) => m[1]).sort();
    expect(documented).toEqual([...mapNames()].sort());
  });
});

describe('worker-secrets.mjs', () => {
  const script = join(ROOT, '.github/scripts/worker-secrets.mjs');
  const run = (env: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'worker-secrets-'));
    const out = join(dir, 'secrets.json');
    try {
      const log = execFileSync(process.execPath, [script, out], {
        env: { PATH: process.env.PATH ?? '', ...env },
        encoding: 'utf8',
      });
      return { log, written: JSON.parse(readFileSync(out, 'utf8')) as Record<string, string> };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('writes the WORKER_* variables with values, under their own names, and nothing else', () => {
    const { log, written } = run({
      WORKER_RESEND_API_KEY: 're_test',
      WORKER_NOTION_TOKEN: '',
      CLOUDFLARE_API_TOKEN: 'cf_test',
    });
    expect(written).toEqual({ WORKER_RESEND_API_KEY: 're_test' });
    expect(log).toContain('shipped to the Worker (1): WORKER_RESEND_API_KEY');
    expect(log).not.toContain('re_test');
  });

  it('refuses a malformed WORKER_ name', () => {
    expect(() => run({ 'WORKER_bad-name': 'x' })).toThrow();
  });
});

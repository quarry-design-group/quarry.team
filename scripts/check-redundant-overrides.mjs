#!/usr/bin/env node
/**
 * check-redundant-overrides.mjs — flag pnpm overrides the upstream tree has outgrown.
 *
 * Each entry in package.json > pnpm.overrides forces a transitive dependency off
 * a vulnerable version range onto a patched one. They are deliberately written
 * with a *vulnerable-range selector* (e.g. `"undici@>=7.0.0 <7.28.0": ">=7.28.0 <8"`)
 * so that, once Dependabot moves the upstream packages forward, the selector stops
 * matching and the override quietly becomes a no-op. But pnpm never tells you when
 * that has happened — a non-matching override is a silent no-op (exit 0) — so the
 * dead entries calcify in package.json and can even hold back a legitimate upgrade.
 *
 * This script finds the calcified ones. For each override it removes it, re-resolves
 * the lockfile, and compares the resolved version(s) of the target package against
 * the committed lockfile. If they are identical, the override changed nothing —
 * upstream already resolves to the same version with or without it — so it is
 * redundant and should be deleted. If they differ, the override is still doing work
 * (holding the package off a version the selector matches) and is kept.
 *
 * This is deliberately severity-agnostic: it asks "does this override still change
 * resolution?", NOT "does `pnpm audit` still pass?". An override that bumps a package
 * off a *moderate* advisory (below the high audit gate) is still load-bearing and
 * must not be flagged just because the high audit is clean without it.
 *
 * Run on a schedule (.github/workflows/security.yml) or locally via
 * `pnpm audit:overrides`. Exits 1 and lists the redundant overrides; exits 0 when
 * every override is still load-bearing. The working tree is restored either way.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PKG = join(ROOT, 'package.json');
const LOCK = join(ROOT, 'pnpm-lock.yaml');

/** Override keys intentionally retained even if they no longer change resolution.
 *  Document WHY next to each (e.g. a forward-looking pin kept on purpose). */
const KEEP = new Set([
  // 'foo@<1.2.3': kept ahead of upstream on purpose — see PR #...
]);

const pkgText = readFileSync(PKG, 'utf8');
const lockText = readFileSync(LOCK, 'utf8');
const overrides = JSON.parse(pkgText).pnpm?.overrides ?? {};
const keys = Object.keys(overrides).filter((key) => !KEEP.has(key));

if (keys.length === 0) {
  console.log('No pnpm overrides to check.');
  process.exit(0);
}

/** The package name an override key targets ("undici@>=7" → "undici",
 *  "@scope/pkg@<1" → "@scope/pkg", bare "lodash" → "lodash"). */
function nameFromKey(key) {
  const scoped = key.startsWith('@');
  const rest = scoped ? key.slice(1) : key;
  const at = rest.indexOf('@');
  const name = at === -1 ? rest : rest.slice(0, at);
  return scoped ? `@${name}` : name;
}

/** Concrete resolved versions of `name` in a lockfile. Matches `  name@<digit>…`
 *  package keys, skipping range specifiers (overrides/importers start with @>=, @<). */
function versionsOf(lock, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^  ${esc}@(\\d[^\\s:(]*)`, 'gm');
  const out = new Set();
  for (let m; (m = re.exec(lock));) out.add(m[1]);
  return out;
}

const sameSet = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));
const restore = () => {
  writeFileSync(PKG, pkgText);
  writeFileSync(LOCK, lockText);
};

const redundant = [];
try {
  for (const key of keys) {
    const name = nameFromKey(key);
    const before = versionsOf(lockText, name);

    const trial = JSON.parse(pkgText);
    delete trial.pnpm.overrides[key];
    writeFileSync(PKG, JSON.stringify(trial, null, 2) + '\n');

    const resolved = spawnSync('pnpm', ['install', '--lockfile-only', '--no-frozen-lockfile'], {
      cwd: ROOT,
      stdio: 'ignore',
      // pnpm is pnpm.cmd on Windows; without a shell, spawnSync ENOENTs and
      // every override would be silently "left in place" (a no-op run).
      shell: process.platform === 'win32',
    });
    const after = resolved.status === 0 ? versionsOf(readFileSync(LOCK, 'utf8'), name) : null;
    restore();

    if (resolved.status !== 0) {
      console.error(`! could not re-resolve without "${key}" — leaving it in place.`);
      continue;
    }
    if (sameSet(before, after)) redundant.push({ key, name, versions: [...before] });
  }
} finally {
  restore();
}

if (redundant.length > 0) {
  console.error('Redundant pnpm overrides — removing them does not change resolution:\n');
  for (const { key, name, versions } of redundant) {
    const at = versions.length ? `${name}@${versions.join(', ')}` : `no ${name} in the tree`;
    console.error(`  • ${key}  →  ${overrides[key]}   (upstream already resolves ${at})`);
  }
  console.error(
    '\nThe upstream tree has caught up. Remove the override(s) above from\n' +
      'package.json > pnpm.overrides, run `pnpm install --lockfile-only`, and commit.\n' +
      'If one is kept on purpose, add its key to KEEP in scripts/check-redundant-overrides.mjs.',
  );
  process.exit(1);
}

console.log(`All ${keys.length} pnpm override(s) still change resolution — none redundant.`);
process.exit(0);

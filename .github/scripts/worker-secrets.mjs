// Writes the Worker's runtime secrets file for `wrangler deploy --secrets-file`.
//
// The deploy step's environment carries the Worker's secrets and nothing else:
// the `worker-secrets` map in .github/workflows/deploy-web.yml names each
// WORKER_* secret of the GitHub environment the job runs in (staging or
// production). Every WORKER_* variable with a value is written under its own
// name, the name the code reads. A secret the environment does not hold
// arrives empty and is left out, and the Worker keeps that secret's value from
// its current version (`--secrets-file` is additive: it never deletes a
// secret). Names are logged, values never are. See infra/README.md ("Worker
// runtime secrets").
//
// Usage: node .github/scripts/worker-secrets.mjs <output.json>

import { writeFileSync } from 'node:fs';

const PREFIX = 'WORKER_';
const NAME = /^WORKER_[A-Z0-9_]+$/;

const out = process.argv[2];
if (!out) {
  console.error('usage: worker-secrets.mjs <output.json>');
  process.exit(2);
}

const secrets = {};
for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith(PREFIX)) continue;
  if (!NAME.test(name)) {
    console.error(`::error::${name} is not a valid Worker secret name (${NAME})`);
    process.exit(1);
  }
  if (typeof value === 'string' && value !== '') secrets[name] = value;
}

writeFileSync(out, JSON.stringify(secrets), { mode: 0o600 });
const shipped = Object.keys(secrets).sort();
console.log(`shipped to the Worker (${shipped.length}): ${shipped.join(', ') || '(none)'}`);

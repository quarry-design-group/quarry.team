// Generate the Starlight docs site's content by projecting the canonical
// Markdown under the repo-root `docs/` tree into `apps/docs/src/content/docs/`.
//
// The docs site is a MIRROR of `docs/`, not a second copy to hand-maintain:
// this script is the mechanism behind that claim. It runs as `prebuild` so a
// build always reflects the current `docs/`, and CI runs it and fails on any
// diff (the freshness gate), so the mirror can never drift from the source.
//
// Per file it: derives Starlight frontmatter (title from the H1, a short
// description, a stable sidebar order), drops the leading H1 (Starlight renders
// the title itself), prepends a "mirrored doc" note pointing at the GitHub
// source, and rewrites links — intra-`docs/` links to their site routes,
// everything else to absolute GitHub URLs so nothing dangles. The architecture
// landing is a generated ADR index built by scanning the ADRs, so it cannot
// carry a stale hand-written claim.
//
// Source of truth is `docs/`. NEVER edit the generated output by hand.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const docsRoot = join(repoRoot, 'docs');
const outRoot = join(repoRoot, 'apps/docs/src/content/docs');
const GH_BLOB = 'https://github.com/quarry-design-group/quarry.team/blob/main';

// Sections of `docs/` to project, and where each lands under content/docs.
// ADRs flatten into `architecture/` alongside a generated `architecture/index`.
const SECTIONS = [
  { srcDir: 'adr', outDir: 'architecture', kind: 'adr' },
  {
    srcDir: 'brd',
    outDir: 'requirements',
    kind: 'doc',
    order: ['business', 'product', 'non-functional'],
  },
  {
    srcDir: 'guides',
    outDir: 'guides',
    kind: 'doc',
    order: ['content-authoring', 'design-system'],
  },
  {
    srcDir: 'runbooks',
    outDir: 'runbooks',
    kind: 'doc',
    order: ['bootstrap', 'local-development', 'content-editing', 'deploy', 'incident-response'],
  },
];

// content/docs entries this script owns and rewrites wholesale each run.
// index.mdx (splash) and content.config.ts are hand-authored and left alone.
const MANAGED_DIRS = ['architecture', 'requirements', 'guides', 'runbooks'];

/** Map a path inside `docs/` (relative, forward slashes) to its site route. */
function docPathToRoute(rel) {
  const m = rel.match(/^([^/]+)\/(.+)\.md$/i);
  if (!m) return null;
  const [, dir, name] = m;
  if (dir === 'adr')
    return name.toLowerCase() === 'readme' ? '/architecture/' : `/architecture/${name}/`;
  if (dir === 'brd') return `/requirements/${name}/`;
  if (dir === 'guides') return `/guides/${name}/`;
  if (dir === 'runbooks') return `/runbooks/${name}/`;
  return null;
}

/** Rewrite one link target found in a source file at `srcAbs`. */
function rewriteTarget(target, srcAbs) {
  if (/^(https?:|mailto:|#|\/)/i.test(target)) return target; // external, anchor, already-absolute
  const [path, hash = ''] = target.split(/(?=#)/); // keep the #fragment
  const abs = resolve(dirname(srcAbs), path);
  const relFromDocs = relative(docsRoot, abs).split('\\').join('/');
  if (!relFromDocs.startsWith('..')) {
    const route = docPathToRoute(relFromDocs);
    if (route) return route + hash;
  }
  // Anything outside the mirrored `docs/` set -> absolute GitHub URL.
  const relFromRepo = relative(repoRoot, abs).split('\\').join('/');
  return `${GH_BLOB}/${relFromRepo}${hash}`;
}

/** Rewrite every inline/image link in a Markdown body. */
function rewriteLinks(body, srcAbs) {
  return body.replace(
    /(!?\[[^\]]*\])\(([^)\s]+)(\s+"[^"]*")?\)/g,
    (whole, label, target, title = '') => {
      return `${label}(${rewriteTarget(target, srcAbs)}${title})`;
    },
  );
}

/** Strip a leading YAML frontmatter block, if the source happens to carry one. */
function stripFrontmatter(text) {
  const m = text.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? text.slice(m[0].length) : text;
}

/** Pull the first H1 as the title and return the body with that line removed. */
function extractTitle(text, kind) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => /^#\s+/.test(l));
  if (i === -1) return { title: 'Untitled', body: text };
  let title = lines[i].replace(/^#\s+/, '').trim();
  if (kind === 'adr') title = title.replace(/^\d+\.\s*/, ''); // "4. Foo" -> "Foo"
  lines.splice(i, 1);
  return { title, body: lines.join('\n').replace(/^\n+/, '') };
}

/** First prose paragraph, flattened to a plain-text description (<=155 chars). */
function extractDescription(body) {
  for (const raw of body.split('\n')) {
    const l = raw.trim();
    if (!l || /^[#\-*|>]/.test(l) || l.startsWith('<') || l.startsWith(':::')) continue;
    let d = l
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images -> text
      .replace(/[*_`]/g, '') // emphasis/code marks
      .replace(/\s+/g, ' ')
      .trim();
    if (d.length > 155) d = d.slice(0, 152).replace(/\s+\S*$/, '') + '…';
    return d;
  }
  return '';
}

function parseStatus(text) {
  const m = text.match(/^\s*[-*]\s*\*\*Status:\*\*\s*(.+)$/im);
  return m ? m[1].trim() : '';
}

const yaml = (s) => JSON.stringify(s); // JSON string == valid double-quoted YAML scalar

function noteFor(relFromRepo) {
  return `:::note[Mirrored doc]\nSource of truth: [\`${relFromRepo}\`](${GH_BLOB}/${relFromRepo}). Edit there; this page is generated.\n:::`;
}

function banner(relFromRepo) {
  return `<!-- GENERATED from ${relFromRepo} — do not edit. Run: pnpm --filter @quarry/docs sync -->`;
}

function render({ title, description, order, relFromRepo, body, label }) {
  const fm = [`title: ${yaml(title)}`];
  if (description) fm.push(`description: ${yaml(description)}`);
  fm.push('sidebar:', `  order: ${order}`);
  if (label) fm.push(`  label: ${yaml(label)}`);
  return `---\n${fm.join('\n')}\n---\n\n${banner(relFromRepo)}\n\n${noteFor(relFromRepo)}\n\n${body}\n`;
}

function orderOf(section, name) {
  if (section.kind === 'adr') return parseInt(name.slice(0, 4), 10) || 999;
  // Match on the leading word so `business-requirements` keys off `business`.
  const key = name.replace(/-requirements$/, '');
  const idx = section.order ? section.order.indexOf(key) : -1;
  return idx >= 0 ? idx + 1 : 500;
}

// --- generate -------------------------------------------------------------

for (const d of MANAGED_DIRS) rmSync(join(outRoot, d), { recursive: true, force: true });

const adrIndexRows = [];

for (const section of SECTIONS) {
  const srcDir = join(docsRoot, section.srcDir);
  if (!existsSync(srcDir)) continue;
  const files = readdirSync(srcDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  for (const file of files) {
    const name = basename(file, '.md');
    const isAdrReadme = section.kind === 'adr' && name.toLowerCase() === 'readme';
    if (isAdrReadme) continue; // replaced by the generated index below

    const srcAbs = join(srcDir, file);
    const relFromRepo = relative(repoRoot, srcAbs).split('\\').join('/');
    const raw = stripFrontmatter(readFileSync(srcAbs, 'utf8'));
    const status = section.kind === 'adr' ? parseStatus(raw) : '';
    const { title, body: noH1 } = extractTitle(raw, section.kind);
    const body = rewriteLinks(noH1, srcAbs);
    const description = extractDescription(noH1);
    const order = orderOf(section, name);

    const outPath = join(outRoot, section.outDir, `${name}.md`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, render({ title, description, order, relFromRepo, body }));

    if (section.kind === 'adr') {
      const num = name.slice(0, 4);
      // Status can carry a link ("Superseded by [ADR 0014](0014-….md)") — rewrite it too.
      // A bare in-page anchor ("see [Amendment](#amendment-…)") points into the ADR
      // itself, so on the index it must carry the ADR's route.
      const indexStatus = rewriteLinks(status, srcAbs).replace(
        /\]\(#/g,
        `](/architecture/${name}/#`,
      );
      adrIndexRows.push({ num, title, status: indexStatus, slug: name });
    }
  }
}

// Generated architecture landing: an index of the ADRs, scanned from source so
// it cannot carry a stale claim. Replaces the former hand-written overview.
adrIndexRows.sort((a, b) => a.num.localeCompare(b.num));
const rows = adrIndexRows
  .map((r) => `| ${r.num} | [${r.title}](/architecture/${r.slug}/) | ${r.status || '—'} |`)
  .join('\n');
const archIndex =
  `---\n` +
  `title: Architecture\n` +
  `description: Architecture Decision Records for the quarry.team next-gen site.\n` +
  `sidebar:\n  order: 0\n  label: Overview\n` +
  `---\n\n` +
  `${banner('docs/adr/')}\n\n` +
  `:::note[Mirrored docs]\nThese records are generated from [\`docs/adr/\`](${GH_BLOB}/docs/adr). Edit the ADRs there; this index is generated.\n:::\n\n` +
  `The significant, hard-to-reverse decisions behind the next-gen quarry.team site, ` +
  `captured as records in a lightweight Nygard-style format (Context / Decision / Consequences / Alternatives). The ADR process is defined in ` +
  `[ADR 0001](/architecture/0001-record-architecture-decisions/).\n\n` +
  `| #    | Decision | Status |\n| ---- | -------- | ------ |\n${rows}\n`;
writeFileSync(join(outRoot, 'architecture', 'index.md'), archIndex);

console.log(
  `sync-docs: generated ${adrIndexRows.length} ADRs + architecture index + requirements/guides/runbooks from docs/`,
);

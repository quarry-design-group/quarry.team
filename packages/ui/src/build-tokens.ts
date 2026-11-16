/**
 * build-tokens.ts — derive the two consumable projections of tokens.json (the
 * single source of truth) so neither can drift from it. Run via
 * `pnpm --filter @quarry/ui build`.
 *
 *   1. tokens.css — the code side. Only the block between the
 *      `@generated:start` / `@generated:end` markers is rewritten in place; the
 *      fluid type scale, elevation, semantic aliases, and dark-theme blocks
 *      below the markers encode design intent beyond raw values and are authored
 *      by hand.
 *   2. figma.tokens.json — the design side. The same tokens wrapped in the
 *      Tokens Studio single-file envelope, so the Tokens Studio plugin can pull
 *      it from Git and apply it as Figma Variables (see
 *      docs/guides/design-system.md).
 *
 * Both outputs are Prettier-formatted for determinism. CI regenerates and fails
 * if either committed file drifts (`git diff --exit-code` — see
 * .github/workflows/ci.yml).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { format, resolveConfig } from 'prettier';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(__dirname, '../tokens/tokens.json');
const cssPath = join(__dirname, '../tokens/tokens.css');
const figmaPath = join(__dirname, '../tokens/figma.tokens.json');

const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));

interface Leaf {
  $type: string;
  $value: unknown;
  $description?: string;
}
const isLeaf = (v: unknown): v is Leaf => typeof v === 'object' && v !== null && '$value' in v;

const titleCase = (s: string): string =>
  s.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

// Serialize a token value to its CSS form, honoring the DTCG $type.
const cssValue = (leaf: Leaf): string => {
  if (leaf.$type === 'cubicBezier' && Array.isArray(leaf.$value)) {
    return `cubic-bezier(${(leaf.$value as number[]).join(', ')})`;
  }
  if (leaf.$type === 'color') return String(leaf.$value).toLowerCase();
  return String(leaf.$value);
};

const lines: string[] = [];
const walk = (node: Record<string, unknown>, prefix: string[]): void => {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (isLeaf(value)) {
      if (value.$description) lines.push(`/* ${value.$description} */`);
      lines.push(`--${[...prefix, key].join('-')}: ${cssValue(value)};`);
    } else {
      const group = value as Record<string, unknown>;
      lines.push('');
      lines.push(`/* ${(group.$description as string) ?? titleCase(key)} */`);
      walk(group, [...prefix, key]);
    }
  }
};

// Ordered groups → primitive scales. `prefix` is the custom-property namespace:
// color and size flatten to the bare names the app already consumes
// (--stone-500, --container); font/space/radius/duration/easing map to their
// short prefixes (--font-display, --dur-1, --ease-out).
const groups: { label?: string; node: Record<string, unknown>; prefix: string[] }[] = [
  { node: tokens.color, prefix: [] },
  { label: tokens.font.family.$description, node: tokens.font.family, prefix: ['font'] },
  { label: 'Spacing', node: tokens.space, prefix: ['space'] },
  { label: 'Radius', node: tokens.radius, prefix: ['radius'] },
  { label: 'Sizing / layout', node: tokens.size, prefix: [] },
  { label: 'Motion — duration', node: tokens.duration, prefix: ['dur'] },
  { label: 'Motion — easing', node: tokens.easing, prefix: ['ease'] },
];
for (const group of groups) {
  if (group.label) {
    lines.push('');
    lines.push(`/* ${group.label} */`);
  }
  walk(group.node, group.prefix);
}

const START = '/* @generated:start — primitives derived from tokens.json; do not edit by hand */';
const END = '/* @generated:end */';
const block = `${START}\n${lines.join('\n').replace(/^\n/, '')}\n${END}`;

const existing = readFileSync(cssPath, 'utf8');
const markerRe = /\/\* @generated:start[\s\S]*?@generated:end \*\//;
if (!markerRe.test(existing)) {
  throw new Error(`tokens.css is missing the @generated:start/@generated:end markers (${cssPath})`);
}

const prettierConfig = await resolveConfig(cssPath);
const spliced = existing.replace(markerRe, block);
const formatted = await format(spliced, { ...prettierConfig, filepath: cssPath });
writeFileSync(cssPath, formatted);

// figma.tokens.json — wrap the token groups (everything but top-level $meta) in
// the Tokens Studio single-file envelope: one "core" set plus the $themes /
// $metadata keys the plugin expects. tokens.json stays the source of truth;
// this is a generated projection the design side pulls, never hand-edited.
const core = Object.fromEntries(Object.entries(tokens).filter(([k]) => !k.startsWith('$')));
const projection = { core, $themes: [], $metadata: { tokenSetOrder: ['core'] } };
const figmaConfig = await resolveConfig(figmaPath);
const figmaJson = await format(JSON.stringify(projection), { ...figmaConfig, filepath: figmaPath });
writeFileSync(figmaPath, figmaJson);

const count = lines.filter((l) => l.startsWith('--')).length;
console.log(
  `[tokens] generated ${count} primitive custom properties into tokens.css and figma.tokens.json from tokens.json`,
);

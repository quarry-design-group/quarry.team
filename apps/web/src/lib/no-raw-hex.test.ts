import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Design-token discipline (AGENTS.md §7, design-system guide): no raw colors
 * in component/page styling — every color comes from tokens.css. A raw color
 * is a hex literal or an `rgb()`/`rgba()`/`hsl()`/`hsla()` call; a translucent
 * color is a `color-mix()` on a token.
 *
 * Scope, in .astro/.mdx sources:
 * - `<style>` blocks and `style=""` attributes.
 * - class values (`class`, `class:list`, `className`), where the Tailwind
 *   utilities and their arbitrary values live.
 * - Tailwind arbitrary values (`bg-[…]`, `shadow-[…]`) in class strings
 *   composed in an .astro frontmatter (tone maps, shared utility strings).
 * Exempt: `mask` / `mask-image` declarations and arbitrary properties (their
 * #000/#fff are luminance stops, not design colors — same reason SVG mask
 * fills in markup are out of scope), `<script>` code (console styling strings
 * are not page styles), and a style declaration preceded by a
 * `raw-color: allow — <reason>` CSS comment, reserved for luminance-only values
 * such as a starfield's white stops.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

/** Mask declarations, and any declaration under a `raw-color: allow` comment. */
const stripExemptDeclarations = (css: string): string =>
  css
    .replace(/\/\*\s*raw-color:\s*allow\b[\s\S]*?\*\/\s*[a-z-]+\s*:[^;}]*/g, '')
    .replace(/(?:-webkit-)?mask[a-z-]*\s*:[^;}]*/g, '');

/** Tailwind mask arbitrary properties (`[mask:…]`, `[-webkit-mask-image:…]`). */
const stripMaskUtilities = (classes: string): string =>
  classes.replace(/\[(?:-webkit-)?mask[a-z-]*:[^\]]*\]/g, '');

// Lookarounds, not \b: Tailwind joins arbitrary-value tokens with `_`, a word
// character (`0_0_4px_rgba(…)`, `#000_42%`).
const RAW_COLOR = /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])|(?<![a-zA-Z])(?:rgba?|hsla?)\(/g;

/** A Tailwind arbitrary value: a utility (`bg-`, `shadow-`, …) then `[…]`. */
const ARBITRARY_VALUE = /[\w-]+-\[[^\]\s]+\]/g;

/** Every class value in a source file: quoted strings, and `{…}` expressions
 *  (balanced braces) for `class:list` and dynamic classes. */
function classValues(text: string): { value: string; index: number }[] {
  const out: { value: string; index: number }[] = [];
  const attr = /\b(?:class|class:list|className)=/g;
  let m: RegExpExecArray | null;
  while ((m = attr.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const open = text[start];
    if (open === '"' || open === "'") {
      const end = text.indexOf(open, start + 1);
      if (end !== -1) out.push({ value: text.slice(start + 1, end), index: m.index });
    } else if (open === '{') {
      let depth = 0;
      let end = start;
      for (; end < text.length; end++) {
        if (text[end] === '{') depth++;
        else if (text[end] === '}' && --depth === 0) break;
      }
      out.push({ value: text.slice(start + 1, end), index: m.index });
    }
  }
  return out;
}

/** Arbitrary values written in an .astro frontmatter, with their offsets. */
function frontmatterArbitraryValues(text: string): { value: string; index: number }[] {
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fence) return [];
  const offset = fence.index + fence[0].indexOf(fence[1]);
  return [...fence[1].matchAll(ARBITRARY_VALUE)]
    .filter((token) => !/^(?:-webkit-)?mask/.test(token[0]))
    .map((token) => ({ value: token[0], index: offset + token.index }));
}

describe('design-token discipline', () => {
  const sources = walk(SRC)
    .filter((f) => /\.(astro|mdx)$/.test(f))
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }));
  const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

  it('holds the no-raw-color line in .astro and .mdx styles', () => {
    const offenders: string[] = [];

    for (const { file, text } of sources) {
      const chunks = [
        ...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),
        ...text.matchAll(/style="([^"]*)"/g),
      ];
      for (const chunk of chunks) {
        for (const color of stripExemptDeclarations(chunk[1]).matchAll(RAW_COLOR)) {
          offenders.push(
            `${relative(SRC, file)} (style block at line ${lineOf(text, chunk.index)}): ${color[0]}`,
          );
        }
      }
    }

    expect(
      offenders,
      `Raw color in styles — use a token from tokens.css (add to tokens.json if missing):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('holds the no-raw-color line in class values', () => {
    const offenders: string[] = [];

    for (const { file, text } of sources) {
      const markup = text.replace(/<script\b[\s\S]*?<\/script>/g, (s) => ' '.repeat(s.length));
      for (const { value, index } of classValues(markup)) {
        for (const color of stripMaskUtilities(value).matchAll(RAW_COLOR)) {
          offenders.push(`${relative(SRC, file)}:${lineOf(text, index)}: ${color[0]}`);
        }
      }
    }

    expect(
      offenders,
      `Raw color in a class value — use a token, or color-mix() on one for a translucent tint:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('holds the no-raw-color line in class strings composed in frontmatter', () => {
    const offenders: string[] = [];

    for (const { file, text } of sources) {
      for (const { value, index } of frontmatterArbitraryValues(text)) {
        for (const color of value.matchAll(RAW_COLOR)) {
          offenders.push(`${relative(SRC, file)}:${lineOf(text, index)}: ${color[0]}`);
        }
      }
    }

    expect(
      offenders,
      `Raw color in a frontmatter class string — use a token, or color-mix() on one:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('finds raw colors in every class form it scans', () => {
    const sample = [
      '<p class="bg-[#0b0b0a]">',
      `<span class:list={['a', { 'shadow-[0_0_4px_rgba(0,0,0,0.5)]': x }]} />`,
      '<div className={`text-[hsl(0_0%_50%)]`} />',
      '<div class="[mask:linear-gradient(#000,transparent)] bg-(--color-bg)">',
      '<i class="shadow-[0_0_2px_#fff_inset]">',
    ].join('\n');
    const found = classValues(sample).flatMap(({ value }) =>
      [...stripMaskUtilities(value).matchAll(RAW_COLOR)].map((c) => c[0]),
    );
    expect(found).toEqual(['#0b0b0a', 'rgba(', 'hsl(', '#fff']);
  });

  it('finds raw colors in frontmatter class strings and honors the style exemptions', () => {
    const astro = [
      '---',
      "const tones = { a: 'bg-[rgb(1_2_3)] text-(--color-text)', b: 'mask-[linear-gradient(#000,transparent)]' };",
      '---',
      '<p class="bg-[#fff]">',
    ].join('\n');
    expect(frontmatterArbitraryValues(astro).map((t) => t.value)).toEqual(['bg-[rgb(1_2_3)]']);

    const css = [
      '.a { color: rgba(0, 0, 0, 0.5); }',
      '.b { /* raw-color: allow — luminance only */ background-image: radial-gradient(#fff, transparent); }',
      '.c { mask-image: linear-gradient(#000, transparent); }',
    ].join('\n');
    expect([...stripExemptDeclarations(css).matchAll(RAW_COLOR)].map((c) => c[0])).toEqual([
      'rgba(',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Form primitives (design-system guide, "Components"): a dropdown renders
 * through `components/Select.astro`, which hides the platform arrow, draws the
 * chevron inside the field's padding, and matches the height of the text
 * inputs beside it. A bare `<select>` gets the platform arrow against the
 * border and renders shorter than its neighbours, so this test fails on one
 * anywhere in the site source outside the primitive itself.
 * `tests/e2e/select.spec.ts` measures the rendered result.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));
const PRIMITIVE = join('components', 'Select.astro');

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const sources = walk(SRC).filter((f) => /\.(astro|mdx|ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f));

describe('form primitives', () => {
  it('renders every <select> through components/Select.astro', () => {
    const offenders = sources
      .filter((f) => relative(SRC, f) !== PRIMITIVE)
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, at: `${relative(SRC, f)}:${i + 1}` }))
          // Case-sensitive: the HTML element is lowercase, the component is
          // <Select>. The tag name may end the line (Prettier wraps a tag with
          // several attributes), so match any non-name character or the end.
          .filter(({ line }) => /<select(?![\w-])/.test(line))
          .map(({ at }) => at),
      );
    expect(offenders, 'Render dropdowns with <Select> from @/components/Select.astro.').toEqual([]);
  });

  it('keeps the primitive drawing its own chevron over a hidden platform arrow', () => {
    const select = readFileSync(join(SRC, PRIMITIVE), 'utf8');
    expect(select).toMatch(/appearance-none/);
    expect(select).toMatch(/data-select-chevron/);
    expect(select).toMatch(/pr-11/);
    expect(select).toMatch(/min-h-\[calc\(1lh\+/);
  });
});

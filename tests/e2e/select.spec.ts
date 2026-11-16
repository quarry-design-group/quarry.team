import { test, expect, type Page } from '@playwright/test';

/**
 * Every dropdown renders through `components/Select.astro`
 * (`src/lib/form-primitives.test.ts` guards the source). This spec measures
 * the rendered result on each page that has one, at a phone width and a
 * desktop width: the platform arrow is hidden, the drawn chevron sits inside
 * the field's padding clear of the border and the text, and the select is
 * the same height as the text input it sits beside. Both pages render on the
 * Worker, so this runs in the `worker` project.
 */

const PAGES = [
  { path: '/search', input: '#search-q' },
  { path: '/policies/grievances', input: '#name' },
];
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
];

type Box = { left: number; right: number; top: number; bottom: number; height: number };

async function measure(page: Page, inputSelector: string) {
  return page.evaluate((inputSel) => {
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
    };
    const input = document.querySelector(inputSel);
    return {
      inputHeight: input ? input.getBoundingClientRect().height : null,
      selects: [...document.querySelectorAll('select')].map((s) => {
        const chevron = s.parentElement?.querySelector('[data-select-chevron]');
        const cs = getComputedStyle(s);
        return {
          name: s.getAttribute('name'),
          appearance: cs.appearance,
          paddingRight: parseFloat(cs.paddingRight),
          select: box(s),
          chevron: chevron ? box(chevron) : null,
        };
      }),
    };
  }, inputSelector);
}

for (const vp of VIEWPORTS) {
  for (const { path, input } of PAGES) {
    test(`${path} dropdowns draw an inset chevron and match the input height (${vp.name})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(path);
      const { inputHeight, selects } = await measure(page, input);

      expect(inputHeight, `text input ${input} renders`).not.toBeNull();
      expect(selects.length, 'the page renders at least one dropdown').toBeGreaterThan(0);

      for (const s of selects) {
        const label = `select[name="${s.name}"]`;
        expect(s.appearance, `${label} hides the platform arrow`).toBe('none');
        expect(s.chevron, `${label} draws the chevron`).not.toBeNull();
        const c = s.chevron!;

        // The chevron sits inside the field: clear of the right border by at
        // least the field's horizontal padding, and inside the padding the
        // select reserves, so it never overlaps the selected option's text.
        expect(
          s.select.right - c.right,
          `${label} chevron clears the border`,
        ).toBeGreaterThanOrEqual(10);
        expect(c.left, `${label} chevron stays in the reserved padding`).toBeGreaterThanOrEqual(
          s.select.right - s.paddingRight,
        );
        expect(c.top, `${label} chevron sits within the field`).toBeGreaterThan(s.select.top);
        expect(c.bottom, `${label} chevron sits within the field`).toBeLessThan(s.select.bottom);

        expect(
          Math.abs(s.select.height - inputHeight!),
          `${label} is the height of ${input} (${s.select.height}px vs ${inputHeight}px)`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }
}

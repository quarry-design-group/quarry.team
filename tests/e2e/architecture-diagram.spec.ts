import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * ArchitectureDiagram: a case-study diagram drawn at build time as inline SVG
 * from a typed data file. Zero JS: node buttons open native popover cards,
 * hover/focus highlights each path through a node in CSS, and a disclosure
 * reads the diagram as text. With JS: an Expand button opens it in a modal
 * dialog with zoom controls. The case below carries the launch-stack diagram.
 */
const CASE = '/work/serving-a-aaa-game-reveal-with-100-uptime-on-aws';
/** Every case that draws its architecture with the component. */
const DIAGRAM_CASES = {
  launch: { path: CASE, figures: 1 },
  pharmacy: {
    path: '/work/from-siloed-tools-to-a-single-source-of-truth-a-data-platform-and-self-serve-bi-for-a-pharmacy-group',
    figures: 1,
  },
  hipaa: { path: '/work/hipaa-compliant-infrastructure-mental-health-industry', figures: 1 },
  cookieless: {
    path: '/work/maximizing-client-opportunity-by-transforming-data-collection-for-the-cookie-less-future',
    figures: 2,
  },
} as const;
/** The site's bar is AA; this component is also held to the axe-checkable AAA
 *  rules (enhanced contrast), and to the AAA checks below that axe cannot run:
 *  target size, focus appearance, and SVG text contrast. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa'];

const figure = (page: Page) => page.locator('figure[data-dg]');
const node = (page: Page, name: RegExp) => figure(page).getByRole('button', { name });
const card = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });
const expandedView = (page: Page) => page.getByRole('dialog', { name: 'Two paths, one platform.' });

/** Snap transitions so computed styles are read in their settled state. */
/**
 * Adds a stylesheet the way a reader's tools would, through CSSOM: a
 * constructable sheet is not an inline style, so the strict CSP allows it and
 * this spec runs unchanged against a deployed preview (`addStyleTag` would be
 * refused there).
 */
const injectCss = (page: Page, css: string) =>
  page.evaluate((text) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, css);

const settle = (page: Page) =>
  injectCss(
    page,
    '*, *::before, *::after { animation: none !important; transition: none !important; }',
  );

type Rgb = [number, number, number];

/** A computed colour (`rgb()`/`rgba()` or `color(srgb …)`) as 0–255 channels. */
const rgbOf = (c: string): Rgb => {
  const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(c);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
  const m = /rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)/.exec(c);
  if (!m) throw new Error(`unparsed colour: ${c}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

const luminance = ([r, g, b]: Rgb) => {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** WCAG contrast ratio; `alpha` composites the foreground over the background. */
const contrast = (fg: string, bg: string, alpha = 1) => {
  const [f, b] = [rgbOf(fg), rgbOf(bg)];
  const mixed: Rgb = [0, 1, 2].map((i) => f[i]! * alpha + b[i]! * (1 - alpha)) as Rgb;
  const [hi, lo] = [luminance(mixed), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const axe = async (page: Page, include: string) => {
  const { violations } = await new AxeBuilder({ page })
    .include(include)
    .withTags(WCAG_TAGS)
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
};

test('renders as inline SVG with real text, not an image', async ({ page }) => {
  await page.goto(CASE);
  await expect(figure(page).locator('svg[data-dg-svg]')).toHaveCount(1);
  await expect(figure(page).locator('img')).toHaveCount(0);
  await expect(figure(page)).toContainText('Two paths, one platform.');
  await expect(figure(page).locator('svg[data-dg-svg]')).toContainText('Site traffic');
  await expect(figure(page).locator('button.dg-btn')).toHaveCount(11);
});

test('a node opens its detail card, and Escape returns focus to it', async ({ page }) => {
  await page.goto(CASE);
  const firewall = node(page, /Edge firewall/);
  await firewall.click();
  const details = card(page, 'Edge firewall');
  await expect(details).toBeVisible();
  await expect(details).toContainText('487,159');
  await expect(details).toContainText('Site requests');

  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
  await expect(firewall).toBeFocused();
});

test('the card closes from its own button', async ({ page }) => {
  await page.goto(CASE);
  await node(page, /^CRM/).click();
  const details = card(page, 'CRM');
  await expect(details).toBeVisible();
  await details.getByRole('button', { name: /Close/ }).click();
  await expect(details).toBeHidden();
  // Focus goes back to the node, also where a click never focused it (WebKit).
  await expect(node(page, /^CRM/)).toBeFocused();
});

/** Lit nodes and connectors the open card overlaps (none, when it is placed right). */
const coveredByCard = async (page: Page, cardName: string, slots: string[]) => {
  const cardBox = (await card(page, cardName).boundingBox())!;
  const sel = `.dg-stage :is(.dg-node, .dg-edge):is(${slots.map((s) => `.${s}`).join(', ')})`;
  const covered: string[] = [];
  for (const el of await page.locator(sel).all()) {
    const b = await el.boundingBox();
    if (!b) continue;
    if (
      b.x < cardBox.x + cardBox.width &&
      cardBox.x < b.x + b.width &&
      b.y < cardBox.y + cardBox.height &&
      cardBox.y < b.y + b.height
    ) {
      covered.push((await el.getAttribute('class')) ?? '');
    }
  }
  return { covered, cardBox };
};

for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`an open card sits clear of the path it lights (${size.width}×${size.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto(CASE);
    await settle(page);
    await figure(page).scrollIntoViewIfNeeded();
    const pipeline = node(page, /^Data pipeline Self-hosted$/);
    await pipeline.click();
    await expect(card(page, 'Data pipeline')).toBeVisible();
    await page.waitForTimeout(600); // the reveal scroll
    const { covered, cardBox } = await coveredByCard(page, 'Data pipeline', ['f2', 'f3', 'f4']);
    expect(covered).toEqual([]);
    // The card is on screen, and so is the node that opened it.
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(size.height);
    const nodeBox = (await pipeline.boundingBox())!;
    expect(nodeBox.y).toBeGreaterThanOrEqual(0);
    expect(nodeBox.y + nodeBox.height).toBeLessThanOrEqual(cardBox.y);
  });
}

test('in the expanded view the card leaves the lit path visible', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(CASE);
  await figure(page).getByRole('button', { name: 'Expand diagram' }).click();
  const view = expandedView(page);
  await page.keyboard.press('0');
  await view.getByRole('button', { name: /Data pipeline/ }).click();
  await expect(card(page, 'Data pipeline')).toBeVisible();
  await page.waitForTimeout(300);
  const { covered } = await coveredByCard(page, 'Data pipeline', ['f2', 'f3', 'f4']);
  expect(covered).toEqual([]);
  await page.keyboard.press('Escape');
  // The padding that made room goes with the card.
  expect(await view.locator('[data-dg-viewport]').evaluate((el) => el.style.paddingBottom)).toBe(
    '',
  );
});

test('hover and focus light the node alone; an open card lights its paths', async ({ page }) => {
  await page.goto(CASE);
  await settle(page);
  const lit = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--dg-lit').trim());
  const opacity = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => Number(getComputedStyle(el).opacity));
  const shadow = (name: RegExp) =>
    node(page, name).evaluate((el) => getComputedStyle(el).boxShadow);

  // Hover: the node takes its ring, nothing else changes.
  await node(page, /^CRM/).hover();
  expect(await shadow(/^CRM/)).not.toBe('none');
  expect(await lit('.dg-edge.f3')).toBe('');
  expect(await opacity('.dg-edge.f1')).toBe(1);
  expect(await shadow(/Data pipeline/)).toMatch(/ 0px\)?$|^none$/);

  // Keyboard focus: the same, node only.
  await node(page, /Event API/).focus();
  expect(await lit('.dg-edge.f2')).toBe('');
  expect(await opacity('.dg-edge.f1')).toBe(1);

  // An open card lights its node's one path (CRM: f3); the rest fades.
  await node(page, /^CRM/).click();
  await expect(card(page, 'CRM')).toBeVisible();
  expect(await lit('.dg-edge.f3')).toBe('1');
  expect(await opacity('.dg-edge.f3')).toBe(1);
  expect(await opacity('.dg-edge.f2:not(.f3)')).toBeLessThan(1);
  expect(await opacity('.dg-edge.f1')).toBeLessThan(1);
  await page.keyboard.press('Escape');

  // The pipeline's card lights all three data paths.
  await node(page, /Data pipeline/).click();
  for (const slot of ['f2', 'f3', 'f4']) {
    expect(await opacity(`.dg-edge.${slot}:not(.f1)`)).toBe(1);
  }
  expect(await opacity('.dg-edge.f1')).toBeLessThan(1);
});

test('the text alternative lists every path in order', async ({ page }) => {
  await page.goto(CASE);
  await figure(page).getByText('Read the diagram as text').click();
  const flows = figure(page).locator('.dg-text-flows > li');
  await expect(flows).toHaveCount(4);
  await expect(flows.first().locator('.dg-text-steps > li')).toHaveText([
    'Visitor: Browser or phone',
    'Edge firewall: Managed attack filtering',
    'CDN cache: Served close to the visitor',
    'Two static sites: Private origins, no servers',
  ]);
  await expect(flows.nth(2)).toContainText('CRM sign-ups');
  await expect(figure(page).locator('.dg-text-foot')).toContainText('Foundation:');
});

test('Expand opens a zoomable modal and Escape puts the diagram back', async ({ page }) => {
  await page.goto(CASE);
  const expand = figure(page).getByRole('button', { name: 'Expand diagram' });
  await expand.click();
  const view = expandedView(page);
  await expect(view).toBeVisible();
  const svg = view.locator('svg[data-dg-svg]');
  await expect(svg).toHaveCount(1);
  const levelEl = view.locator('[data-dg-level]');
  const level = async () => parseInt((await levelEl.textContent()) ?? '0', 10);
  const width = async () => (await svg.boundingBox())!.width;

  // Fit is the floor: zooming out from it is disabled.
  await page.keyboard.press('0');
  const fitted = await width();
  const fitLevel = await level();
  await expect(view.getByRole('button', { name: 'Zoom out' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  await view.getByRole('button', { name: 'Zoom in' }).click();
  expect(await width()).toBeGreaterThan(fitted * 1.4);
  expect(await level()).toBeGreaterThan(fitLevel);
  await page.keyboard.press('+');
  const viewport = view.locator('[data-dg-viewport]');
  expect(await viewport.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.keyboard.press('0');
  expect(await level()).toBe(fitLevel);

  // Cards still open from inside the expanded view.
  await view.getByRole('button', { name: /Durable outbox/ }).click();
  await expect(card(page, 'Durable outbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card(page, 'Durable outbox')).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(view).toBeHidden();
  await expect(expand).toBeFocused();
  await expect(figure(page).locator('[data-dg-home] svg[data-dg-svg]')).toHaveCount(1);
});

test('Expand never opens smaller than the diagram in the page', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(CASE);
  const inPage = (await figure(page).locator('svg[data-dg-svg]').boundingBox())!.width;
  await figure(page).getByRole('button', { name: 'Expand diagram' }).click();
  const expanded = (await expandedView(page).locator('svg[data-dg-svg]').boundingBox())!.width;
  expect(expanded).toBeGreaterThanOrEqual(inPage - 1);
});

test('one ctrl-wheel notch zooms one modest step', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse wheel');
  await page.goto(CASE);
  await figure(page).getByRole('button', { name: 'Expand diagram' }).click();
  const view = expandedView(page);
  await page.keyboard.press('0');
  const levelEl = view.locator('[data-dg-level]');
  const before = parseInt((await levelEl.textContent()) ?? '0', 10);
  const box = (await view.locator('[data-dg-viewport]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(levelEl).not.toHaveText(`${before}%`);
  const after = parseInt((await levelEl.textContent()) ?? '0', 10);
  expect(after / before).toBeLessThanOrEqual(1.5);
});

test('below the floor width the diagram scrolls in its own region', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(CASE);
  const region = figure(page).getByRole('region', { name: 'Two paths, one platform.' });
  expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  // The figure itself stays inside the viewport; only its region scrolls.
  // And says so.
  await expect(figure(page).getByText('Scroll sideways for the rest.')).toBeVisible();
  const box = (await figure(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('lanes and groups are named groups, read in order', async ({ page }) => {
  await page.goto(CASE);
  const tree = await figure(page).locator('svg[data-dg-svg]').ariaSnapshot();
  expect(tree).toMatch(
    /group "01 · Site traffic":[\s\S]*button "Visitor[\s\S]*group "02 · Marketing data":/,
  );
  expect(tree).toMatch(/group "Destinations":\s*- text: Destinations\s*- button "Six ad platforms/);
  // The badge is announced after the visible label, so the name starts with it (2.5.3).
  await expect(node(page, /^Edge firewall Managed attack filtering \(Gate\)$/)).toHaveCount(1);
});

test('every control is at least 44 × 44 CSS px (2.5.5, AAA)', async ({ page }) => {
  await page.goto(CASE);
  const small = async (scope: string) =>
    page.evaluate((sel) => {
      return [...document.querySelectorAll<HTMLElement>(`${sel} :is(button, summary)`)]
        .filter((el) => el.getClientRects().length && !el.closest('[popover]:not(:popover-open)'))
        .map((el) => ({
          el: el.textContent?.trim().slice(0, 24),
          ...el.getBoundingClientRect().toJSON(),
        }))
        .filter((r) => r.width < 44 || r.height < 44);
    }, scope);
  expect(await small('figure[data-dg]')).toEqual([]);
  await node(page, /Data pipeline/).click();
  expect(await small('#launch-stack-card-pipeline')).toEqual([]);
  await page.keyboard.press('Escape');
  await figure(page).getByRole('button', { name: 'Expand diagram' }).click();
  await expect(expandedView(page)).toBeVisible();
  expect(await small('.dg-dialog-bar')).toEqual([]);
});

test('the focus ring is a 3px non-scaling stroke at any zoom (2.4.13, AAA)', async ({ page }) => {
  await page.goto(CASE);
  await figure(page).getByText('Select a step for its details.').click();
  // Keyboard focus, so :focus-visible applies.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => !!document.activeElement?.closest('.dg-node'))) break;
  }
  const ring = page.locator('.dg-node:has(.dg-btn:focus-visible) .dg-ring');
  await expect(ring).toHaveCount(1);
  const style = await ring.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      visibility: cs.visibility,
      width: cs.strokeWidth,
      effect: cs.vectorEffect,
      stroke: cs.stroke,
    };
  });
  expect(style).toMatchObject({
    visibility: 'visible',
    width: '3px',
    effect: 'non-scaling-stroke',
  });
  const panel = await figure(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(contrast(style.stroke, panel)).toBeGreaterThanOrEqual(3);
});

test('faded connectors keep 3:1 against the panel (1.4.11)', async ({ page }) => {
  await page.goto(CASE);
  await settle(page);
  await node(page, /^CRM/).click();
  await expect(card(page, 'CRM')).toBeVisible();
  const { stroke, opacity, panel } = await page
    .locator('.dg-edge.f1')
    .first()
    .evaluate((el) => ({
      stroke: getComputedStyle(el).stroke,
      opacity: Number(getComputedStyle(el).opacity),
      panel: getComputedStyle(el.closest('figure')!).backgroundColor,
    }));
  expect(opacity).toBeLessThan(1);
  // The faded stroke, composited over the panel.
  expect(contrast(stroke, panel, opacity)).toBeGreaterThanOrEqual(3);
});

test('reader text spacing never clips a node label (1.4.12)', async ({ page }) => {
  await page.goto(CASE);
  await injectCss(
    page,
    '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
  );
  const report = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.dg-btn')].map((btn) => {
      const fo = btn.closest('foreignObject')!;
      const spill = Math.max(
        ...[...btn.querySelectorAll('.dg-btn-title, .dg-btn-detail')].map(
          (s) => s.getBoundingClientRect().bottom - btn.getBoundingClientRect().bottom,
        ),
      );
      return { overflow: getComputedStyle(fo).overflow, spill };
    }),
  );
  for (const r of report) {
    expect(r.overflow).toBe('visible');
    // Any spill stays inside the gap below the node, short of the next row.
    expect(r.spill).toBeLessThan(10);
  }
});

test('forced colours map the SVG paint to system colours', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari has no forced-colours mode');
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(CASE);
  const paint = await figure(page).evaluate((fig) => ({
    text: getComputedStyle(fig).color,
    lane: getComputedStyle(fig.querySelector('.dg-lane')!).fill,
    edge: getComputedStyle(fig.querySelector('.dg-edge')!).stroke,
  }));
  expect(paint.lane).toBe(paint.text);
  expect(paint.edge).toBe(paint.text);

  // Lit nodes still read as lit: borders and shadows are forced, so an outline.
  await node(page, /Data pipeline/).click();
  const outline = await node(page, /^CRM/).evaluate((el) => getComputedStyle(el).outlineWidth);
  expect(outline).toBe('3px');
  const unlit = await node(page, /^Visitor/).evaluate((el) => getComputedStyle(el).outlineWidth);
  expect(unlit).toBe('0px');
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe in the ${theme} theme`, () => {
    test.use({ reducedMotion: 'reduce', colorScheme: theme });

    test.beforeEach(async ({ page }) => {
      await page.goto(CASE);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await settle(page);
    });

    test('the diagram has no violations', async ({ page }) => {
      expect(await axe(page, 'figure[data-dg]')).toEqual([]);
    });

    test('an open card has no violations', async ({ page }) => {
      await node(page, /Data pipeline/).click();
      await expect(card(page, 'Data pipeline')).toBeVisible();
      expect(await axe(page, '#launch-stack-card-pipeline')).toEqual([]);
    });

    test('the expanded view has no violations', async ({ page }) => {
      await figure(page).getByRole('button', { name: 'Expand diagram' }).click();
      await expect(expandedView(page)).toBeVisible();
      expect(await axe(page, '[data-dg-dialog]')).toEqual([]);
    });
  });
}

test('exploring the diagram raises no CSP violations', async ({ page }) => {
  // Recorded from page start, so nothing the component does is missed. Locally
  // the static server sends no CSP; against a deployed preview this is the check.
  await page.addInitScript(() => {
    (window as unknown as { cspViolations: string[] }).cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { cspViolations: string[] }).cspViolations.push(
        `${event.violatedDirective} ${event.blockedURI}`,
      );
    });
  });
  await page.goto(CASE);
  await node(page, /^Edge firewall/).click();
  await expect(card(page, 'Edge firewall')).toBeVisible();
  await page.keyboard.press('Escape');
  await figure(page).getByRole('button', { name: 'Expand diagram' }).click();
  await expect(expandedView(page)).toBeVisible();
  await page.keyboard.press('+');
  await page.keyboard.press('0');
  await expandedView(page).getByRole('button', { name: /^CRM/ }).click();
  await expect(card(page, 'CRM')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(expandedView(page)).toBeHidden();
  const violations = await page.evaluate(
    () => (window as unknown as { cspViolations: string[] }).cspViolations,
  );
  expect(violations).toEqual([]);
});

test.describe('every migrated case', () => {
  for (const [name, { path, figures }] of Object.entries(DIAGRAM_CASES)) {
    test(`${name}: diagrams are inline SVG, labels fit, axe AA + AAA`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('figure[data-dg]')).toHaveCount(figures);
      await expect(page.locator('figure[data-dg] img')).toHaveCount(0);
      // Element ids stay unique with more than one diagram on the page.
      const dupes = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[data-dg] [id]')].map((el) => el.id);
        return ids.filter((id, i) => ids.indexOf(id) !== i);
      });
      expect(dupes).toEqual([]);
      // Node labels stay inside their boxes; container labels inside theirs.
      const overflow = await page.evaluate(() => {
        const out: string[] = [];
        for (const btn of document.querySelectorAll<HTMLElement>('.dg-btn')) {
          const box = btn.getBoundingClientRect();
          for (const span of btn.querySelectorAll('.dg-btn-title, .dg-btn-detail')) {
            const r = span.getBoundingClientRect();
            if (r.bottom > box.bottom + 1 || r.right > box.right + 1)
              out.push(span.textContent ?? '');
          }
        }
        for (const g of document.querySelectorAll('.dg-box')) {
          const rect = g.querySelector('rect')!.getBoundingClientRect();
          const label = g.querySelector('text')!.getBoundingClientRect();
          if (label.right > rect.right + 1) out.push(g.querySelector('text')!.textContent ?? '');
        }
        return out;
      });
      expect(overflow).toEqual([]);
      for (const theme of ['light', 'dark']) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await settle(page);
        expect(await axe(page, 'figure[data-dg]')).toEqual([]);
      }
    });
  }

  test('pharmacy: the write-back draws as a dashed return path that lights with its card', async ({
    page,
  }) => {
    await page.goto(DIAGRAM_CASES.pharmacy.path);
    await settle(page);
    const back = page.locator('.dg-edge--return');
    await expect(back).toHaveCount(1);
    expect(await back.evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toBe('none');
    await expect(page.locator('.dg-return-label')).toHaveText(
      /Flagged accounts written back to the CRM/i,
    );
    await node(page, /^Business-logic models/).click();
    await expect(card(page, 'Business-logic models')).toBeVisible();
    expect(
      await back.evaluate((el) => getComputedStyle(el).getPropertyValue('--dg-lit').trim()),
    ).toBe('1');
    await page.keyboard.press('Escape');
    await figure(page).getByText('Read the diagram as text').click();
    await expect(figure(page).locator('.dg-text-flows')).toContainText('loops back');
  });

  test('hipaa: containers frame their nodes, and cards and text name them', async ({ page }) => {
    await page.goto(DIAGRAM_CASES.hipaa.path);
    await expect(page.locator('.dg-box')).toHaveCount(15);
    await expect(page.locator('.dg-box--boundary')).toHaveCount(1);
    // Containers are drawn for sighted readers and hidden from assistive tech.
    expect(
      await page
        .locator('.dg-box')
        .first()
        .evaluate((el) => el.closest('[aria-hidden="true"]') !== null),
    ).toBe(true);
    await node(page, /^Read replica/).click();
    await expect(card(page, 'Read replica')).toContainText(
      'Production › ePHI boundary › Application VPC › Availability zone 2',
    );
    await page.keyboard.press('Escape');
    await figure(page).getByText('Read the diagram as text').click();
    await expect(figure(page).locator('.dg-text-boxes')).toContainText(
      'ePHI boundary › Logging: VPC flow logs, CloudWatch, CloudTrail, S3',
    );
    // A wide diagram keeps its higher floor and says it scrolls.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(figure(page).getByText('Scroll sideways for the rest.')).toBeVisible();
  });

  test('cookieless: before and after each expand on their own', async ({ page }) => {
    await page.goto(DIAGRAM_CASES.cookieless.path);
    const figures = page.locator('figure[data-dg]');
    for (const [i, title] of ['Client-side collection.', 'Server-side collection.'].entries()) {
      await figures.nth(i).getByRole('button', { name: 'Expand diagram' }).click();
      const view = page.getByRole('dialog', { name: title });
      await expect(view).toBeVisible();
      await expect(view.locator('svg[data-dg-svg]')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(view).toBeHidden();
    }
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('cards and highlights work; Expand stays hidden', async ({ page }) => {
    await page.goto(CASE);
    await expect(figure(page).getByRole('button', { name: 'Expand diagram' })).toBeHidden();
    await node(page, /Event API/).click();
    await expect(card(page, 'Event API')).toBeVisible();
  });
});

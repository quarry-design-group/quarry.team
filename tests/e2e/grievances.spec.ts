import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * The stakeholder grievance mechanism, end to end against the real Worker
 * (ADR-0017): the `worker` Playwright project runs `wrangler dev` on the built
 * output with a local D1, so these tests cover what the static suite cannot —
 * the on-demand render, the signed token, server-side validation with the
 * visitor's text preserved, the 303 to a confirmation carrying the reference,
 * the security headers a Worker response must set itself, and the brief's
 * acceptance criterion: a scripted flood puts zero entries in the live log.
 *
 * No Turnstile secret is configured locally, so the challenge is `skipped`
 * (dev parity with the contact forms): a human-paced, clean submission is
 * accepted; a scripted one still trips the dwell-time check and the throttle.
 */

const WEB_DIR = fileURLToPath(new URL('../../apps/web', import.meta.url));

/** Query the local D1 the Worker is writing to (one shell string: Windows
 *  concatenates spawn args without quoting, so the SQL is quoted here). */
const d1 = (sql: string): Record<string, unknown>[] => {
  const cmd =
    'pnpm exec wrangler d1 execute marketing-site-form-submissions --local ' +
    `-c dist/server/wrangler.json --json --command "${sql}"`;
  const out = execSync(cmd, { cwd: WEB_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as {
    results: Record<string, unknown>[];
  }[];
  return parsed[0]?.results ?? [];
};

const PAGE = '/policies/grievances';
const REF = /GRV-\d{4}-[0-9A-HJKMNP-TV-Z]{5}/;

/**
 * The intake keys its throttle on `cf-connecting-ip`, which the Cloudflare
 * edge always sets (and overwrites) in production. `wrangler dev` sets nothing,
 * so the tests supply it: a fresh /16 per run and a fresh address per test,
 * keeping throttle buckets isolated across tests and across repeated local
 * runs against the same persisted D1.
 */
const RUN_NET = `10.${Math.floor(Math.random() * 250)}`;
let addr = 10;
const nextIp = () => `${RUN_NET}.0.${addr++}`;
const IP_HEADER = 'cf-connecting-ip';

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ [IP_HEADER]: nextIp() });
});

const fillGoodForm = async (page: import('@playwright/test').Page, description: string) => {
  await page.getByLabel('Contact me by email').check();
  await page.getByLabel('Your name', { exact: false }).fill('Ada Lovelace');
  await page.getByLabel('Email address').fill('ada@example.com');
  await page.getByLabel('Your relationship to Quarry').selectOption('client');
  await page.getByLabel('What is the concern about?').selectOption('client_project');
  await page.getByLabel('Describe the concern').fill(description);
  await page.getByLabel(/I understand how this submission/).check();
};

/** A bot: fetch a token, then POST straight away with it (with the Origin
 *  header a browser would send — Astro's cross-site POST check rejects a POST
 *  without one before the intake even runs). */
const scriptedPost = async (
  request: APIRequestContext,
  ip: string,
  overrides: Record<string, string> = {},
) => {
  const html = await (await request.get(PAGE, { headers: { [IP_HEADER]: ip } })).text();
  const token = html.match(/name="_t" value="([^"]+)"/)?.[1] ?? '';
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  return request.post(PAGE, {
    headers: { Origin: origin, [IP_HEADER]: ip },
    form: {
      contact_mode: 'anonymous',
      stakeholder: 'other',
      category: 'other',
      description: 'Automated submission from a headless script, repeated many times.',
      acknowledge: 'on',
      _t: token,
      ...overrides,
    },
    maxRedirects: 0,
  });
};

test.describe.configure({ mode: 'serial' });

test('the page renders on demand with the policy, the form, a signed token, and Worker-set security headers', async ({
  page,
}) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp ??= [];
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`,
      );
    });
  });
  const res = await page.goto(PAGE, { waitUntil: 'networkidle' });
  expect(res?.status()).toBe(200);
  const headers = res!.headers();
  // The static `_headers` never reach a Worker response: the middleware sets them.
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['cache-control']).toBe('no-store');
  const csp = headers['content-security-policy'] ?? '';
  expect(csp).not.toMatch(/unsafe-/);
  expect(csp).not.toContain('__CSP_');
  expect(csp).toMatch(/script-src [^;]*'sha256-/);
  expect(csp).toMatch(/style-src [^;]*'sha256-/);
  violations.push(
    ...(await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])),
  );
  expect(violations, 'no CSP violations under the Worker-set policy').toEqual([]);

  await expect(page.locator('h1')).toContainText('Grievances & Concerns');
  await expect(page.locator('#raise-heading')).toHaveText('Raise a concern');
  const token = await page.locator('input[name="_t"]').getAttribute('value');
  expect(token).toMatch(/^\d{13}\.[A-Za-z0-9_-]{40,}$/);
  // Two renders, two tokens: each carries its own issue time.
  const res2 = await page.goto(PAGE);
  expect(await page.locator('input[name="_t"]').getAttribute('value')).not.toBe(token);
  expect(res2?.status()).toBe(200);
});

test('a human-paced submission is accepted, redirects to a confirmation with the reference, and lands in D1', async ({
  page,
}) => {
  await page.goto(PAGE);
  const description = `E2E accepted ${Date.now()}: the handoff left us without the promised documentation.`;
  await fillGoodForm(page, description);
  await page.waitForTimeout(4_500); // clear the dwell-time check
  await page.getByRole('button', { name: 'Submit concern' }).click();

  await expect(page).toHaveURL(/\/policies\/grievances\/received\?ref=GRV-/);
  await expect(page.locator('h1')).toContainText('received your concern');
  const ref = (await page
    .locator('text=/GRV-\\d{4}-[0-9A-HJKMNP-TV-Z]{5}/')
    .first()
    .textContent())!.match(REF)![0];

  const rows = d1(`SELECT outcome, reasons, email, anonymous FROM grievances WHERE ref = '${ref}'`);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    outcome: 'accepted',
    reasons: '[]',
    email: 'ada@example.com',
    anonymous: 0,
  });
  // The confirmation page is itself a Worker response: same header contract.
  const res = await page.request.get(page.url());
  expect(res.headers()['content-security-policy']).not.toMatch(/unsafe-/);
  expect(res.headers()['x-robots-tag'] ?? (await res.text())).toMatch(/noindex/);
});

test('works with JavaScript disabled: server-side validation keeps the visitor’s text, then confirms', async ({
  browser,
}) => {
  // A hand-made context inherits none of the project's `use` options: repeat
  // reducedMotion, or the site's smooth scroll to each control keeps
  // Playwright's stability check from ever settling without page scripting.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: 'reduce',
    extraHTTPHeaders: { [IP_HEADER]: nextIp() },
  });
  const page = await context.newPage();
  await page.goto(PAGE);
  const description = `E2E no-JS ${Date.now()}: a concern typed carefully without any scripting.`;
  // Submit incomplete: no category, no acknowledgment.
  await page.getByLabel('I prefer to stay anonymous').check();
  await page.getByLabel('Your relationship to Quarry').selectOption('community');
  await page.getByLabel('Describe the concern').fill(description);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(PAGE) && r.request().method() === 'POST'),
    // With scripting disabled, Playwright's click never resolves (its hit-target
    // and navigation bookkeeping need page scripting), so submit the way a
    // keyboard user does: Enter on a focused control triggers implicit submission.
    // (The contact fields are hidden while "anonymous" is checked.)
    page.getByLabel('I prefer to stay anonymous').press('Enter'),
  ]);
  expect(res.status()).toBe(422);
  await page.waitForLoadState('load');
  const summary = page.locator('#form-errors');
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute('role', 'alert');
  await expect(summary.locator('a[href="#category"]')).toBeVisible();
  await expect(summary.locator('a[href="#acknowledge"]')).toBeVisible();
  await expect(page.locator('#category')).toHaveAttribute('aria-invalid', 'true');
  // The text survived the round trip — the whole point of server-side re-render.
  await expect(page.getByLabel('Describe the concern')).toHaveValue(description);

  // The successful no-JS path from a fresh render: every field, then the
  // keyboard submission a screen-reader user would make.
  await page.goto(PAGE);
  await page.getByLabel('I prefer to stay anonymous').check();
  await page.getByLabel('Your relationship to Quarry').selectOption('community');
  await page.getByLabel('What is the concern about?').selectOption('environmental');
  await page.getByLabel('Describe the concern').fill(description);
  await page.getByLabel(/I understand how this submission/).check();
  await page.waitForTimeout(4_500);
  await page.getByLabel('I prefer to stay anonymous').press('Enter');
  await expect(page).toHaveURL(/\/received\?ref=GRV-/);
  await expect(page.locator('h1')).toContainText('received your concern');
  const ref = page.url().match(REF)![0];
  const rows = d1(`SELECT outcome, anonymous, email FROM grievances WHERE ref = '${ref}'`);
  expect(rows[0]).toMatchObject({ outcome: 'accepted', anonymous: 1, email: null });
  await context.close();
});

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// No injected style tag here (the a11y suite's trick): these responses carry
// the real, Worker-set CSP, which blocks it — the project's reducedMotion
// emulation already disables the site's animations for a deterministic scan.
const axeViolations = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return violations.map(
    (v) => `${v.id}: ${v.help} @ ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
};

test('the form, its error state, and the confirmation meet WCAG 2.2 AA (axe)', async ({ page }) => {
  await page.goto(PAGE);
  expect(await axeViolations(page), 'pristine form').toEqual([]);
  // Error state: submit an incomplete form and scan the re-render.
  await page.getByLabel('I prefer to stay anonymous').check();
  await page
    .getByLabel('Describe the concern')
    .fill('An incomplete submission to exercise the error summary.');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes(PAGE) && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Submit concern' }).click({ noWaitAfter: true }),
  ]);
  await expect(page.locator('#form-errors')).toBeVisible();
  expect(await axeViolations(page), 'error state').toEqual([]);
  await page.goto('/policies/grievances/received?ref=GRV-2026-TESTQ');
  expect(await axeViolations(page), 'confirmation').toEqual([]);
});

test('a filled honeypot is rejected with a recovery notice and logged with its reason', async ({
  request,
}) => {
  const before = d1(`SELECT COUNT(*) AS n FROM grievance_events WHERE reason = 'honeypot'`)[0]!
    .n as number;
  const res = await scriptedPost(request, nextIp(), { hp_note: 'http://spam.example' });
  expect(res.status()).toBe(400);
  const html = await res.text();
  expect(html).toContain('We couldn’t take that submission');
  expect(html).toContain('Your answers are still in the form');
  // The re-render carries the honeypot value: resubmitting it as-is trips it again.
  expect(html).toContain('value="http://spam.example"');
  const after = d1(`SELECT COUNT(*) AS n FROM grievance_events WHERE reason = 'honeypot'`)[0]!
    .n as number;
  expect(after).toBe(before + 1);
});

test('a patient bot cannot replay a token harvested from another address', async ({ request }) => {
  const harvester = nextIp();
  const html = await (await request.get(PAGE, { headers: { [IP_HEADER]: harvester } })).text();
  const token = html.match(/name="_t" value="([^"]+)"/)?.[1] ?? '';
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  await new Promise((r) => setTimeout(r, 4_500)); // wait out the dwell check, as a patient bot would
  const res = await request.post(PAGE, {
    headers: { Origin: origin, [IP_HEADER]: nextIp() },
    form: {
      contact_mode: 'anonymous',
      stakeholder: 'other',
      category: 'other',
      description: 'Replayed with a token minted for somebody else, after a polite pause.',
      acknowledge: 'on',
      _t: token,
    },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(400);
  expect(await res.text()).toContain('We couldn’t take that submission');
  const bad = d1(`SELECT COUNT(*) AS n FROM grievance_events WHERE reason = 'bad_token'`)[0]!
    .n as number;
  expect(bad).toBeGreaterThan(0);
});

test('a scripted flood puts zero entries in the live log: quarantined at first, throttled after', async ({
  request,
}) => {
  const marker = `flood-${Date.now()}`;
  const bot = nextIp(); // one source, hammering
  const statuses: number[] = [];
  for (let i = 0; i < 8; i++) {
    const res = await scriptedPost(request, bot, {
      description: `Automated ${marker} submission ${i} from a headless script, repeated.`,
    });
    statuses.push(res.status());
  }
  // The first few get in (303) but too fast to be human; the rest hit the throttle.
  expect(statuses.filter((s) => s === 303).length).toBeGreaterThan(0);
  expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  expect(statuses.indexOf(429)).toBeGreaterThan(statuses.lastIndexOf(303));

  const live = d1(
    `SELECT COUNT(*) AS n FROM grievances WHERE outcome = 'accepted' AND description LIKE '%${marker}%'`,
  )[0]!.n as number;
  expect(live, 'nothing from the flood reaches the live log').toBe(0);
  const quarantined = d1(
    `SELECT reasons FROM grievances WHERE outcome = 'quarantined' AND description LIKE '%${marker}%'`,
  );
  expect(quarantined.length).toBe(statuses.filter((s) => s === 303).length);
  for (const row of quarantined) expect(String(row.reasons)).toContain('too_fast');
  const throttled = d1(
    `SELECT COUNT(*) AS n FROM grievance_events WHERE kind = 'rejected' AND reason = 'rate_limited'`,
  )[0]!.n as number;
  expect(throttled).toBeGreaterThan(0);
});

test('legacy legal URLs 301 into the policies section', async ({ request }) => {
  for (const [from, to] of [
    ['/privacy', '/policies/privacy'],
    ['/terms', '/policies/terms'],
  ] as const) {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status(), `${from} should 301`).toBe(301);
    expect(new URL(res.headers().location!, 'http://localhost').pathname).toBe(to);
  }
});

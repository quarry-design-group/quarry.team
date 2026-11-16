import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Client-side form-flow contract for the contact and careers forms. The e2e
 * server is the built static site (sirv), so the Worker API is exercised at
 * the network boundary via route interception: these tests pin the request
 * payload the client sends (including the untouched honeypot) and the
 * success/error UX; the server-side validation behind /api/* is unit-tested
 * in apps/web/src/lib/form-submissions.test.ts, and Turnstile runs only in deployed
 * environments (ADR 0012).
 */

type CapturedRequest = { payload: Record<string, string> | null; count: number };

const interceptApi = async (
  page: Page,
  path: string,
  status = 200,
  hold?: Promise<void>,
): Promise<CapturedRequest> => {
  const captured: CapturedRequest = { payload: null, count: 0 };
  await page.route(`**${path}`, async (route: Route) => {
    captured.payload = route.request().postDataJSON() as Record<string, string>;
    captured.count += 1;
    if (hold) await hold;
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(status === 200 ? { ok: true } : { ok: false }),
    });
  });
  return captured;
};

test.describe('contact form (SubmissionForm component)', () => {
  test('valid submission POSTs JSON with an untouched honeypot and shows the success note', async ({
    page,
  }) => {
    const captured = await interceptApi(page, '/api/contact');
    await page.goto('/contact');
    await page.getByLabel('Name').fill('Ada Lovelace');
    await page.getByLabel('Work email').fill('ada@example.com');
    await page.getByLabel('Organization').fill('Analytical Engines Ltd');
    await page.getByLabel('What are you working on?').fill('An analytical engine, POC first.');
    await page.locator('#contact-form button[type="submit"]').click();

    await expect(page.locator('#contact-form [data-status="ok"]')).toBeVisible();
    await expect(page.locator('#contact-form [data-status="err"]')).toBeHidden();
    expect(captured.payload).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      organization: 'Analytical Engines Ltd',
      message: 'An analytical engine, POC first.',
      hp_note: '', // honeypot must ship empty for a human submission
    });
    expect(captured.payload).not.toHaveProperty('role');
    expect(captured.payload).not.toHaveProperty('links');
    // Success resets the form.
    await expect(page.getByLabel('Name')).toHaveValue('');
  });

  test('failed submission shows the recovery note and preserves what was typed', async ({
    page,
  }) => {
    await interceptApi(page, '/api/contact', 500);
    await page.goto('/contact');
    await page.getByLabel('Name').fill('Ada Lovelace');
    await page.getByLabel('Work email').fill('ada@example.com');
    await page.getByLabel('What are you working on?').fill('An analytical engine, POC first.');
    await page.locator('#contact-form button[type="submit"]').click();

    const err = page.locator('#contact-form [data-status="err"]');
    await expect(err).toBeVisible();
    await expect(err).toHaveAttribute('role', 'alert');
    // The recovery path depends on the text surviving the failure.
    await expect(page.getByLabel('Name')).toHaveValue('Ada Lovelace');
    await expect(page.getByLabel('What are you working on?')).toHaveValue(
      'An analytical engine, POC first.',
    );
  });

  test('the submit button is disabled while a request is in flight', async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const captured = await interceptApi(page, '/api/contact', 200, held);
    await page.goto('/contact');
    await page.getByLabel('Name').fill('Ada Lovelace');
    await page.getByLabel('Work email').fill('ada@example.com');
    await page.getByLabel('What are you working on?').fill('An analytical engine, POC first.');
    const submit = page.locator('#contact-form button[type="submit"]');
    await submit.click();

    await expect(submit).toBeDisabled();
    // A second activation while the first request is pending sends nothing.
    await page.getByLabel('Work email').press('Enter');
    release();
    await expect(page.locator('#contact-form [data-status="ok"]')).toBeVisible();
    await expect(submit).toBeEnabled();
    expect(captured.count).toBe(1);
  });

  test('honeypot is invisible to humans and assistive tech but present for bots', async ({
    page,
  }) => {
    await page.goto('/contact');
    const hp = page.locator('#contact-form .hp');
    await expect(hp).toHaveAttribute('aria-hidden', 'true');
    const input = hp.locator('input[name="hp_note"]');
    expect(await input.count()).toBe(1);
    await expect(input).toHaveAttribute('tabindex', '-1');
    await expect(input).toHaveAttribute('autocomplete', 'off');
    // display:none, not off-screen: browsers never autofill an invisible field,
    // and the password-manager opt-outs cover the extensions that would.
    await expect(input).toBeHidden();
    await expect(input).toHaveAttribute('data-1p-ignore', '');
    await expect(input).toHaveAttribute('data-lpignore', 'true');
    await expect(input).toHaveAttribute('data-bwignore', '');
  });
});

test.describe('careers forms (SubmissionForm component)', () => {
  test('general-interest application POSTs to /api/careers and confirms', async ({ page }) => {
    const captured = await interceptApi(page, '/api/careers');
    await page.goto('/careers');
    const form = page.locator('form.js-submission-form');
    await form.getByLabel('Name').fill('Grace Hopper');
    await form.getByLabel('Email').fill('grace@example.com');
    await form.getByLabel(/Role you're interested in/).fill('Senior QA Engineer');
    await form.getByLabel('Tell us about yourself').fill('I write compilers and find bugs.');
    await form.locator('button[type="submit"]').click();

    await expect(form.locator('[data-status="ok"]')).toBeVisible();
    expect(captured.payload).toMatchObject({
      name: 'Grace Hopper',
      email: 'grace@example.com',
      role: 'Senior QA Engineer',
      hp_note: '',
    });
  });

  test('position application enforces a loom.com intro link client-side', async ({ page }) => {
    const captured = await interceptApi(page, '/api/careers');
    await page.goto('/careers');
    const positionHref = await page
      .locator('a[href^="/careers/"]:not([href="/careers/"])')
      .first()
      .getAttribute('href');
    expect(positionHref, 'at least one published position must exist').toBeTruthy();
    await page.goto(positionHref as string);

    const form = page.locator('form.js-submission-form');
    await form.getByLabel('Name').fill('Grace Hopper');
    await form.getByLabel('Email').fill('grace@example.com');
    await form.getByLabel('Tell us about yourself').fill('I write compilers and find bugs.');

    // A non-Loom URL must be rejected by the input's pattern before any request.
    const loom = form.locator('input[name="loom"]');
    await loom.fill('https://example.com/not-loom');
    await form.locator('button[type="submit"]').click();
    expect(await loom.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
    expect(captured.payload, 'invalid Loom link must not reach the API').toBeNull();

    await loom.fill('https://www.loom.com/share/0123456789abcdef');
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('[data-status="ok"]')).toBeVisible();
    expect(captured.payload).toMatchObject({
      loom: 'https://www.loom.com/share/0123456789abcdef',
      hp_note: '',
    });
    // The position page pre-fills and locks the role via a hidden input.
    expect(captured.payload?.role).toBeTruthy();
  });
});

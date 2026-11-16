import { defineConfig, devices } from '@playwright/test';

// Both ports are overridable (E2E_PORT, E2E_WORKER_PORT): with
// reuseExistingServer on locally, a sibling worktree's `astro dev` on 4321
// would otherwise be mistaken for this run's static server.
const PORT = Number(process.env.E2E_PORT ?? 4321);
/** The built Worker under workerd (wrangler dev) — the on-demand grievance
 *  and search routes, and the per-request CSP nonce every HTML response
 *  leaves with. */
const WORKER_PORT = Number(process.env.E2E_WORKER_PORT ?? 8788);
const WORKER_SPECS = /(grievances|csp-nonce|search|select)\.spec\.ts$/;
const SMOKE_SPECS = /production\.spec\.ts/;

/** Set to a live origin (e.g. https://quarry.team) to run the post-deploy
 *  smoke (tests/e2e/production.spec.ts) against it instead of the local build.
 *  The deploy workflow does this right after `wrangler deploy` (ADR-0018). */
const SMOKE_BASE_URL = process.env.SMOKE_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: SMOKE_BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: SMOKE_BASE_URL
    ? [
        {
          name: 'production',
          testMatch: SMOKE_SPECS,
          use: { ...devices['Desktop Chrome'] },
        },
      ]
    : [
        {
          name: 'chromium',
          testIgnore: [SMOKE_SPECS, WORKER_SPECS],
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'mobile',
          testIgnore: [SMOKE_SPECS, WORKER_SPECS],
          use: { ...devices['Pixel 7'] },
        },
        {
          // Server-rendered routes never exist in dist/client, so sirv cannot
          // serve them: this project drives the real Worker (local D1, local
          // migrations) and exercises the grievance intake at the network
          // boundary — headers included (ADR-0017) — plus the Worker-first
          // serving of static HTML with its CSP nonce (ADR-0019) and the
          // search route with its rate-limit binding (ADR-0021). Serial: the
          // grievance tests share one throttle table.
          name: 'worker',
          // reducedMotion: the site smooth-scrolls to the form's #raise anchor on
          // every re-render; under reduce that is instant, so locators are stable.
          use: {
            ...devices['Desktop Chrome'],
            baseURL: `http://localhost:${WORKER_PORT}`,
            reducedMotion: 'reduce',
          },
          testMatch: WORKER_SPECS,
          fullyParallel: false,
        },
      ],
  webServer: SMOKE_BASE_URL
    ? undefined
    : [
        {
          // sirv serves the static half of the build (dist/client) for the
          // chromium and mobile projects; the worker project drives the real
          // Worker. Same server as `pnpm preview`.
          command: `pnpm --filter @quarry/web exec sirv dist/client --port ${PORT} --host --quiet`,
          url: `http://localhost:${PORT}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          // wrangler dev against the emitted config, after applying the D1
          // migrations to the local database. GRIEVANCE_STRICT=0 keeps the
          // production build lenient locally (no secrets here — ADR-0017).
          command: `pnpm --filter @quarry/web db:migrate:local && pnpm --filter @quarry/web exec wrangler dev -c dist/server/wrangler.json --port ${WORKER_PORT} --show-interactive-dev-session=false --var GRIEVANCE_STRICT:0`,
          url: `http://localhost:${WORKER_PORT}/policies/grievances`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      ],
});

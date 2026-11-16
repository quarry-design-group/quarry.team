/**
 * The route layer for the form endpoints: `makeSubmissionRoute(kind)` builds
 * the `POST` and `ALL` handlers that `src/pages/api/contact.ts` and
 * `.../careers.ts` export. It binds the runtime-agnostic submission logic
 * (`form-submissions.ts`) to the Worker env and to the build mode; the
 * security headers on its JSON responses are stamped by `src/middleware.ts`.
 * See ADR-0014.
 */
import type { APIRoute } from 'astro';
// Astro v6 removed Astro.locals.runtime.env on the Cloudflare adapter — worker
// bindings/secrets are imported from the runtime module instead.
import { env as workerEnv } from 'cloudflare:workers';
import { handleSubmission, type SubmissionEnv, type SubmissionKind } from './form-submissions';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

export function makeSubmissionRoute(kind: SubmissionKind): { POST: APIRoute; ALL: APIRoute } {
  const POST: APIRoute = async ({ request }) => {
    // cf-connecting-ip is always set by the Cloudflare edge. Do NOT touch
    // Astro's `clientAddress` here — on the Cloudflare adapter it is a getter
    // that THROWS (ClientAddressNotAvailable) and fails every submission.
    const ip = request.headers.get('cf-connecting-ip') ?? '';
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const { status, body: result } = await handleSubmission(
      kind,
      body,
      workerEnv as unknown as SubmissionEnv,
      // Only `astro dev` accepts submissions without the Turnstile secret.
      { ip, deployed: !import.meta.env.DEV },
    );
    return json(status, result);
  };

  // Anything but POST: a proper 405 with Allow, not a generic 404 — the form
  // endpoints are the one part of the site an API-minded evaluator probes.
  const ALL: APIRoute = () =>
    json(405, { ok: false, error: 'method_not_allowed' }, { allow: 'POST' });

  return { POST, ALL };
}

/**
 * Minimal ambient declaration for the Cloudflare Workers runtime module — the
 * repo deliberately avoids a hard dependency on @cloudflare/workers-types (see
 * D1Like in src/lib/form-submissions.ts). `env` carries the Worker's bindings + secrets;
 * call sites narrow it to the shape they need (e.g. SubmissionEnv).
 */
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}

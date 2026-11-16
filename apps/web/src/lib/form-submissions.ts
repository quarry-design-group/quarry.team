/**
 * Form-submission capture — shared logic for the same-origin form endpoints
 * (`src/pages/api/contact.ts`, `.../careers.ts`, both built by
 * `src/lib/submission-route.ts`). Runs on the Cloudflare Workers runtime via
 * the Astro adapter. Responsibilities: validate (Zod), verify Turnstile,
 * persist to D1, notify the team. Pure and runtime-agnostic so it can be
 * unit-tested without a live Worker. See ADR-0014.
 *
 * Deployed builds fail closed: without `WORKER_TURNSTILE_SECRET` every submission is
 * refused with a 503, and a verifier outage answers 503 as well. Only a
 * development build accepts submissions without a secret.
 *
 * The client address is stored as two derived values: its network prefix
 * (IPv4 /24, IPv6 /48) and an HMAC-SHA256 of the full address keyed by
 * `WORKER_FORM_SUBMISSIONS_IP_HASH_KEY`. The key is distinct from the grievance
 * intake's, so hashes from the two stores never correlate. Rows are deleted
 * 36 months after receipt (docs/runbooks/data-retention.md).
 *
 * Rate limiting is enforced upstream at the Cloudflare WAF (per-IP rate-limit
 * rule on the form endpoints) — the correct layer on the edge, since Worker
 * isolates don't share in-process memory.
 */
import { z } from 'zod';
import { hashIp } from './grievances';

/** Minimal structural type for a D1 prepared statement — avoids a hard
 *  dependency on @cloudflare/workers-types in the shared module. */
export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): { run(): Promise<unknown> };
  };
}

/** Bindings + vars the submission handler reads off the Worker runtime env. */
export interface SubmissionEnv {
  DB?: D1Like;
  WORKER_TURNSTILE_SECRET?: string;
  /** Secret. Keys the stored address hash; distinct from WORKER_GRIEVANCE_SIGNING_KEY. */
  WORKER_FORM_SUBMISSIONS_IP_HASH_KEY?: string;
  WORKER_RESEND_API_KEY?: string;
  WORKER_FORM_SUBMISSIONS_NOTIFY_TO?: string;
  WORKER_FORM_SUBMISSIONS_NOTIFY_FROM?: string;
  WORKER_FORM_SUBMISSIONS_WEBHOOK_URL?: string;
}

export type SubmissionKind = 'contact' | 'careers';

/** The honeypot input's name — hidden from humans, filled by naive bots. The
 *  name and label deliberately resemble no address, identity, or URL field:
 *  browser and password-manager autofill classify inputs by those cues and
 *  ignore `autocomplete="off"`, and a filled honeypot rejects the submission.
 *  The forms hide the wrapper with display:none rather than off-screen
 *  positioning (browsers never autofill an invisible field) and carry the
 *  1Password/LastPass/Bitwarden opt-out attributes for the extensions that do. */
export const HONEYPOT_FIELD = 'hp_note';

// Honeypot: a field hidden from humans via CSS. Real users leave it blank;
// naive bots fill every field, so a non-empty value fails validation.
const honeypot = z.string().max(0).optional().or(z.literal(''));

export const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.email().max(320),
  organization: z.string().max(200).optional().default(''),
  message: z.string().min(1).max(5000),
  [HONEYPOT_FIELD]: honeypot,
  'cf-turnstile-response': z.string().optional(),
});

export const careersSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.email().max(320),
  role: z.string().max(200).optional().default(''),
  // Loom intro for position applications. Optional here because the general
  // interest form posts to the same endpoint without it (the position form
  // marks the input required client-side) — but when present it must be a
  // loom.com link, so applicants can't satisfy the field with anything else.
  loom: z
    .string()
    .regex(/^https:\/\/(www\.)?loom\.com\/\S+$/, 'must be a loom.com link')
    .max(500)
    .optional()
    .or(z.literal('')),
  links: z.string().max(2000).optional().default(''),
  message: z.string().min(1).max(5000),
  [HONEYPOT_FIELD]: honeypot,
  'cf-turnstile-response': z.string().optional(),
});

const SCHEMAS = { contact: contactSchema, careers: careersSchema } as const;

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** `passed` lets the submission through; `failed` is the client's (no token,
 *  or a failed challenge) and answers 403; `unavailable` means verification
 *  cannot run and answers 503. */
export type TurnstileOutcome = 'passed' | 'failed' | 'unavailable';

/** Verify a Cloudflare Turnstile token. Without a secret, a deployed build is
 *  `unavailable` and a development build passes, so local forms work with no
 *  secrets wired. An unreachable or erroring verifier is `unavailable`. */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
  secret: string | undefined,
  deployed = false,
): Promise<TurnstileOutcome> {
  if (!secret) return deployed ? 'unavailable' : 'passed';
  if (!token) return 'failed';
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    if (!res.ok) throw new Error(`siteverify responded ${res.status}`);
    const data = (await res.json()) as { success?: boolean };
    return data.success === true ? 'passed' : 'failed';
  } catch (err) {
    // An unreachable or erroring verify endpoint is an OUTAGE, not a bot: it
    // answers 503, and the log line keeps it distinguishable from failed
    // challenges — during a Turnstile outage every refused submission lands here.
    console.error(
      '[form-submissions] turnstile verify ERROR (outage, not a failed challenge):',
      err,
    );
    return 'unavailable';
  }
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET = /^[0-9a-f]{1,4}$/i;

function ipv4Prefix(ip: string): string {
  const m = IPV4.exec(ip);
  if (!m || m.slice(1).some((octet) => Number(octet) > 255)) return '';
  return `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}.0/24`;
}

/** The network prefix of a client address: IPv4 /24 (`203.0.113.0/24`) or
 *  IPv6 /48 (`2001:db8:85a3::/48`, hextets in canonical lowercase form). An
 *  IPv4-mapped IPv6 address yields its IPv4 prefix. Empty for anything that is
 *  not an address. */
export function ipPrefix(ip: string): string {
  const addr = ip.trim().replace(/%.*$/, ''); // an IPv6 zone id is not part of the address
  if (!addr.includes(':')) return ipv4Prefix(addr);
  const last = addr.slice(addr.lastIndexOf(':') + 1);
  if (last.includes('.')) return ipv4Prefix(last);
  const halves = addr.split('::');
  if (halves.length > 2) return '';
  const groups = (part: string) => (part ? part.split(':') : []);
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  const zeros = 8 - head.length - tail.length;
  if (halves.length === 2 ? zeros < 1 : zeros !== 0) return '';
  const all = [...head, ...Array<string>(zeros).fill('0'), ...tail];
  if (!all.every((g) => HEXTET.test(g))) return '';
  const [a, b, c] = all.map((g) => parseInt(g, 16).toString(16));
  return `${a}:${b}:${c}::/48`;
}

/** HMAC-SHA256 of the full client address, hex — the grievance intake's
 *  helper and message format (`ip:<address>`) under this store's own key.
 *  Null without an address or a key. */
export async function ipHash(key: string | undefined, ip: string): Promise<string | null> {
  if (!key || !ip) return null;
  return hashIp(key, ip);
}

async function insertSubmission(
  db: D1Like | undefined,
  kind: SubmissionKind,
  data: Record<string, unknown>,
  address: { prefix: string; hash: string | null },
): Promise<void> {
  if (!db) {
    console.log('[form-submissions] (no D1 binding) submission received:', kind);
    return;
  }
  // The Loom intro is data-wise a link: store it in the links column (prefixed
  // so it stays identifiable) rather than migrating a new column into D1.
  const links = [data.loom ? `Loom: ${data.loom}` : '', String(data.links ?? '')]
    .filter(Boolean)
    .join('\n');
  await db
    .prepare(
      `INSERT INTO form_submissions (kind, name, email, organization, message, role, links, ip, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      kind,
      String(data.name ?? ''),
      String(data.email ?? ''),
      String(data.organization ?? ''),
      String(data.message ?? ''),
      String(data.role ?? ''),
      links,
      address.prefix,
      address.hash,
    )
    .run();
}

/** HTML-escape a value for the notification body. */
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** A value as one line of plain text, for the subject header. */
const oneLine = (s: unknown) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

function summarize(kind: SubmissionKind, data: Record<string, unknown>): string {
  const rows =
    kind === 'careers'
      ? ['name', 'email', 'role', 'loom', 'links', 'message']
      : ['name', 'email', 'organization', 'message'];
  return rows
    .filter((k) => data[k])
    .map((k) => `<p><strong>${k}:</strong> ${esc(data[k])}</p>`)
    .join('\n');
}

/** Surface non-2xx notification responses in the Worker logs. fetch() only
 *  rejects on network failure — an HTTP 403 (e.g. Resend domain not verified)
 *  resolves "successfully", so the status is checked here. */
async function logIfNotOk(label: string, res: Response): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  console.error(`[form-submissions] ${label} responded ${res.status}: ${body.slice(0, 500)}`);
}

/** Best-effort notifications (email via Resend + optional webhook). Never
 *  throws — the submission is already persisted before this runs. The subject
 *  is a plain-text header built from the raw values; HTML escaping applies to
 *  the HTML body only. */
export async function notifySubmission(
  env: SubmissionEnv,
  kind: SubmissionKind,
  data: Record<string, unknown>,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (env.WORKER_RESEND_API_KEY) {
    const to = (env.WORKER_FORM_SUBMISSIONS_NOTIFY_TO ?? 'hello@quarry.team')
      .split(',')
      .map((s) => s.trim());
    const from = env.WORKER_FORM_SUBMISSIONS_NOTIFY_FROM ?? 'Quarry Site <noreply@quarry.team>';
    const who = oneLine(data.name) || 'Someone';
    const subject =
      kind === 'careers'
        ? `New application: ${who}${data.role ? ` — ${oneLine(data.role)}` : ''}`
        : `New inquiry: ${who}${data.organization ? ` (${oneLine(data.organization)})` : ''}`;
    tasks.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WORKER_RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          reply_to: String(data.email ?? ''),
          subject,
          html: `<h2>${kind === 'careers' ? 'Careers application' : 'Project inquiry'}</h2>\n${summarize(kind, data)}`,
        }),
      }).then((res) => logIfNotOk('Resend', res)),
    );
  }

  if (env.WORKER_FORM_SUBMISSIONS_WEBHOOK_URL) {
    tasks.push(
      fetch(env.WORKER_FORM_SUBMISSIONS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...data }),
      }).then((res) => logIfNotOk('webhook', res)),
    );
  }

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[form-submissions] notification failed:', r.reason);
    }
  }
}

export type SubmissionResult = { status: number; body: { ok: boolean; error?: string } };

export interface SubmissionContext {
  /** The client address (`cf-connecting-ip`): sent to the Turnstile verifier,
   *  stored only as its prefix and keyed hash. */
  ip: string;
  /** A deployed build (the route passes `!import.meta.env.DEV`): a missing
   *  Turnstile secret refuses every submission. */
  deployed?: boolean;
}

const UNAVAILABLE: SubmissionResult = { status: 503, body: { ok: false, error: 'unavailable' } };

/** Configuration guard → validate → verify Turnstile → persist → notify.
 *  Returns the HTTP status and JSON body for the endpoint to send. */
export async function handleSubmission(
  kind: SubmissionKind,
  rawBody: unknown,
  env: SubmissionEnv,
  ctx: SubmissionContext,
): Promise<SubmissionResult> {
  const deployed = ctx.deployed ?? false;
  if (deployed && !env.WORKER_TURNSTILE_SECRET) {
    console.error('[form-submissions] WORKER_TURNSTILE_SECRET is not set; refusing submissions');
    return UNAVAILABLE;
  }

  const parsed = SCHEMAS[kind].safeParse(rawBody);
  if (!parsed.success) return { status: 400, body: { ok: false, error: 'invalid_input' } };

  const data = parsed.data as Record<string, unknown>;
  const turnstile = await verifyTurnstile(
    data['cf-turnstile-response'] as string | undefined,
    ctx.ip,
    env.WORKER_TURNSTILE_SECRET,
    deployed,
  );
  if (turnstile === 'unavailable') return UNAVAILABLE;
  if (turnstile === 'failed')
    return { status: 403, body: { ok: false, error: 'turnstile_failed' } };

  if (deployed && !env.WORKER_FORM_SUBMISSIONS_IP_HASH_KEY) {
    console.error(
      '[form-submissions] WORKER_FORM_SUBMISSIONS_IP_HASH_KEY is not set; storing the address prefix without a hash',
    );
  }
  const address = {
    prefix: ipPrefix(ctx.ip),
    hash: await ipHash(env.WORKER_FORM_SUBMISSIONS_IP_HASH_KEY, ctx.ip),
  };
  await insertSubmission(env.DB, kind, data, address);
  await notifySubmission(env, kind, data); // never throws; awaited, so the 200 follows delivery
  return { status: 200, body: { ok: true } };
}

/**
 * Stakeholder grievance intake — the shared logic behind the on-demand
 * /policies/grievances route (ADR-0017). Runs on the Cloudflare Workers
 * runtime via the Astro adapter; pure and runtime-agnostic (Web Crypto, fetch,
 * a structural D1 type) so it unit-tests without a live Worker.
 *
 * Pipeline: configuration guard → honeypot → signed dwell-time token →
 * validation → per-source throttle → Turnstile → content heuristics → persist
 * to D1 → mirror to the Notion log → notify (owner, or backup only) and
 * acknowledge (accepted submissions with a contact). Only three things REJECT
 * a submission outright — a filled honeypot, a bad or missing token, and the
 * throttle — and every rejection is logged with its reason. Everything else
 * the filters flag is QUARANTINED, never dropped: the record is stored and
 * mirrored with its reasons so a human reviews it. A missing Turnstile token
 * (no JavaScript) is a quarantine signal, not a rejection — the form must work
 * without JS.
 *
 * The WAF rate-limit rule (3 POSTs / 10 s per IP) is the burst layer; the D1
 * throttle here is the sustained layer with progressive backoff, so a
 * legitimate visitor on a shared network is slowed, not locked out. It counts
 * only submissions that passed validation: a person's mistakes are not a
 * signal (ADR-0017 §3).
 *
 * Strict mode (production builds, unless GRIEVANCE_STRICT=0): without
 * WORKER_GRIEVANCE_SIGNING_KEY the intake refuses to run rather than sign tokens and
 * hash addresses with a key that sits in a public repository, and a missing
 * Turnstile secret quarantines the submission. `astro dev` and the local e2e
 * run (which sets GRIEVANCE_STRICT=0) keep the lenient behaviour; every
 * built Worker, PR previews and staging included, runs strict (ADR-0017).
 */
import { z } from 'zod';

// ───────────────────────────── vocabulary ─────────────────────────────────

/** Stakeholder relationship: form dropdown keys → labels (also the Notion select names). */
export const STAKEHOLDERS = {
  employee: 'Employee',
  contractor: 'Contractor',
  client: 'Client',
  end_user: 'End user of a product Quarry built',
  vendor: 'Supplier or vendor',
  community: 'Community member',
  other: 'Other',
} as const;
export type Stakeholder = keyof typeof STAKEHOLDERS;
const stakeholderKeys = Object.keys(STAKEHOLDERS) as [Stakeholder, ...Stakeholder[]];

/** Concern category: form dropdown keys → labels (also the Notion select names). */
export const CATEGORIES = {
  workplace_conduct: 'Workplace conduct',
  pay_contract: 'Pay or contract',
  client_project: 'A client project',
  product_accessibility: 'Accessibility of a product we shipped',
  privacy_data: 'Privacy or data handling',
  marketing_claims: 'A marketing claim',
  environmental: 'Environmental',
  other: 'Other',
} as const;
export type Category = keyof typeof CATEGORIES;
const categoryKeys = Object.keys(CATEGORIES) as [Category, ...Category[]];

/** Fields the form posts (besides the honeypot, the token, and Turnstile). */
export const FIELDS = [
  'contact_mode',
  'name',
  'email',
  'stakeholder',
  'category',
  'involves_owner',
  'description',
  'desired_outcome',
  'acknowledge',
] as const;
export type Field = (typeof FIELDS)[number];

/** The honeypot input's name — hidden from humans, filled by naive bots. The
 *  name (and the field's label) deliberately resemble no address, identity, or
 *  URL field: browser and password-manager autofill classify inputs by those
 *  cues and ignore `autocomplete="off"`, and a filled honeypot rejects the
 *  submission. The form re-renders the posted value into the field, so a
 *  resubmission of the re-rendered form trips it again. */
export const HONEYPOT_FIELD = 'hp_note';
/** The signed dwell-time token's input name. */
export const TOKEN_FIELD = '_t';
export const TURNSTILE_FIELD = 'cf-turnstile-response';

/** Human-plausible minimum between form render and submit. */
export const MIN_DWELL_MS = 4_000;
/** A form left open longer than this must be reloaded (fresh token). */
export const MAX_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;

// ───────────────────────────── runtime types ──────────────────────────────

/** Structural D1 types — no hard dependency on @cloudflare/workers-types. */
export interface D1Bound {
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
export interface D1Like {
  prepare(query: string): { bind(...values: unknown[]): D1Bound };
}

/** Bindings, vars, and secrets the intake reads off the Worker env. */
export interface GrievanceEnv {
  DB?: D1Like;
  /** Secret, REQUIRED in production. Signs the dwell-time token and keys the IP hash. */
  WORKER_GRIEVANCE_SIGNING_KEY?: string;
  /** Secret. The dedicated invisible Turnstile widget's secret. */
  WORKER_TURNSTILE_GRIEVANCES_SECRET?: string;
  /** Secret. Internal-integration token with insert access to the log. */
  WORKER_NOTION_TOKEN?: string;
  /** Var. The Notion data source (database) that is the tracking log. */
  NOTION_GRIEVANCE_DATA_SOURCE_ID?: string;
  /** Vars. Notion user ids the "Owner" property is set to. */
  NOTION_GRIEVANCE_OWNER_ID?: string;
  NOTION_GRIEVANCE_BACKUP_ID?: string;
  /** Secret (shared with the contact/careers forms). */
  WORKER_RESEND_API_KEY?: string;
  /** Secret. Where new-submission notices go (default concerns@quarry.team). */
  WORKER_GRIEVANCE_NOTIFY_TO?: string;
  /** Secret. The backup's OWN inbox — never the shared alias. A concern that
   *  involves the owner is sent here and nowhere else; when unset, no email
   *  goes out for such a concern (the Notion routing still happens). */
  WORKER_GRIEVANCE_NOTIFY_BACKUP_TO?: string;
  /** Var. Sender for notices and acknowledgments. */
  GRIEVANCE_FROM?: string;
  /** Var. "0" opts a production build out of strict mode (local e2e). */
  GRIEVANCE_STRICT?: string;
}

/** Raw string values as posted (for validation and for re-rendering the form). */
export type FormValues = Record<string, string>;
export type FieldErrors = Partial<Record<Field, string>>;

export interface GrievanceInput {
  contact_mode: 'contact' | 'anonymous';
  name: string;
  email: string;
  stakeholder: Stakeholder;
  category: Category;
  involves_owner: boolean;
  description: string;
  desired_outcome: string;
}

export type TurnstileStatus = 'passed' | 'failed' | 'missing' | 'skipped' | 'error';

/** Quarantine signals — the vocabulary the Notion "Quarantine reasons" select carries. */
export type Signal =
  | 'no_turnstile'
  | 'turnstile_failed'
  | 'turnstile_error'
  | 'too_fast'
  | 'link_heavy'
  | 'blocklist'
  | 'unexpected_script';

export type Outcome = 'accepted' | 'quarantined';
export type RejectReason = 'honeypot' | 'bad_token' | 'rate_limited';

export type GrievanceResult =
  | { kind: 'invalid'; errors: FieldErrors }
  | { kind: 'rejected'; reason: RejectReason; retryAfterSec?: number }
  | { kind: 'received'; ref: string; outcome: Outcome }
  /** `offline`: strict mode without its signing key — the intake refuses to run
   *  until configured. `outage`: a dependency (D1) failed; worth retrying. */
  | { kind: 'unavailable'; reason: 'offline' | 'outage' };

/** What the page shows above the form after a POST that did not succeed. */
export type Notice = Extract<GrievanceResult, { kind: 'rejected' | 'unavailable' }>;

export interface GrievanceRecord extends GrievanceInput {
  ref: string;
  receivedAt: string; // ISO
  outcome: Outcome;
  reasons: Signal[];
  turnstile: TurnstileStatus;
  dwellMs: number | null;
}

// ───────────────────────────── form parsing & validation ──────────────────

/** Flatten a FormData to first-value-per-key strings (checkboxes → 'on'). */
export function parseForm(fd: FormData): FormValues {
  const out: FormValues = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string' && !(k in out)) out[k] = v;
  return out;
}

export const MESSAGES = {
  contact_mode: 'Choose whether we may contact you or you prefer to stay anonymous.',
  name: 'Keep your name under 200 characters.',
  email_required: 'Enter an email address so we can acknowledge and update you.',
  email_invalid: 'That email address doesn’t look right.',
  stakeholder: 'Tell us your relationship to Quarry.',
  category: 'Choose the category that fits best.',
  description_short: 'Describe the concern in at least 20 characters.',
  description_long: 'Keep the description under 10,000 characters.',
  desired_outcome: 'Keep the desired outcome under 3,000 characters.',
  acknowledge: 'Confirm you’ve read how we handle submissions.',
} as const;

const schema = z
  .object({
    contact_mode: z.enum(['contact', 'anonymous'], { error: MESSAGES.contact_mode }),
    name: z.string().trim().max(200, MESSAGES.name).default(''),
    email: z.string().trim().max(320, MESSAGES.email_invalid).default(''),
    stakeholder: z.enum(stakeholderKeys, { error: MESSAGES.stakeholder }),
    category: z.enum(categoryKeys, { error: MESSAGES.category }),
    involves_owner: z.string().optional(),
    description: z
      .string({ error: MESSAGES.description_short })
      .trim()
      .min(20, MESSAGES.description_short)
      .max(10_000, MESSAGES.description_long),
    desired_outcome: z.string().trim().max(3_000, MESSAGES.desired_outcome).default(''),
    acknowledge: z.literal('on', { error: MESSAGES.acknowledge }),
  })
  .superRefine((d, ctx) => {
    if (d.contact_mode !== 'contact') return;
    if (!d.email) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: MESSAGES.email_required });
    } else if (!z.email().safeParse(d.email).success) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: MESSAGES.email_invalid });
    }
  });

/** Validate posted values into a typed input, or field-level messages. */
export function validate(
  values: FormValues,
): { ok: true; data: GrievanceInput } | { ok: false; errors: FieldErrors } {
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as Field | undefined;
      if (field && !errors[field]) errors[field] = issue.message;
    }
    return { ok: false, errors };
  }
  const d = parsed.data;
  const anonymous = d.contact_mode === 'anonymous';
  return {
    ok: true,
    data: {
      contact_mode: d.contact_mode,
      // Anonymity is a promise: drop any contact detail typed before the switch.
      name: anonymous ? '' : d.name,
      email: anonymous ? '' : d.email,
      stakeholder: d.stakeholder,
      category: d.category,
      involves_owner: d.involves_owner === 'on',
      description: d.description,
      desired_outcome: d.desired_outcome,
    },
  };
}

// ───────────────────────────── crypto helpers ─────────────────────────────

const enc = new TextEncoder();
/** Lenient-mode fallback only — strict mode refuses to run on it. */
const DEV_KEY = 'dev-only-grievance-signing-key';

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Constant-time string equality (same length required). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Issue the dwell-time token stamped into the form: `<issued-at>.<hmac>`,
 * where the HMAC covers the timestamp AND the source's hashed address. The
 * page is rendered on demand, so every render carries a fresh, server-signed
 * timestamp — the timing check cannot be forged by a client-set field — and
 * binding it to the source means a token harvested once cannot be replayed
 * from elsewhere. (A visitor whose address changes mid-form gets the form
 * re-rendered with their text intact and a fresh token.) Without a configured
 * key (lenient mode) a fixed dev key keeps the mechanism structurally intact;
 * it is simply not secret, which is why strict mode refuses it.
 */
export async function issueToken(
  secret: string | undefined,
  ipHash: string | null,
  now = Date.now(),
): Promise<string> {
  const ts = String(now);
  return `${ts}.${toBase64Url(await hmac(secret || DEV_KEY, `${ts}.${ipHash ?? ''}`))}`;
}

/** Verify a token: intact signature for this source, and within the maximum age. */
export async function verifyToken(
  secret: string | undefined,
  token: string | undefined,
  ipHash: string | null,
  now = Date.now(),
): Promise<{ ok: boolean; issuedAt?: number }> {
  if (!token) return { ok: false };
  const dot = token.indexOf('.');
  if (dot <= 0) return { ok: false };
  const ts = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d{10,16}$/.test(ts)) return { ok: false };
  const expected = toBase64Url(await hmac(secret || DEV_KEY, `${ts}.${ipHash ?? ''}`));
  if (!safeEqual(sig, expected)) return { ok: false };
  const issuedAt = Number(ts);
  if (issuedAt > now + 60_000 || now - issuedAt > MAX_TOKEN_AGE_MS) return { ok: false };
  return { ok: true, issuedAt };
}

/** HMAC-keyed hash of a source IP — correlates abuse, stores no raw address. */
export async function hashIp(secret: string | undefined, ip: string): Promise<string | null> {
  if (!ip) return null;
  return toHex(await hmac(secret || DEV_KEY, `ip:${ip}`));
}

// ───────────────────────────── Turnstile ──────────────────────────────────

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify the invisible widget's token. `missing` when the client sent none (no
 * JavaScript, or a script that never ran) — a quarantine signal, not a
 * rejection. Without a configured secret: `skipped` in lenient mode (`astro
 * dev` and the local e2e run), `error` in strict mode so a misconfigured
 * deployment quarantines every submission.
 */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
  secret: string | undefined,
  strict = false,
): Promise<TurnstileStatus> {
  if (!secret) return strict ? 'error' : 'skipped';
  if (!token) return 'missing';
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true ? 'passed' : 'failed';
  } catch (err) {
    // An unreachable verify endpoint is an outage, not a bot. It must stay
    // distinguishable in the logs — and it quarantines rather than rejects.
    console.error('[grievances] turnstile verify ERROR (outage, not a failed challenge):', err);
    return 'error';
  }
}

// ───────────────────────────── content heuristics ─────────────────────────

/** Conservative spam vocabulary. False negatives are cheaper than false positives here. */
const BLOCKLIST =
  /\b(casino|viagra|cialis|forex signals?|crypto (?:signals?|investment)|seo (?:services?|packages?)|backlinks?|guest post(?:ing)?|payday loans?|escorts?)\b/i;

/**
 * Content signals on the free text. Link-heavy bodies, blocklisted vocabulary,
 * and text whose letters are mostly non-Latin (the site and its audience are
 * English; a Cyrillic or CJK body is the classic comment-spam shape) are
 * quarantined for human review — never rejected, since a genuine concern in
 * another script is exactly the kind of false positive the brief forbids.
 */
export function contentSignals(text: string): Signal[] {
  const signals: Signal[] = [];
  const links = text.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links >= 3) signals.push('link_heavy');
  if (BLOCKLIST.test(text)) signals.push('blocklist');
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  if (letters >= 40 && latin / letters < 0.5) signals.push('unexpected_script');
  return signals;
}

/** Fold every signal into the intake decision. Any signal quarantines. */
export function triage(
  turnstile: TurnstileStatus,
  dwellMs: number | null,
  content: Signal[],
): { outcome: Outcome; reasons: Signal[] } {
  const reasons: Signal[] = [...content];
  if (turnstile === 'missing') reasons.push('no_turnstile');
  if (turnstile === 'failed') reasons.push('turnstile_failed');
  if (turnstile === 'error') reasons.push('turnstile_error');
  if (dwellMs !== null && dwellMs < MIN_DWELL_MS) reasons.push('too_fast');
  return { outcome: reasons.length ? 'quarantined' : 'accepted', reasons };
}

// ───────────────────────────── throttle (progressive backoff) ─────────────

export interface ThrottleState {
  count: number;
  window_start: number; // epoch seconds
  blocked_until: number; // epoch seconds, 0 = none
  strikes: number;
}

export const THROTTLE = {
  windowSec: 3600,
  /** Valid submissions allowed per source per window. The WAF handles bursts;
   *  this is the sustained layer, sized so a shared office or carrier NAT is
   *  not exhausted by a couple of genuine concerns. */
  limit: 5,
  /** Cooldown per successive strike: 15 min → 1 h → 6 h → 24 h. */
  backoffSec: [900, 3600, 21_600, 86_400],
  /** Strikes decay once a source has been quiet this long after its block. */
  forgiveAfterSec: 86_400,
} as const;

/**
 * Pure throttle step. Counts valid submissions in a rolling hour; exceeding
 * the limit blocks for a cooldown that escalates with each strike and decays
 * after a quiet day — progressive backoff rather than a hard lockout. When a
 * cooldown has expired the window starts fresh, so "try again in 15 minutes"
 * is true: the next attempt is allowed, and only a further burst escalates.
 */
export function throttleDecision(
  state: ThrottleState | null,
  nowSec: number,
): { allowed: boolean; retryAfterSec: number; next: ThrottleState } {
  if (state && state.blocked_until > nowSec) {
    return { allowed: false, retryAfterSec: state.blocked_until - nowSec, next: state };
  }
  let strikes = state?.strikes ?? 0;
  if (state?.blocked_until && nowSec - state.blocked_until > THROTTLE.forgiveAfterSec) strikes = 0;
  // Fresh window: no state, the hour has rolled, or a cooldown has just ended.
  const fresh =
    !state ||
    nowSec - state.window_start >= THROTTLE.windowSec ||
    (state.blocked_until > 0 && nowSec >= state.blocked_until);
  const count = (fresh ? 0 : state.count) + 1;
  const window_start = fresh ? nowSec : state.window_start;
  if (count > THROTTLE.limit) {
    strikes += 1;
    const cooldown = THROTTLE.backoffSec[Math.min(strikes, THROTTLE.backoffSec.length) - 1];
    return {
      allowed: false,
      retryAfterSec: cooldown,
      next: { count, window_start, blocked_until: nowSec + cooldown, strikes },
    };
  }
  return {
    allowed: true,
    retryAfterSec: 0,
    next: { count, window_start, blocked_until: 0, strikes },
  };
}

/**
 * Read-then-upsert; not atomic across concurrent POSTs from one source (each
 * could read the same state and pass). The WAF's 3/10 s burst rule bounds the
 * overshoot, which is why this layer does not pay for a transaction.
 */
async function checkThrottle(
  db: D1Like | undefined,
  key: string | null,
  nowSec: number,
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  if (!db || !key) return { allowed: true, retryAfterSec: 0 };
  const state = await db
    .prepare(
      'SELECT count, window_start, blocked_until, strikes FROM grievance_throttle WHERE key = ?',
    )
    .bind(key)
    .first<ThrottleState>();
  const { allowed, retryAfterSec, next } = throttleDecision(state, nowSec);
  await db
    .prepare(
      `INSERT INTO grievance_throttle (key, count, window_start, blocked_until, strikes, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_start = excluded.window_start,
         blocked_until = excluded.blocked_until, strikes = excluded.strikes, updated_at = excluded.updated_at`,
    )
    .bind(key, next.count, next.window_start, next.blocked_until, next.strikes)
    .run();
  return { allowed, retryAfterSec };
}

// ───────────────────────────── reference numbers ──────────────────────────

/** Crockford base32: no I, L, O, U — unambiguous when read aloud or typed. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const REF_PATTERN = /^GRV-\d{4}-[0-9A-HJKMNP-TV-Z]{5}$/;

/** `GRV-YYYY-XXXXX` — random, not sequential, so the id leaks no volume. */
export function newReference(
  now = new Date(),
  random: (n: number) => Uint8Array = randomBytes,
): string {
  const bytes = random(5);
  let tail = '';
  for (const b of bytes) tail += ALPHABET[b % 32];
  return `GRV-${now.getUTCFullYear()}-${tail}`;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

// ───────────────────────────── persistence ────────────────────────────────

async function logEvent(
  db: D1Like | undefined,
  kind: string,
  reason: string | null,
  ref: string | null,
  ipHash: string | null,
  detail: string | null = null,
): Promise<void> {
  if (!db) {
    console.log('[grievances] (no D1 binding) event:', kind, reason, ref ?? '');
    return;
  }
  await db
    .prepare(
      'INSERT INTO grievance_events (kind, reason, ref, ip_hash, detail) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(kind, reason, ref, ipHash, detail)
    .run();
}

async function insertGrievance(
  db: D1Like,
  r: GrievanceRecord,
  ipHash: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO grievances (ref, received_at, outcome, reasons, stakeholder, category, anonymous,
         name, email, involves_owner, description, desired_outcome, ip_hash, turnstile, dwell_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      r.ref,
      r.receivedAt,
      r.outcome,
      JSON.stringify(r.reasons),
      r.stakeholder,
      r.category,
      r.contact_mode === 'anonymous' ? 1 : 0,
      r.name || null,
      r.email || null,
      r.involves_owner ? 1 : 0,
      r.description,
      r.desired_outcome || null,
      ipHash,
      r.turnstile,
      r.dwellMs,
    )
    .run();
}

/** D1 surfaces SQLite's constraint failures by message; only these are retried. */
const isUniqueViolation = (err: unknown) => /UNIQUE constraint failed/i.test(String(err));

// ───────────────────────────── Notion mirror ──────────────────────────────

const NOTION_VERSION = '2025-09-03';
const NOTION_TEXT_LIMIT = 1_900; // API cap is 2000 per rich_text item

type NotionRichText = { type: 'text'; text: { content: string } }[];

const richText = (s: string): NotionRichText => [{ type: 'text', text: { content: s } }];

/** Split long text into paragraph blocks that fit Notion's rich-text cap. */
export function paragraphBlocks(text: string): unknown[] {
  const chunks: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    for (let i = 0; i < para.length; i += NOTION_TEXT_LIMIT) {
      chunks.push(para.slice(i, i + NOTION_TEXT_LIMIT));
    }
  }
  return chunks
    .filter((c) => c.trim().length)
    .map((c) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: richText(c) },
    }));
}

const heading = (text: string) => ({
  object: 'block',
  type: 'heading_2',
  heading_2: { rich_text: richText(text) },
});

/**
 * The page-create payload for the Notion log (pure, so it is testable).
 * Property names match the "Stakeholder Grievance Log" database exactly.
 * The Owner is the grievance owner — or the backup when the concern involves
 * the owner, so the owner's name is never attached to a concern about them.
 */
export function buildNotionPage(
  r: GrievanceRecord,
  opts: { dataSourceId: string; ownerId?: string; backupId?: string },
): Record<string, unknown> {
  const assignee = r.involves_owner ? opts.backupId : opts.ownerId;
  const properties: Record<string, unknown> = {
    'Reference ID': { title: richText(r.ref) },
    'Date received': { date: { start: r.receivedAt } },
    'Stakeholder group': { select: { name: STAKEHOLDERS[r.stakeholder] } },
    Category: { select: { name: CATEGORIES[r.category] } },
    Status: { select: { name: r.outcome === 'quarantined' ? 'Quarantined' : 'Received' } },
    Summary: { rich_text: richText(r.description.slice(0, 200)) },
    Anonymous: { checkbox: r.contact_mode === 'anonymous' },
    'Involves grievance owner': { checkbox: r.involves_owner },
    'Quarantine reasons': { multi_select: r.reasons.map((name) => ({ name })) },
    Source: { select: { name: 'Website' } },
  };
  if (r.name) properties['Contact name'] = { rich_text: richText(r.name) };
  if (r.email) properties['Contact email'] = { email: r.email };
  if (assignee) properties.Owner = { people: [{ object: 'user', id: assignee }] };

  const children: unknown[] = [heading('Description'), ...paragraphBlocks(r.description)];
  if (r.desired_outcome) {
    children.push(heading('Desired outcome'), ...paragraphBlocks(r.desired_outcome));
  }
  children.push(
    heading('Intake'),
    ...paragraphBlocks(
      [
        `Outcome: ${r.outcome}${r.reasons.length ? ` (${r.reasons.join(', ')})` : ''}`,
        `Turnstile: ${r.turnstile}`,
        `Dwell: ${r.dwellMs === null ? 'unknown' : `${Math.round(r.dwellMs / 1000)} s`}`,
      ].join('\n'),
    ),
  );

  return {
    parent: { type: 'data_source_id', data_source_id: opts.dataSourceId },
    properties,
    children,
  };
}

async function mirrorToNotion(env: GrievanceEnv, r: GrievanceRecord): Promise<string | null> {
  if (!env.WORKER_NOTION_TOKEN || !env.NOTION_GRIEVANCE_DATA_SOURCE_ID) return null;
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WORKER_NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      buildNotionPage(r, {
        dataSourceId: env.NOTION_GRIEVANCE_DATA_SOURCE_ID,
        ownerId: env.NOTION_GRIEVANCE_OWNER_ID,
        backupId: env.NOTION_GRIEVANCE_BACKUP_ID,
      }),
    ),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Notion responded ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

/** Notion page URL from a page id (dashes stripped, as Notion links them). */
export const notionPageUrl = (id: string) => `https://www.notion.so/${id.replace(/-/g, '')}`;

// ───────────────────────────── email ──────────────────────────────────────

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const DEFAULT_FROM = 'Quarry Concerns <concerns@quarry.team>';
export const DEFAULT_NOTIFY_TO = 'concerns@quarry.team';
export const POLICY_PATH = '/policies/grievances';

/** Acknowledgment to the submitter: the reference and what happens next. Never echoes their text. */
export function buildAckEmail(r: GrievanceRecord, origin: string) {
  const policy = `${origin}${POLICY_PATH}`;
  const subject = `Your concern has been received (${r.ref})`;
  const text = [
    `Thank you for raising a concern with Quarry.`,
    ``,
    `Your reference number is ${r.ref}. Please keep it and quote it in any follow-up.`,
    ``,
    `What happens next: we acknowledge receipt within five business days (this email counts), and we aim to resolve the concern or give you a substantive update within 30 days. If it takes longer, you will receive a written status update every 30 days until it is closed.`,
    ``,
    `You can add information at any time by replying to this email. No one will face retaliation for raising a concern in good faith.`,
    ``,
    `How this process works: ${policy}`,
  ].join('\n');
  const html = `<p>Thank you for raising a concern with Quarry.</p>
<p>Your reference number is <strong>${esc(r.ref)}</strong>. Please keep it and quote it in any follow-up.</p>
<p><strong>What happens next.</strong> We acknowledge receipt within five business days (this email counts), and we aim to resolve the concern or give you a substantive update within 30 days. If it takes longer, you will receive a written status update every 30 days until it is closed.</p>
<p>You can add information at any time by replying to this email. No one will face retaliation for raising a concern in good faith.</p>
<p><a href="${esc(policy)}">How this process works</a></p>`;
  return { subject, text, html };
}

/**
 * Notice to the grievance owner (or the backup only, when the concern involves
 * the owner). Carries the metadata and the log link — not the description,
 * which stays in the log where access is controlled.
 */
export function buildNotifyEmail(r: GrievanceRecord, notionId: string | null) {
  const flag = r.outcome === 'quarantined' ? ' [quarantined]' : '';
  const subject = `New grievance ${r.ref}: ${CATEGORIES[r.category]}${flag}`;
  const rows: [string, string][] = [
    ['Reference', r.ref],
    ['Received', r.receivedAt],
    ['Stakeholder', STAKEHOLDERS[r.stakeholder]],
    ['Category', CATEGORIES[r.category]],
    ['Contact', r.contact_mode === 'anonymous' ? 'Anonymous' : 'Provided'],
    ['Involves grievance owner', r.involves_owner ? 'Yes: sent to the backup only' : 'No'],
    ['Intake', r.outcome + (r.reasons.length ? ` (${r.reasons.join(', ')})` : '')],
    ['Log', notionId ? notionPageUrl(notionId) : 'Notion mirror failed; see D1 (grievances table)'],
  ];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const html =
    rows.map(([k, v]) => `<p><strong>${esc(k)}:</strong> ${esc(v)}</p>`).join('\n') +
    `\n<p>The description is in the log. Acknowledge within 5 business days.</p>`;
  return { subject, text, html };
}

async function sendResend(
  apiKey: string,
  msg: {
    from: string;
    to: string[];
    reply_to?: string;
    subject: string;
    text: string;
    html: string;
  },
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(msg),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend responded ${res.status}: ${body.slice(0, 500)}`);
  }
}

/**
 * Recipients for the internal notice: the owner's inbox, or the backup's
 * alone. A concern that involves the owner is NEVER routed to the owner's
 * inbox by fallback — the shared alias delivers to the owner too — so with no
 * backup inbox configured the answer is nobody, and the caller logs that.
 */
export function notifyRecipients(env: GrievanceEnv, involvesOwner: boolean): string[] {
  const raw = involvesOwner
    ? env.WORKER_GRIEVANCE_NOTIFY_BACKUP_TO || ''
    : env.WORKER_GRIEVANCE_NOTIFY_TO || DEFAULT_NOTIFY_TO;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ───────────────────────────── the handler ────────────────────────────────

export interface HandleContext {
  /** Source IP (cf-connecting-ip); hashed before storage, never stored raw. */
  ip: string;
  /** Request origin, for links in the acknowledgment. */
  origin: string;
  /** Production posture: refuse to run without the signing key; a missing
   *  Turnstile secret quarantines instead of skipping. */
  strict?: boolean;
  now?: number;
}

/**
 * Guard → honeypot → token → validate → throttle → Turnstile → heuristics →
 * persist → mirror → notify. Returns what the page should render or where it
 * should redirect. Never throws for a submitter's mistake; a failing
 * dependency (Notion, Resend) is logged and the submission still stands in D1.
 * A failing D1 does throw — the page catches it and keeps the visitor's text.
 */
export async function handleGrievance(
  values: FormValues,
  env: GrievanceEnv,
  ctx: HandleContext,
): Promise<GrievanceResult> {
  const now = ctx.now ?? Date.now();
  const strict = ctx.strict ?? false;

  // 0. Strict mode never runs on the public dev key.
  if (strict && !env.WORKER_GRIEVANCE_SIGNING_KEY) {
    console.error(
      '[grievances] WORKER_GRIEVANCE_SIGNING_KEY is not set; refusing to accept submissions',
    );
    return { kind: 'unavailable', reason: 'offline' };
  }
  const ipHash = await hashIp(env.WORKER_GRIEVANCE_SIGNING_KEY, ctx.ip);

  // 1. Honeypot — hidden from humans and assistive tech; a value means a bot.
  //    Each hit spends the source's hourly budget, so a run of them blocks the
  //    source with the usual backoff, while a single hit (autofill can cause
  //    one) costs a human nothing beyond the retry.
  if ((values[HONEYPOT_FIELD] ?? '').length > 0) {
    const spent = await checkThrottle(env.DB, ipHash, Math.floor(now / 1000));
    await logEvent(
      env.DB,
      'rejected',
      'honeypot',
      null,
      ipHash,
      spent.allowed ? null : `blocked ${spent.retryAfterSec}s`,
    );
    return { kind: 'rejected', reason: 'honeypot' };
  }

  // 2. Signed dwell-time token, bound to this source — proves a real render
  //    preceded the POST from the same address.
  const token = await verifyToken(
    env.WORKER_GRIEVANCE_SIGNING_KEY,
    values[TOKEN_FIELD],
    ipHash,
    now,
  );
  if (!token.ok) {
    await logEvent(env.DB, 'rejected', 'bad_token', null, ipHash);
    return { kind: 'rejected', reason: 'bad_token' };
  }

  // 3. Validation — a person's mistake, not a signal; re-render with messages.
  //    It runs before the throttle so mistakes never spend the hourly budget.
  const parsed = validate(values);
  if (!parsed.ok) return { kind: 'invalid', errors: parsed.errors };
  const input = parsed.data;

  // 4. Sustained-rate throttle on valid submissions (the WAF handles bursts).
  const throttle = await checkThrottle(env.DB, ipHash, Math.floor(now / 1000));
  if (!throttle.allowed) {
    await logEvent(
      env.DB,
      'rejected',
      'rate_limited',
      null,
      ipHash,
      String(throttle.retryAfterSec),
    );
    return { kind: 'rejected', reason: 'rate_limited', retryAfterSec: throttle.retryAfterSec };
  }

  // 5–6. Signals → outcome.
  const turnstile = await verifyTurnstile(
    values[TURNSTILE_FIELD],
    ctx.ip,
    env.WORKER_TURNSTILE_GRIEVANCES_SECRET,
    strict,
  );
  const dwellMs = token.issuedAt === undefined ? null : now - token.issuedAt;
  const { outcome, reasons } = triage(
    turnstile,
    dwellMs,
    contentSignals(`${input.description}\n${input.desired_outcome}`),
  );

  const record: GrievanceRecord = {
    ...input,
    ref: newReference(new Date(now)),
    receivedAt: new Date(now).toISOString(),
    outcome,
    reasons,
    turnstile,
    dwellMs,
  };
  // An anonymous submission carries no stable identifier on its row: the
  // throttle table already holds the hash for abuse correlation.
  const rowIpHash = input.contact_mode === 'anonymous' ? null : ipHash;

  // 7. Persist — the one step that must succeed. Retry once on a ref collision
  //    (and only on that; any other D1 failure propagates to the page).
  if (env.DB) {
    try {
      await insertGrievance(env.DB, record, rowIpHash);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      record.ref = newReference(new Date(now));
      await insertGrievance(env.DB, record, rowIpHash);
    }
  } else {
    console.log('[grievances] (no D1 binding) received:', record.ref, outcome, reasons);
  }
  await logEvent(env.DB, outcome, reasons.join(',') || null, record.ref, rowIpHash);

  // 8. Mirror to the Notion log — best effort; failure is logged, not fatal.
  let notionId: string | null = null;
  try {
    notionId = await mirrorToNotion(env, record);
    if (notionId && env.DB) {
      await env.DB.prepare('UPDATE grievances SET notion_page_id = ? WHERE ref = ?')
        .bind(notionId, record.ref)
        .run();
    }
  } catch (err) {
    console.error('[grievances] Notion mirror failed:', err);
    await logEvent(env.DB, 'notion_failed', String(err).slice(0, 500), record.ref, rowIpHash);
  }

  // 9. Notify and acknowledge — best effort. The routing promise comes first:
  //    a concern that involves the owner goes to the backup's inbox or to no
  //    inbox at all; and the acknowledgment (which says "this email counts")
  //    goes only for accepted submissions, never for a quarantined one whose
  //    address nobody has verified.
  const recipients = notifyRecipients(env, record.involves_owner);
  if (record.involves_owner && recipients.length === 0) {
    await logEvent(env.DB, 'notify_skipped', 'no_backup_inbox', record.ref, rowIpHash);
  }
  const canAck = record.email && record.outcome === 'accepted' && recipients.length > 0;
  if (record.email && !canAck) {
    await logEvent(
      env.DB,
      'ack_deferred',
      record.outcome === 'quarantined' ? 'quarantined' : 'no_backup_inbox',
      record.ref,
      rowIpHash,
    );
  }
  if (env.WORKER_RESEND_API_KEY) {
    const from = env.GRIEVANCE_FROM || DEFAULT_FROM;
    const tasks: Promise<unknown>[] = [];
    if (recipients.length > 0) {
      const notify = buildNotifyEmail(record, notionId);
      tasks.push(
        sendResend(env.WORKER_RESEND_API_KEY, {
          from,
          to: recipients,
          subject: notify.subject,
          text: notify.text,
          html: notify.html,
        }),
      );
    }
    if (canAck) {
      const ack = buildAckEmail(record, ctx.origin);
      tasks.push(
        sendResend(env.WORKER_RESEND_API_KEY, {
          from,
          to: [record.email],
          reply_to: recipients[0],
          subject: ack.subject,
          text: ack.text,
          html: ack.html,
        }).then(async () => {
          if (env.DB) {
            await env.DB.prepare('UPDATE grievances SET ack_sent = 1 WHERE ref = ?')
              .bind(record.ref)
              .run();
          }
        }),
      );
    }
    for (const r of await Promise.allSettled(tasks)) {
      if (r.status === 'rejected') {
        console.error('[grievances] email failed:', r.reason);
        await logEvent(
          env.DB,
          'email_failed',
          String(r.reason).slice(0, 500),
          record.ref,
          rowIpHash,
        );
      }
    }
  }

  return { kind: 'received', ref: record.ref, outcome };
}

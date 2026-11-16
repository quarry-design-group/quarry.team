import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  HONEYPOT_FIELD,
  MIN_DWELL_MS,
  REF_PATTERN,
  THROTTLE,
  TOKEN_FIELD,
  buildAckEmail,
  buildNotifyEmail,
  buildNotionPage,
  contentSignals,
  handleGrievance,
  hashIp,
  issueToken,
  newReference,
  notifyRecipients,
  parseForm,
  throttleDecision,
  triage,
  validate,
  verifyToken,
  verifyTurnstile,
  type D1Like,
  type GrievanceRecord,
  type ThrottleState,
} from './grievances';

/**
 * In-memory D1 stub that understands just the statements the intake issues:
 * the throttle read/upsert, the grievance insert (UNIQUE on ref), the event
 * log, and the two post-hoc updates. Enough to drive the whole pipeline.
 * `failWith` makes every statement throw, to model an outage.
 */
function fakeDb(opts: { failWith?: Error } = {}) {
  const grievances: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const throttle = new Map<string, ThrottleState>();
  const db: D1Like = {
    prepare: (query: string) => ({
      bind: (...v: unknown[]) => ({
        run: async () => {
          if (opts.failWith) throw opts.failWith;
          if (query.includes('INSERT INTO grievance_throttle')) {
            const [key, count, window_start, blocked_until, strikes] = v as [
              string,
              number,
              number,
              number,
              number,
            ];
            throttle.set(key, { count, window_start, blocked_until, strikes });
          } else if (query.includes('INSERT INTO grievance_events')) {
            const [kind, reason, ref, ip_hash, detail] = v;
            events.push({ kind, reason, ref, ip_hash, detail });
          } else if (query.includes('INSERT INTO grievances')) {
            const [ref] = v as [string];
            if (grievances.some((g) => g.ref === ref)) throw new Error('UNIQUE constraint failed');
            const [
              ,
              received_at,
              outcome,
              reasons,
              stakeholder,
              category,
              anonymous,
              name,
              email,
              ,
              ,
              ,
              ip_hash,
            ] = v;
            grievances.push({
              ref,
              received_at,
              outcome,
              reasons,
              stakeholder,
              category,
              anonymous,
              name,
              email,
              ip_hash,
            });
          } else if (query.includes('SET notion_page_id')) {
            const [id, ref] = v;
            const g = grievances.find((x) => x.ref === ref);
            if (g) g.notion_page_id = id;
          } else if (query.includes('SET ack_sent')) {
            const [ref] = v;
            const g = grievances.find((x) => x.ref === ref);
            if (g) g.ack_sent = 1;
          }
          return {};
        },
        first: async <T>() => {
          if (opts.failWith) throw opts.failWith;
          if (query.startsWith('SELECT count')) return (throttle.get(v[0] as string) ?? null) as T;
          return null;
        },
      }),
    }),
  };
  return { db, grievances, events, throttle };
}

const good = {
  contact_mode: 'contact',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  stakeholder: 'client',
  category: 'client_project',
  description: 'The handoff left us without the documentation we were promised in the SOW.',
  desired_outcome: 'The missing runbooks, delivered.',
  acknowledge: 'on',
};

const now = 1_760_000_000_000;
const IP = '203.0.113.7';
const ctx = { ip: IP, origin: 'https://quarry.team', now };

/** A token for this source, minted long enough ago to clear the dwell check unless `agoMs` says otherwise. */
const tokenFor = async (secret: string | undefined, ip = IP, agoMs = MIN_DWELL_MS + 1000) =>
  issueToken(secret, await hashIp(secret, ip), now - agoMs);

describe('validate', () => {
  it('accepts a complete contact submission and types it', () => {
    const r = validate({ ...good, involves_owner: 'on' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.involves_owner).toBe(true);
      expect(r.data.stakeholder).toBe('client');
      expect(r.data.email).toBe('ada@example.com');
    }
  });

  it('drops contact details when the submitter chose anonymity', () => {
    const r = validate({ ...good, contact_mode: 'anonymous' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe('');
      expect(r.data.email).toBe('');
    }
  });

  it('requires an email only in contact mode, and a plausible one', () => {
    const missing = validate({ ...good, email: '' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.email).toMatch(/enter an email/i);
    const bad = validate({ ...good, email: 'not-an-email' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.email).toMatch(/doesn’t look right/);
    expect(validate({ ...good, contact_mode: 'anonymous', email: '' }).ok).toBe(true);
  });

  it('returns one plain-language message per failing field', () => {
    const r = validate({ description: 'too short', email: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.contact_mode).toBeTruthy();
      expect(r.errors.stakeholder).toBeTruthy();
      expect(r.errors.category).toBeTruthy();
      expect(r.errors.description).toMatch(/at least 20/);
      expect(r.errors.acknowledge).toBeTruthy();
    }
  });
});

describe('dwell-time token', () => {
  it('round-trips for the same source and reports when it was issued', async () => {
    const h = await hashIp('k', IP);
    const t = await issueToken('k', h, now - 5000);
    const v = await verifyToken('k', t, h, now);
    expect(v.ok).toBe(true);
    expect(v.issuedAt).toBe(now - 5000);
  });

  it('is bound to the source: a token harvested from one address fails from another', async () => {
    const here = await hashIp('k', IP);
    const elsewhere = await hashIp('k', '198.51.100.9');
    const t = await issueToken('k', here, now - 5000);
    expect((await verifyToken('k', t, elsewhere, now)).ok).toBe(false);
    expect((await verifyToken('k', t, null, now)).ok).toBe(false);
  });

  it('rejects tampering, a foreign key, garbage, and stale tokens', async () => {
    const h = await hashIp('k', IP);
    const t = await issueToken('k', h, now - 5000);
    expect((await verifyToken('k', t.replace(/\d(?=\.)/, '9'), h, now)).ok).toBe(false);
    expect((await verifyToken('other', t, h, now)).ok).toBe(false);
    expect((await verifyToken('k', 'nope', h, now)).ok).toBe(false);
    expect((await verifyToken('k', undefined, h, now)).ok).toBe(false);
    const old = await issueToken('k', h, now - 25 * 3600 * 1000);
    expect((await verifyToken('k', old, h, now)).ok).toBe(false);
  });
});

describe('Turnstile posture', () => {
  it('skips without a secret in lenient mode and quarantines (error) in strict mode', async () => {
    expect(await verifyTurnstile(undefined, IP, undefined)).toBe('skipped');
    expect(await verifyTurnstile(undefined, IP, undefined, true)).toBe('error');
    expect(await verifyTurnstile(undefined, IP, 'secret')).toBe('missing');
  });
});

describe('content signals and triage', () => {
  it('flags link-heavy, blocklisted, and mostly non-Latin text; passes plain English', () => {
    expect(contentSignals('see https://a.example https://b.example www.c.example')).toContain(
      'link_heavy',
    );
    expect(contentSignals('Best casino bonuses for you')).toContain('blocklist');
    expect(
      contentSignals('Это длинное сообщение написано полностью кириллицей для теста'),
    ).toContain('unexpected_script');
    expect(contentSignals(good.description)).toEqual([]);
  });

  it('accepts a clean, human-paced submission and quarantines any signal', () => {
    expect(triage('skipped', 12_000, [])).toEqual({ outcome: 'accepted', reasons: [] });
    expect(triage('passed', 12_000, [])).toEqual({ outcome: 'accepted', reasons: [] });
    expect(triage('missing', 12_000, []).reasons).toEqual(['no_turnstile']);
    expect(triage('failed', 12_000, []).reasons).toEqual(['turnstile_failed']);
    expect(triage('error', 12_000, []).reasons).toEqual(['turnstile_error']);
    expect(triage('passed', 800, []).reasons).toEqual(['too_fast']);
    expect(triage('passed', 12_000, ['blocklist']).outcome).toBe('quarantined');
  });
});

describe('throttle (progressive backoff)', () => {
  const burst = (state: ThrottleState | null, from: number) => {
    let s = state;
    for (let i = 0; i < THROTTLE.limit; i++) {
      const d = throttleDecision(s, from + i);
      expect(d.allowed, `attempt ${i + 1} of a fresh window is allowed`).toBe(true);
      s = d.next;
    }
    return s!;
  };

  it('allows the limit per hour, then blocks with the first cooldown', () => {
    const t0 = 1_000_000;
    const state = burst(null, t0);
    const blocked = throttleDecision(state, t0 + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(THROTTLE.backoffSec[0]);
    expect(blocked.next.strikes).toBe(1);
    // Still blocked inside the cooldown, with the remaining time reported.
    const during = throttleDecision(blocked.next, t0 + 100);
    expect(during.allowed).toBe(false);
    expect(during.retryAfterSec).toBe(THROTTLE.backoffSec[0] - 90);
  });

  it('honours "try again in 15 minutes": the first attempt after the cooldown is allowed', () => {
    const t0 = 1_000_000;
    const blocked = throttleDecision(burst(null, t0), t0 + 10);
    const after = throttleDecision(blocked.next, blocked.next.blocked_until + 1);
    expect(after.allowed).toBe(true);
    expect(after.next.count).toBe(1); // a fresh window, not the stale count
    expect(after.next.strikes).toBe(1); // the strike is remembered for escalation
  });

  it('escalates only on a genuine second burst after the cooldown', () => {
    const t0 = 1_000_000;
    const blocked = throttleDecision(burst(null, t0), t0 + 10);
    const t1 = blocked.next.blocked_until + 1;
    const state = burst(blocked.next, t1); // limit attempts allowed again
    const second = throttleDecision(state, t1 + 10);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSec).toBe(THROTTLE.backoffSec[1]);
    expect(second.next.strikes).toBe(2);
  });

  it('forgives strikes after a quiet day', () => {
    const state: ThrottleState = { count: 5, window_start: 0, blocked_until: 1000, strikes: 3 };
    const d = throttleDecision(state, 1000 + THROTTLE.forgiveAfterSec + 1);
    expect(d.allowed).toBe(true);
    expect(d.next.strikes).toBe(0);
    expect(d.next.count).toBe(1);
  });
});

describe('reference numbers', () => {
  it('match the public pattern and use the injected randomness', () => {
    const ref = newReference(
      new Date('2026-09-05T00:00:00Z'),
      () => new Uint8Array([0, 1, 2, 3, 31]),
    );
    expect(ref).toBe('GRV-2026-0123Z');
    expect(REF_PATTERN.test(ref)).toBe(true);
    expect(REF_PATTERN.test(newReference())).toBe(true);
  });
});

const record: GrievanceRecord = {
  contact_mode: 'contact',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  stakeholder: 'client',
  category: 'client_project',
  involves_owner: false,
  description: good.description,
  desired_outcome: good.desired_outcome,
  ref: 'GRV-2026-ABCDE',
  receivedAt: '2026-09-05T12:00:00.000Z',
  outcome: 'accepted',
  reasons: [],
  turnstile: 'passed',
  dwellMs: 15_000,
};

describe('Notion payload', () => {
  const opts = { dataSourceId: 'ds', ownerId: 'owner-id', backupId: 'backup-id' };

  it('maps the record onto the log schema and assigns the owner', () => {
    const p = buildNotionPage(record, opts) as {
      parent: Record<string, string>;
      properties: Record<string, Record<string, unknown>>;
      children: { type: string }[];
    };
    expect(p.parent).toEqual({ type: 'data_source_id', data_source_id: 'ds' });
    expect(p.properties['Reference ID']).toEqual({
      title: [{ type: 'text', text: { content: 'GRV-2026-ABCDE' } }],
    });
    expect(p.properties['Stakeholder group']).toEqual({ select: { name: 'Client' } });
    expect(p.properties.Category).toEqual({ select: { name: 'A client project' } });
    expect(p.properties.Status).toEqual({ select: { name: 'Received' } });
    expect(p.properties['Contact email']).toEqual({ email: 'ada@example.com' });
    expect(p.properties.Owner).toEqual({ people: [{ object: 'user', id: 'owner-id' }] });
    expect(p.children[0].type).toBe('heading_2');
  });

  it('routes a concern about the owner to the backup and marks quarantine', () => {
    const p = buildNotionPage(
      { ...record, involves_owner: true, outcome: 'quarantined', reasons: ['no_turnstile'] },
      opts,
    ) as { properties: Record<string, Record<string, unknown>> };
    expect(p.properties.Owner).toEqual({ people: [{ object: 'user', id: 'backup-id' }] });
    expect(p.properties.Status).toEqual({ select: { name: 'Quarantined' } });
    expect(p.properties['Quarantine reasons']).toEqual({
      multi_select: [{ name: 'no_turnstile' }],
    });
  });

  it('omits contact properties for an anonymous record', () => {
    const p = buildNotionPage(
      { ...record, contact_mode: 'anonymous', name: '', email: '' },
      opts,
    ) as {
      properties: Record<string, unknown>;
    };
    expect(p.properties['Contact email']).toBeUndefined();
    expect(p.properties['Contact name']).toBeUndefined();
    expect(p.properties.Anonymous).toEqual({ checkbox: true });
  });
});

describe('emails', () => {
  it('the acknowledgment carries the reference and never the description', () => {
    const m = buildAckEmail(record, 'https://quarry.team');
    expect(m.subject).toContain('GRV-2026-ABCDE');
    expect(m.text).toContain('https://quarry.team/policies/grievances');
    expect(m.text).not.toContain(good.description);
  });

  it('the notice flags quarantine and links the log, without the description', () => {
    const m = buildNotifyEmail(
      { ...record, outcome: 'quarantined', reasons: ['too_fast'] },
      'abc-def',
    );
    expect(m.subject).toContain('[quarantined]');
    expect(m.text).toContain('https://www.notion.so/abcdef');
    expect(m.text).toContain('too_fast');
    expect(m.text).not.toContain(good.description);
  });

  it('notices go to the owner inbox, or the backup alone, never to the owner by fallback', () => {
    expect(notifyRecipients({}, false)).toEqual(['concerns@quarry.team']);
    expect(notifyRecipients({ WORKER_GRIEVANCE_NOTIFY_TO: 'a@x.com, b@x.com' }, false)).toEqual([
      'a@x.com',
      'b@x.com',
    ]);
    expect(
      notifyRecipients(
        { WORKER_GRIEVANCE_NOTIFY_TO: 'a@x.com', WORKER_GRIEVANCE_NOTIFY_BACKUP_TO: 'b@x.com' },
        true,
      ),
    ).toEqual(['b@x.com']);
    // No backup inbox configured: nobody, rather than the shared alias the owner reads.
    expect(notifyRecipients({ WORKER_GRIEVANCE_NOTIFY_TO: 'a@x.com' }, true)).toEqual([]);
    expect(notifyRecipients({}, true)).toEqual([]);
  });
});

describe('handleGrievance', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects a filled honeypot and logs the reason', async () => {
    const { db, events, grievances } = fakeDb();
    const r = await handleGrievance(
      {
        ...good,
        [HONEYPOT_FIELD]: 'http://spam.example',
        [TOKEN_FIELD]: await tokenFor(undefined),
      },
      { DB: db },
      ctx,
    );
    expect(r).toEqual({ kind: 'rejected', reason: 'honeypot' });
    expect(grievances).toHaveLength(0);
    expect(events).toEqual([expect.objectContaining({ kind: 'rejected', reason: 'honeypot' })]);
  });

  it('honeypot hits spend the hourly budget: a run of them blocks the source, one does not', async () => {
    const { db, events, grievances } = fakeDb();
    const token = await tokenFor(undefined);
    const bot = () =>
      handleGrievance(
        { ...good, [HONEYPOT_FIELD]: 'http://spam.example', [TOKEN_FIELD]: token },
        { DB: db },
        ctx,
      );
    const human = () => handleGrievance({ ...good, [TOKEN_FIELD]: token }, { DB: db }, ctx);
    // One hit (autofill, say), then a clean retry: the retry goes through.
    expect(await bot()).toEqual({ kind: 'rejected', reason: 'honeypot' });
    expect((await human()).kind).toBe('received');
    // A run of hits exhausts the budget; the source is then blocked for everything.
    for (let i = 0; i < THROTTLE.limit; i++)
      expect(await bot()).toEqual({ kind: 'rejected', reason: 'honeypot' });
    expect(events.at(-1)).toMatchObject({
      kind: 'rejected',
      reason: 'honeypot',
      detail: `blocked ${THROTTLE.backoffSec[0]}s`,
    });
    expect(await human()).toEqual({
      kind: 'rejected',
      reason: 'rate_limited',
      retryAfterSec: THROTTLE.backoffSec[0],
    });
    expect(grievances).toHaveLength(1);
  });

  it('rejects a missing, forged, or foreign-source token', async () => {
    const { db, events } = fakeDb();
    expect(await handleGrievance({ ...good }, { DB: db }, ctx)).toEqual({
      kind: 'rejected',
      reason: 'bad_token',
    });
    expect(
      await handleGrievance({ ...good, [TOKEN_FIELD]: `${now - 9000}.forged` }, { DB: db }, ctx),
    ).toEqual({ kind: 'rejected', reason: 'bad_token' });
    // The patient bot: a token fetched from one address, replayed from another.
    expect(
      await handleGrievance(
        { ...good, [TOKEN_FIELD]: await tokenFor(undefined, '198.51.100.9') },
        { DB: db },
        ctx,
      ),
    ).toEqual({ kind: 'rejected', reason: 'bad_token' });
    expect(events.every((e) => e.reason === 'bad_token')).toBe(true);
  });

  it('returns field errors for a person’s mistake without logging or spending the throttle', async () => {
    const { db, events, throttle } = fakeDb();
    for (let i = 0; i < THROTTLE.limit + 2; i++) {
      const r = await handleGrievance(
        { ...good, description: 'short', [TOKEN_FIELD]: await tokenFor(undefined) },
        { DB: db },
        ctx,
      );
      expect(r.kind).toBe('invalid');
      if (r.kind === 'invalid') expect(r.errors.description).toMatch(/at least 20/);
    }
    expect(events).toHaveLength(0);
    expect(throttle.size).toBe(0);
    // The corrected submission still goes through.
    const ok = await handleGrievance(
      { ...good, [TOKEN_FIELD]: await tokenFor(undefined) },
      { DB: db },
      ctx,
    );
    expect(ok.kind).toBe('received');
  });

  it('accepts a clean, human-paced submission (no Turnstile secret → skipped) and persists it', async () => {
    const { db, grievances, events } = fakeDb();
    const r = await handleGrievance(
      { ...good, [TOKEN_FIELD]: await tokenFor(undefined) },
      { DB: db },
      ctx,
    );
    expect(r.kind).toBe('received');
    if (r.kind !== 'received') return;
    expect(r.outcome).toBe('accepted');
    expect(REF_PATTERN.test(r.ref)).toBe(true);
    expect(grievances).toHaveLength(1);
    expect(grievances[0]).toMatchObject({
      ref: r.ref,
      outcome: 'accepted',
      email: 'ada@example.com',
    });
    expect(grievances[0].ip_hash).toBeTruthy();
    expect(events).toEqual([expect.objectContaining({ kind: 'accepted', ref: r.ref })]);
  });

  it('stores no source hash on an anonymous row', async () => {
    const { db, grievances } = fakeDb();
    await handleGrievance(
      { ...good, contact_mode: 'anonymous', [TOKEN_FIELD]: await tokenFor(undefined) },
      { DB: db },
      ctx,
    );
    expect(grievances[0]).toMatchObject({ anonymous: 1, ip_hash: null });
  });

  it('quarantines a no-JS submission (secret configured, no Turnstile token) rather than rejecting it', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { db, grievances } = fakeDb();
    const r = await handleGrievance(
      { ...good, [TOKEN_FIELD]: await tokenFor(undefined) },
      { DB: db, WORKER_TURNSTILE_GRIEVANCES_SECRET: 'secret' },
      ctx,
    );
    expect(r.kind).toBe('received');
    if (r.kind === 'received') expect(r.outcome).toBe('quarantined');
    expect(grievances[0]).toMatchObject({ outcome: 'quarantined', reasons: '["no_turnstile"]' });
    expect(fetchSpy).not.toHaveBeenCalled(); // nothing to verify, nothing to notify
  });

  it('quarantines a submission completed faster than a human plausibly could', async () => {
    const { db, grievances } = fakeDb();
    const r = await handleGrievance(
      { ...good, [TOKEN_FIELD]: await tokenFor(undefined, IP, 900) },
      { DB: db },
      ctx,
    );
    expect(r.kind).toBe('received');
    expect(grievances[0]).toMatchObject({ outcome: 'quarantined', reasons: '["too_fast"]' });
  });

  it('throttles a source after the hourly limit of valid submissions, with a Retry-After', async () => {
    const { db, events } = fakeDb();
    const token = await tokenFor(undefined);
    const post = () => handleGrievance({ ...good, [TOKEN_FIELD]: token }, { DB: db }, ctx);
    for (let i = 0; i < THROTTLE.limit; i++) expect((await post()).kind).toBe('received');
    const r = await post();
    expect(r).toEqual({
      kind: 'rejected',
      reason: 'rate_limited',
      retryAfterSec: THROTTLE.backoffSec[0],
    });
    expect(events.at(-1)).toMatchObject({ kind: 'rejected', reason: 'rate_limited' });
  });

  describe('strict mode', () => {
    it('refuses to run without the signing key', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { db, grievances } = fakeDb();
      const r = await handleGrievance(
        { ...good, [TOKEN_FIELD]: await tokenFor(undefined) },
        { DB: db },
        { ...ctx, strict: true },
      );
      expect(r).toEqual({ kind: 'unavailable', reason: 'offline' });
      expect(grievances).toHaveLength(0);
      expect(errSpy).toHaveBeenCalled();
    });

    it('quarantines instead of skipping when the Turnstile secret is missing', async () => {
      const { db, grievances } = fakeDb();
      const r = await handleGrievance(
        { ...good, [TOKEN_FIELD]: await tokenFor('real-key') },
        { DB: db, WORKER_GRIEVANCE_SIGNING_KEY: 'real-key' },
        { ...ctx, strict: true },
      );
      expect(r.kind).toBe('received');
      expect(grievances[0]).toMatchObject({
        outcome: 'quarantined',
        reasons: '["turnstile_error"]',
      });
    });
  });

  it('propagates a D1 outage (the page keeps the text) and retries only a ref collision', async () => {
    const { db } = fakeDb({ failWith: new Error('D1_ERROR: no such table: grievances') });
    await expect(
      handleGrievance({ ...good, [TOKEN_FIELD]: await tokenFor(undefined) }, { DB: db }, ctx),
    ).rejects.toThrow(/no such table/);
  });

  it('mirrors to Notion and sends both emails when configured; a Notion failure is logged, not fatal', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        if (url.includes('notion')) return new Response('{"id":"page-1"}', { status: 200 });
        return new Response('{"id":"email"}', { status: 200 });
      }),
    );
    const { db, grievances } = fakeDb();
    const env = {
      DB: db,
      WORKER_NOTION_TOKEN: 'ntn',
      NOTION_GRIEVANCE_DATA_SOURCE_ID: 'ds',
      NOTION_GRIEVANCE_OWNER_ID: 'owner',
      NOTION_GRIEVANCE_BACKUP_ID: 'backup',
      WORKER_RESEND_API_KEY: 're',
      WORKER_GRIEVANCE_NOTIFY_TO: 'owner@x.com',
      WORKER_GRIEVANCE_NOTIFY_BACKUP_TO: 'backup@x.com',
    };
    const r = await handleGrievance(
      { ...good, involves_owner: 'on', [TOKEN_FIELD]: await tokenFor(undefined) },
      env,
      ctx,
    );
    expect(r.kind).toBe('received');
    expect(grievances[0]).toMatchObject({ notion_page_id: 'page-1', ack_sent: 1 });
    const notion = calls.find((c) => c.url.includes('notion'))!;
    expect((notion.body.properties as Record<string, unknown>).Owner).toEqual({
      people: [{ object: 'user', id: 'backup' }],
    });
    const emails = calls.filter((c) => c.url.includes('resend'));
    expect(emails).toHaveLength(2);
    expect(emails[0].body.to).toEqual(['backup@x.com']); // backup only: the concern involves the owner
    expect(emails[1].body.to).toEqual(['ada@example.com']);
    expect(emails[1].body.reply_to).toBe('backup@x.com'); // replies never reach the owner either

    // Notion down: the submission still stands, and the failure is on the record.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 })),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db: db2, grievances: g2, events: e2 } = fakeDb();
    const r2 = await handleGrievance(
      { ...good, [TOKEN_FIELD]: await tokenFor(undefined) },
      { ...env, DB: db2 },
      ctx,
    );
    expect(r2.kind).toBe('received');
    expect(g2).toHaveLength(1);
    expect(e2.map((e) => e.kind)).toEqual([
      'accepted',
      'notion_failed',
      'email_failed',
      'email_failed',
    ]);
    expect(errSpy).toHaveBeenCalled();
  });

  it('sends no email at all for a concern involving the owner when no backup inbox is configured', async () => {
    const fetchSpy = vi.fn(async () => new Response('{"id":"x"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const { db, events } = fakeDb();
    const r = await handleGrievance(
      { ...good, involves_owner: 'on', [TOKEN_FIELD]: await tokenFor(undefined) },
      { DB: db, WORKER_RESEND_API_KEY: 're', WORKER_GRIEVANCE_NOTIFY_TO: 'owner@x.com' },
      ctx,
    );
    expect(r.kind).toBe('received');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(events.map((e) => `${e.kind}:${e.reason}`)).toEqual([
      'accepted:null',
      'notify_skipped:no_backup_inbox',
      'ack_deferred:no_backup_inbox',
    ]);
  });

  it('defers the acknowledgment for a quarantined submission (unverified address) but still notifies', async () => {
    const calls: { body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ body: JSON.parse(String(init.body)) });
        return new Response('{"id":"x"}', { status: 200 });
      }),
    );
    const { db, events, grievances } = fakeDb();
    const r = await handleGrievance(
      { ...good, [TOKEN_FIELD]: await tokenFor(undefined, IP, 900) },
      { DB: db, WORKER_RESEND_API_KEY: 're' },
      ctx,
    );
    expect(r.kind).toBe('received');
    if (r.kind === 'received') expect(r.outcome).toBe('quarantined');
    expect(calls).toHaveLength(1); // the notice only
    expect(calls[0].body.to).toEqual(['concerns@quarry.team']);
    expect(grievances[0].ack_sent).toBeUndefined();
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'ack_deferred', reason: 'quarantined' }),
    );
  });

  it('parseForm flattens FormData to first-value strings', () => {
    const fd = new FormData();
    fd.set('a', '1');
    fd.append('b', 'x');
    fd.append('b', 'y');
    expect(parseForm(fd)).toEqual({ a: '1', b: 'x' });
  });
});

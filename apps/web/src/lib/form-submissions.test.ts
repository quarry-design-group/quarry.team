import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  handleSubmission,
  notifySubmission,
  verifyTurnstile,
  ipPrefix,
  ipHash,
  contactSchema,
  HONEYPOT_FIELD,
  type D1Like,
} from './form-submissions';
import { hashIp } from './grievances';

/** In-memory D1 stub that records the bound INSERT values. */
function fakeDb() {
  const rows: unknown[][] = [];
  const db: D1Like = {
    prepare: () => ({
      bind: (...values: unknown[]) => ({
        run: async () => {
          rows.push(values);
          return {};
        },
      }),
    }),
  };
  return { db, rows };
}

// Bound INSERT columns: kind, name, email, organization, message, role, links, ip, ip_hash.
const LINKS = 6;
const IP = 7;
const IP_HASH = 8;

const contact = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'We have a hard problem worth building well.',
};

/** Stub the Turnstile siteverify endpoint with one response. */
const stubVerifier = (res: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async () => res());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('form submission capture', () => {
  it('rejects an invalid contact payload', async () => {
    const r = await handleSubmission('contact', { name: '', email: 'nope' }, {}, { ip: '1.2.3.4' });
    expect(r.status).toBe(400);
  });

  it('rejects a filled honeypot (bot)', async () => {
    const r = await handleSubmission(
      'contact',
      {
        name: 'Spammy McBot',
        email: 'bot@example.com',
        message: 'buy now',
        [HONEYPOT_FIELD]: 'http://spam.example',
      },
      {},
      { ip: '1.2.3.4' },
    );
    expect(r.status).toBe(400);
  });

  it('accepts a valid contact payload and persists it in a development build', async () => {
    const { db, rows } = fakeDb();
    const r = await handleSubmission('contact', contact, { DB: db }, { ip: '1.2.3.4' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('ada@example.com');
    expect(rows[0][0]).toBe('contact'); // kind
  });

  it('stores the address prefix and its keyed hash, never the address', async () => {
    const { db, rows } = fakeDb();
    const key = 'form-key';
    await handleSubmission(
      'contact',
      contact,
      { DB: db, WORKER_FORM_SUBMISSIONS_IP_HASH_KEY: key },
      { ip: '203.0.113.77' },
    );
    expect(rows[0][IP]).toBe('203.0.113.0/24');
    expect(rows[0][IP_HASH]).toBe(await hashIp(key, '203.0.113.77'));
    expect(rows[0]).not.toContain('203.0.113.77');
  });

  it('stores the prefix with a null hash and logs the missing key in a deployed build', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubVerifier(() => Response.json({ success: true }));
    const { db, rows } = fakeDb();
    const r = await handleSubmission(
      'contact',
      { ...contact, 'cf-turnstile-response': 'tok' },
      { DB: db, WORKER_TURNSTILE_SECRET: 'sec' },
      { ip: '2001:db8:85a3::8a2e:370:7334', deployed: true },
    );
    expect(r.status).toBe(200);
    expect(rows[0][IP]).toBe('2001:db8:85a3::/48');
    expect(rows[0][IP_HASH]).toBeNull();
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('WORKER_FORM_SUBMISSIONS_IP_HASH_KEY'),
    );
  });

  it('accepts a valid careers payload', async () => {
    const { db, rows } = fakeDb();
    const r = await handleSubmission(
      'careers',
      {
        name: 'Grace Hopper',
        email: 'grace@example.com',
        role: 'Senior Fullstack Magento Engineer',
        message: 'I am a master of the Magento core.',
      },
      { DB: db },
      { ip: '' },
    );
    expect(r.status).toBe(200);
    expect(rows[0][0]).toBe('careers');
    expect(rows[0][IP]).toBe('');
    expect(rows[0][IP_HASH]).toBeNull();
  });

  it('accepts a careers payload with a Loom intro and folds it into links', async () => {
    const { db, rows } = fakeDb();
    const r = await handleSubmission(
      'careers',
      {
        name: 'Grace Hopper',
        email: 'grace@example.com',
        role: 'Senior Fullstack Magento Engineer',
        loom: 'https://www.loom.com/share/abc123',
        links: 'https://github.com/grace',
        message: 'I am a master of the Magento core.',
      },
      { DB: db },
      { ip: '' },
    );
    expect(r.status).toBe(200);
    // Loom first, then the other links.
    expect(rows[0][LINKS]).toBe(
      'Loom: https://www.loom.com/share/abc123\nhttps://github.com/grace',
    );
  });

  it('rejects a careers payload whose loom field is not a loom.com link', async () => {
    const r = await handleSubmission(
      'careers',
      {
        name: 'Grace Hopper',
        email: 'grace@example.com',
        loom: 'https://www.youtube.com/watch?v=abc',
        message: 'hi',
      },
      {},
      { ip: '' },
    );
    expect(r.status).toBe(400);
  });

  it('contactSchema strips unknown keys and enforces required fields', () => {
    const parsed = contactSchema.safeParse({ ...contact, admin: true, id: 7 });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('admin');
    expect(parsed.data).not.toHaveProperty('id');
    expect(contactSchema.safeParse({ name: 'X', email: 'x@y.com' }).success).toBe(false);
  });
});

describe('verifyTurnstile', () => {
  it('fails a missing token without calling the verifier', async () => {
    const fetchMock = stubVerifier(() => Response.json({ success: true }));
    expect(await verifyTurnstile(undefined, '1.2.3.4', 'sec', true)).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes a token the verifier accepts, forwarding the client address', async () => {
    const fetchMock = stubVerifier(() => Response.json({ success: true }));
    expect(await verifyTurnstile('tok', '1.2.3.4', 'sec', true)).toBe('passed');
    const body = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as URLSearchParams;
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });

  it('fails a token the verifier rejects', async () => {
    stubVerifier(() =>
      Response.json({ success: false, 'error-codes': ['invalid-input-response'] }),
    );
    expect(await verifyTurnstile('tok', '', 'sec', true)).toBe('failed');
  });

  it('reports a verifier outage as unavailable and logs it', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubVerifier(() => Promise.reject(new TypeError('fetch failed')));
    expect(await verifyTurnstile('tok', '', 'sec', true)).toBe('unavailable');
    expect(err).toHaveBeenCalledWith(expect.stringContaining('outage'), expect.anything());
  });

  it('reports a verifier error status as unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubVerifier(() => new Response('upstream error', { status: 502 }));
    expect(await verifyTurnstile('tok', '', 'sec', true)).toBe('unavailable');
  });

  it('without a secret: unavailable in a deployed build, passed in development', async () => {
    expect(await verifyTurnstile('tok', '', undefined, true)).toBe('unavailable');
    expect(await verifyTurnstile('tok', '', undefined, false)).toBe('passed');
  });
});

describe('handleSubmission Turnstile outcomes (deployed build)', () => {
  const env = (db: D1Like) => ({
    DB: db,
    WORKER_TURNSTILE_SECRET: 'sec',
    WORKER_FORM_SUBMISSIONS_IP_HASH_KEY: 'k',
  });
  const ctx = { ip: '1.2.3.4', deployed: true };

  it('answers 403 when the secret is set and the token is missing', async () => {
    stubVerifier(() => Response.json({ success: true }));
    const { db, rows } = fakeDb();
    const r = await handleSubmission('contact', contact, env(db), ctx);
    expect(r).toEqual({ status: 403, body: { ok: false, error: 'turnstile_failed' } });
    expect(rows).toHaveLength(0);
  });

  it('answers 200 and persists when the verifier accepts the token', async () => {
    stubVerifier(() => Response.json({ success: true }));
    const { db, rows } = fakeDb();
    const r = await handleSubmission(
      'contact',
      { ...contact, 'cf-turnstile-response': 'tok' },
      env(db),
      ctx,
    );
    expect(r.status).toBe(200);
    expect(rows).toHaveLength(1);
  });

  it('answers 503 and persists nothing during a verifier outage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubVerifier(() => Promise.reject(new TypeError('fetch failed')));
    const { db, rows } = fakeDb();
    const r = await handleSubmission(
      'contact',
      { ...contact, 'cf-turnstile-response': 'tok' },
      env(db),
      ctx,
    );
    expect(r).toEqual({ status: 503, body: { ok: false, error: 'unavailable' } });
    expect(rows).toHaveLength(0);
  });

  it('answers 503 and names the secret when WORKER_TURNSTILE_SECRET is missing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = stubVerifier(() => Response.json({ success: true }));
    const { db, rows } = fakeDb();
    const r = await handleSubmission(
      'contact',
      { ...contact, 'cf-turnstile-response': 'tok' },
      { DB: db },
      ctx,
    );
    expect(r.status).toBe(503);
    expect(rows).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('WORKER_TURNSTILE_SECRET'));
  });
});

describe('ipPrefix', () => {
  it('truncates IPv4 to its /24', () => {
    expect(ipPrefix('203.0.113.77')).toBe('203.0.113.0/24');
    expect(ipPrefix('10.0.0.1')).toBe('10.0.0.0/24');
  });

  it('truncates IPv6 to its /48, expanding a compressed address', () => {
    expect(ipPrefix('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::/48');
    expect(ipPrefix('2001:DB8::1')).toBe('2001:db8:0::/48');
    expect(ipPrefix('2001:0db8:0001::')).toBe('2001:db8:1::/48');
    expect(ipPrefix('::1')).toBe('0:0:0::/48');
    expect(ipPrefix('1::2:3:4:5:6:7')).toBe('1:0:2::/48');
    expect(ipPrefix('fe80::1%eth0')).toBe('fe80:0:0::/48');
  });

  it('gives an IPv4-mapped IPv6 address its IPv4 prefix', () => {
    expect(ipPrefix('::ffff:198.51.100.9')).toBe('198.51.100.0/24');
  });

  it('is empty for an absent or malformed address', () => {
    expect(ipPrefix('')).toBe('');
    expect(ipPrefix('not-an-ip')).toBe('');
    expect(ipPrefix('256.1.1.1')).toBe('');
    expect(ipPrefix('1:2:3')).toBe('');
    expect(ipPrefix('1::2::3')).toBe('');
    expect(ipPrefix('1:2:3:4:5:6:7:8::')).toBe('');
  });
});

describe('ipHash', () => {
  it('is the grievance helper’s HMAC under the form key', async () => {
    expect(await ipHash('form-key', '203.0.113.77')).toBe(await hashIp('form-key', '203.0.113.77'));
    expect(await ipHash('form-key', '203.0.113.77')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('separates stores keyed differently', async () => {
    expect(await ipHash('form-key', '203.0.113.77')).not.toBe(
      await ipHash('grievance-key', '203.0.113.77'),
    );
  });

  it('is null without an address or a key', async () => {
    expect(await ipHash('form-key', '')).toBeNull();
    expect(await ipHash(undefined, '203.0.113.77')).toBeNull();
    expect(await ipHash('', '203.0.113.77')).toBeNull();
  });
});

describe('notifySubmission', () => {
  const sent = (fetchMock: ReturnType<typeof vi.fn>) =>
    JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
      subject: string;
      html: string;
    };

  it('builds the subject from raw strings and escapes the HTML body', async () => {
    const fetchMock = stubVerifier(() => Response.json({ id: 'ok' }));
    await notifySubmission({ WORKER_RESEND_API_KEY: 're_test' }, 'contact', {
      name: 'Ada & Co',
      email: 'ada@example.com',
      organization: 'Babbage <Engines>',
      message: 'hi',
    });
    const { subject, html } = sent(fetchMock);
    expect(subject).toBe('New inquiry: Ada & Co (Babbage <Engines>)');
    expect(html).toContain('Ada &amp; Co');
    expect(html).toContain('Babbage &lt;Engines&gt;');
  });

  it('keeps the subject on one line', async () => {
    const fetchMock = stubVerifier(() => Response.json({ id: 'ok' }));
    await notifySubmission({ WORKER_RESEND_API_KEY: 're_test' }, 'careers', {
      name: 'Grace\r\nBcc: x@example.com',
      email: 'grace@example.com',
      role: 'R&D',
      message: 'hi',
    });
    expect(sent(fetchMock).subject).toBe('New application: Grace Bcc: x@example.com — R&D');
  });

  it('logs a non-2xx Resend response', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubVerifier(() => new Response('{"message":"domain is not verified"}', { status: 403 }));
    await notifySubmission({ WORKER_RESEND_API_KEY: 're_test' }, 'contact', contact);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('Resend responded 403'));
  });

  it('stays silent on a 2xx Resend response and never throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubVerifier(() => new Response('{"id":"ok"}', { status: 200 }));
    await expect(
      notifySubmission({ WORKER_RESEND_API_KEY: 're_test' }, 'contact', contact),
    ).resolves.toBeUndefined();
    expect(err).not.toHaveBeenCalled();
  });
});

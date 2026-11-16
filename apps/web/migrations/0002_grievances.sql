-- Stakeholder grievance mechanism — D1 (SQLite) schema. See ADR-0017.
-- Applied by the deploy jobs (wrangler d1 migrations apply … -c dist/server/wrangler.json).
--
-- D1 is the durable, owned store for every submission the intake accepts or
-- quarantines; the Notion log is a working mirror written best-effort after
-- the insert. Raw IPs are never stored: ip_hash is an HMAC keyed by the
-- Worker's GRIEVANCE_SIGNING_KEY, enough to correlate abuse, useless alone.
-- Retention (NFR §4): grievance rows three years after closure; events and
-- throttle rows thirteen months. Purged by the documented quarterly procedure.

CREATE TABLE IF NOT EXISTS grievances (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ref             TEXT NOT NULL UNIQUE,      -- GRV-YYYY-XXXXX, shared with the submitter
  received_at     TEXT NOT NULL DEFAULT (datetime('now')),
  outcome         TEXT NOT NULL,             -- 'accepted' | 'quarantined'
  reasons         TEXT NOT NULL DEFAULT '[]',-- JSON array of quarantine signals
  stakeholder     TEXT NOT NULL,             -- form dropdown key
  category        TEXT NOT NULL,             -- form dropdown key
  anonymous       INTEGER NOT NULL DEFAULT 0,
  name            TEXT,
  email           TEXT,
  involves_owner  INTEGER NOT NULL DEFAULT 0,-- routed to the backup, not the owner
  description     TEXT NOT NULL,
  desired_outcome TEXT,
  ip_hash         TEXT,
  turnstile       TEXT,                      -- passed | failed | missing | skipped | error
  dwell_ms        INTEGER,                   -- time between form render and submit
  notion_page_id  TEXT,                      -- set once the Notion mirror write succeeds
  ack_sent        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_grievances_received ON grievances (received_at);
CREATE INDEX IF NOT EXISTS idx_grievances_outcome ON grievances (outcome, received_at);

-- Every rejection and every intake outcome, with its reason — the audit trail
-- behind "log every rejection so filter tuning is auditable" and the
-- filtered/quarantined counts in the quarterly report.
CREATE TABLE IF NOT EXISTS grievance_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       TEXT NOT NULL DEFAULT (datetime('now')),
  kind     TEXT NOT NULL,   -- rejected | accepted | quarantined | notion_failed | email_failed
  reason   TEXT,            -- honeypot | bad_token | rate_limited | <signal list> | error text
  ref      TEXT,
  ip_hash  TEXT,
  detail   TEXT
);

CREATE INDEX IF NOT EXISTS idx_grievance_events_at ON grievance_events (at, kind);

-- Per-source throttle with progressive backoff (the WAF's 3/10s rule is the
-- burst layer; this is the sustained layer). One row per hashed source.
CREATE TABLE IF NOT EXISTS grievance_throttle (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0,  -- attempts in the current window
  window_start  INTEGER NOT NULL,            -- epoch seconds
  blocked_until INTEGER NOT NULL DEFAULT 0,  -- epoch seconds; 0 = not blocked
  strikes       INTEGER NOT NULL DEFAULT 0,  -- escalations so far (drives the backoff)
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

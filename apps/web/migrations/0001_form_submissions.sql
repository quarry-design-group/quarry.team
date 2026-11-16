-- Quarry form-submission capture — D1 (SQLite) schema.
-- Apply with: wrangler d1 migrations apply marketing-site-form-submissions --remote -c dist/server/wrangler.json
-- (staging: the -staging database name, after a CLOUDFLARE_ENV=staging build)
-- The single durable store for contact + careers form submissions. See ADR-0014.
CREATE TABLE IF NOT EXISTS form_submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL,            -- 'contact' | 'careers'
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  organization TEXT,
  message      TEXT NOT NULL,
  role         TEXT,
  links        TEXT,
  ip           TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_kind_created ON form_submissions (kind, created_at);

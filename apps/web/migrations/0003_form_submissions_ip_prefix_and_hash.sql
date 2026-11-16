-- Form submissions store derived client addresses only. See ADR-0014.
-- Applied by the deploy jobs (wrangler d1 migrations apply … -c dist/server/wrangler.json).
--
-- `ip` holds the network prefix of the request (IPv4 /24 as 203.0.113.0/24,
-- IPv6 /48 as 2001:db8:85a3::/48), and `ip_hash` an HMAC-SHA256 of the full
-- address keyed by the WORKER_FORM_SUBMISSIONS_IP_HASH_KEY Worker secret, written by
-- src/lib/form-submissions.ts (ipPrefix). This migration rewrites every
-- stored address to its prefix by the same rules, matching ipPrefix on the
-- canonical address forms the Cloudflare edge sends in cf-connecting-ip.
-- SQLite has no HMAC, so rows written before it keep a null hash.
-- Retention: 36 months after receipt (docs/runbooks/data-retention.md).

ALTER TABLE form_submissions ADD COLUMN ip_hash TEXT;

-- 1. IPv4-mapped IPv6 (::ffff:198.51.100.9) → its IPv4 address (the part after the last colon).
UPDATE form_submissions
SET ip = substr(ip, length(rtrim(ip, replace(ip, ':', ''))) + 1)
WHERE ip LIKE '%:%.%' AND ip NOT LIKE '%/%';

-- 2. IPv4 → /24: drop the last octet's digits and close the prefix.
UPDATE form_submissions
SET ip = rtrim(ip, '0123456789') || '0/24'
WHERE ip LIKE '%.%.%.%' AND ip NOT LIKE '%:%' AND ip NOT LIKE '%/%';

-- 3. Compressed IPv6 → eight groups. Inside an address '::' stands for
--    (8 - colon count) zero groups; at either end, for one more.
UPDATE form_submissions
SET ip = trim(
  replace(
    ip,
    '::',
    ':' || substr(
      '0:0:0:0:0:0:0:0',
      1,
      2 * (8 - (length(ip) - length(replace(ip, ':', ''))) + (ip LIKE '::%' OR ip LIKE '%::')) - 1
    ) || ':'
  ),
  ':'
)
WHERE ip LIKE '%::%' AND ip NOT LIKE '%/%';

-- 4. Expanded IPv6 → /48: the first three groups, lowercased.
UPDATE form_submissions
SET ip = lower(
  substr(
    ip,
    1,
    instr(ip, ':')
      + instr(substr(ip, instr(ip, ':') + 1), ':')
      + instr(substr(ip, instr(ip, ':') + instr(substr(ip, instr(ip, ':') + 1), ':') + 1), ':')
      - 1
  )
) || '::/48'
WHERE ip LIKE '%:%:%:%:%:%:%:%' AND ip NOT LIKE '%::%' AND ip NOT LIKE '%/%';

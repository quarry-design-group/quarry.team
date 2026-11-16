# modules/cloudflare-web/main.tf
#
# Cloudflare edge + data tier for the marketing site:
#   - D1 databases (form-submission stores, production + staging, bound as `DB`)
#   - Turnstile widgets: managed (contact/careers) + invisible (grievances)
#   - Rulesets: WAF custom rules, per-IP rate limiting on the form endpoints,
#     and a staging noindex header
#
# There is deliberately NO cache ruleset here. Every hostname on this zone is
# served by a Worker (wrangler custom-domain routes), and zone cache
# configuration does not apply to Worker responses — see the note in
# apps/web/public/_headers, which is the single cache plane for this site.
#
# The Worker that binds D1 and serves the site (static assets + same-origin
# /api/* routes) is built by @astrojs/cloudflare and deployed by `wrangler
# deploy` — NOT by Terraform. apex/www custom-domain DNS is managed by the
# Worker's routes (wrangler) for the same reason.
#
# All resources target the cloudflare provider v5 schema (nested config as
# object attributes; ruleset `rules` is a list attribute).

locals {
  www_fqdn     = "www.${var.domain}"
  staging_fqdn = "staging.${var.domain}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Scrape Shield — email address obfuscation. Cloudflare rewrites email
# addresses + mailto: links in proxied HTML so harvesters can't scrape them
# (real browsers see them via a tiny injected decoder). Belt-and-suspenders with
# the build-time entity-encoding done by the Email.astro component.
# ─────────────────────────────────────────────────────────────────────────────
resource "cloudflare_zone_setting" "email_obfuscation" {
  zone_id    = var.zone_id
  setting_id = "email_obfuscation"
  value      = "on"
}

# ─────────────────────────────────────────────────────────────────────────────
# D1 — the durable form-submission store (SQLite at the edge). Append-only,
# low write volume; backups/point-in-time restore via D1 Time Travel. The
# staging database is fully separate so staging and PR-preview test
# submissions never land in production data (ADR-0013).
# ─────────────────────────────────────────────────────────────────────────────
resource "cloudflare_d1_database" "form_submissions" {
  account_id = var.account_id
  name       = var.d1_database_name

  read_replication = {
    mode = var.d1_read_replica ? "auto" : "disabled"
  }
}

resource "cloudflare_d1_database" "form_submissions_staging" {
  account_id = var.account_id
  name       = "${var.d1_database_name}-staging"

  read_replication = {
    mode = "disabled"
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Turnstile widget for the contact/careers forms.
# ─────────────────────────────────────────────────────────────────────────────
# Exports `sitekey` (public) and `secret` (sensitive) used by the form + Worker.
#
# Since provider 5.26.0 the resource schema also carries the list endpoint's
# `page`/`per_page` query params (Optional+Computed, defaults 1 and 25; never
# sent to the API). Leave them unset: state written by an older provider holds
# them as null, so the defaults plan as an in-place update that marks `secret`
# unknown and cascades into every github_actions_environment_secret — a red
# drift check. One apply records the defaults in state and the plan settles.
# Setting them here would only break `validate` once the provider drops them.
resource "cloudflare_turnstile_widget" "forms" {
  account_id = var.account_id
  name       = "${var.worker_name}-forms"
  mode       = "managed" # adaptive challenge; best UX/security balance

  # Domains the widget is valid on — apex + www + the staging host.
  # Sorted because Cloudflare stores `domains` as an unordered (alphabetised)
  # set but the provider models it as an ordered list; without sort() the
  # committed order never matches what the API reads back, producing perpetual
  # phantom drift on the scheduled drift check.
  domains = sort([
    var.domain,
    local.www_fqdn,
    local.staging_fqdn,
  ])

  region = "world"
}

# ─────────────────────────────────────────────────────────────────────────────
# Turnstile widget for the stakeholder grievance form (ADR-0017). A SEPARATE
# widget in invisible mode: the brief forbids any puzzle or checkbox on this
# form (it must never block assistive technology), and the managed widget
# above may show one. The Worker treats a missing token as a quarantine
# signal, never a rejection, so no-JS submissions still land. `page`/`per_page`
# stay unset for the reason given on the forms widget above.
# ─────────────────────────────────────────────────────────────────────────────
resource "cloudflare_turnstile_widget" "grievances" {
  account_id = var.account_id
  name       = "${var.worker_name}-grievances"
  mode       = "invisible"

  domains = sort([
    var.domain,
    local.www_fqdn,
    local.staging_fqdn,
  ])

  region = "world"
}

# ─────────────────────────────────────────────────────────────────────────────
# WAF — custom firewall ruleset (zone-level, http_request_firewall_custom).
# ─────────────────────────────────────────────────────────────────────────────
# Canonical-host enforcement is NOT here: a zone ruleset only sees traffic
# through the quarry.team zone, so a `*.workers.dev` expression could never
# match. The control that works is `workers_dev = false` on both environments
# in apps/web/wrangler.toml.
resource "cloudflare_ruleset" "waf_custom" {
  zone_id     = var.zone_id
  name        = "quarry-waf-custom"
  description = "Custom WAF rules for the marketing site."
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [
    {
      # Challenge suspicious traffic hitting the same-origin form endpoints.
      # NOTE: no cf.bot_management.* fields here — they require the Bot
      # Management add-on (Enterprise) and 400 on this zone's plan.
      action      = "managed_challenge"
      description = "Challenge suspicious traffic to the /api form endpoints"
      enabled     = true
      expression  = "(starts_with(http.request.uri.path, \"/api/\")) and (cf.threat_score gt 10)"
    },
    {
      # Challenge high-threat-score POSTs anywhere (defense-in-depth).
      action      = "managed_challenge"
      description = "Challenge high threat-score POST requests"
      enabled     = true
      expression  = "(http.request.method eq \"POST\") and (cf.threat_score gt 25)"
    },
  ]
}

# ─────────────────────────────────────────────────────────────────────────────
# Rate limiting — per-IP cap on the form endpoints (the correct layer on the
# edge; Worker isolates can't share an in-process limiter).
# ─────────────────────────────────────────────────────────────────────────────
resource "cloudflare_ruleset" "ratelimit" {
  zone_id     = var.zone_id
  name        = "quarry-ratelimit"
  description = "Per-IP rate limit on the form submission endpoints."
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    {
      # NOTE: 10 seconds is the only period (and mitigation timeout) this
      # zone accepts — longer values 400 at the API. 3 requests, then a 10 s
      # block, repeating: at most 3 per 10 s burst, and about 18 per minute
      # sustained. Tighter per burst and looser sustained than an
      # 8-per-minute ceiling; Turnstile on every submission and the Worker's
      # D1 throttle carry the sustained layer.
      action = "block"
      # The grievance form POSTs to its own on-demand page, not /api/*
      # (ADR-0017) — covered here explicitly. This is the burst layer; the
      # Worker's D1 throttle adds progressive backoff over the hour.
      description = "Throttle form POSTs to 3 per 10 seconds per IP"
      enabled     = true
      expression  = "(http.request.method eq \"POST\") and (starts_with(http.request.uri.path, \"/api/\") or http.request.uri.path eq \"/policies/grievances\")"
      ratelimit = {
        characteristics     = ["ip.src", "cf.colo.id"]
        period              = 10
        requests_per_period = 3
        mitigation_timeout  = 10
      }
    },
  ]
}

# ─────────────────────────────────────────────────────────────────────────────
# Staging noindex — the staging host must never enter search indexes.
# Builds differ between environments only by SITE_URL and CLOUDFLARE_ENV; the
# noindex is edge-owned (a response header transform), so no environment needs
# a special build or a robots meta tag. PR previews on workers.dev never pass
# through this zone; the Worker entry (apps/web/src/worker.ts) sets their
# X-Robots-Tag. See ADR-0013.
# ─────────────────────────────────────────────────────────────────────────────
resource "cloudflare_ruleset" "staging_noindex" {
  zone_id     = var.zone_id
  name        = "quarry-staging-noindex"
  description = "Mark the staging hostname noindex/nofollow for all crawlers."
  kind        = "zone"
  phase       = "http_response_headers_transform"

  rules = [
    {
      action      = "rewrite"
      description = "X-Robots-Tag: noindex on ${local.staging_fqdn}"
      enabled     = true
      expression  = "(http.host eq \"${local.staging_fqdn}\")"
      action_parameters = {
        headers = {
          "X-Robots-Tag" = {
            operation = "set"
            value     = "noindex, nofollow"
          }
        }
      }
    },
    # The TEMPORARY post-cutover Clear-Site-Data rule (purging legacy WordPress
    # service workers on first contact) lived here 2026-06-10 → 2026-07-03, its
    # ~2-week soak window. Long-tail returning visitors are handled by the
    # permanent kill-switch at apps/web/public/service-worker.js, which the
    # stale SW fetches and self-unregisters against.
  ]
}

# ─────────────────────────────────────────────────────────────────────────────
# ZTNA — the entire staging host sits behind Cloudflare Access (ADR-0013
# amendment): unauthenticated requests to staging.quarry.team get the Access
# login (One-Time PIN to a @quarry.team address by default; IdPs can be added
# in Zero Trust later). Pages and the same-origin /api/* routes are both
# gated — the Access JWT rides the session cookie. PR previews live on
# workers.dev, outside this zone: reachable by anyone with the URL (posted in
# the PR's comment) while the PR is open, noindexed by the Worker entry
# (apps/web/src/worker.ts), serving staging data, and outside this zone's WAF,
# rate limits and Access policy.
# ─────────────────────────────────────────────────────────────────────────────
resource "cloudflare_zero_trust_access_policy" "staging_team" {
  account_id = var.account_id
  name       = "quarry-staging-team"
  decision   = "allow"

  include = [
    {
      email_domain = { domain = var.domain }
    },
  ]
}

resource "cloudflare_zero_trust_access_application" "staging" {
  zone_id          = var.zone_id
  name             = "quarry-web-staging"
  domain           = local.staging_fqdn
  type             = "self_hosted"
  session_duration = "24h"

  policies = [
    {
      id         = cloudflare_zero_trust_access_policy.staging_team.id
      precedence = 1
    },
  ]
}

# ─────────────────────────────────────────────────────────────────────────────
# Canonical host — www 301s to the apex at the edge (before the Worker), path
# and query preserved. The www custom domain stays attached so DNS resolves;
# this rule intercepts every request on it.
# ─────────────────────────────────────────────────────────────────────────────
resource "cloudflare_ruleset" "www_redirect" {
  zone_id     = var.zone_id
  name        = "quarry-www-redirect"
  description = "301 www to the apex (canonical host)."
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"

  rules = [
    {
      action      = "redirect"
      description = "www.${var.domain} -> ${var.domain} (301, path + query preserved)"
      enabled     = true
      expression  = "(http.host eq \"${local.www_fqdn}\")"
      action_parameters = {
        from_value = {
          status_code = 301
          target_url = {
            expression = "concat(\"https://${var.domain}\", http.request.uri.path)"
          }
          preserve_query_string = true
        }
      }
    },
  ]
}

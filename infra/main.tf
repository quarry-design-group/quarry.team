# main.tf
#
# Production composition (Cloudflare-only). Looks up the existing zone, then
# wires the two modules: object storage (R2) and the edge/data tier
# (Turnstile + WAF/rate-limit + the D1 form_submissions database).
#
# The site itself — static assets + the same-origin /api/* form endpoints — is
# one Cloudflare Worker built by @astrojs/cloudflare and shipped by
# `wrangler deploy` in CI (not Terraform). Terraform owns the stateful/config
# plane only. See ADR-0014, ADR-0006, ADR-0008.

# ─────────────────────────────────────────────────────────────────────────────
# Existing Cloudflare zone (assumed already created — looked up by name).
# ─────────────────────────────────────────────────────────────────────────────
# In v5 the data source filters by `name` under a `filter` attribute and exposes
# the zone identifier as `.id` (the `zone_id` field is an *input* lookup param).
data "cloudflare_zone" "main" {
  filter = {
    name = var.domain
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Object storage (R2): (out-of-band) Terraform state bucket.
# ─────────────────────────────────────────────────────────────────────────────
module "storage" {
  source = "./modules/cloudflare-storage"

  account_id        = var.cloudflare_account_id
  state_bucket_name = var.state_bucket_name
  location_hint     = var.r2_location_hint

  # Flip to true only AFTER importing the bootstrapped state bucket (see README).
  manage_state_bucket = false
}

# ─────────────────────────────────────────────────────────────────────────────
# Cloudflare edge + data tier: D1 (form_submissions), Turnstile widget, WAF rules.
# Cache policy is NOT here: it lives in apps/web/public/_headers, because zone
# cache rules do not apply to Worker-served responses.
# (The Worker that binds D1 and serves the site is deployed by wrangler.)
# ─────────────────────────────────────────────────────────────────────────────
module "web" {
  source = "./modules/cloudflare-web"

  account_id = var.cloudflare_account_id
  zone_id    = data.cloudflare_zone.main.id
  domain     = var.domain

  worker_name      = var.worker_name
  d1_database_name = var.d1_database_name
  d1_read_replica  = var.d1_read_replication
}

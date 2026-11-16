# outputs.tf — useful values for humans and downstream CI steps.

output "zone_id" {
  description = "Cloudflare zone ID for the domain."
  value       = data.cloudflare_zone.main.id
}

output "site_url" {
  description = "Canonical production site URL."
  value       = "https://${var.domain}"
}

output "turnstile_sitekey" {
  description = "Public Turnstile site key — set as PUBLIC_TURNSTILE_SITE_KEY at build time."
  value       = module.web.turnstile_sitekey
}

output "turnstile_grievances_sitekey" {
  description = "Public site key of the invisible grievance-form widget — set as PUBLIC_TURNSTILE_GRIEVANCES_SITE_KEY at build time."
  value       = module.web.turnstile_grievances_sitekey
}

# The widget secrets are written straight into the deploy environments
# (github.tf) and have no root output: nothing prints them.

# ── Data tier (D1) ───────────────────────────────────────────────────────────
output "d1_database_id" {
  description = "Production D1 database id — copy into apps/web/wrangler.toml ([[d1_databases]].database_id) or inject in CI before `wrangler deploy`."
  value       = module.web.d1_database_id
}

output "d1_database_name" {
  description = "Production D1 database name (binding `DB`)."
  value       = module.web.d1_database_name
}

output "d1_staging_database_id" {
  description = "Staging D1 database id — copy into apps/web/wrangler.toml ([env.staging] d1 binding)."
  value       = module.web.d1_staging_database_id
}

output "d1_staging_database_name" {
  description = "Staging D1 database name (binding `DB` in [env.staging])."
  value       = module.web.d1_staging_database_name
}

output "staging_url" {
  description = "Staging URL (behind Cloudflare Access; noindex enforced at the edge)."
  value       = "https://staging.${var.domain}"
}

# ── Storage ─────────────────────────────────────────────────────────────────
output "r2_s3_endpoint" {
  description = "S3-compatible endpoint for the account's R2 storage."
  value       = module.storage.s3_api_endpoint
}

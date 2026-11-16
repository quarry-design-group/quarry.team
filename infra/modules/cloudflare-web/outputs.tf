# modules/cloudflare-web/outputs.tf

output "d1_database_id" {
  description = "Production D1 database id — copy into apps/web/wrangler.toml or inject in CI before `wrangler deploy`."
  value       = cloudflare_d1_database.form_submissions.id
}

output "d1_database_name" {
  description = "Production D1 database name (binding `DB`)."
  value       = cloudflare_d1_database.form_submissions.name
}

output "d1_staging_database_id" {
  description = "Staging D1 database id — copy into apps/web/wrangler.toml ([env.staging])."
  value       = cloudflare_d1_database.form_submissions_staging.id
}

output "d1_staging_database_name" {
  description = "Staging D1 database name (binding `DB` in [env.staging])."
  value       = cloudflare_d1_database.form_submissions_staging.name
}

output "turnstile_sitekey" {
  description = "Public Turnstile site key for embedding in the form markup (build-time PUBLIC_TURNSTILE_SITE_KEY)."
  value       = cloudflare_turnstile_widget.forms.sitekey
}

output "turnstile_secret" {
  description = "Turnstile secret key for server-side verification (written to the deploy environments as WORKER_TURNSTILE_SECRET, infra/github.tf)."
  value       = cloudflare_turnstile_widget.forms.secret
  sensitive   = true
}

output "turnstile_grievances_sitekey" {
  description = "Public site key of the invisible grievance-form widget (build-time PUBLIC_TURNSTILE_GRIEVANCES_SITE_KEY)."
  value       = cloudflare_turnstile_widget.grievances.sitekey
}

output "turnstile_grievances_secret" {
  description = "Secret of the invisible grievance-form widget (written to the deploy environments as WORKER_TURNSTILE_GRIEVANCES_SECRET, infra/github.tf)."
  value       = cloudflare_turnstile_widget.grievances.secret
  sensitive   = true
}

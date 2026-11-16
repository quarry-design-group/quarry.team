# variables.tf
#
# All inputs for the production configuration. Secrets are marked `sensitive`
# and have NO defaults — they must be supplied via TF_VAR_* env vars (GitHub
# Actions secrets) or the production tfvars (which itself never contains real
# secrets). Non-secret structural values get safe defaults.

# ─────────────────────────────────────────────────────────────────────────────
# Identity / account
# ─────────────────────────────────────────────────────────────────────────────

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the zone, Worker, D1, and R2 buckets."
  type        = string
  # No default: account-specific. Supply via TF_VAR_cloudflare_account_id.
}

variable "domain" {
  description = "Apex domain for the marketing site. The Cloudflare zone is looked up by this name."
  type        = string
  default     = "quarry.team"
}

# ─────────────────────────────────────────────────────────────────────────────
# Worker / web
# ─────────────────────────────────────────────────────────────────────────────

variable "worker_name" {
  description = "Name of the Cloudflare Worker that serves the site + same-origin /api/* routes (must match `name` in apps/web/wrangler.toml). Deployed by wrangler, referenced here for WAF/host rules."
  type        = string
  default     = "quarry-web"
}

# ─────────────────────────────────────────────────────────────────────────────
# D1 (form-submission store)
# ─────────────────────────────────────────────────────────────────────────────

variable "d1_database_name" {
  description = "Name of the production D1 database for contact/careers form submissions (must match the [[d1_databases]] binding in apps/web/wrangler.toml; the staging database is created as \"<name>-staging\")."
  type        = string
  default     = "marketing-site-form-submissions"
}

variable "d1_read_replication" {
  description = "Whether to enable D1 read replication (read-only mode). Off for a low-write form_submissions store."
  type        = bool
  default     = false
}

# ─────────────────────────────────────────────────────────────────────────────
# Cloudflare storage (R2)
# ─────────────────────────────────────────────────────────────────────────────

variable "state_bucket_name" {
  description = "R2 bucket that stores Terraform remote state. Bootstrapped out-of-band; declared here for visibility and imported."
  type        = string
  default     = "quarry-tf-state"
}

variable "r2_location_hint" {
  description = "R2 bucket location hint (jurisdiction/region hint). Empty = automatic. Valid hints e.g. wnam, enam, weur, eeur, apac."
  type        = string
  default     = "enam" # eastern North America
}

# ─────────────────────────────────────────────────────────────────────────────
# GitHub (the deploy environments that hold the Worker runtime secrets)
# ─────────────────────────────────────────────────────────────────────────────

variable "github_owner" {
  description = "GitHub organization that owns the repository."
  type        = string
  default     = "quarry-design-group"
}

variable "github_repository" {
  description = "Repository whose deploy environments hold the Worker runtime secrets."
  type        = string
  default     = "quarry.team"
}

variable "deploy_environments" {
  description = "GitHub environments the Deploy Web jobs run in; each receives the Terraform-generated Worker secrets."
  type        = list(string)
  default     = ["staging", "production"]
}

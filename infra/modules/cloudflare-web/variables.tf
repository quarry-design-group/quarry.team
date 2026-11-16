# modules/cloudflare-web/variables.tf

variable "account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "zone_id" {
  description = "Cloudflare zone ID for the domain (looked up by the caller)."
  type        = string
}

variable "domain" {
  description = "Apex domain (e.g. quarry.team)."
  type        = string
}

variable "worker_name" {
  description = "Name of the Worker serving the site (matches apps/web/wrangler.toml). Used to name the Turnstile widget."
  type        = string
}

variable "d1_database_name" {
  description = "Name of the D1 form_submissions database (matches the [[d1_databases]] binding in apps/web/wrangler.toml)."
  type        = string
}

variable "d1_read_replica" {
  description = "Enable D1 read replication. Off for a low-write append-only store."
  type        = bool
  default     = false
}


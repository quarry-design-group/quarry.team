# providers.tf
#
# Provider configuration. No credentials are hardcoded — every provider reads
# its token from an environment variable (set as GitHub Actions secrets in CI),
# so nothing sensitive is ever committed.
#
# Environment variables consumed:
#   CLOUDFLARE_API_TOKEN   -> Cloudflare provider auth (scoped API token)
#   GITHUB_APP_ID,         -> GitHub provider auth as the Terraform GitHub App
#   GITHUB_APP_INSTALLATION_ID,  (org-owned, installed on this repository only,
#   GITHUB_APP_PEM_FILE           Environments: read and write). Each run mints a
#                                 short-lived installation token; the private
#                                 key (PEM contents) is the only secret. Unset,
#                                 the provider is anonymous: plans that only
#                                 create still run, a refresh or apply fails.
#
# The Cloudflare *account* id is passed explicitly to resources that need it
# (via var.cloudflare_account_id) rather than as a provider-level setting, which
# is the v5 convention.

provider "cloudflare" {
  # api_token is read from CLOUDFLARE_API_TOKEN automatically when omitted.
  # Declaring it via the env var (not here) keeps the token out of state/config.
  # api_token = var.cloudflare_api_token   # intentionally NOT set; use env.
}

provider "github" {
  # token is read from GITHUB_TOKEN automatically when omitted.
  owner = var.github_owner
}

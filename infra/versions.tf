# versions.tf
#
# Pins Terraform and provider major versions for the whole configuration.
# The constraints admit a provider's whole major line; the exact versions every
# run uses are locked in .terraform.lock.hcl (committed, with Linux, Windows,
# and macOS hashes). Dependabot's `terraform` group raises the lock within the
# major line as a PR, under the cooldown, with the plan on the PR (ADR 0018).
#
# Provider choices:
#   - cloudflare ~> 5.x  -> The v5 line is a ground-up rewrite generated from
#     Cloudflare's OpenAPI schema. Resource/attribute names differ substantially
#     from v4 (e.g. `cloudflare_dns_record` not `cloudflare_record`, nested
#     attributes are objects not `block {}`s). All HCL in this repo targets v5.
#   - github ~> 6.13     -> integrations/github, for one resource family only:
#     the Worker runtime secrets Terraform generates (the Turnstile widget
#     secrets), written into the repository's `staging` and `production`
#     environments, where every deploy picks them up (github.tf).
#
# The stack itself is on Cloudflare (zone, D1, R2, Turnstile, WAF/rate-limit).
# The site + same-origin form API deploy as one Worker via `wrangler deploy`
# (not Terraform). See ADR-0014, ADR-0006, ADR-0008.

terraform {
  # Floor is 1.10: native S3-backend lockfile locking (use_lockfile, against R2
  # conditional writes) lands in Terraform 1.10, and `backend.tf` sets it — 1.6
  # through 1.9 reject it as an unknown backend argument and fail `init`. Keep an
  # upper bound off so CI can use any 1.x runner >= 1.10 (the Infra workflow pins
  # TF_VERSION 1.11.4).
  required_version = ">= 1.10.0" # use_lockfile (native S3-backend locking)

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
  }
}

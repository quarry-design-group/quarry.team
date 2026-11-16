# backend.tf
#
# Remote state lives in a Cloudflare R2 bucket using Terraform's S3-compatible
# backend. R2 speaks the S3 API, so we point the standard `s3` backend at R2's
# endpoint and disable the AWS-specific behaviours that R2 does not implement.
#
# ─────────────────────────────────────────────────────────────────────────────
# BOOTSTRAP (one-time, out-of-band — NOT managed by this Terraform)
# ─────────────────────────────────────────────────────────────────────────────
# The state bucket must exist before `terraform init` can use it, so it cannot
# be created by the same state it would store. Create it once by hand:
#
#   1. Create the R2 bucket `quarry-tf-state` in the Cloudflare dashboard or via
#      Wrangler:   wrangler r2 bucket create quarry-tf-state
#   2. Create an R2 API token (Account > R2 > Manage API Tokens) scoped to
#      Object Read & Write for that bucket. This yields an Access Key ID and a
#      Secret Access Key (S3-compatible credentials).
#   3. Note your account ID; the R2 S3 endpoint is:
#         https://<ACCOUNT_ID>.r2.cloudflarestorage.com
#
# The `quarry-tf-state` bucket is intentionally also declared in
# modules/cloudflare-storage so it shows up in the dashboard/plan, but it is
# created out-of-band first; import it after bootstrap (see README) rather than
# letting Terraform try to create the bucket that holds its own state.
#
# ─────────────────────────────────────────────────────────────────────────────
# CI USAGE
# ─────────────────────────────────────────────────────────────────────────────
# Backend config that is environment-specific is supplied at init time so no
# account-specific values are committed:
#
#   terraform init \
#     -backend-config="bucket=quarry-tf-state" \
#     -backend-config="key=quarry-team/production.tfstate" \
#     -backend-config="endpoints={s3=\"https://<ACCOUNT_ID>.r2.cloudflarestorage.com\"}" \
#     -backend-config="access_key=${R2_ACCESS_KEY_ID}" \
#     -backend-config="secret_key=${R2_SECRET_ACCESS_KEY}"
#
# (access_key/secret_key may instead be provided via the AWS_ACCESS_KEY_ID /
#  AWS_SECRET_ACCESS_KEY environment variables, which the s3 backend also reads.)

terraform {
  backend "s3" {
    # `region` is required by the s3 backend's schema but is meaningless for R2.
    # R2 buckets are global; "auto" is the conventional placeholder.
    region = "auto"

    # The following are intentionally NOT set here and are passed via
    # `-backend-config` at init time (see header):
    #   bucket, key, endpoints, access_key, secret_key

    # R2 does not implement these AWS-isms; they must be skipped or init fails.
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true # R2 rejects the default streaming checksum trailer

    # R2 only supports path-style addressing for the S3 API.
    use_path_style = true

    # Native S3-backend locking via a .tflock object (TF >= 1.10; R2 supports
    # the conditional writes it relies on). Without this, concurrent applies
    # can corrupt state — there is no DynamoDB analog on R2.
    use_lockfile = true
  }
}

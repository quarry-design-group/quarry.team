# modules/cloudflare-storage/main.tf
#
# Cloudflare R2 buckets.
#
# In the cloudflare v5 provider the resource is `cloudflare_r2_bucket` with
# arguments: account_id, name, and optional location (the "location hint") and
# storage_class. See: registry.terraform.io/providers/cloudflare/cloudflare/5

# Terraform state bucket — created out-of-band during bootstrap because it holds
# this configuration's own state. Declared here for visibility/parity. It is
# only actually managed once `manage_state_bucket = true` AND it has been
# imported (otherwise apply would try to re-create an existing bucket).
resource "cloudflare_r2_bucket" "state" {
  count = var.manage_state_bucket ? 1 : 0

  account_id    = var.account_id
  name          = var.state_bucket_name
  location      = var.location_hint != "" ? var.location_hint : null
  storage_class = "Standard"

  lifecycle {
    # State is precious: never let a plan destroy the bucket that holds it.
    prevent_destroy = true
  }
}

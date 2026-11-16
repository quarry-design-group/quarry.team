# versions.tf — child modules must declare their own provider requirements;
# without this, Terraform infers hashicorp/cloudflare (which does not exist)
# and init fails. Version constraint matches the root (v5 line).
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

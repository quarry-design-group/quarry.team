# modules/cloudflare-storage/variables.tf

variable "account_id" {
  description = "Cloudflare account ID that owns the R2 buckets."
  type        = string
}

variable "state_bucket_name" {
  description = "Name of the R2 bucket holding Terraform remote state (bootstrapped out-of-band, then imported)."
  type        = string
}

variable "location_hint" {
  description = "R2 location hint (e.g. enam, weur). Empty string = let R2 choose."
  type        = string
  default     = ""
}

variable "manage_state_bucket" {
  description = <<-EOT
    Whether Terraform should manage the state bucket resource. This bucket is
    created out-of-band during bootstrap (it stores this very state). Keep false
    until you have imported it (see README), then flip to true so drift is
    tracked. Leaving it false avoids a create-conflict on first apply.
  EOT
  type        = bool
  default     = false
}

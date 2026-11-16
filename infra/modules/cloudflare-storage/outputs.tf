# modules/cloudflare-storage/outputs.tf

output "s3_api_endpoint" {
  description = "S3-compatible endpoint for the account's R2 (used to configure clients/backend). Bucket is addressed path-style under this host."
  value       = "https://${var.account_id}.r2.cloudflarestorage.com"
}

output "state_bucket_name" {
  description = "Name of the Terraform state R2 bucket (whether or not Terraform manages it)."
  value       = var.state_bucket_name
}

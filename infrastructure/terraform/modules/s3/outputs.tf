output "bucket_name" {
  description = "The S3 reports bucket name"
  value       = aws_s3_bucket.reports.id
}

output "bucket_arn" {
  description = "The S3 reports bucket ARN"
  value       = aws_s3_bucket.reports.arn
}

output "ui_bucket_id" {
  description = "The S3 UI bucket name"
  value       = aws_s3_bucket.ui.id
}

output "ui_bucket_arn" {
  description = "The S3 UI bucket ARN"
  value       = aws_s3_bucket.ui.arn
}

output "ui_bucket_regional_domain_name" {
  description = "The regional domain name of S3 UI bucket"
  value       = aws_s3_bucket.ui.bucket_regional_domain_name
}

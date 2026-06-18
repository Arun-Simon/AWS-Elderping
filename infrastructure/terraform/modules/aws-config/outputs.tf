output "recorder_arn" {
  description = "The Config recorder Name/ID"
  value       = aws_config_configuration_recorder.main.id
}

output "config_bucket_name" {
  description = "The S3 bucket name of Config rules audits"
  value       = aws_s3_bucket.config.id
}

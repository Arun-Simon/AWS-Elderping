output "db_endpoint" {
  description = "The database endpoint URL"
  value       = aws_db_instance.main.endpoint
}

output "db_username" {
  description = "The database root master username"
  value       = aws_db_instance.main.username
}

output "db_host" {
  description = "The database server network address host"
  value       = aws_db_instance.main.address
}

output "kms_key_arn" {
  description = "The ARN of the KMS key used for RDS encryption"
  value       = aws_kms_key.rds.arn
}


output "log_group_name" {
  description = "The name of the app logs CloudWatch group"
  value       = aws_cloudwatch_log_group.app_logs.name
}

output "log_group_arn" {
  description = "The ARN of the app logs CloudWatch group"
  value       = aws_cloudwatch_log_group.app_logs.arn
}

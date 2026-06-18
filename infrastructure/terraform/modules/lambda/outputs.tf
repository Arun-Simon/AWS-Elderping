output "lambda_arn" {
  description = "The Lambda function ARN"
  value       = aws_lambda_function.reports_trigger.arn
}

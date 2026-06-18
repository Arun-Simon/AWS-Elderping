output "user_pool_id" {
  description = "The Cognito User Pool ID"
  value       = aws_cognito_user_pool.pool.id
}

output "user_pool_client_id" {
  description = "The Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.client.id
}

output "user_pool_arn" {
  description = "The Cognito User Pool ARN"
  value       = aws_cognito_user_pool.pool.arn
}

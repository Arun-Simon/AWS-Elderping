output "s3_endpoint_id" {
  description = "The S3 Gateway Endpoint ID"
  value       = aws_vpc_endpoint.s3.id
}

output "secrets_endpoint_id" {
  description = "The Secrets Manager Endpoint ID"
  value       = aws_vpc_endpoint.secretsmanager.id
}

output "logs_endpoint_id" {
  description = "The CloudWatch Logs Endpoint ID"
  value       = aws_vpc_endpoint.logs.id
}

output "sts_endpoint_id" {
  description = "The STS Endpoint ID"
  value       = aws_vpc_endpoint.sts.id
}

output "ecr_api_endpoint_id" {
  description = "The ECR API Endpoint ID"
  value       = aws_vpc_endpoint.ecr_api.id
}

output "ecr_dkr_endpoint_id" {
  description = "The ECR DKR Endpoint ID"
  value       = aws_vpc_endpoint.ecr_dkr.id
}

output "ssm_endpoint_id" {
  description = "The SSM Endpoint ID"
  value       = aws_vpc_endpoint.ssm.id
}

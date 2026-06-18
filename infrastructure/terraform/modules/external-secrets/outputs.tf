output "eso_role_arn" {
  description = "The IAM role ARN for External Secrets Operator"
  value       = aws_iam_role.eso.arn
}



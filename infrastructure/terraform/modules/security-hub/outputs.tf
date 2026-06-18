output "security_hub_id" {
  description = "The account ID for Security Hub"
  value       = aws_securityhub_account.main.id
}

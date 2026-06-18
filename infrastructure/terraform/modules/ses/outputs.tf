output "domain_identity_arn" {
  description = "The ARN of the SES domain identity"
  value       = aws_ses_domain_identity.domain.arn
}

output "verification_token" {
  description = "Verification token needed for TXT record creation at GoDaddy"
  value       = aws_ses_domain_identity.domain.verification_token
}

output "dkim_tokens" {
  description = "List of DKIM tokens to generate CNAME records at GoDaddy"
  value       = aws_ses_domain_dkim.dkim.dkim_tokens
}

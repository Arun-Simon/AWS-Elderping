variable "domain_name" {
  type        = string
  description = "The primary domain name for SES verification"
  default     = "elderping.online"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

variable "route53_zone_id" {
  type        = string
  description = "The Route 53 Hosted Zone ID for domain verification"
}

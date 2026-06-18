variable "domain_name" {
  type        = string
  description = "The primary domain name"
  default     = "elderping.online"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

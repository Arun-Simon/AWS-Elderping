variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

variable "log_retention_days" {
  type        = number
  description = "Retention period for CloudWatch logs in days"
  default     = 90
}


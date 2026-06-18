variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

variable "limit_amount" {
  type        = string
  description = "Monthly cost budget limit in USD"
  default     = "500"
}

variable "subscriber_email" {
  type        = string
  description = "Subscriber email for notifications"
  default     = "alerts@elderping.online"
}

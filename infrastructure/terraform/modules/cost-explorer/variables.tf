variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

variable "subscriber_email" {
  type        = string
  description = "Subscriber email for alerts"
  default     = "alerts@elderping.online"
}

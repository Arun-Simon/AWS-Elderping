# Variables declarations
variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "db_password" {
  type      = string
  sensitive = true
  default   = "SuperSecurePassword123!"
}

variable "domain_name" {
  type        = string
  description = "The primary domain name for route53 zone"
  default     = "elderping.online"
}

variable "kubernetes_version" {
  type        = string
  description = "Kubernetes Version for EKS cluster"
  default     = "1.31"
}

variable "log_retention_days" {
  type        = number
  description = "Retention period for CloudWatch logs in days"
  default     = 90
}


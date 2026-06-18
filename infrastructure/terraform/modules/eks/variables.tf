variable "vpc_id" {
  type        = string
  description = "VPC ID where EKS will be launched"
}

variable "private_subnets" {
  type        = list(string)
  description = "List of private subnets for EKS worker nodes"
}

variable "environment" {
  type        = string
  description = "Deployment environment (e.g. dev, staging, prod)"
  default     = "dev"
}

variable "kubernetes_version" {
  type        = string
  description = "Target Kubernetes version for EKS cluster"
  default     = "1.31"
}

variable "log_retention_days" {
  type        = number
  description = "Retention period for CloudWatch logs in days"
  default     = 90
}


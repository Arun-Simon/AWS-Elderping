variable "vpc_id" {
  type        = string
  description = "VPC ID where the ALB will be placed"
}

variable "public_subnets" {
  type        = list(string)
  description = "List of public subnets to place the ALB"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

variable "certificate_arn" {
  type        = string
  description = "ACM Certificate ARN for the HTTPS listener"
}


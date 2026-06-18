variable "vpc_id" {
  type        = string
  description = "VPC ID where Lambda attaches"
}

variable "private_subnets" {
  type        = list(string)
  description = "Private Subnets for VPC attachment"
}

variable "eventbridge_rule_arn" {
  type        = string
  description = "The EventBridge rule ARN"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

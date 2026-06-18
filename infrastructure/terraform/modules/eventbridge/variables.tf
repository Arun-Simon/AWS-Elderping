variable "lambda_arn" {
  type        = string
  description = "The target Lambda ARN to execute report routines"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

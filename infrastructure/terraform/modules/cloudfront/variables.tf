variable "s3_bucket_domain_name" {
  type        = string
  description = "The S3 bucket domain name of ui-service content"
  default     = "elderpinq-ui-dev.s3.amazonaws.com"
}

variable "s3_bucket_id" {
  type        = string
  description = "S3 bucket ID of ui-service content"
  default     = "elderpinq-ui-dev"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

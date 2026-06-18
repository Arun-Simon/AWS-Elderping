variable "vpc_id" {
  type        = string
  description = "VPC ID where RDS security group is placed"
}

variable "private_subnets" {
  type        = list(string)
  description = "List of private subnets for RDS subnet group"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

variable "db_password" {
  type        = string
  description = "Root password for the database master user"
  sensitive   = true
}

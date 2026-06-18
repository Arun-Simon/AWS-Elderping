variable "vpc_id" {
  type        = string
  description = "VPC ID where endpoints will be placed"
}

variable "private_subnets" {
  type        = list(string)
  description = "List of private subnets to attach interface endpoints"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

variable "route_table_ids" {
  type        = list(string)
  description = "List of route table IDs to associate with gateway endpoints"
}


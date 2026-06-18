variable "eks_cluster_name" {
  type        = string
  description = "The name of the EKS Cluster"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

variable "eks_cluster_name" {
  type        = string
  description = "The name of the EKS Cluster"
}

variable "oidc_provider_arn" {
  type        = string
  description = "OIDC Provider ARN for IRSA mappings"
}

variable "oidc_provider_url" {
  type        = string
  description = "OIDC Provider URL for IRSA mappings"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

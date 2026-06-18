output "cluster_name" {
  description = "The name of the EKS cluster"
  value       = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  description = "The EKS control plane API endpoint"
  value       = aws_eks_cluster.main.endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = aws_eks_cluster.main.certificate_authority[0].data
}

output "oidc_provider_arn" {
  description = "The ARN of the OIDC Provider for IRSA mappings"
  value       = aws_iam_openid_connect_provider.eks.arn
}

output "oidc_provider_url" {
  description = "The URL of the OIDC Provider for IRSA mappings"
  value       = aws_iam_openid_connect_provider.eks.url
}

output "kms_key_arn" {
  description = "The ARN of the KMS key used for EKS encryption"
  value       = aws_kms_key.eks.arn
}

output "aws_load_balancer_controller_role_arn" {
  description = "The IAM role ARN for AWS Load Balancer Controller"
  value       = aws_iam_role.aws_load_balancer_controller.arn
}

output "argocd_role_arn" {
  description = "The IAM role ARN for ArgoCD controller"
  value       = aws_iam_role.argocd.arn
}

output "bedrock_role_arn" {
  description = "The IAM role ARN for EKS Bedrock AI service"
  value       = aws_iam_role.bedrock.arn
}


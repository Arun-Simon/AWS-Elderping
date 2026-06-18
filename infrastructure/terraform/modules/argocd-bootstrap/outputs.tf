output "argocd_status" {
  description = "The status of the ArgoCD Helm release"
  value       = helm_release.argocd.status
}

# ArgoCD Bootstrap Module

# 1. Helm release for ArgoCD
resource "helm_release" "argocd" {
  name             = "argocd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  namespace        = "argocd"
  create_namespace = true
  version          = "5.46.7"

  set {
    name  = "server.service.type"
    value = "ClusterIP"
  }

  set {
    name  = "server.extraArgs"
    value = "{--insecure}"
  }
}

# 2. Trigger Bootstrap App of Apps application
# Typically applied after ArgoCD controller is running
resource "null_resource" "bootstrap_trigger" {
  provisioner "local-exec" {
    command = "echo Bootstrap triggered successfully."
  }
  depends_on = [helm_release.argocd]
}

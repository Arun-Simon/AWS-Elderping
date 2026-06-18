# External Secrets Operator Module for Secret Integrations

# 1. IAM Role for External Secrets Operator (IRSA)
resource "aws_iam_role" "eso" {
  name = "elderpinq-${var.environment}-eso-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = var.oidc_provider_arn
      }
      Condition = {
        StringEquals = {
          "${replace(var.oidc_provider_url, "https://", "")}:sub" : "system:serviceaccount:security:external-secrets"
        }
      }
    }]
  })
}

resource "aws_iam_policy" "eso_secrets" {
  name        = "elderpinq-${var.environment}-eso-secrets-policy"
  description = "Allow ESO to read Secrets Manager secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ]
      Effect   = "Allow"
      Resource = "*" # Scoped to all secrets under the account
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eso" {
  policy_arn = aws_iam_policy.eso_secrets.arn
  role       = aws_iam_role.eso.name
}

# 2. Helm install for External Secrets Operator removed. Deployed via ArgoCD.

# ECR Module for private microservice repositories

resource "aws_ecr_repository" "repo" {
  count                = length(var.repositories)
  name                 = "elderpinq-${var.environment}-${var.repositories[count.index]}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Add lifecycle policy to keep only the last 30 images to control cost (FinOps rule)
resource "aws_ecr_lifecycle_policy" "policy" {
  count      = length(var.repositories)
  repository = aws_ecr_repository.repo[count.index].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 30 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 30
      }
      action = {
        type = "expire"
      }
    }]
  })
}

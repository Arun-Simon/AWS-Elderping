output "repository_urls" {
  description = "Map of microservices to ECR repository URLs"
  value       = { for idx, repo in aws_ecr_repository.repo : var.repositories[idx] => repo.repository_url }
}

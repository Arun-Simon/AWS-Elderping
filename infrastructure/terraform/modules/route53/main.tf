# Route 53 Module for elderping.online

resource "aws_route53_zone" "primary" {
  name = var.domain_name

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

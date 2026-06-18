output "cloudfront_domain_name" {
  description = "The domain name of the CloudFront CDN distribution"
  value       = aws_cloudfront_distribution.cdn.domain_name
}

output "cloudfront_hosted_zone_id" {
  description = "The Route 53 zone ID for CloudFront distribution"
  value       = aws_cloudfront_distribution.cdn.hosted_zone_id
}

output "cloudfront_arn" {
  description = "The ARN of the CloudFront distribution"
  value       = aws_cloudfront_distribution.cdn.arn
}

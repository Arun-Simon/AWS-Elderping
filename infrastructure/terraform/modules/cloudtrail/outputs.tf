output "trail_arn" {
  description = "The CloudTrail ARN"
  value       = aws_cloudtrail.global.arn
}

output "trail_bucket_name" {
  description = "The S3 bucket name of CloudTrail logs"
  value       = aws_s3_bucket.trail_bucket.id
}

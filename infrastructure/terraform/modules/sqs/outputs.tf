output "queue_url" {
  description = "The SQS queue URL"
  value       = aws_sqs_queue.notifications.url
}

output "queue_arn" {
  description = "The SQS queue ARN"
  value       = aws_sqs_queue.notifications.arn
}

output "dlq_arn" {
  description = "The dead letter SQS queue ARN"
  value       = aws_sqs_queue.dlq.arn
}

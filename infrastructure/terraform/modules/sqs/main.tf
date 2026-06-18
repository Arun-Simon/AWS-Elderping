# SQS Module for event processing queues

resource "aws_sqs_queue" "dlq" {
  name                      = "elderpinq-${var.environment}-notifications-dlq"
  message_retention_seconds = 1209600 # 14 days
  kms_master_key_id         = "alias/aws/sqs"
}

resource "aws_sqs_queue" "notifications" {
  name                      = "elderpinq-${var.environment}-notifications-queue"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 345600 # 4 days
  receive_wait_time_seconds = 20     # Long polling
  kms_master_key_id         = "alias/aws/sqs"

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

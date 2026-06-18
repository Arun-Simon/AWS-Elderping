# SNS Module for alerts dispatching

resource "aws_sns_topic" "alerts" {
  name              = "elderpinq-${var.environment}-alerts-topic"
  kms_master_key_id = "alias/aws/sns" # Default AWS managed KMS key for encryption

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

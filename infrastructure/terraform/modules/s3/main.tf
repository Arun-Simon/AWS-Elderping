# S3 Module for Health Reports

resource "aws_kms_key" "s3_key" {
  description             = "KMS Key for ElderPinq S3 Reports Bucket"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = {
    Name        = "elderpinq-${var.environment}-s3-kms"
    Environment = var.environment
  }
}

resource "aws_s3_bucket" "reports" {
  bucket        = "elderpinq-${var.environment}-reports-bucket"
  force_destroy = var.environment == "prod" ? false : true

  tags = {
    Name        = "elderpinq-${var.environment}-reports-bucket"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.s3_key.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket = aws_s3_bucket.reports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 Bucket for UI Static Hosting
resource "aws_s3_bucket" "ui" {
  bucket        = "elderpinq-${var.environment}-ui"
  force_destroy = var.environment == "prod" ? false : true

  tags = {
    Name        = "elderpinq-${var.environment}-ui"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "ui" {
  bucket = aws_s3_bucket.ui.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

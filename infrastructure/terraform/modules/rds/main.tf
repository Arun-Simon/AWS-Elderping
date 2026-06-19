# RDS Module

resource "aws_db_subnet_group" "main" {
  name       = "elderpinq-${var.environment}-db-subnet-group"
  subnet_ids = var.private_subnets

  tags = {
    Name = "elderpinq-${var.environment}-db-subnet-group"
  }
}

resource "aws_security_group" "db" {
  name        = "elderpinq-${var.environment}-db-sg"
  description = "Allow DB connection from within EKS"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"] # Restricted to VPC IP CIDR
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "elderpinq-${var.environment}-db-sg"
  }
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "rds_kms" {
  statement {
    sid    = "Enable IAM User Permissions"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    actions   = ["kms:*"]
    resources = ["*"]
  }
}

resource "aws_kms_key" "rds" {
  description             = "KMS Key for RDS storage encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.rds_kms.json

  tags = {
    Name        = "elderpinq-${var.environment}-rds-kms"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "rds" {
  name          = "alias/elderpinq-${var.environment}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

resource "aws_db_instance" "main" {
  identifier             = "elderpinq-${var.environment}-db"
  allocated_storage      = 20
  max_allocated_storage  = 100
  db_name                = "postgres" # Initial DB, schemas created later
  engine                 = "postgres"
  engine_version         = "15.18"
  instance_class         = "db.t3.micro"
  username               = "elderpinq_admin"
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  skip_final_snapshot    = true
  multi_az               = var.environment == "prod" ? true : false
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.rds.arn

  tags = {
    Name        = "elderpinq-${var.environment}-db"
    Environment = var.environment
  }
}


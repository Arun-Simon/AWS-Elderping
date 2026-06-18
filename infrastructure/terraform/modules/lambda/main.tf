# Lambda Module for report compilation triggers

resource "aws_security_group" "lambda" {
  name        = "elderpinq-${var.environment}-lambda-sg"
  description = "Lambda execution security group"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "elderpinq-${var.environment}-lambda-sg"
  }
}

resource "aws_iam_role" "lambda" {
  name = "elderpinq-${var.environment}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.lambda.name
}

# Dummy deployment package zip for compilation execution template
data "archive_file" "dummy" {
  type        = "zip"
  output_path = "${path.module}/dummy_lambda.zip"

  source {
    content  = "exports.handler = async (event) => { console.log('Weekly report batch trigger invocation successful.'); return { status: 'triggered' }; };"
    filename = "index.js"
  }
}

resource "aws_lambda_function" "reports_trigger" {
  filename         = data.archive_file.dummy.output_path
  function_name    = "elderpinq-${var.environment}-reports-trigger"
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.dummy.output_base64sha256
  runtime          = "nodejs18.x"
  timeout          = 30

  vpc_config {
    subnet_ids         = var.private_subnets
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      REPORT_SERVICE_URL = "http://report-service.healthcare.svc.cluster.local:3000/reports/generate"
    }
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.reports_trigger.function_name
  principal     = "events.amazonaws.com"
  source_arn    = var.eventbridge_rule_arn
}

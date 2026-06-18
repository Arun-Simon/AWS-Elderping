# EventBridge Module for cron scheduling

resource "aws_cloudwatch_event_rule" "weekly_trigger" {
  name                = "elderpinq-${var.environment}-weekly-reports"
  description         = "Trigger weekly health report compiler at 10 PM on Sundays"
  schedule_expression = "cron(0 22 ? * SUN *)"

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.weekly_trigger.name
  target_id = "weekly_reports_lambda"
  arn       = var.lambda_arn
}

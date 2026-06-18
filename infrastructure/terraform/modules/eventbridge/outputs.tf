output "rule_arn" {
  description = "The EventBridge rule ARN"
  value       = aws_cloudwatch_event_rule.weekly_trigger.arn
}

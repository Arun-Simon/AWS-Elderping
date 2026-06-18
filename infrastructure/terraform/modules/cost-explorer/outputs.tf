output "monitor_arn" {
  description = "The cost anomaly monitor ARN"
  value       = aws_ce_anomaly_monitor.monitor.arn
}

output "subscription_arn" {
  description = "The cost anomaly subscription ARN"
  value       = aws_ce_anomaly_subscription.subscription.arn
}

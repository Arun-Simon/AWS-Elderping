# Cost Explorer Module (Cost anomaly monitors)

resource "aws_ce_anomaly_monitor" "monitor" {
  name              = "elderpinq-${var.environment}-cost-anomaly-monitor"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_ce_anomaly_subscription" "subscription" {
  name      = "elderpinq-${var.environment}-cost-anomaly-subscription"
  frequency = "DAILY"
  monitor_arn_list = [
    aws_ce_anomaly_monitor.monitor.arn
  ]

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = ["50"]
    }
  }

  subscriber {
    address = var.subscriber_email
    type    = "EMAIL"
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

output "budget_arn" {
  description = "The budget ARN"
  value       = aws_budgets_budget.monthly.arn
}

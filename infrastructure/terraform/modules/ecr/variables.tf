variable "repositories" {
  type        = list(string)
  description = "List of repository names to create"
  default = [
    "ui-service",
    "auth-service",
    "health-service",
    "reminder-service",
    "alert-service",
    "appointment-service",
    "notes-service",
    "ai-service",
    "report-service",
    "notification-service",
    "audit-service",
    "finops-service"
  ]
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"
}

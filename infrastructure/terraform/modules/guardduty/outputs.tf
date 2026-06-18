output "guardduty_detector_id" {
  description = "The GuardDuty Detector ID"
  value       = aws_guardduty_detector.main.id
}

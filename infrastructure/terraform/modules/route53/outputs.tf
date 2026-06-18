output "zone_id" {
  description = "The Route 53 Hosted Zone ID"
  value       = aws_route53_zone.primary.zone_id
}

output "name_servers" {
  description = "List of Hosted Zone Nameservers to delegate at registrar (GoDaddy)"
  value       = aws_route53_zone.primary.name_servers
}

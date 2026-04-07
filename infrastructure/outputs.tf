output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.family_tree.name
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.http_api.api_endpoint
}

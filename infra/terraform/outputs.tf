output "agents_table" {
  value = aws_dynamodb_table.agents.name
}

output "requests_table" {
  value = aws_dynamodb_table.requests.name
}

output "connections_table" {
  value = aws_dynamodb_table.connections.name
}

output "config_table" {
  value = aws_dynamodb_table.config.name
}

output "state_machine_arn" {
  value = var.create_sfn ? aws_sfn_state_machine.routing[0].arn : local.state_machine_arn
}

output "notifications_topic_arn" {
  value = aws_sns_topic.notifications.arn
}

output "pii_key_id" {
  value = aws_kms_key.pii.key_id
}

output "lambda_function_names" {
  value = { for k, fn in aws_lambda_function.fn : k => fn.function_name }
}

output "http_api_endpoint" {
  value = var.create_apigw ? aws_apigatewayv2_stage.http[0].invoke_url : "(local: http://localhost:3000)"
}

output "ws_api_endpoint" {
  value = var.create_apigw ? aws_apigatewayv2_stage.ws[0].invoke_url : "(local: ws://localhost:3001)"
}

output "cognito_user_pool_id" {
  value = var.create_cognito ? aws_cognito_user_pool.main[0].id : ""
}

output "cognito_client_id" {
  value = var.create_cognito ? aws_cognito_user_pool_client.web[0].id : ""
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

# HTTP API for the REST surface. Locally the api-server emulates these routes
# against the same handler code; this stack provisions the authentic AWS path
# (gated by create_apigw because apigatewayv2 is a LocalStack Pro feature).
resource "aws_apigatewayv2_api" "http" {
  count         = var.create_apigw ? 1 : 0
  name          = "${var.name_prefix}-http"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["content-type", "authorization", "x-ran-role", "x-ran-npn"]
  }
}

locals {
  http_routes = {
    "POST /requests"                   = "consumerCreate"
    "GET /requests/{id}"               = "consumerGet"
    "POST /agent/requests/{id}/accept" = "agentAccept"
    "POST /agent/requests/{id}/reject" = "agentReject"
    "POST /agent/requests/{id}/status" = "agentUpdateStatus"
    "GET /agent/profile"               = "agentProfileGet"
    "PUT /agent/profile"               = "agentProfileUpdate"
    "POST /agent/status"               = "agentSetStatus"
    "POST /agent/today-availability"   = "agentTodayAvailability"
    "POST /agent/out-of-office"        = "agentOutOfOffice"
    "GET /agent/missed-referrals"      = "agentMissedReferrals"
    "GET /agent/stats"                 = "agentStats"
    "GET /agent/history"               = "agentHistory"
    "DELETE /agent/messages/{msgId}"   = "agentDismissMessage"
    "GET /admin/metrics"               = "adminMetrics"
    "GET /admin/requests"              = "adminRequests"
    "GET /admin/config"                = "adminConfigGet"
    "PUT /admin/config"                = "adminConfigUpdate"
    "GET /admin/agent/{npn}"           = "adminGetAgent"
    "POST /admin/agent/{npn}/notify"   = "adminNotifyAgent"
  }

  # Routes requiring a logged-in agent/admin (Cognito JWT). Consumer routes are public.
  protected_routes = toset([
    "POST /agent/requests/{id}/accept",
    "POST /agent/requests/{id}/reject",
    "POST /agent/requests/{id}/status",
    "GET /agent/profile",
    "PUT /agent/profile",
    "POST /agent/status",
    "POST /agent/today-availability",
    "POST /agent/out-of-office",
    "GET /agent/missed-referrals",
    "GET /agent/stats",
    "GET /agent/history",
    "GET /admin/metrics",
    "GET /admin/requests",
    "GET /admin/config",
    "PUT /admin/config",
    "GET /admin/agent/{npn}",
    "POST /admin/agent/{npn}/notify",
  ])

  http_routes_eff = var.create_apigw ? local.http_routes : {}
}

resource "aws_apigatewayv2_integration" "http" {
  for_each               = local.http_routes_eff
  api_id                 = aws_apigatewayv2_api.http[0].id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.fn[each.value].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  count            = var.create_apigw && var.create_cognito ? 1 : 0
  api_id           = aws_apigatewayv2_api.http[0].id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.name_prefix}-cognito"
  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web[0].id]
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.main[0].id}"
  }
}

resource "aws_apigatewayv2_route" "http" {
  for_each  = local.http_routes_eff
  api_id    = aws_apigatewayv2_api.http[0].id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.http[each.key].id}"

  authorization_type = var.create_cognito && contains(local.protected_routes, each.key) ? "JWT" : "NONE"
  authorizer_id      = var.create_cognito && contains(local.protected_routes, each.key) ? aws_apigatewayv2_authorizer.jwt[0].id : null
}

resource "aws_apigatewayv2_stage" "http" {
  count       = var.create_apigw ? 1 : 0
  api_id      = aws_apigatewayv2_api.http[0].id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "http" {
  for_each      = local.http_routes_eff
  statement_id  = "AllowHttp-${replace(each.key, "/[^a-zA-Z0-9]+/", "-")}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn[each.value].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http[0].execution_arn}/*/*"
}

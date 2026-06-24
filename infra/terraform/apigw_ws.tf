# WebSocket API for real-time push to consumer/agent/admin clients. Locally the
# ws-bridge emulates this; here is the authentic AWS GovCloud path (gated by
# create_apigw because apigatewayv2 is a LocalStack Pro feature).
resource "aws_apigatewayv2_api" "ws" {
  count                      = var.create_apigw ? 1 : 0
  name                       = "${var.name_prefix}-ws"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

locals {
  ws_routes = {
    "$connect"    = "wsConnect"
    "$disconnect" = "wsDisconnect"
    "$default"    = "wsDefault"
  }
  ws_routes_eff = var.create_apigw ? local.ws_routes : {}
}

resource "aws_apigatewayv2_integration" "ws" {
  for_each         = local.ws_routes_eff
  api_id           = aws_apigatewayv2_api.ws[0].id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.fn[each.value].invoke_arn
}

resource "aws_apigatewayv2_route" "ws" {
  for_each  = local.ws_routes_eff
  api_id    = aws_apigatewayv2_api.ws[0].id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.ws[each.key].id}"
}

resource "aws_apigatewayv2_stage" "ws" {
  count       = var.create_apigw ? 1 : 0
  api_id      = aws_apigatewayv2_api.ws[0].id
  name        = "prod"
  auto_deploy = true
}

resource "aws_lambda_permission" "ws" {
  for_each      = local.ws_routes_eff
  statement_id  = "AllowWs-${replace(each.key, "/[^a-zA-Z0-9]+/", "-")}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn[each.value].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws[0].execution_arn}/*/*"
}

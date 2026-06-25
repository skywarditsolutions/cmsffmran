data "aws_caller_identity" "current" {}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend/dist"
  output_path = "${path.module}/build/lambda.zip"
}

locals {
  state_machine_name = "${var.name_prefix}-routing"

  # Built as a string (not a resource reference) to avoid a dependency cycle:
  # the state machine references the match/notify Lambdas, while these Lambdas
  # need the state machine ARN to start/callback executions.
  state_machine_arn = "arn:aws:states:${var.region}:${data.aws_caller_identity.current.account_id}:stateMachine:${local.state_machine_name}"

  common_env = merge(
    {
      AGENTS_TABLE               = aws_dynamodb_table.agents.name
      REQUESTS_TABLE             = aws_dynamodb_table.requests.name
      CONNECTIONS_TABLE          = aws_dynamodb_table.connections.name
      CONFIG_TABLE               = aws_dynamodb_table.config.name
      PII_KEY_ID                 = aws_kms_key.pii.key_id
      NOTIFICATIONS_TOPIC        = aws_sns_topic.notifications.arn
      SES_SENDER                 = aws_ses_email_identity.sender.email
      STATE_MACHINE_ARN          = local.state_machine_arn
      ROUTING_TIMEOUT_SECONDS    = tostring(var.routing_timeout_seconds)
      SAFETY_NET_TIMEOUT_SECONDS = tostring(var.safety_net_timeout_seconds)
      MAX_ROUTING_ATTEMPTS       = tostring(var.max_routing_attempts)
    },
    # Local (LocalStack): point SDKs at the emulator and the ws-bridge.
    # Real AWS: no endpoint override; WS_CALLBACK_URL is the API Gateway
    # WebSocket stage URL used by the @connections API.
    var.environment == "local" ? {
      WS_CALLBACK_URL       = "http://host.docker.internal:3002"
      AWS_ENDPOINT_OVERRIDE = "http://host.docker.internal:4566"
    } : {
      # The @connections Management API requires an https:// endpoint, but
      # the WebSocket stage invoke_url is wss://. Convert the protocol.
      WS_CALLBACK_URL = var.create_apigw ? replace(aws_apigatewayv2_stage.ws[0].invoke_url, "wss://", "https://") : ""
    },
  )

  functions = {
    consumerCreate    = { handler = "index.consumerCreate" }
    consumerGet       = { handler = "index.consumerGet" }
    agentAccept       = { handler = "index.agentAccept" }
    agentReject       = { handler = "index.agentReject" }
    agentUpdateStatus = { handler = "index.agentUpdateStatus" }
    agentProfileGet   = { handler = "index.agentProfileGet" }
    agentProfileUpdate = { handler = "index.agentProfileUpdate" }
    agentSetStatus    = { handler = "index.agentSetStatus" }
    agentTodayAvailability = { handler = "index.agentTodayAvailability" }
    agentOutOfOffice   = { handler = "index.agentOutOfOffice" }
    agentMissedReferrals = { handler = "index.agentMissedReferrals" }
    agentStats        = { handler = "index.agentStats" }
    agentHistory      = { handler = "index.agentHistory" }
    agentDismissMessage = { handler = "index.agentDismissMessage" }
    adminMetrics      = { handler = "index.adminMetrics" }
    adminRequests     = { handler = "index.adminRequests" }
    adminConfigGet    = { handler = "index.adminConfigGet" }
    adminConfigUpdate = { handler = "index.adminConfigUpdate" }
    adminGetAgent    = { handler = "index.adminGetAgent" }
    adminNotifyAgent = { handler = "index.adminNotifyAgent" }
    wsConnect         = { handler = "index.wsConnect" }
    wsDisconnect      = { handler = "index.wsDisconnect" }
    wsDefault         = { handler = "index.wsDefault" }
    sfnMatch          = { handler = "index.sfnMatch" }
    sfnNotify         = { handler = "index.sfnNotify" }
    sfnSafetyNet      = { handler = "index.sfnSafetyNet" }
    sfnSafetyNetTimeout = { handler = "index.sfnSafetyNetTimeout" }
  }
}

resource "aws_lambda_function" "fn" {
  for_each = local.functions

  function_name    = "${var.name_prefix}-${each.key}"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs20.x"
  handler          = each.value.handler
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = local.common_env
  }
}

# AgentsBrokers: profile + licensure + availability + live load.
resource "aws_dynamodb_table" "agents" {
  name         = "${var.name_prefix}-agents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "npn"

  attribute {
    name = "npn"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.pii.arn
  }
}

# Requests: consumer referral lifecycle. Consumer PII stored encrypted.
resource "aws_dynamodb_table" "requests" {
  name         = "${var.name_prefix}-requests"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "requestId"

  attribute {
    name = "requestId"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "byStatus"
    hash_key        = "status"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.pii.arn
  }
}

# WebSocket connection registry: connectionId -> role/requestId/npn.
resource "aws_dynamodb_table" "connections" {
  name         = "${var.name_prefix}-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }

  attribute {
    name = "channel"
    type = "S"
  }

  # Look up all connections subscribed to a channel (a requestId, an agent npn,
  # or the "admin" broadcast channel) for targeted real-time push.
  global_secondary_index {
    name            = "byChannel"
    hash_key        = "channel"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

# Admin-editable runtime configuration (timer, business rules).
resource "aws_dynamodb_table" "config" {
  name         = "${var.name_prefix}-config"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "configKey"

  attribute {
    name = "configKey"
    type = "S"
  }
}

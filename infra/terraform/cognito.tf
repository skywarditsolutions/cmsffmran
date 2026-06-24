# Cognito is created by Terraform for real AWS/GovCloud (create_cognito = true).
# Locally we use the `cognito-local` emulator (provisioned by the bootstrap
# script) because Cognito is a Pro feature in LocalStack. See docs/aws-mapping.md.
resource "aws_cognito_user_pool" "main" {
  count = var.create_cognito ? 1 : 0
  name  = "${var.name_prefix}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = true
    invite_message_template {
      email_subject = "Your RAN account"
      email_message = "Your username is {username} and temporary password is {####}."
      sms_message   = "Your username is {username} and temporary password is {####}."
    }
  }

  schema {
    name                = "npn"
    attribute_data_type = "String"
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 20
    }
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }
}

resource "aws_cognito_user_group" "agents" {
  count        = var.create_cognito ? 1 : 0
  name         = "agents"
  user_pool_id = aws_cognito_user_pool.main[0].id
  description  = "Marketplace-registered agents and brokers"
}

resource "aws_cognito_user_group" "admins" {
  count        = var.create_cognito ? 1 : 0
  name         = "admins"
  user_pool_id = aws_cognito_user_pool.main[0].id
  description  = "CMS administrative users"
}

resource "aws_cognito_user_pool_client" "web" {
  count                                = var.create_cognito ? 1 : 0
  name                                 = "${var.name_prefix}-web"
  user_pool_id                         = aws_cognito_user_pool.main[0].id
  explicit_auth_flows                  = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  allowed_oauth_flows_user_pool_client = false
  generate_secret                      = false

  # Token validity periods (values in hours for access/id, days for refresh).
  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
}

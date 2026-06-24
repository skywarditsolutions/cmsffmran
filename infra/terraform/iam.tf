data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name_prefix}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda_policy" {
  statement {
    sid    = "Logs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "Dynamo"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      aws_dynamodb_table.agents.arn,
      "${aws_dynamodb_table.agents.arn}/index/*",
      aws_dynamodb_table.requests.arn,
      "${aws_dynamodb_table.requests.arn}/index/*",
      aws_dynamodb_table.connections.arn,
      "${aws_dynamodb_table.connections.arn}/index/*",
      aws_dynamodb_table.config.arn,
    ]
  }

  statement {
    sid    = "Crypto"
    effect = "Allow"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [aws_kms_key.pii.arn]
  }

  statement {
    sid       = "Notify"
    effect    = "Allow"
    actions   = ["sns:Publish", "ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]
  }

  statement {
    sid    = "StepFns"
    effect = "Allow"
    actions = [
      "states:StartExecution",
      "states:SendTaskSuccess",
      "states:SendTaskFailure",
      "states:DescribeExecution",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "ApiGwManage"
    effect    = "Allow"
    actions   = ["execute-api:ManageConnections"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${var.name_prefix}-lambda-policy"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_policy.json
}

# Step Functions role.
data "aws_iam_policy_document" "sfn_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sfn" {
  name               = "${var.name_prefix}-sfn-role"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
}

data "aws_iam_policy_document" "sfn_policy" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "sfn" {
  name   = "${var.name_prefix}-sfn-policy"
  role   = aws_iam_role.sfn.id
  policy = data.aws_iam_policy_document.sfn_policy.json
}

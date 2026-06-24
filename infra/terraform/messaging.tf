# SNS topic stands in for the SMS notification channel. In GovCloud this would
# publish to phone numbers; locally LocalStack records the publish for the demo.
resource "aws_sns_topic" "notifications" {
  name = "${var.name_prefix}-agent-notifications"
}

# SES identity for email notifications to agents/brokers.
resource "aws_ses_email_identity" "sender" {
  email = "no-reply@ran.cms.gov.example"
}

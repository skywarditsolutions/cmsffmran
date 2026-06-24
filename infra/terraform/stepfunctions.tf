resource "aws_sfn_state_machine" "routing" {
  count    = var.create_sfn ? 1 : 0
  name     = local.state_machine_name
  role_arn = aws_iam_role.sfn.arn

  definition = templatefile("${path.module}/routing.asl.json.tftpl", {
    match_arn              = aws_lambda_function.fn["sfnMatch"].arn
    notify_arn             = aws_lambda_function.fn["sfnNotify"].arn
    safetynet_arn          = aws_lambda_function.fn["sfnSafetyNet"].arn
    safetynet_timeout_arn  = aws_lambda_function.fn["sfnSafetyNetTimeout"].arn
    timeout_seconds        = var.routing_timeout_seconds
    safetynet_timeout_seconds = var.safety_net_timeout_seconds
  })
}

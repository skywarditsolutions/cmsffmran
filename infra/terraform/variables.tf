variable "region" {
  description = "AWS region. Use us-gov-west-1 for GovCloud."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "local"
}

variable "name_prefix" {
  description = "Prefix applied to all resource names."
  type        = string
  default     = "ran"
}

variable "routing_timeout_seconds" {
  description = "Seconds an agent has to accept a referral before auto-reroute (15 min in prod; lowered for demos)."
  type        = number
  default     = 30
}

variable "safety_net_timeout_seconds" {
  description = "Seconds the after-hours safety-net broadcast stays open for a first-come accept (prod: until next business hours; lowered for demos)."
  type        = number
  default     = 120
}

variable "max_routing_attempts" {
  description = "Maximum agents to try before a request is queued."
  type        = number
  default     = 5
}

variable "lambda_zip_path" {
  description = "Path to the bundled backend Lambda artifact."
  type        = string
  default     = "../../backend/dist/lambda.zip"
}

variable "create_cognito" {
  description = "Whether to create Cognito resources via Terraform (true for real AWS; locally cognito-local is used instead)."
  type        = bool
  default     = false
}

variable "create_apigw" {
  description = "Whether to create API Gateway v2 (HTTP + WebSocket) resources. True for real AWS; locally the api-server + ws-bridge stand in (apigatewayv2 is a LocalStack Pro feature)."
  type        = bool
  default     = false
}

variable "create_sfn" {
  description = "Whether to create the Step Functions state machine via Terraform. True for real AWS; locally it is created via the AWS CLI because the provider's ValidateStateMachineDefinition call is unimplemented in community LocalStack."
  type        = bool
  default     = true
}

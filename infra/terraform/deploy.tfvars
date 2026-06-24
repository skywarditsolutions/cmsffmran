# Deployment to real AWS (us-east-2).
# Usage: terraform apply -var-file=deploy.tfvars
region                     = "us-east-2"
environment                = "dev"
routing_timeout_seconds    = 30
safety_net_timeout_seconds = 120
max_routing_attempts       = 5
create_cognito             = true
create_apigw               = true
create_sfn                 = true

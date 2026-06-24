#!/usr/bin/env bash
set -euo pipefail

# Creates the RAN routing Step Functions state machine in LocalStack via the AWS
# CLI. This path is used locally because the Terraform aws_sfn_state_machine
# resource triggers ValidateStateMachineDefinition, which community LocalStack
# does not implement. In real AWS, Terraform (create_sfn=true) handles this.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENDPOINT="http://localhost:4566"
ACCOUNT="000000000000"
REGION="us-east-1"
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION="$REGION"

TIMEOUT="${ROUTING_TIMEOUT_SECONDS:-30}"
SAFETYNET_TIMEOUT="${SAFETY_NET_TIMEOUT_SECONDS:-120}"
MATCH_ARN="arn:aws:lambda:${REGION}:${ACCOUNT}:function:ran-sfnMatch"
NOTIFY_ARN="arn:aws:lambda:${REGION}:${ACCOUNT}:function:ran-sfnNotify"
SAFETYNET_ARN="arn:aws:lambda:${REGION}:${ACCOUNT}:function:ran-sfnSafetyNet"
SAFETYNET_TIMEOUT_ARN="arn:aws:lambda:${REGION}:${ACCOUNT}:function:ran-sfnSafetyNetTimeout"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/ran-sfn-role"
NAME="ran-routing"

DEF=$(sed \
  -e "s|\${match_arn}|${MATCH_ARN}|g" \
  -e "s|\${notify_arn}|${NOTIFY_ARN}|g" \
  -e "s|\${safetynet_arn}|${SAFETYNET_ARN}|g" \
  -e "s|\${safetynet_timeout_arn}|${SAFETYNET_TIMEOUT_ARN}|g" \
  -e "s|\${timeout_seconds}|${TIMEOUT}|g" \
  -e "s|\${safetynet_timeout_seconds}|${SAFETYNET_TIMEOUT}|g" \
  "$ROOT/infra/terraform/routing.asl.json.tftpl")

SM_ARN="arn:aws:states:${REGION}:${ACCOUNT}:stateMachine:${NAME}"

if aws --endpoint-url "$ENDPOINT" stepfunctions describe-state-machine \
  --state-machine-arn "$SM_ARN" >/dev/null 2>&1; then
  echo "    state machine exists; updating definition"
  aws --endpoint-url "$ENDPOINT" stepfunctions update-state-machine \
    --state-machine-arn "$SM_ARN" \
    --definition "$DEF" --role-arn "$ROLE_ARN" >/dev/null
else
  aws --endpoint-url "$ENDPOINT" stepfunctions create-state-machine \
    --name "$NAME" --definition "$DEF" --role-arn "$ROLE_ARN" \
    --type STANDARD >/dev/null
  echo "    created state machine $SM_ARN"
fi

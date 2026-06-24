#!/usr/bin/env bash
set -euo pipefail

# Creates demo Cognito users (agent + admin) in a real AWS user pool.
# Usage: bash scripts/setup-cognito-aws.sh <pool_id> <client_id> <region>

POOL_ID="${1:?Usage: setup-cognito-aws.sh <pool_id> <client_id> <region>}"
CLIENT_ID="${2:?Usage: setup-cognito-aws.sh <pool_id> <client_id> <region>}"
REGION="${3:?Usage: setup-cognito-aws.sh <pool_id> <client_id> <region>}"

export AWS_DEFAULT_REGION="$REGION"

echo "    creating demo users in Cognito pool $POOL_ID..."

create_user() {
  local username="$1" group="$2" npn="$3" pass="$4"
  echo "    -> $username ($group)"

  # Create the user (suppressed email).
  aws cognito-idp admin-create-user \
    --user-pool-id "$POOL_ID" \
    --username "$username" \
    --user-attributes Name=email,Value="$username" Name=custom:npn,Value="$npn" \
    --message-action SUPPRESS \
    >/dev/null 2>&1 || true

  # Set a permanent password.
  aws cognito-idp admin-set-user-password \
    --user-pool-id "$POOL_ID" \
    --username "$username" \
    --password "$pass" \
    --permanent \
    >/dev/null

  # Add to group.
  aws cognito-idp admin-add-user-to-group \
    --user-pool-id "$POOL_ID" \
    --username "$username" \
    --group-name "$group" \
    >/dev/null

  echo "       OK"
}

create_user "agent@ran.demo" agents 70000000 "Agent#Demo123"
create_user "admin@ran.demo" admins  ""        "Admin#Demo123"

echo "    demo users ready:"
echo "      agent@ran.demo / Agent#Demo123  (NPN 70000000)"
echo "      admin@ran.demo / Admin#Demo123"

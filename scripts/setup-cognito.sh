#!/usr/bin/env bash
set -euo pipefail

# Provisions a Cognito user pool, app client, groups, and demo users against the
# cognito-local emulator. Emits frontend/.env.local with the pool/client ids.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COG="http://localhost:9229"
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1

aws() { command aws --endpoint-url "$COG" "$@"; }

echo "    creating user pool..."
POOL_ID=$(aws cognito-idp create-user-pool \
  --pool-name ran-users \
  --schema Name=npn,AttributeDataType=String,Mutable=true \
  --query 'UserPool.Id' --output text)

CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id "$POOL_ID" \
  --client-name ran-web \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --query 'UserPoolClient.ClientId' --output text)

for grp in agents admins; do
  aws cognito-idp create-group --group-name "$grp" --user-pool-id "$POOL_ID" >/dev/null
done

create_user() {
  local username="$1" group="$2" npn="$3" pass="$4"
  aws cognito-idp admin-create-user \
    --user-pool-id "$POOL_ID" --username "$username" \
    --user-attributes Name=email,Value="$username" Name=custom:npn,Value="$npn" \
    --message-action SUPPRESS >/dev/null
  aws cognito-idp admin-set-user-password \
    --user-pool-id "$POOL_ID" --username "$username" --password "$pass" --permanent >/dev/null
  aws cognito-idp admin-add-user-to-group \
    --user-pool-id "$POOL_ID" --username "$username" --group-name "$group" >/dev/null
}

# Demo agent maps to seeded NPN 70000000; demo admin has no NPN.
create_user "agent@ran.demo"  agents 70000000 "Agent#Demo123"
create_user "admin@ran.demo"  admins ""        "Admin#Demo123"

cat > "$ROOT/frontend/.env.local" <<EOF
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3001
VITE_COGNITO_URL=$COG
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
VITE_COGNITO_POOL_ID=$POOL_ID
EOF

echo "    cognito ready (pool=$POOL_ID client=$CLIENT_ID)"
echo "    demo users: agent@ran.demo / Agent#Demo123   admin@ran.demo / Admin#Demo123"

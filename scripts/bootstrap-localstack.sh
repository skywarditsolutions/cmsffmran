#!/usr/bin/env bash
set -euo pipefail

# Bootstraps the full RAN prototype against LocalStack:
#   1. start LocalStack + cognito-local
#   2. build + bundle the backend Lambdas
#   3. terraform apply (via tflocal) the AWS-native infrastructure
#   4. provision cognito-local users/groups
#   5. seed demo agents/brokers
#
# Prereqs: docker, node>=20, terraform, and tflocal (pip install terraform-local).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
ENDPOINT="http://localhost:4566"

echo "==> [1/5] Starting LocalStack + cognito-local"
docker compose up -d

echo "    waiting for LocalStack to be healthy..."
for i in $(seq 1 30); do
  if curl -sf "$ENDPOINT/_localstack/health" >/dev/null 2>&1; then
    echo "    LocalStack ready"
    break
  fi
  sleep 2
done

echo "==> [2/5] Building backend Lambda bundle"
npm install
npm run build:backend

echo "==> [3/5] Provisioning infrastructure (terraform via tflocal)"
if ! command -v tflocal >/dev/null 2>&1; then
  echo "ERROR: tflocal not found. Install with: pip install terraform-local" >&2
  exit 1
fi
pushd infra/terraform >/dev/null
tflocal init -upgrade
tflocal apply -auto-approve
popd >/dev/null

echo "    creating Step Functions state machine (local CLI path)"
chmod +x scripts/create-sfn-local.sh
bash scripts/create-sfn-local.sh

echo "==> [4/5] Provisioning cognito-local users"
bash scripts/setup-cognito.sh || echo "    (cognito setup skipped/failed - non-fatal for demo)"

echo "==> [5/5] Seeding demo agents/brokers"
npm run seed

echo ""
echo "Bootstrap complete. Start the runtime processes in separate terminals:"
echo "  npm run ws-bridge   --workspace backend   # real-time bridge"
echo "  npm run api         --workspace backend   # REST API (http://localhost:3000)"
echo "  npm run dev:frontend                      # UI (http://localhost:5173)"

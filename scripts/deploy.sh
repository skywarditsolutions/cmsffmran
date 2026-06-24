#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# RAN Deploy Script - provisions the full prototype to real AWS.
#
# Prereqs: AWS CLI configured (aws sts get-caller-identity works), Terraform >=1.5,
#          Node >=20. Region/vars come from infra/terraform/deploy.tfvars.
#
# Usage:   bash scripts/deploy.sh
# Teardown: bash scripts/deploy.sh destroy
# ============================================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
TF_DIR="$ROOT/infra/terraform"
TFVARS="$TF_DIR/deploy.tfvars"

# ---- 0. Preflight checks --------------------------------------------------
echo "==> [0/7] Preflight checks"

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "ERROR: AWS credentials not configured. Run 'aws configure' or set env vars." >&2
  exit 1
fi
echo "    AWS identity: $(aws sts get-caller-identity --query 'Account' --output text)"

if ! command -v terraform >/dev/null 2>&1; then
  echo "ERROR: terraform not found. Install from https://developer.hashicorp.com/terraform/install" >&2
  exit 1
fi
echo "    terraform: $(terraform version -json 2>/dev/null | jq -r '.terraform_version' 2>/dev/null || terraform version | head -1)"

REGION=$(grep '^region' "$TFVARS" | awk -F'"' '{print $2}')
echo "    target region: $REGION"

# ---- Handle destroy -------------------------------------------------------
if [[ "${1:-}" == "destroy" ]]; then
  echo "==> Destroying all AWS resources..."
  cd "$TF_DIR"
  terraform init
  terraform destroy -var-file="$TFVARS" -auto-approve
  echo "Done. All resources destroyed."
  exit 0
fi

# ---- 1. Build backend Lambda bundle ---------------------------------------
echo "==> [1/7] Building backend Lambda bundle"
npm install --silent
npm run build:backend

# ---- 2. Terraform apply (creates all AWS infra) ---------------------------
echo "==> [2/7] Provisioning AWS infrastructure via Terraform"
cd "$TF_DIR"
terraform init -upgrade
terraform apply -var-file="$TFVARS" -auto-approve

# ---- 3. Extract Terraform outputs -----------------------------------------
echo "==> [3/7] Extracting infrastructure outputs"
HTTP_API=$(terraform output -raw http_api_endpoint | sed 's:/*$::')
WS_API=$(terraform output -raw ws_api_endpoint | sed 's:/*$::')
COGNITO_POOL_ID=$(terraform output -raw cognito_user_pool_id)
COGNITO_CLIENT_ID=$(terraform output -raw cognito_client_id)
FRONTEND_BUCKET=$(terraform output -raw frontend_bucket_name)
CLOUDFRONT_URL=$(terraform output -raw cloudfront_url)
COGNITO_URL="https://cognito-idp.${REGION}.amazonaws.com"

echo "    HTTP API:       $HTTP_API"
echo "    WS API:         $WS_API"
echo "    Cognito URL:    $COGNITO_URL"
echo "    Cognito Pool:   $COGNITO_POOL_ID"
echo "    Cognito Client: $COGNITO_CLIENT_ID"
echo "    Frontend S3:    $FRONTEND_BUCKET"
echo "    CloudFront URL: $CLOUDFRONT_URL"

# ---- 4. Build frontend with real AWS endpoints ----------------------------
echo "==> [4/7] Building frontend with real AWS endpoints"
cd "$ROOT"
rm -rf frontend/dist
VITE_API_URL="$HTTP_API" \
VITE_WS_URL="$WS_API" \
VITE_COGNITO_URL="$COGNITO_URL" \
VITE_COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
VITE_COGNITO_POOL_ID="$COGNITO_POOL_ID" \
npm run build:frontend --silent

# ---- 5. Upload frontend to S3 ---------------------------------------------
echo "==> [5/7] Uploading frontend to S3 ($FRONTEND_BUCKET)"
aws s3 sync frontend/dist "s3://$FRONTEND_BUCKET" \
  --delete \
  --exclude "*.map" \
  --cache-control "public, max-age=300" \
  --metadata-directive REPLACE \
  >/dev/null

echo "    uploaded. Frontend will be live at $CLOUDFRONT_URL"
echo "    (CloudFront may take 1-2 min to propagate)"

# ---- 6. Create Cognito demo users -----------------------------------------
echo "==> [6/7] Creating Cognito demo users"
chmod +x scripts/setup-cognito-aws.sh
bash scripts/setup-cognito-aws.sh "$COGNITO_POOL_ID" "$COGNITO_CLIENT_ID" "$REGION"

# ---- 7. Seed DynamoDB with demo agents ------------------------------------
echo "==> [7/7] Seeding demo agents into DynamoDB"
# Explicitly clear the endpoint override so the seed script talks to real AWS.
export AWS_ENDPOINT_OVERRIDE=""
export AWS_DEFAULT_REGION="$REGION"
export AWS_REGION="$REGION"
npm run seed --workspace backend

# ---- Done -----------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Deployment complete!"
echo ""
echo "  App URL:   $CLOUDFRONT_URL"
echo ""
echo "  Demo credentials:"
echo "    Agent:  agent@ran.demo / Agent#Demo123  (NPN 70000000)"
echo "    Admin:  admin@ran.demo / Admin#Demo123"
echo ""
echo "  Teardown:  bash scripts/deploy.sh destroy"
echo "============================================================"

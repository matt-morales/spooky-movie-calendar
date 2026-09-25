#!/usr/bin/env bash
# One-time setup before the first `make infra`. Safe to re-run.
#   - checks you're logged in to Google Cloud
#   - creates the GCS bucket that holds Terraform state
#   - writes infra/backend.hcl and infra/terraform.tfvars
set -euo pipefail
cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null || { echo "Missing $1. $2"; exit 1; }; }
need gcloud "Install: brew install --cask google-cloud-sdk"
need terraform "Install: brew install terraform (or mise use terraform)"

PROJECT="${GCP_PROJECT:-nightsofhorror-50265}"
REGION="${GCP_REGION:-us-central1}"
BUCKET="${PROJECT}-tfstate"

gcloud auth application-default print-access-token >/dev/null 2>&1 || {
  echo "Log in first:  gcloud auth login && gcloud auth application-default login"
  exit 1
}
gcloud config set project "$PROJECT" >/dev/null

if [ "$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)')" != "True" ]; then
  echo "Billing isn't enabled on $PROJECT. Cloud Run's free tier still needs a billing account linked:"
  echo "  https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT"
  exit 1
fi

if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  echo "Creating Terraform state bucket gs://$BUCKET"
  gcloud services enable storage.googleapis.com
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access
  gcloud storage buckets update "gs://$BUCKET" --versioning
fi
echo "bucket = \"$BUCKET\"" > infra/backend.hcl

if [ ! -f infra/terraform.tfvars ]; then
  read -rp "Cloudflare account ID (dashboard → any domain → right sidebar): " CF_ACCOUNT
  cat > infra/terraform.tfvars <<TFVARS
cloudflare_account_id = "$CF_ACCOUNT"
gcp_project           = "$PROJECT"
gcp_region            = "$REGION"
# billing_account_id  = "XXXXXX-XXXXXX-XXXXXX"   # uncomment to enable the budget alert
TFVARS
fi

echo "Bootstrap done. Next: export CLOUDFLARE_API_TOKEN and NEON_API_KEY, then run: make infra"

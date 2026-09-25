#!/usr/bin/env bash
# Build the Go API image with ko (no Docker), push it to Artifact Registry and
# roll it out on Cloud Run. Same script locally and in GitHub Actions.
set -euo pipefail
export PATH="$HOME/google-cloud-sdk/bin:$PATH" # where Google's installer puts gcloud
cd "$(dirname "$0")/.."
set -a; source deploy.env; [ -f .secrets.env ] && source .secrets.env; set +a

gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet >/dev/null 2>&1
IMAGE=$(cd go && KO_DOCKER_REPO="$IMAGE_REPO" go tool ko build ./cmd/api --bare --image-label "org.opencontainers.image.revision=$(git rev-parse HEAD)")
echo "Built $IMAGE"

gcloud run deploy "$API_SERVICE" --image "$IMAGE" --region "$GCP_REGION" --project "$GCP_PROJECT" --quiet

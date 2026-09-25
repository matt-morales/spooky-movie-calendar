#!/usr/bin/env bash
# Upload poster images from assets/posters to the R2 bucket served at
# images.<domain>. Re-running overwrites files with the same name.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source deploy.env; [ -f .secrets.env ] && source .secrets.env; set +a
export CLOUDFLARE_ACCOUNT_ID

for f in assets/posters/*.jpg; do
  key="posters/$(basename "$f")"
  echo "→ $key"
  (cd ts && npx wrangler r2 object put "$R2_BUCKET/$key" --file "../$f" --remote \
    --content-type image/jpeg --cache-control "public, max-age=31536000")
done

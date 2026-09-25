#!/usr/bin/env bash
# Build the React app and upload it (plus the /api proxy function) to
# Cloudflare Pages. Needs CLOUDFLARE_API_TOKEN in the environment.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source deploy.env; [ -f .secrets.env ] && source .secrets.env; set +a
export CLOUDFLARE_ACCOUNT_ID

cd ts
npm run build -w @spooky/web
cd apps/web
npx wrangler pages deploy dist --project-name "$PAGES_PROJECT" --branch main --commit-dirty=true

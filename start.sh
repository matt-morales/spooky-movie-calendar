#!/usr/bin/env bash
# Start the whole app locally (Postgres + Go API + site). Same as `make dev`.
#   ./start.sh          dev server with hot reload
#   ./start.sh --prod   production build of the site (closer to the live site)
# The site is on http://localhost:3000 and is reachable from phones on your Wi-Fi.
set -euo pipefail
cd "$(dirname "$0")"

if [ "${1:-}" = "--prod" ]; then
  export SITE_MODE=prod
fi
exec ./scripts/dev.sh

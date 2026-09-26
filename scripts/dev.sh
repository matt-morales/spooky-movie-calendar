#!/usr/bin/env bash
# Run everything locally: Postgres (embedded, no Docker), the Go API and the
# Vite dev server with hot reload. Ctrl-C stops all three.
#   Site: http://localhost:3000   API: http://localhost:8080
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="postgres://postgres:postgres@localhost:5433/spooky?sslmode=disable"
export VISITOR_SECRET="dev-only-visitor-secret-0123456789abcdef"
export TURNSTILE_SECRET="1x0000000000000000000000000000000AA" # Cloudflare's always-pass test key
export SECURE_COOKIES=false
export IMAGES_BASE_URL=/images
export IMAGES_DIR="$PWD/assets"
export PORT=8080

[ -d ts/node_modules ] || (cd ts && npm ci)

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; wait 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd go && go run ./cmd/devdb) &
pids+=($!)
until (echo >/dev/tcp/localhost/5433) 2>/dev/null; do sleep 0.5; done

(cd go && go run ./cmd/api) &
pids+=($!)

if [ "${SITE_MODE:-}" = prod ]; then
  (cd ts && npm run build && npm run preview -w @spooky/web -- --port 3000 --host) &
else
  (cd ts && npm run dev) &
fi
pids+=($!)

wait

# One entry point for local work and CI. GitHub Actions runs these same targets.
#
#   make up             run Postgres + Go API + Vite in containers (http://localhost:3000)
#   make dev            same, without containers (embedded Postgres, go run, vite)
#   make test           all Go and TypeScript tests
#   make e2e            browser tests against the running site (after make up)
#   make generate       regenerate sqlc code after editing SQL
#   make infra          terraform apply (Cloudflare, GCP, Neon)
#   make deploy         deploy the API, then the site
#   make events         analytics report from production (REPORT=movies DAYS=30 YEAR=2025)
#
# One-time setup: ./scripts/bootstrap.sh (see README "First-time setup").

SHELL := /bin/bash
# Docker Desktop and the Google Cloud CLI installer may not add themselves to PATH.
export PATH := $(HOME)/.docker/bin:$(HOME)/google-cloud-sdk/bin:$(PATH)
TF := terraform -chdir=infra
# The GCP project, from the Terraform-generated deploy.env (not gcloud's default).
GCP_PROJECT := $(shell . ./deploy.env 2>/dev/null && echo $$GCP_PROJECT)

# Deploy credentials from the git-ignored .secrets.env, if present (CI sets
# them as environment variables instead).
-include .secrets.env
export CLOUDFLARE_API_TOKEN NEON_API_KEY

.PHONY: up down reset-db logs dev e2e test test-go test-ts lint lint-go lint-tf generate check-generated build \
        infra-init infra-plan infra infra-apply deploy deploy-api deploy-web \
        upload-posters import-firestore-ratings events

dev:
	./scripts/dev.sh

# Containerised alternative to `make dev` (needs Docker, OrbStack or Colima).
up:
	docker compose up --build --watch

down:
	docker compose down

logs:
	docker compose logs -f api

# Wipe the local database; migrations re-seed it on the next start.
reset-db:
	docker compose down -v

test: test-go test-ts

test-go:
	cd go && go vet ./... && go test ./...

test-ts:
	cd ts && npm run typecheck && npm test

# Browser tests (Playwright + your installed Chrome) against a running stack: run `make up` first.
e2e:
	cd ts/apps/web && npx playwright test

# CI runs each half in the job that has the tool installed.
lint: lint-go lint-tf

lint-go:
	cd go && test -z "$$(gofmt -l .)" || (gofmt -l . && exit 1)

lint-tf:
	$(TF) fmt -check -recursive

generate:
	cd go && go tool sqlc generate

# Fails if someone edited SQL without regenerating (used in CI).
check-generated:
	cd go && go tool sqlc diff

build:
	cd go && go build ./...
	cd ts && npm run build

infra-init:
	$(TF) init -backend-config=backend.hcl -input=false

infra-plan: infra-init
	$(TF) plan -input=false

infra infra-apply: infra-init
	$(TF) apply -input=false $(if $(CI),-auto-approve,)

deploy: deploy-api deploy-web

deploy-api:
	./scripts/deploy-api.sh

deploy-web:
	./scripts/deploy-web.sh

upload-posters:
	./scripts/upload-posters.sh

# One-off: copy the 2025 Firestore ratings into Neon (best effort, re-runnable).
import-firestore-ratings:
	cd go && FIRESTORE_TOKEN="$$(gcloud auth print-access-token)" \
	  DATABASE_URL="$$(gcloud secrets versions access latest --secret=api-database-url --project $(GCP_PROJECT))" \
	  go run ./cmd/import-firestore-ratings

# Analytics reports from production (read-only). Days and times are shown in
# this machine's time zone; the movies report covers this year's lineup.
#   make events                              full report: overview, per movie, per country (last 7 days)
#   make events REPORT=movies DAYS=30 YEAR=2025
# Reports: full summary types daily nights movies countries referrers latest
REPORT ?= full
DAYS ?= 7
EVENTS_TZ ?= $(or $(shell readlink /etc/localtime 2>/dev/null | sed -n 's|.*zoneinfo/||p'),UTC)
events:
	@cd go && DATABASE_URL="$$(gcloud secrets versions access latest --secret=api-database-url --project $(GCP_PROJECT))" \
	  go run ./cmd/events -days $(DAYS) -tz $(EVENTS_TZ) $(if $(YEAR),-year $(YEAR)) $(REPORT)

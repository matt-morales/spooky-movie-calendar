terraform {
  required_version = ">= 1.9"

  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.25" }
    google     = { source = "hashicorp/google", version = "~> 8.4" }
    neon       = { source = "kislerdm/neon", version = "~> 0.18" }
    random     = { source = "hashicorp/random", version = "~> 3.9" }
    local      = { source = "hashicorp/local", version = "~> 2.9" }
  }

  # State lives in a GCS bucket created by scripts/bootstrap.sh.
  # `make infra-init` passes the bucket name from backend.hcl.
  backend "gcs" {
    prefix = "spooky-movie-calendar"
  }
}

# Credentials come from the environment, never from code:
#   CLOUDFLARE_API_TOKEN, NEON_API_KEY, and Google Application Default
#   Credentials (gcloud locally, Workload Identity Federation in CI).
provider "cloudflare" {}
provider "neon" {}

provider "google" {
  project = var.gcp_project
  region  = var.gcp_region
}

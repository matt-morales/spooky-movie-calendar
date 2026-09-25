# Google Cloud: the Go API on Cloud Run, its image in Artifact Registry,
# secrets in Secret Manager, and keyless GitHub Actions access (Workload
# Identity Federation). All within the always-free tier at this traffic.

locals {
  services = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "billingbudgets.googleapis.com",
  ]
  image_repo = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project}/${google_artifact_registry_repository.api.repository_id}"
}

resource "google_project_service" "enabled" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------------- Images

resource "google_artifact_registry_repository" "api" {
  repository_id = "api"
  format        = "DOCKER"
  location      = var.gcp_region

  # Stay under the 0.5 GB free storage: keep only recent images.
  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "604800s" # 7 days
    }
  }

  depends_on = [google_project_service.enabled]
}

# ---------------------------------------------------------------- Secrets

resource "random_password" "visitor_secret" {
  length  = 48
  special = false
}

locals {
  secrets = {
    database-url     = neon_project.db.connection_uri_pooler
    visitor-secret   = random_password.visitor_secret.result
    turnstile-secret = cloudflare_turnstile_widget.comments.secret
  }
}

resource "google_secret_manager_secret" "api" {
  for_each  = local.secrets
  secret_id = "api-${each.key}"
  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_version" "api" {
  for_each    = local.secrets
  secret      = google_secret_manager_secret.api[each.key].id
  secret_data = each.value
}

# ---------------------------------------------------------------- Cloud Run

resource "google_service_account" "api" {
  account_id   = "api-runtime"
  display_name = "Cloud Run runtime for the Go API"
}

resource "google_secret_manager_secret_iam_member" "api" {
  for_each  = local.secrets
  secret_id = google_secret_manager_secret.api[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "api"
  location = var.gcp_region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # Public API: no Google sign-in needed to call it.
  invoker_iam_disabled = true
  deletion_protection  = false

  template {
    # Scale to zero when idle; cap instances so a traffic spike (or abuse)
    # can't run up a bill. (Revision-level scaling: the service-level
    # `scaling` block failed on this project with an opaque internal error.)
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    service_account                  = google_service_account.api.email
    max_instance_request_concurrency = 80
    timeout                          = "30s"

    containers {
      # Placeholder for the first apply; `make deploy-api` ships real images.
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        cpu_idle          = true # only billed while handling requests
        startup_cpu_boost = true # faster cold starts
      }

      env {
        name  = "IMAGES_BASE_URL"
        value = "https://${local.images_domain}"
      }
      env {
        name  = "SECURE_COOKIES"
        value = "true"
      }
      dynamic "env" {
        for_each = {
          DATABASE_URL     = "database-url"
          VISITOR_SECRET   = "visitor-secret"
          TURNSTILE_SECRET = "turnstile-secret"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.api[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/api/healthz"
        }
        period_seconds    = 2
        failure_threshold = 15
      }
    }
  }

  lifecycle {
    # Deploys change the image; Terraform owns everything else.
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_project_service.enabled, google_secret_manager_secret_iam_member.api]
}

# ------------------------------------------------- GitHub Actions (keyless)

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  # Only this repository can use the pool.
  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "github-deployer"
  display_name = "GitHub Actions: terraform apply and deploys"
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# CI runs `terraform apply`, so it needs to manage everything in this file.
# This is broad; it's scoped to this single-purpose project.
resource "google_project_iam_member" "deployer" {
  for_each = toset([
    "roles/editor",
    "roles/resourcemanager.projectIamAdmin",
    "roles/secretmanager.admin",
    "roles/run.admin",
    "roles/iam.workloadIdentityPoolAdmin",
    "roles/iam.serviceAccountAdmin",
  ])
  project = var.gcp_project
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# ---------------------------------------------------------------- Budget

data "google_project" "this" {}

resource "google_billing_budget" "monthly" {
  count           = var.billing_account_id == "" ? 0 : 1
  billing_account = var.billing_account_id
  display_name    = "spooky-movie-calendar monthly"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }
  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_usd)
    }
  }
  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  depends_on = [google_project_service.enabled]
}

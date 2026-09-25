# Neon: serverless Postgres on the free plan (0.5 GB, scales to zero after
# 5 minutes idle). The Go API runs its own migrations on startup.

resource "neon_project" "db" {
  name       = "spooky-movie-calendar"
  region_id  = var.neon_region
  pg_version = 17

  # The free plan allows a restore window of up to 6 hours.
  history_retention_seconds = 21600

  branch {
    name          = "main"
    database_name = "spooky"
    role_name     = "spooky"
  }
}

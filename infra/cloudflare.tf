# Cloudflare: DNS, the React site (Pages), poster images (R2) and Turnstile.

data "cloudflare_zone" "site" {
  filter = { name = var.domain }
}

locals {
  zone_id       = data.cloudflare_zone.site.zone_id
  pages_project = "spooky-movie-calendar"
  images_domain = "images.${var.domain}"
}

# ---------------------------------------------------------------- Site (Pages)
# Terraform owns the project and its settings; `make deploy-web` uploads each
# build with wrangler. The Pages Function in ts/apps/web/functions proxies
# /api/* to Cloud Run using API_ORIGIN.

resource "cloudflare_pages_project" "site" {
  account_id        = var.cloudflare_account_id
  name              = local.pages_project
  production_branch = "main"

  deployment_configs = {
    production = {
      env_vars = {
        API_ORIGIN = { type = "plain_text", value = google_cloud_run_v2_service.api.uri }
      }
    }
    preview = {
      env_vars = {
        API_ORIGIN = { type = "plain_text", value = google_cloud_run_v2_service.api.uri }
      }
    }
  }
}

resource "cloudflare_pages_domain" "apex" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.site.name
  name         = var.domain
}

resource "cloudflare_pages_domain" "www" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.site.name
  name         = "www.${var.domain}"
}

# Cloudflare flattens a CNAME at the apex, so this works for the bare domain.
resource "cloudflare_dns_record" "apex" {
  zone_id = local.zone_id
  name    = var.domain
  type    = "CNAME"
  content = "${cloudflare_pages_project.site.name}.pages.dev"
  proxied = true
  ttl     = 1 # automatic
  comment = "Managed by Terraform: Cloudflare Pages"
}

resource "cloudflare_dns_record" "www" {
  zone_id = local.zone_id
  name    = "www.${var.domain}"
  type    = "CNAME"
  content = "${cloudflare_pages_project.site.name}.pages.dev"
  proxied = true
  ttl     = 1
  comment = "Managed by Terraform: Cloudflare Pages"
}

# -------------------------------------------------------------- Images (R2)
# Posters are uploaded by `make upload-posters` and served from
# images.<domain> through Cloudflare's cache. R2 has no egress fees.

resource "cloudflare_r2_bucket" "images" {
  account_id = var.cloudflare_account_id
  name       = "spooky-images"
  location   = "enam" # eastern North America
}

resource "cloudflare_r2_custom_domain" "images" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.images.name
  zone_id     = local.zone_id
  domain      = local.images_domain
  enabled     = true
  min_tls     = "1.2"
}

# ------------------------------------------------------ Turnstile (anti-spam)

resource "cloudflare_turnstile_widget" "comments" {
  account_id = var.cloudflare_account_id
  name       = "31 Nights comments"
  domains    = [var.domain, "www.${var.domain}", "${local.pages_project}.pages.dev"]
  mode       = "managed" # invisible unless Cloudflare is unsure
}

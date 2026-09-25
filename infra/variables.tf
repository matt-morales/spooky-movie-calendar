variable "domain" {
  description = "Apex domain, already a zone in Cloudflare."
  type        = string
  default     = "31nightsofhorror.com"
}

variable "cloudflare_account_id" {
  type = string
}

variable "gcp_project" {
  description = "GCP project ID (the existing Firebase project works)."
  type        = string
}

variable "gcp_region" {
  description = "Cloud Run region. us-central1 is in Cloud Run's cheapest pricing tier."
  type        = string
  default     = "us-central1"
}

variable "neon_region" {
  description = "Neon region, close to the Cloud Run region."
  type        = string
  default     = "aws-us-east-2"
}

variable "github_repository" {
  description = "owner/name of the repo allowed to deploy via GitHub Actions."
  type        = string
  default     = "matt-morales/spooky-movie-calendar"
}

variable "billing_account_id" {
  description = "GCP billing account for the budget alert. Leave empty to skip the alert."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Email alert threshold. Everything should stay in free tiers (~$0)."
  type        = number
  default     = 5
}

variable "neon_org_id" {
  description = "Neon organization that owns the project (needed with organization API keys)."
  type        = string
  default     = null
}

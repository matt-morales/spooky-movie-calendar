# Tasks

## Done: hosting, storage and database migration (September 2026)

The earlier tasks 1–3 are complete in code. The decisions and reasoning are in the [README](README.md#infrastructure-decisions).

- **Hosting:** the site is on Cloudflare Pages, the Go API on Cloud Run, the database is Neon Postgres, posters are on R2, and DNS is on Cloudflare. Everything is managed by Terraform, and CI/CD runs in GitHub Actions and locally through `make`.
- **Storage keys are year-safe:** movie IDs look like `2025-01`.
- **Access rules are enforced by the database and API:**
  - one rating per visitor per movie
  - rating values of 2/4/6/8/10 only
  - comment length limits
  - authors can delete only their own comments
  - a limit on comments per minute
- **Averages** come from a single SQL aggregate for the whole lineup (one request per page, not ~62).
- **The average display bug is fixed:** it now uses `(average / 2).toFixed(1)`.
- **Threaded comments UI** with Turnstile anti-spam and moderation (`api comment-status`).
- **Movies live in the database** (a migration seeds the 2025 lineup). The posters and `data/movies.js` are gone from the bundle.
- **Data fixes:** the "9thth" typo is gone (dates are ISO now). *Weapons* is now credited to Zach Cregger, with a matching description.
- **Analytics:** every site event is stored in Postgres.

## 1. Go live

- [x] Infrastructure created, posters uploaded, API and site deployed, DNS cut over from GitHub Pages (2026-09-26). Verified with the Playwright suite against https://31nightsofhorror.com.
- [ ] GitHub: add the `CLOUDFLARE_API_TOKEN` and `NEON_API_KEY` secrets, create the `production` environment, turn off GitHub Pages, then merge `migrate-to-cloudflare-gcp` so pushes to `main` deploy automatically.
- [ ] Post a real comment on the live site to confirm Turnstile works end to end (it can't be automated).
- [ ] Delete the empty Neon onboarding project (`31nightsofhorror`); Terraform's project is `spooky-movie-calendar`.
- [ ] Optional: remove the leftover GoDaddy `NS` records and the unused `_domainconnect` record in Cloudflare DNS.
- [ ] Look over the live site on a real phone ([docs/mobile-testing.md](docs/mobile-testing.md)). Automated desktop and phone-size browser tests pass.
- [ ] Run `make import-firestore-ratings`, then switch off Firestore and Auth in the Firebase project.
- [ ] Add `billing_account_id` to `infra/terraform.tfvars` to turn on the budget alert.

## 2. Content

- [ ] Check descriptions that look inaccurate: *Incantation*, *House of Psychotic Women* (the credited director is questionable) and *Friday the 13th: The Final Chapter*. Fix them with a new migration (`UPDATE movies ...`).
- [ ] Add release years and Letterboxd links (the `release_year` and `letterboxd_url` columns already exist).
- [ ] 2026 lineup:
  1. Add a `000003_movies_2026.up.sql` migration.
  2. Add the posters to `assets/posters`.
  3. Run `make upload-posters`.
  4. Set `VITE_LINEUP_YEAR=2026`.

  Some 2026 candidates' posters are already in `assets/posters`: *1408*, *Dawn of the Dead*, *Girl, Interrupted*, *Mama* and *The Blair Witch Project*.

## 3. Operations

- [ ] Nightly `pg_dump` from Neon to R2. Neon's free restore window is only 6 hours.
- [ ] A small moderation page behind Cloudflare Access, instead of the CLI.
- [ ] Saved SQL queries or a dashboard for the `events` table (visits per day, popular nights, ratings over time).
- [ ] Decide whether October traffic justifies `min_instance_count = 1` on Cloud Run, to remove cold starts for a few dollars a month.

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

- [ ] Check descriptions that look inaccurate: *Incantation*, *House of Psychotic Women* and *Friday the 13th: The Final Chapter*. Fix them with a new migration (`UPDATE movies ...`). (The wrong directors for *The Hills Have Eyes*, *House of Psychotic Women* and *Gonjiam* were fixed in `000003`.)
- [x] Release years and Letterboxd links for 2025 (`000003_letterboxd_links`). Each year's Letterboxd list URL is in the `lineups` table and returned as `lineup.letterboxdListUrl` by `GET /api/movies`.
- [ ] 2026 lineup:
  1. [x] `000004_movies_2026` seeds nights 1–26 from https://letterboxd.com/mattmo/list/31-nights-of-horror-2026/, with posters in `assets/posters/<letterboxd-slug>.jpg`.
  2. [ ] Add nights 27–31 once they're on the list (new migration + posters).
  3. [ ] Run `make upload-posters`.
  4. [ ] Frontend: read the list link from `lineup.letterboxdListUrl` instead of hard-coding it in `Sidebar.tsx`, and check how the calendar handles missing nights.
  5. [ ] Set `VITE_LINEUP_YEAR=2026`.

## 3. Operations

- [ ] Nightly `pg_dump` from Neon to R2. Neon's free restore window is only 6 hours.
- [ ] A small moderation page behind Cloudflare Access, instead of the CLI.
- [x] Analytics reports: `make events` prints the full report (unique visitors, overview, per movie, per country; automated traffic excluded); `REPORT=summary|visitors|returns|types|daily|nights|movies|countries|referrers|latest`, `DAYS=30`, `YEAR=2025`.
- [ ] A dashboard for the `events` table (charts over time), if the reports aren't enough.
- [ ] Decide whether October traffic justifies `min_instance_count = 1` on Cloud Run, to remove cold starts for a few dollars a month.

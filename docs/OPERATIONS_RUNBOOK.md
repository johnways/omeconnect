# OMECOnnect — Operations Runbook

How OMECOnnect is monitored, backed up, tested, costed and changed safely.

## 1. Monitoring (uptime)

| What | How |
|---|---|
| Automatic check every 30 minutes | GitHub Actions workflow **Uptime monitor** (`.github/workflows/uptime.yml`) checks the customer app page, version file, notification service worker, Android app link, APK download, database API and sign-in service |
| Alert | A failed check fails the workflow; GitHub emails the repository owner. Make sure GitHub → **Settings → Notifications → Actions** has failed-workflow emails on |
| Manual check | GitHub → **Actions → Uptime monitor → Run workflow** |
| App errors from phones | Staff console → **Security → App errors**; staff are alerted automatically when errors spike |
| Scheduled jobs | Supabase → **Integrations → Cron**: `omeconnect-bill-reminders` (daily 8:00 AM PH) and `omeconnect-nightly-backup` (daily 2:00 AM PH) |

> GitHub pauses scheduled workflows in a repository with no activity for 60 days; push any change or run it by hand to resume.

## 2. Backups and the monthly restore drill

**What is backed up:** every night, 15 tables (users, accounts, bills, payments, meter readings,
verification requests, concerns and their history, announcements, notifications, staff, audit
log, service areas, settings and the **electricity rate schedule**) to the private Storage
bucket `backups`, kept for 14 days. Staff can also press **Security → Backups → Back up now**.

**Restore drill — once a month (15 minutes):**
1. Supabase → **Storage → backups →** latest date folder → download `omeconnect-YYYY-MM-DD.json.gz`.
2. Run: `python tools/verify_backup.py omeconnect-YYYY-MM-DD.json.gz`
3. It must end with **"OK: the backup is complete and consistent."** Note the date and result in the table below.
4. Delete the downloaded file (it contains customer data).

| Date | Backup file | Result | By |
|---|---|---|---|
| 2026-11-26 | omeconnect-2026-11-26 (16.5 KB, 15 tables) | OK — `electricity_rates` and `notifications` added to the backup in this drill | Claude (IT consultant) |

**Full restore (disaster):** create a new Supabase project, run every file in
`backend/database/migrations/` in order (phase2 … latest), then load each table from the backup
JSON (parents first: users → customer_accounts → electricity_rates → bills → payments → …), point
`frontend/*/config.js` to the new project, rebuild (`python tools/build_deploy.py`) and push.
Supabase Pro also keeps its own daily backups (7 days) for one-click restore.

## 3. Automated tests

| Test | Where | Runs |
|---|---|---|
| Billing math equals the database's `compute_bill` to the centavo (0, 33, 100, 173, 188, 1,000 kWh), VAT-on-distribution, monthly charge, rounding | `tests/billing.test.mjs` | Every push (CI) |
| Statement barcode (Code 128 patterns, Code C/B, checksums) | `tests/statement.test.mjs` | Every push (CI) |
| Database rules: bill totals, customers cannot read others' bills, visitors are refused, unpublished announcements hidden | `tests/database_checks.sql` | By hand in Supabase → SQL Editor (all inside a rolled-back transaction) |
| Syntax, shared files, page references, element ids, build, no secrets in public site | `.github/workflows/checks.yml` | Every push (CI) |

Run the JavaScript tests locally: `node --test tests/*.test.mjs`

## 4. Cost plan

Prices are list prices as of 2026 — confirm on each provider's pricing page before budgeting.

| Service | Now (pilot) | At real OMECO scale | Notes |
|---|---|---|---|
| Supabase | Free | **Pro, about US$25/month** | Free tier: 500 MB database, 1 GB files, project pauses after a week without activity — not acceptable in production. Pro adds daily backups and no pausing |
| Vercel | Hobby (free) | **Pro, about US$20/month per member** | Hobby is for non-commercial use; a cooperative's production service should be on Pro |
| Google Play developer account | — | **US$25 one time** | For publishing the Android app |
| Domain name (e.g. omeconnect.ph) | — | about ₱1,500–₱3,000/year | Optional, more trustworthy than *.vercel.app |
| SMS codes (TextBee via an Android phone) | Phone load | Phone load / or an SMS provider | Free gateway app; cost is the SIM's texts |
| Email (Brevo) | Free | Free up to 300 emails/day | Paid plans if more |
| Online payments (PayMongo) | Off | Per-transaction fee | No monthly fee; fee per successful payment |
| AI assistant (Claude API) | Off | Usage-based | Small for short answers; set a monthly spending limit |

**Estimated production running cost:** roughly **US$45–70 per month** (Supabase Pro + Vercel Pro),
plus the one-time Play Store fee and per-use costs for payments, SMS and AI.

## 5. Staging environment (test before going live)

Never test risky changes on the live database. Recommended setup:

1. **Staging database:** create a second Supabase project (free) named `omeconnect-staging`; run all
   files in `backend/database/migrations/` in order; deploy the Edge Functions there.
2. **Staging website:** in Vercel, every branch and pull request already gets its own **Preview
   deployment** URL. Create a branch `staging` whose `frontend/*/config.js` points to the staging
   Supabase project.
3. **Flow:** change on a branch → test on its Preview URL with the staging database → merge to
   `main` → Vercel publishes the live site automatically.
4. Keep test accounts and demo data **only** in staging.

## 6. Releasing a change

1. Edit `frontend/` or `backend/`.
2. `python tools/build_deploy.py`
3. `node --test tests/*.test.mjs` (and the database checks if SQL changed)
4. Commit and push → CI checks run → Vercel deploys → the uptime monitor confirms.
5. Database changes: add a new `backend/database/migrations/phaseNN_*.sql`, apply it to staging
   first, then to live.

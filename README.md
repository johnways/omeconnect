# OMECOnnect

Customer app and admin dashboard for OMECO (Occidental Mindoro Electric Cooperative).

| Part | Folder |
|---|---|
| Sign-in chooser (Customer / Staff) | `index.html` |
| Customer app (bills, outages, concerns, AI assistant) | `customer-mobile-app/` |
| Admin dashboard (verification, customers, bills, announcements, complaints, reports) | `admin-dashboard/` |
| Database schema and migrations (Supabase / PostgreSQL) | `database/` |
| Supabase Edge Function | `supabase/functions/` |
| Architecture diagrams and setup guides | `docs/` |

Backend: **Supabase** (Auth with email + Google, PostgreSQL with Row Level Security).

## Live sites (Vercel) — customer and admin are SEPARATE
| Site | Vercel project | Root Directory | Address |
|---|---|---|---|
| Public customer app | `omeconnect` | `deploy` | https://omeconnect.vercel.app |
| Private admin dashboard | `omeco-staff-enwd3uiw` | `deploy-admin` | https://omeco-staff-enwd3uiw.vercel.app — **share only with OMECO staff** |

The public site contains **no admin files** (`/admin-dashboard` is 404 there) and never links to the admin site.
The admin site contains only the admin dashboard, is never indexed by search engines (`noindex`, `robots.txt Disallow: /`)
and is never cached. Admins must still sign in with an OMECO admin account; database rules (RLS) check admin rights
on every request.

After changing any app file:

```bash
python tools/build_deploy.py
git add -A
git commit -m "Describe the change"
git push
```

Vercel publishes **both** sites automatically after each push.

## Staff tools (admin console)

- **Two-step verification is required for staff.** The first admin sign-in shows a QR code to add to Google/Microsoft Authenticator; every later sign-in asks for the 6-digit code. The database refuses admin data without it (`is_omeco_admin()` requires `aal2`). Lost phone: in Supabase SQL run `delete from auth.mfa_factors where user_id = '<admin user id>';` and set it up again at the next sign-in.
- **Import bills from CSV** (Bills → Import many bills). Columns: `account_number, billing_month, due_date, total_amount, consumption_kwh`. The server checks every row first (preview), then saves only the valid rows; customers are notified.
- **Concern assignment and target times.** Each concern gets a target (power interruption 4 h, low voltage 24 h, payment 48 h, billing 72 h, new connection 5 days, other 72 h; change them in `complaint_sla_hours`). Tabs: Assigned to me, Unassigned, Overdue.
- **Customer list** loads in batches (no 1000-row limit) and shows 25/50/100 rows per page.

## Live updates and app updates
- **Data changes appear instantly** in the customer app and admin dashboard (Supabase Realtime,
  `live.js`; tables listed in `database/phase12_realtime.sql`). Each user only receives changes
  their database rules allow them to see. A 30–60 s check remains as a safety net.
- **New versions reach every user automatically**: the build writes `version.json`; open apps
  check it every 2 minutes and reload when reopened (or show "tap to refresh"). The Android app
  (APK) shows the live site, so it never needs re-downloading for normal updates.
- **Online-only**: nothing is stored for offline use; without internet the app shows a
  "No internet connection" notice and continues automatically when back online.
- **Phone pop-up notifications (Web Push)**: customers tap *Turn on notifications* (Home card or
  Profile). Every new row in `notifications` (announcements, bills, verification results, concern
  replies) is pushed to their phones by the `send-push` Edge Function
  (`database/phase13_push_notifications.sql`, `phase14_test_push.sql`). Keys live in Supabase
  Vault. Works in Chrome / Samsung Internet on Android and on iPhone after *Add to Home Screen*.
- Sign-ins renew themselves before the 1-hour limit, and survive an update reload (kept for the
  current tab/app session only).

## Run locally with Docker
```bash
docker compose up -d --build
```
Customer app: http://localhost:8080/ · Admin dashboard: http://localhost:8081/ (this computer only) — see `docs/DOCKER_SETUP.md`.

Without Docker (development): `python tools/serve_local.py customer` → http://localhost:5500 and
`python tools/serve_local.py admin` → http://localhost:5501 (both this computer only).

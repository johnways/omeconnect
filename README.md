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

## Live site (Vercel)
Vercel serves the **`deploy/`** folder (project setting *Root Directory = deploy*).
After changing any app file:

```bash
python tools/build_deploy.py
git add -A
git commit -m "Describe the change"
git push
```

Vercel publishes the new version automatically after each push.

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
Then open http://localhost:8080/ — see `docs/DOCKER_SETUP.md`.

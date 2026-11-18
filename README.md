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

## Run locally with Docker
```bash
docker compose up -d --build
```
Then open http://localhost:8080/ — see `docs/DOCKER_SETUP.md`.

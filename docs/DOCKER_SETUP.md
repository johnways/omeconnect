# OMECOnnect – Running the system in Docker (step by step)

## What is in Docker
| File | Purpose |
|---|---|
| `Dockerfile` | Builds a small, secure **nginx** web server image (runs as a non-root user) holding the chooser page, the customer app and the admin dashboard. |
| `nginx/default.conf.template` | Web server settings: port **8080**, security headers (only the app's own scripts run, pages may only talk to Supabase, no framing), admin pages hidden from search engines, hidden files blocked, `/healthz` health check. |
| `docker-compose.yml` | One command to build and start it, with automatic restart. |
| `.dockerignore` | Keeps `docs`, `database`, `supabase`, `tools`, notes and secrets **out** of the image. |

The **database, sign-in and Google login stay on Supabase** (cloud). Docker only serves the web pages,
so nothing about your data changes.

Already done by Claude:
- Supabase → Authentication → URL Configuration → Redirect URLs now include
  `http://localhost:8080/**` and `http://127.0.0.1:8080/**`, so Google sign-in and password-reset links
  return to the Docker site.
- **Tested for real on 18 Nov 2026** (Docker 29.9.3, image `omeconnect-web:1.0`, nginx 1.27.5):
  build succeeded, container **healthy**, runs as the non-root `nginx` user, nginx config test OK,
  all pages 200, `config.example.js` / hidden files 404, security headers present, served files
  identical to the project files, customer app loads service areas from Supabase and sign-in reaches
  Supabase, admin dashboard loads with no errors.
  Docker Desktop is installed on this PC, so you can skip Step 1.

---

## Step 1 – Install Docker Desktop (one time, ~15 min)
1. Open https://www.docker.com/products/docker-desktop/ → **Download for Windows – AMD64**.
2. Run `Docker Desktop Installer.exe`. Keep **"Use WSL 2 instead of Hyper-V"** ticked → **OK**.
3. When it finishes, click **Close and restart** (your PC restarts).
4. After restart Docker Desktop opens. Read and **Accept** the Docker Subscription Service Agreement
   (it is free for personal use, education and small organisations).
   You can **skip** signing in.
5. If it says **"WSL needs updating"**, open PowerShell **as Administrator** and run:
```bash
wsl --update
```
   then restart Docker Desktop.
6. Wait until the bottom-left of Docker Desktop shows **Engine running** (green).
7. Check in a normal PowerShell window:
```bash
docker --version
```
```bash
docker compose version
```
   Both should print a version number.

> If Docker says **virtualization is disabled**: restart the PC → enter BIOS (usually F2 or Del on ASUS)
> → enable **Intel Virtualization Technology / SVM Mode** → save and exit. (On this PC it is already on.)

---

## Step 2 – Build and start OMECOnnect (~2 min the first time)
In PowerShell:
```bash
cd C:\Users\Asus\Downloads\OMECOnnect_Mobile_Application
```
```bash
docker compose up -d --build
```
You should see `✔ Container omeconnect-web  Started`.

---

## Step 3 – Check it works
1. Status – after ~15 seconds it should say **(healthy)**:
```bash
docker compose ps
```
2. Open http://localhost:8080/ → the **Customer / OMECO Staff** chooser appears.
3. Customer app: sign in with email, or **Continue with Google** – you should come back to
   `localhost:8080` signed in.
4. Admin dashboard: http://localhost:8080/admin-dashboard/index.html → sign in with the admin account.
5. Health check: http://localhost:8080/healthz shows `ok`.
6. Security headers (optional):
```bash
curl.exe -I http://localhost:8080/
```
   should list `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.

---

## Everyday commands
| What | Command |
|---|---|
| Start (after a PC restart Docker starts it automatically if Docker Desktop is running) | `docker compose up -d` |
| Stop | `docker compose down` |
| See logs | `docker compose logs -f` (Ctrl+C to leave) |
| **After changing any app file** – rebuild | `docker compose up -d --build` |
| Remove old unused images | `docker image prune -f` |

---

## Optional – open it from phones on the same Wi-Fi
1. Find your PC's IP: `ipconfig` → **IPv4 Address** (e.g. `192.168.1.20`).
2. Windows may ask to allow Docker through the firewall – choose **Private networks** → **Allow**.
3. On the phone open `http://192.168.1.20:8080/`.
4. For Google sign-in / reset links from phones, add `http://192.168.1.20:8080/**` to
   Supabase → Authentication → URL Configuration → Redirect URLs.
   *(Google login on a plain `http` IP may be refused by Google; email sign-in works. For real use, put
   it online with HTTPS – see `NEXT_STEPS_FOR_YOU.md` step 4.)*

---

## Troubleshooting
| Problem | Fix |
|---|---|
| `docker: command not found` | Docker Desktop is not running or not installed – open it and wait for **Engine running**. |
| `port is already allocated` / `bind: address already in use` | Something else uses 8080. In `docker-compose.yml` change `"8080:8080"` to `"8081:8080"`, run `docker compose up -d`, open http://localhost:8081/ and add `http://localhost:8081/**` to Supabase Redirect URLs. |
| `error during connect … pipe/dockerDesktopLinuxEngine` | Docker Desktop is still starting – wait a minute and retry. |
| Status shows **(unhealthy)** | Run `docker compose logs` and look for `emerg` lines; send them to Claude. |
| Page loads but sign-in does nothing | Make sure you open it at `localhost:8080` (in Redirect URLs). Press Ctrl+F5 to reload without cache. |
| Old version still shows after an edit | You forgot `--build`: run `docker compose up -d --build`, then Ctrl+F5. |
| Using a different Supabase project | Change `SUPABASE_URL` in `docker-compose.yml` **and** `supabaseUrl` in both `config.js` files, then rebuild. |

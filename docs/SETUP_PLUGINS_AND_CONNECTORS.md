# OMECOnnect – Plugins, Connectors & Tools Setup Guide

Your project uses: **Supabase** (database + auth, used now), **Flutter** (the planned mobile app),
**Firebase Cloud Messaging** (planned push notifications), **XAMPP** (local testing only) and
plain HTML/JS for the current prototypes.

| # | What | Type | Priority | Needed for |
|---|------|------|----------|------------|
| 1 | Supabase | Claude connector | **Required now** | Lets Claude create tables, run your SQL and check RLS in your Supabase project |
| 2 | supabase | Claude plugin | **Required now** | Supabase + Postgres best-practice skills (RLS, auth) |
| 3 | frontend-design | Claude plugin | Recommended | Polishing the HTML customer app and admin dashboard |
| 4 | Dart and Flutter | Claude plugin | When you start Flutter | Flutter/Dart skills + Dart MCP server |
| 5 | firebase | Claude plugin | Phase 4 | Push notifications (FCM) |
| 6 | Supabase CLI | Computer tool | Recommended | Migrations, local Supabase |
| 7 | Firebase CLI | Computer tool | Phase 4 | FCM / hosting |
| 8 | Flutter SDK + Android Studio | Computer tool | When you start Flutter | Building the real mobile app |

Already installed on your PC: Node.js 25, npm, Git, Python 3.14, VS Code, XAMPP (C:\xampp).

---

## PART A – Claude plugins (claude.ai)

### Option 1: Use the card in the Claude chat
1. In the Claude desktop app, scroll to the plugin card Claude showed you
   ("For your OMECOnnect project").
2. Click **Install** (or **Add**) next to **supabase**.
3. Do the same for **frontend-design**. Later, add **Dart and Flutter** and **firebase**.
4. Start a **new session** so the plugins load.

### Option 2: Install from the website
1. Open https://claude.ai and sign in.
2. Click your profile picture/name in the bottom-left → **Settings**.
3. Open **Plugins** (it may be under **Customize** or **Capabilities** → **Plugins**).
4. Click **Browse plugins** to open the **Anthropic Directory**.
5. Search **supabase**. Pick the one by **Supabase**, labeled "Official Supabase plugin for Claude Code".
   Click it and choose **Install / Enable**.
6. Repeat the search for **frontend-design** (by Anthropic).
7. When you start Flutter, also install **Dart and Flutter** (by Dart and Flutter / flutter).
8. For Phase 4, install **firebase** (by Google).
9. Close and reopen the Claude desktop app, or start a new Code session.
10. Check: ask Claude "what plugins do I have?" It should list them.

---

## PART B – Supabase connector (lets Claude reach your database)

1. First create a Supabase account and project if you don't have one:
   1. Go to https://supabase.com → **Start your project** → sign up (GitHub or email).
   2. Click **New project**, choose an organization, name it `omeconnect`.
   3. Set a strong **database password** and save it in a password manager.
   4. Region: **Southeast Asia (Singapore)**, the closest to the Philippines.
   5. Click **Create new project** and wait about 2 minutes.
2. Connect it to Claude:
   1. In the Claude chat, click **Connect** on the **Supabase** connector card.
      Or go to claude.ai → **Settings** → **Connectors** → **Browse connectors**, search **Supabase**, then click **Connect**.
   2. A Supabase page opens. Sign in, choose your organization, and click **Authorize**.
   3. Back in Claude, Supabase should show **Connected**.
   4. In the Code tab, check that the connector is turned on for the session
      (the connectors / tools menu next to the message box).
3. Check: ask Claude "list my Supabase projects". You should see `omeconnect`.

> Safety: the connector acts with your account's full rights. Use a **development** project
> (not one holding real customer data) until RLS is verified, per your own docs.

---

## PART C – Developer tools on your computer

Open **PowerShell** (Start menu → type `PowerShell` → Enter) for these commands.

### C1. Firebase CLI (Claude installed this for you; to check)
```bash
firebase --version
```
If it says "not recognized", reinstall:
```bash
npm install -g firebase-tools
```
Then log in. A browser window opens; sign in with your Google account:
```bash
firebase login
```

### C2. Supabase CLI
Supabase does **not** support `npm install -g supabase`. On Windows, use Scoop:
1. Install Scoop. Run these two lines in PowerShell, one at a time:
```bash
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
```bash
irm get.scoop.sh | iex
```
2. Add the Supabase bucket and install:
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
```
```bash
scoop install supabase
```
3. Check and log in:
```bash
supabase --version
```
```bash
supabase login
```
4. Link your project folder. Your project ref is the `xxxx` part of `https://xxxx.supabase.co`:
```bash
cd C:\Users\Asus\Downloads\OMECOnnect_Mobile_Application
```
```bash
supabase init
```
```bash
supabase link --project-ref YOUR_PROJECT_REF
```
(Without Scoop, you can run any command as `npx supabase <command>` instead.)

### C3. Apply your database (do this once)
1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste all of `backend/database/schema/supabase_schema.sql` → **Run**.
3. New query → paste `backend/database/migrations/phase2_supabase_auth_and_access.sql` → **Run**.
4. New query → paste `backend/database/migrations/phase3_function_privileges.sql` → **Run** (stops the
   internal functions from being called over the public API).

> ✅ Steps 1–4 and the config.js step were already done by Claude on 2026-11-17 for the
> project `Omeconnect_Mobile_Appllication`. Only repeat them for a new project.
4. Go to **Project Settings → API**. Copy the **Project URL** and the **publishable/anon** key
   (**never** the service_role key) into `frontend/customer-mobile-app/config.js` and
   `frontend/admin-dashboard/config.js`, and set `demoMode: false`.
5. **Authentication → Providers → Email**: turn it on. Set the redirect URLs under **URL Configuration**.

### C4. Flutter SDK (only when you start the real mobile app)
1. Install Git. You already have it.
2. Download the Flutter SDK for Windows from https://docs.flutter.dev/get-started/install/windows
   and extract it to `C:\src\flutter`. Do **not** put it in Program Files.
3. Add it to PATH: Start → type `environment variables` → **Edit the system environment
   variables** → **Environment Variables…** → under *User variables* select **Path** →
   **Edit** → **New** → `C:\src\flutter\bin` → OK, OK, OK.
4. Install **Android Studio** from https://developer.android.com/studio. Run it once, then go to
   **More Actions → SDK Manager**. Install the latest Android SDK, **Command-line Tools** and **Build-Tools**.
5. Close and reopen PowerShell, then run:
```bash
flutter doctor
```
```bash
flutter doctor --android-licenses
```
   Accept each license by typing `y`. Fix anything `flutter doctor` marks with ✗.
6. In VS Code: Extensions (Ctrl+Shift+X) → install **Flutter**. Dart installs with it.

### C5. Useful VS Code extensions (optional)
In VS Code press Ctrl+Shift+X and search for:
- To preview the apps, use `python tools/serve_local.py customer` (http://localhost:5500) and
  `python tools/serve_local.py admin` (http://localhost:5501). They put the shared files
  (frontend/shared/) and the app files together, exactly like the live site.
- **Supabase** (Supabase): browse tables and run SQL.
- **PostgreSQL** (Microsoft): optional SQL editing.

---

## PART D – Final checklist
- [ ] supabase plugin installed
- [ ] frontend-design plugin installed
- [ ] Supabase connector shows **Connected**
- [ ] Supabase project created; both SQL files ran without errors
- [ ] config.js files filled with URL + anon key (never service_role)
- [ ] `firebase --version` works (Phase 4)
- [ ] `supabase --version` works
- [ ] (Later) `flutter doctor` shows all green; Dart and Flutter plugin installed

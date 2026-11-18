# OMECOnnect – Improvements only you can do (step by step)

These need your own accounts, passwords or payment, so Claude could not do them.
Do them in this order. Each one has a time estimate.

---

## 1. Reliable emails with Brevo (free) – ⭐ most important, ~20 min
**Why:** password-reset emails (and any confirmation emails) are sent by Supabase's built-in
mailer, which only sends **a few emails per hour** and often lands in spam. With many customers,
"Forgot password?" will stop working. Brevo's free plan sends ~300 emails/day.

1. Go to https://www.brevo.com → **Sign up free** → verify your email.
2. Left menu **Senders, Domains & Dedicated IPs → Senders → Add a sender**:
   name `OMECOnnect`, email = an address you can open (e.g. your Gmail) → **Save** → open the
   verification email Brevo sends and click the link.
   *(Better, if OMECO has a website domain: **Domains → Add a domain** and add the DNS records.)*
3. Top-right menu → **SMTP & API** → tab **SMTP**:
   - note **SMTP server** `smtp-relay.brevo.com`, **Port** `587`, and your **Login** (looks like `xxxx@smtp-brevo.com`).
   - click **Generate a new SMTP key** → name `supabase` → copy the key (**secret**, don't share it).
4. Supabase → your project → **Authentication → Emails → SMTP Settings** → turn on **Enable custom SMTP**:
   - Sender email: the sender from step 2. Sender name: `OMECOnnect`.
   - Host `smtp-relay.brevo.com` · Port `587` · Username: the Brevo **Login** · Password: the **SMTP key**.
   - **Save**.
5. Supabase → **Authentication → Rate Limits** → *Rate limit for sending emails* → `100` per hour → **Save**.
6. Test: in the app, **Forgot password?** → your email → open the email → you should land on
   **"Set a new password"**.

---

## 2. Switch off the unused SMS setup – ~3 min
**Why:** mobile OTP was removed from the app; the old SMS settings are unused.

1. Supabase → **Authentication → Hooks** → *Send SMS hook* → **⋮ / Delete** (or switch it off) → confirm.
2. Supabase → **Authentication → Sign In / Providers → Phone** → switch **Enable Phone provider** off → **Save**.
3. Supabase → **Edge Functions → send-sms-textbee** → **⋮ → Delete** (optional; it does nothing now).

---

## 3. Change the secrets that were posted in chat – ~10 min
**Why:** anything typed in a chat is stored in its history.

**a) Your admin password**
1. Supabase → **Authentication → Users** → find `gonzalespangks07@gmail.com` → **⋮ → Send password recovery**
   (after step 1, the email arrives reliably), **or** sign in to the app and use **Forgot password?**.
2. Choose a new password: 12+ characters, mixing words, numbers and symbols. Keep it in a password manager.

**b) The Google client secret**
1. https://console.cloud.google.com → project **OMECOnnect** → **Google Auth Platform → Clients → OMECOnnect Supabase**.
2. **Add secret** → copy the new secret.
3. Supabase → **Authentication → Sign In / Providers → Google** → paste it in **Client Secret** → **Save**.
4. Back in Google Cloud → delete the **old** secret.
5. Test **Continue with Google** in the app.

---

## 4. Put the system online so others can use it (free) – ~30 min
**Why:** right now it only works on your computer (`localhost`). Online, customers and staff can open it from any phone or PC.

Using **Netlify** (free, drag-and-drop):
0. **Build the upload folder** (Claude set this up): in PowerShell in the project folder run
```bash
python tools/build_deploy.py
```
   This creates a `deploy` folder with **only** the app (chooser page, customer app, admin
   dashboard) plus security headers. It leaves out `docs`, `database`, `supabase` and `tools`,
   so your internal notes, admin email and SQL are **not** published. Run it again after every change.
1. Go to https://app.netlify.com → sign up (free).
2. **Add new site → Deploy manually** → drag the **`deploy`** folder (not the whole project) onto the page.
3. Netlify gives you an address like `https://omeconnect-xyz.netlify.app`. Optional:
   **Site settings → Change site name** → e.g. `omeconnect` → `https://omeconnect.netlify.app`.
4. Tell Supabase the new address: **Authentication → URL Configuration**:
   - **Site URL**: `https://YOUR-SITE.netlify.app/customer-mobile-app/index.html`
   - **Redirect URLs → Add URL**: `https://YOUR-SITE.netlify.app/**`
5. Tell Google: Google Cloud → **Clients → OMECOnnect Supabase → Authorized JavaScript origins → Add URI**:
   `https://YOUR-SITE.netlify.app` → **Save**.
6. Google Cloud → **Google Auth Platform → Audience → Publish app** (so any Google account can sign
   in, not only test users). Basic email/profile access needs no Google review.
7. Open `https://YOUR-SITE.netlify.app/` → you should see the Customer / Staff chooser.
8. Every time the code changes: run `python tools/build_deploy.py` again, then on Netlify open your
   site → **Deploys** → drag the new `deploy` folder onto the drop area.
9. Check the security headers are active: open https://securityheaders.com and enter your site
   address. You should get a good grade (Content-Security-Policy, X-Frame-Options, etc. present).

> The anon key in `config.js` is meant to be public; the database rules (RLS) protect the data.
> **Never** put the `service_role` key, Google secret or Brevo key in any file you upload.

---

## 5. Back up the database – ~10 min, then monthly
**Why:** Supabase's free plan does **not** include downloadable daily backups.

1. Supabase → **Project Settings → Database** → note or reset the **database password** (keep it secret).
2. In PowerShell in the project folder:
```bash
npx supabase login
```
```bash
npx supabase link --project-ref qkhqrerexiikymnftlne
```
```bash
npx supabase db dump --data-only -f backup-data.sql
```
```bash
npx supabase db dump -f backup-schema.sql
```
3. Keep the two `.sql` files somewhere safe (Google Drive, USB). **They contain customer data,
   so don't share them.**
4. Repeat monthly, or before big changes. (Supabase **Pro** plan adds automatic daily backups.)

---

## 6. Optional extras
- **Leaked-password protection:** Supabase → **Authentication → Attack Protection → Prevent use of
  leaked passwords** (may need the Pro plan).
- **Android app:** install **Android Studio**, then ask Claude to set up Capacitor (see the earlier
  "Android" answer in this project's chat).
- **Push notifications to phones:** needs a Firebase project (part of the Android step).

---

## Already done by Claude (no action needed)
- `tools/build_deploy.py` builds a clean `deploy/` folder for Netlify with security headers
  (only your own scripts may run, the pages only talk to your Supabase project, no framing,
  admin pages hidden from search engines). Tested locally with those headers: all pages work.
- Password reset now works end-to-end ("Set a new password" screen).
- Bills screen shows the real outstanding balance (it showed a fixed ₱4,280.00 before).
- Customer notifications refresh every minute, can be tapped to mark as read, and "Mark all as read".
- Logout always works, even with no internet.
- 12 database indexes added (`database/phase11_performance_indexes.sql`) for speed as data grows.

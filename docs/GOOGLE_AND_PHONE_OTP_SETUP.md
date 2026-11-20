# OMECOnnect – Sign-in Security Setup (Google, Phone OTP, 2-step, Email)

**Already done (by Claude, 2026-11-17):**
- Customer app has **Continue with Google**, and a **required SMS code (OTP) step** when creating an
  account or when an account has no verified mobile number. Codes expire after 5 minutes.
- Database updated (`backend/database/migrations/phase4_google_and_phone_auth.sql`, `phase5_phone_verification_required.sql`).
- The app checks whether each method is switched on, and shows "not set up yet" until you finish the steps below.

> ✅ **Google sign-in is DONE and tested (2026-11-17).** Google Cloud project `omeconnect`,
> OAuth client "OMECOnnect Supabase", Supabase URL configuration and the Google provider are all set.
> Your Gmail is the only test user so far. Add more under Google Auth Platform → Audience → Test users,
> or click **Publish app** when ready for the public. Parts 0 and 1 below are kept for reference.

**What you must do** (needs your own Google/Twilio accounts and secret keys, which Claude must not handle):
- Part 1: Google (free), about 15 minutes
- Part 2: Phone OTP via **textbee (free)**, **required**: sign-up is blocked until done, about 15 minutes
- Part 3: Authenticator-app two-step: **done**, nothing to set up
- Part 4: Brevo email (free, recommended before real customers)

Your Supabase project: `Omeconnect_Mobile_Appllication`
Supabase callback URL (you'll paste this in Google): **`https://qkhqrerexiikymnftlne.supabase.co/auth/v1/callback`**

---

## PART 0 – Allow the app's address in Supabase (do this first, needed by Google)

1. Open https://supabase.com/dashboard → your project.
2. Left menu: **Authentication** → **URL Configuration**.
3. **Site URL**: for now `http://localhost:5500/customer-mobile-app/index.html`
   (later change it to your real website address).
4. Under **Redirect URLs** click **Add URL** and add each of these:
   - `http://localhost:5500/**`
   - `http://127.0.0.1:5500/**`
   - (later) `https://YOUR-REAL-DOMAIN/**`
5. Click **Save**.

> Without this, after Google sign-in Supabase will send people to the wrong page.

---

## PART 1 – Google Sign-In

### 1A. Create a Google Cloud project
1. Go to https://console.cloud.google.com and sign in with the Google account that will **own** the app.
   An official OMECO account is better than a personal one.
2. At the top, click the project dropdown → **New Project**.
3. Name: `OMECOnnect` → **Create**. Wait, then make sure `OMECOnnect` is selected at the top.

### 1B. Set up the consent screen (what users see: "OMECOnnect wants to access…")
1. Search bar → type **Google Auth Platform** → open it → **Get started**.
2. **App information**: App name `OMECOnnect`; User support email: your email → **Next**.
3. **Audience**: choose **External** → **Next**.
4. **Contact information**: your email → **Next** → tick the agreement → **Continue** → **Create**.
5. Left menu **Branding**:
   - Under **Authorized domains**, click **Add domain** → `supabase.co`
   - (later) also add your real domain.
   - **Save**.
6. Left menu **Data Access** → **Add or remove scopes** → tick `.../auth/userinfo.email`,
   `.../auth/userinfo.profile` and `openid` → **Update** → **Save**.
   These are basic scopes and need no Google review.
7. Left menu **Audience**:
   - While testing, the app is in **Testing** mode. Click **Add users** and add the Gmail
     addresses that will test. Only these can sign in.
   - When ready for the public, click **Publish app**.

### 1C. Create the OAuth client (the keys)
1. Left menu **Clients** → **Create client**.
2. Application type: **Web application**. Name: `OMECOnnect Supabase`.
3. **Authorized JavaScript origins** → **Add URI**:
   - `http://localhost:5500`
   - `http://127.0.0.1:5500`
   - (later) `https://YOUR-REAL-DOMAIN`
4. **Authorized redirect URIs** → **Add URI**:
   `https://qkhqrerexiikymnftlne.supabase.co/auth/v1/callback`
   (exactly this; it's Supabase that receives Google's reply, not your app).
5. Click **Create**. A box shows the **Client ID** and **Client secret**.
   Copy both somewhere safe, such as a password manager.
   **Never** put the client secret in `config.js` or any app file.

### 1D. Turn Google on in Supabase
1. Supabase dashboard → **Authentication** → **Sign In / Providers** (may be called **Providers**).
2. Click **Google** → switch **Enable Sign in with Google** on.
3. Paste the **Client ID** into *Client IDs* and the **Client secret** into *Client Secret (for OAuth)*.
4. Leave *Skip nonce checks* **off** → **Save**.

### 1E. Test it
1. Run `python tools/serve_local.py customer` and open http://localhost:5500.
   It must be served over http(s); opening the file directly won't work.
2. Click **Continue with Google** → pick a test Gmail account → **Continue**.
3. You should come back to the app, signed in, with your Google name shown.
4. Check in Supabase: **Authentication → Users** lists the new user (provider: google),
   and **Table Editor → users** has their profile.

| Problem | Fix |
|---|---|
| "Google sign-in is not set up yet" | Step 1D not saved, or Google switch off |
| Google says `redirect_uri_mismatch` | Step 1C.4 URL must match exactly (https, no trailing slash) |
| "Access blocked: app has not completed verification" / user not allowed | Add the Gmail as a test user (1B.7) or publish the app |
| Comes back to a different page (e.g. localhost:3000) | Part 0, Redirect URLs |
| "Google sign-in expired…" | Start and finish sign-in in the same browser tab |

---

## PART 2 – Phone OTP (SMS code): REQUIRED for every account, sent FREE via textbee

**How the app uses it (built and tested by Claude, 2026-11-17):**
- No "sign in with mobile number" button. Phone OTP is a **security step**:
  - **Create account:** the customer gets a 6-digit SMS code. The account is created **only after the code is verified**.
  - **Google accounts (or any account without a verified number):** must verify a mobile number before the dashboard.
- Each code is valid for **5 minutes** (Supabase server setting **SMS OTP Expiry = 300**, already set). After that it is
  refused; the customer taps **Resend code** (once every 60 s) for a new code with a new 5 minutes.
- The database refuses account-linking requests from anyone without a verified phone.

**How the SMS is delivered (free):** Supabase creates the code → calls the Edge Function
`send-sms-textbee` (Auth Hook) → **textbee** → the textbee app on **your Android phone** sends a normal
text from your SIM. textbee free plan: about **300 SMS per month**, no credit card. You pay only your SIM's
normal texting (an "unli text" promo works well).

**Already done by Claude:**
- ✅ Edge Function `send-sms-textbee` deployed (it rejects any request not signed by Supabase).
- ✅ Supabase **Auth → Hooks → Send SMS hook** created (HTTPS → the function), **enabled**, signing secret generated.
- ✅ Supabase **Phone provider ON**, SMS OTP Expiry **300 s**, OTP length **6**, phone confirmations ON.
  (Twilio fields are left empty on purpose: the hook replaces them.)

> ⚠️ Until you finish 2A–2C, "Send code" shows *"The SMS could not be sent / SMS service is not configured yet"*.
> Nobody can finish creating an account or signing in with Google until then.

**Your part (needs your accounts, your phone and secret keys, which only you may handle). About 15 minutes:**

### 2A. Create a textbee account and connect an Android phone
1. On your computer, go to https://textbee.dev → **Get started / Sign up** (free). Verify your email.
2. On an **Android phone with a SIM that has load** (a spare phone is best, because it must stay on):
   - Install the **textbee** app. Use the download link shown in your textbee dashboard, or Google Play if listed.
   - Open it and allow the **SMS permission**.
3. In the textbee **dashboard** (computer): **Register device** / **Link device**. It shows a QR code.
   Scan it with the textbee app (or type the key it shows). The phone appears under **Devices** as online.
4. Still in the dashboard:
   - Copy the **Device ID** of that phone (Devices list).
   - Create an **API key** (*Generate API Key*) and copy it. **The API key is secret.**
5. Test from the dashboard: send yourself a test SMS. If it arrives, textbee works.

**Keep the phone:** plugged in, on Wi-Fi/data, battery optimisation **off** for textbee
(Settings → Apps → textbee → Battery → Unrestricted). Otherwise texts may be delayed.

### 2B. Copy the Supabase hook secret
1. Supabase → **Authentication → Hooks** → *Send SMS hook* → **Secret → Reveal** → copy it
   (starts with `v1,whsec_`). **Secret: don't paste it in chat.**

### 2C. Give the three secrets to the Edge Function
Supabase → **Edge Functions → Secrets** (or *Project Settings → Edge Functions*) → **Add new secret**, three times:

| Name (type exactly) | Value |
|---|---|
| `SEND_SMS_HOOK_SECRET` | the `v1,whsec_…` value from 2B |
| `TEXTBEE_API_KEY` | your textbee API key from 2A.4 |
| `TEXTBEE_DEVICE_ID` | your textbee Device ID from 2A.4 |

Click **Save**. No redeploy needed. Then tell Claude **"textbee ready"** and it will run the real test with your number.

### 2D. Test it
1. Open the app (`python tools/serve_local.py customer` → http://localhost:5500) → **Create account**
   → fill in the form with your real number → **Continue**.
2. Your Android phone sends a text like *"OMECOnnect code: 123456. Valid for 5 minutes…"* to the number.
3. Enter it → **Verify** → *"Mobile number verified and account created…"*. Open the email link, then sign in.
4. Expiry test: request a code, wait **more than 5 minutes**, enter it → refused → **Resend code** works.

| Problem | Fix |
|---|---|
| "SMS service is not configured yet" | 2C secrets missing or misspelled |
| "The SMS could not be sent" | Phone offline / textbee app closed / no load / wrong Device ID or API key |
| Code arrives late | Turn off battery optimisation for textbee; keep phone on Wi-Fi |
| "Token has expired or is invalid" | Wrong code or older than 5 minutes; tap **Resend code** |
| "SMS rate limit exceeded" | Supabase → Authentication → Rate Limits → raise *SMS messages per hour* |

**Protect your SIM and quota:** keep Supabase's SMS rate limit modest (e.g. 30/hour). textbee's free plan
is about 300 SMS a month. For thousands of real OMECO customers, plan a paid Philippine SMS provider
later. Only the Edge Function changes; the app stays the same.

**Paid alternative (later):** Twilio. Disable the hook (Auth → Hooks), then fill the Twilio fields
in the Phone provider (use **Twilio**, not *Twilio Verify*, so the 5-minute expiry still applies).

---

## PART 3 – Authenticator app two-step verification (free, optional for customers): DONE

Built and tested by Claude (2026-11-17). Nothing to set up. Supabase includes it for free.
- **Profile → Two-step verification → Set up authenticator app** → scan the QR with Google
  Authenticator / Microsoft Authenticator → enter the 6-digit code → **On**.
- After that, every sign-in asks for the app's current code (screen "Two-step check").
- The **database enforces it** (`backend/database/migrations/phase6_authenticator_app_2fa.sql`): a session that skipped the
  code cannot read that customer's data, even if someone bypasses the app.
- Turn off: Profile → **Turn off two-step verification**.
- **Lost phone?** An admin can remove the factor in Supabase → Authentication → Users → the user → *MFA factors* → delete.

---

## PART 4 – Better email delivery with Brevo (free, recommended before real customers)

Supabase's built-in email sender only sends **a few emails per hour** and is meant for testing. Account
confirmation and password-reset emails will be delayed or dropped once many customers sign up.
Brevo's free plan allows about **300 emails per day**.

1. Sign up at https://www.brevo.com (free).
2. **Senders, Domains & Dedicated IPs → Domains → Add a domain** you own (best), and add the DNS
   records Brevo shows. Or at least **Senders → Add a sender** with an address you control and verify it.
3. **SMTP & API → SMTP** tab → note the **SMTP login** and **Generate a new SMTP key**. **The key is secret.**
4. Supabase → **Authentication → Emails → SMTP Settings** → **Enable custom SMTP**:
   - Sender email: your verified Brevo sender. Sender name: `OMECOnnect`.
   - Host `smtp-relay.brevo.com`, Port `587`, Username: your Brevo SMTP login, Password: the SMTP key.
   - **Save**.
5. Supabase → **Authentication → Rate Limits** → raise *emails per hour* (e.g. 100).
6. With custom SMTP on, you can also edit the email templates (Authentication → Emails → Templates).

---

## PART 5 – Extra security switch (optional)
- Supabase → **Authentication → Attack Protection → Prevent use of leaked passwords**: blocks passwords
  that appeared in known data breaches. It may require a paid Supabase plan. If it's available on your plan, turn it on.

---

## How it works (for reference)
- **Google:** the app → Supabase → Google login → Supabase callback → back to the app with a
  one-time `?code=`. The app swaps it for a session using PKCE (a secret the app made
  before leaving and kept in the tab), so a stolen code is useless.
- **Phone (sign-up):** the app asks Supabase to text a code (`/auth/v1/otp`). When the code is
  verified (`/auth/v1/verify`), the account is created, then the email + password are attached
  (the email becomes active after its confirmation link is clicked).
- **Phone (existing/Google account):** the app adds the number to the account (`PUT /auth/v1/user`)
  and verifies it with the SMS code (type `phone_change`).
- Both create a row in `users` automatically. **Neither links an electricity account.** The
  customer still submits their OMECO account number and staff must verify it, as before.
- Sign-ins are not saved after a page reload (current prototype design).

## Security notes before going live
- Never put the Google client secret or Twilio Auth Token in any app file or Git.
- Consider Supabase **Attack Protection → CAPTCHA** later. This needs a small app change
  (sending a captcha token), so ask Claude before switching it on, or sign-in will break.
- Change **Site URL** and redirect URLs to the real HTTPS domain, and remove localhost entries.

# OMECOnnect — Your Action Guide (IT consultant recommendations)

These recommendations need **your** accounts, passwords, money or a legal decision, so they
cannot be done from the code. Each has exact steps. Everything else from the recommendation
list is already built (see the bottom of this page).

## Quick wins (about 10 minutes each)

### 1. Turn on leaked-password protection (security)
1. Supabase → your project → **Authentication → Sign In / Providers** (or **Policies / Password security**, depending on the dashboard version).
2. Under **Password security**, switch on **Prevent use of leaked passwords** (checks passwords against HaveIBeenPwned).
3. Optional on the same page: minimum password length **10** (the app already asks for 10).

### 2. Add a second Supervisor (so you can never be locked out)
1. The second person creates an OMECOnnect account (customer app → **Create account**) and confirms their email.
2. You: staff console → **Security → Staff and roles → Add staff** → their email → role **Supervisor** → **Add staff**.
3. They sign in to the staff console and set up the **authenticator app** when asked.
4. Keep the two accounts with different people.

### 4. Fill in the TIN and hotline (shown on receipts and on the sign-in page)
1. Staff console → **Bills → Statement header (shown at the top of every online statement)**.
2. Enter OMECO's **TIN** and **Hotline** (and check the address) → **Save**.
3. The hotline then appears automatically on every online statement **and** in the new **Contact OMECO** card on the customer sign-in page and Profile.

## Bigger steps

### 7. Publish the Android app on Google Play
1. Create a **Google Play Console** developer account (US$25 one time): play.google.com/console.
2. Create the app *OMECOnnect*, fill in the store listing (description, screenshots, icon from `frontend/public/icons/`), the content rating questionnaire and the **Data safety** form (use `docs/DATA_PRIVACY_COMPLIANCE.md`).
3. Upload `android-signing/OMECOnnect.aab` (the App Bundle, not the APK) to an **Internal testing** track first, then **Production**.
4. Keep `android-signing/` (keystore + passwords) safe and **never** upload it to GitHub — every future update must be signed with it.
5. Use **Play App Signing** (recommended by Google); then add the Play signing certificate's SHA-256 to `frontend/public/.well-known/assetlinks.json` so the app keeps opening full screen. Ask Claude to do that file change.

### 8. Make notifications pop up over other apps by default
Android decides pop-ups per notification channel. The current app (built with PWABuilder) creates a normal-priority channel, so customers turn on **Pop on screen** in Settings → Apps → OMECOnnect → Notifications.
To make it the default, the Android app must be rebuilt as an Android Studio project (Bubblewrap) whose notification service creates a **high-importance** channel, signed with your keystore. This needs Android Studio on your computer and your keystore password (which only you should type). When you are ready, open the project with Claude and say "rebuild the Android app with high-priority notifications".

### 9. Data Privacy Act registration (legal)
Follow section 4 of `docs/DATA_PRIVACY_COMPLIANCE.md`: OMECO designates a **Data Protection Officer**, registers with the **National Privacy Commission**, and approves the retention schedule. Put the DPO's contact in `frontend/public/privacy.html` (ask Claude).

### 10. Email notifications (Brevo) and 15. AI assistant (Claude)
Both are built and switched off. Follow `docs/SWITCH_ON_PAYMENTS_AI_EMAIL.md`: you create the account, copy the key, and paste it into **Supabase → Edge Functions → Secrets** yourself (never send keys in chat), then switch the feature on in the staff console.

### Monthly: restore drill (15 minutes)
Follow section 2 of `docs/OPERATIONS_RUNBOOK.md` and write the result in its table.

### Production hosting (when OMECO goes live)
Upgrade Supabase to **Pro** and Vercel to **Pro** (see the cost plan in `docs/OPERATIONS_RUNBOOK.md`), and set up the **staging** environment described there.

---

## Already done in the system (no action needed)

| # | Recommendation | Where to see it |
|---|---|---|
| 3 | Live data cleanup | Done after your confirmation (test announcements and test data) |
| 5 | Contact OMECO card | Customer sign-in page and Profile (shows the hotline once you fill it in, step 4) |
| 11 | Payment history with receipts | Customer **Bills → Payment history → Receipt** |
| 12 | Scheduled outage calendar | Staff: announcement **Outage starts / ends**; customer Home: **Scheduled power interruptions** |
| 13 | Outage board | Customer Home → power card: open outage reports per barangay in your town |
| 14 | Usage insights and saving tips | Customer Home → **Your usage** |
| 16 | Text size option | Customer **Profile → Text size** (Normal / Large / Extra large) |
| 17 | Management dashboard | Staff **Reports**: collected amount, overdue accounts, outages by barangay (plus the existing figures) |
| 18 | Import preview | Staff **Bills → Import**: the file is checked and previewed before saving (already existed) |
| 19 | Field-staff directions | Staff **Complaints → Directions** opens Google Maps to the customer's barangay |
| 20 | Quick replies | Staff **Complaints → Update**: one-tap message templates |
| 21 | Uptime monitoring | GitHub **Actions → Uptime monitor** (every 30 minutes, emails on failure) |
| 22 | Backup restore drill | `tools/verify_backup.py`; the backup now also includes the rate schedule and notifications |
| 23 | Cost plan | `docs/OPERATIONS_RUNBOOK.md` section 4 |
| 24 | Staging environment plan | `docs/OPERATIONS_RUNBOOK.md` section 5 |
| 25 | Automated tests | `tests/` — run on every push |
| 6 | Online payments | Not done, as you asked |

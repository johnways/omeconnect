# Switch on: online payment, AI assistant, and reliable email

Everything is already built and deployed. Each feature stays **off** (and the app
works normally without it) until you add the key from your own account.
Never paste these keys into chat, GitHub, or the app code — only into the
Supabase dashboard as shown.

Where to paste secrets:
**Supabase dashboard → project `qkhqrerexiikymnftlne` → Edge Functions → Secrets → Add new secret.**

---

## 1. Online payment (GCash, Maya, cards) — PayMongo

What customers see: a green **Pay now** button on Home and in each bill's details.
They pay on PayMongo's secure page, come back to the app, the bill updates by
itself and they get a "Payment received" notification.

1. Sign up at **https://dashboard.paymongo.com** using OMECO's business details
   (business documents are needed for real payments; **test mode works right away**).
2. **Developers → API keys** → copy the **Secret key** (`sk_test_...` for testing).
3. In Supabase secrets add: `PAYMONGO_SECRET_KEY` = that key.
4. **Developers → Webhooks → Create webhook**
   - URL: `https://qkhqrerexiikymnftlne.supabase.co/functions/v1/paymongo-webhook`
   - Event: `checkout_session.payment.paid`
   - Copy its **secret** (`whsk_...`) → Supabase secret `PAYMONGO_WEBHOOK_SECRET`.
5. Tell Claude "PayMongo keys added" — the **Pay now** button is then switched on
   (`app_settings.payments_enabled = true`) and tested with a test payment.
6. When OMECO's PayMongo account is approved for live payments, replace both
   secrets with the live ones (`sk_live_...`, live webhook secret). Nothing else changes.

Optional: `PAYMONGO_METHODS` = `gcash,paymaya,card` (default) — remove any method
not yet activated on your PayMongo account.

## 2. AI assistant (Claude)

What customers see: the **Ask AI** screen answers real questions in English or
Filipino using only *their own* bills, concerns, outages and advisories
(e.g. "Bakit tumaas ang bill ko?", "When is my bill due?"). Max 30 questions per
customer per hour. Until switched on, the simple built-in replies are used.

1. Create an account at **https://console.anthropic.com** → add billing
   (pay-as-you-go; short answers cost a fraction of a peso each).
2. **API keys → Create key** → copy it.
3. Supabase secret: `ANTHROPIC_API_KEY` = that key.
4. Tell Claude "AI key added" — the assistant is switched on
   (`app_settings.ai_assistant_enabled = true`) and tested.

## 3. Reliable sign-up / password emails — Brevo (free)

Supabase's built-in email sends only a few emails per hour, so confirmation and
password-reset emails will fail once many customers sign up.

1. Sign up at **https://www.brevo.com** (free plan: 300 emails/day).
2. **Senders, domains & dedicated IPs → Senders** → add and verify the email
   OMECO will send from (e.g. `no-reply@your-domain`).
3. **SMTP & API → SMTP** → note the server (`smtp-relay.brevo.com`, port `587`),
   your SMTP login, and **Generate a new SMTP key**.
4. Supabase dashboard → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Sender email: the verified sender · Sender name: `OMECOnnect`
   - Host `smtp-relay.brevo.com` · Port `587`
   - Username: your Brevo SMTP login · Password: the SMTP key
5. **Authentication → Rate limits** → raise "emails per hour" (e.g. 100).
6. Test: create an account in the app with a new email; the confirmation email
   should arrive within a minute.

---

### Already running (no keys needed)

| Feature | Where |
|---|---|
| Bill reminders 3 days before, on the due date, and 1 day overdue (push + in-app) | every day 8:00 AM |
| Nightly backup of all records, kept 14 days | every night 2:00 AM · Admin → Security → Backups |
| Outage status + one-tap "Report no power" | customer Home |
| Concern photos, timeline, star rating | customer Concerns |
| Meter reading with photo | customer Bills · Admin → Meter readings |
| Bill charge breakdown, comparison, print/PDF | customer Bills |
| Several OMECO accounts per customer | customer Home (account picker) |
| Privacy consent, download my data, delete my account | customer Profile |
| Staff roles (supervisor, billing, service, engineering) | Admin → Security |
| Outages by barangay + "Mark power restored" | Admin → Complaints |
| Management report (on-time %, rating, collection) | Admin → Reports |
| Alert to supervisors when app errors spike | admin bell |
| Automatic code checks on every GitHub push | GitHub → Actions |

# OMECOnnect — Data Privacy Compliance Pack (Republic Act No. 10173)

This pack prepares OMECOnnect for use with **real OMECO member-consumers**. It maps the
Data Privacy Act of 2012 (DPA), its Implementing Rules and Regulations and the National
Privacy Commission (NPC) circulars to what the system already does and what OMECO must
still do. **It is a technical preparation, not legal advice** — OMECO's Data Protection
Officer or legal counsel should review it before go-live.

## 1. Roles

| DPA role | Who |
|---|---|
| Personal Information Controller (PIC) | **OMECO** (decides why and how customer data is processed) |
| Personal Information Processors (PIP) | Supabase (database, sign-in, storage), Vercel (website hosting), Google (sign-in with Google, Android notifications), TextBee/phone carrier (SMS codes); later PayMongo, Brevo, Anthropic if switched on |
| Data Protection Officer (DPO) | **To be designated by OMECO** (required) |
| Data subjects | Member-consumers using the app; OMECO staff using the console |

## 2. Personal data the system processes

| Data | Where | Why (purpose) | Lawful basis |
|---|---|---|---|
| Name, email, mobile number | `users`, sign-in | Account, contact, sign-in codes | Contract / consent |
| OMECO account number, meter number, service address, municipality/barangay | `customer_accounts`, `users` | Show the right bills, area outage notices | Contract |
| Bills, payments, meter readings (with photo) | `electricity_bills`, `payments`, `meter_readings`, storage | Billing service | Contract / legal obligation |
| Concerns, photos, ratings | `complaints`, storage | Customer service | Contract / consent |
| Notifications, push registration | `notifications`, `push_subscriptions` | Alerts | Consent (phone permission) |
| Profile photo | storage `avatars` | Personalisation | Consent |
| Staff actions | `audit_logs` | Accountability, security | Legitimate interest |
| Error reports (no message content) | `system_logs` | Fix problems | Legitimate interest |

No sensitive personal information (health, government IDs, religion…) is collected.

## 3. What the system already does (security and rights)

| Requirement | How OMECOnnect meets it |
|---|---|
| Consent / privacy notice | Privacy notice shown and accepted in the app (`accept_privacy_notice`, recorded with time) |
| Right to access / data portability | **Profile → Your data and privacy → Download my data** (`export_my_data`, JSON file) |
| Right to erasure | **Delete my account** (`delete_my_account`): removes the sign-in and personal data; billing records stay with OMECO as required |
| Access control | Row-level security: customers see only their own verified accounts; staff roles (supervisor, billing, service, engineering) |
| Strong authentication | Staff must use two-step sign-in (authenticator app); database refuses staff actions without it |
| Encryption in transit | HTTPS everywhere; strict security headers (CSP, no framing) |
| Encryption at rest | Provided by Supabase (managed PostgreSQL and storage) |
| Accountability | Audit log of staff actions; app error log |
| Availability / backups | Nightly backups kept 14 days; restore drill (see OPERATIONS_RUNBOOK.md) |
| Data minimisation | Push/SMS messages contain no bill details beyond what the customer needs; error reports exclude personal data |

## 4. What OMECO must still do before go-live

1. **Designate a Data Protection Officer** and publish the DPO's contact details in the privacy policy (`frontend/public/privacy.html`).
2. **Register with the NPC** (NPC Circular No. 2022-04, Registration of Data Processing Systems). Registration is required when, among others, a PIC processes personal data of **1,000 or more** individuals — an electric cooperative's customer base will meet this.
3. **Sign data processing agreements** with each processor (Supabase, Vercel, and any switched-on service) or confirm their standard terms meet DPA requirements.
4. **Approve a retention schedule** (proposal below) and an **annual privacy impact assessment**.
5. **Train staff** with console access on confidentiality, phishing, and the breach procedure.

## 5. Proposed retention schedule

| Data | Keep for | Then |
|---|---|---|
| Bills and payments | As required by OMECO's accounting and regulatory rules (typically 10 years) | Archive offline |
| Concerns and their photos | 3 years after closing | Delete photos; keep anonymised statistics |
| Notifications | 1 year | Delete |
| Meter-reading photos | 2 years | Delete |
| Error logs | 90 days | Delete |
| Audit logs | 5 years | Archive |
| Backups | 14 days rolling (automatic) | Deleted automatically |
| Deleted accounts | Sign-in and profile removed at once | Billing records kept under OMECO's legal basis |

## 6. Personal data breach response (NPC Circular No. 16-03)

1. **Contain** (within hours): revoke compromised staff access (Security → Staff and roles), rotate keys in Supabase, take a fresh backup.
2. **Assess**: what data, how many people, risk of harm. Record everything (date, discovery, actions).
3. **Notify the NPC within 72 hours** of knowledge of a breach that involves sensitive information or information that may enable identity fraud and is likely to cause real risk of serious harm.
4. **Notify affected customers within the same 72 hours**, through the app announcement, email or SMS, with what happened, what data, what OMECO is doing, and what they should do.
5. **Review**: fix the cause, update this document, brief staff.

## 7. Contacts

| Role | Name | Contact |
|---|---|---|
| Data Protection Officer | _to be designated_ | _email / phone_ |
| System administrator (technical) | _name_ | _email / phone_ |
| National Privacy Commission | — | privacy.gov.ph |

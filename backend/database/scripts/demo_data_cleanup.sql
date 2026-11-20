-- Demo data for the video presentation (added 20 Nov 2026).
-- Demo customer = the project owner's Google account, OMECO account 1234567890.
-- Run in Supabase > SQL Editor.
--
--   PART A  "Reset between takes": undoes only the actions done LIVE in the video
--           (December bill, the two announcements, linked account 05-0500-000x,
--           power reports, billing-concern update, meter acceptance, rating).
--           Afterwards the demo looks exactly as at the start of the recording guide.
--   PART B  "Remove all demo data": run PART A first, then PART B, when the
--           video is finished. The sign-in, profile and account 1234567890 are kept.

-- =====================================================================
-- PART A - Reset between takes
-- =====================================================================
BEGIN;

-- Alerts the live demo sent to the demo customer (everything after setup).
DELETE FROM public.notifications
WHERE user_id = '6469fdbb-8279-4fff-acc5-9beb4903376d'
  AND created_at > '2026-11-20 05:30:00+00';

-- Staff alerts about the live power reports and the linked-account request.
DELETE FROM public.notifications
WHERE created_at > '2026-11-20 05:30:00+00'
  AND (message ILIKE '%05-0500-000%'
       OR message ILIKE ANY (SELECT '%' || tracking_number || '%' FROM public.complaints
                             WHERE user_id = '6469fdbb-8279-4fff-acc5-9beb4903376d'
                               AND complaint_type = 'Power interruptions'));

-- December 2026 bill (posted live by Back-End 1).
DELETE FROM public.notifications
WHERE bill_id IN (SELECT id FROM public.electricity_bills
                  WHERE customer_account_id = 'a188fede-9af9-4713-a18d-192ae3157b6e'
                    AND billing_month = 'December 2026');
DELETE FROM public.payments
WHERE customer_account_id = 'a188fede-9af9-4713-a18d-192ae3157b6e'
  AND reference_number IN (SELECT payment_reference FROM public.electricity_bills
                           WHERE customer_account_id = 'a188fede-9af9-4713-a18d-192ae3157b6e'
                             AND billing_month = 'December 2026');
DELETE FROM public.electricity_bills
WHERE customer_account_id = 'a188fede-9af9-4713-a18d-192ae3157b6e'
  AND billing_month = 'December 2026';

-- Live announcements: the power-interruption notice and the "Power restored" advisory.
DELETE FROM public.notifications
WHERE announcement_id IN (SELECT id FROM public.announcements
                          WHERE created_at > '2026-11-20 05:30:00+00'
                            AND (title ILIKE 'Power interruption: San Jose%'
                                 OR title ILIKE 'Power restored: Brgy. Barangay 5, San Jose%'));
DELETE FROM public.announcements
WHERE created_at > '2026-11-20 05:30:00+00'
  AND (title ILIKE 'Power interruption: San Jose%'
       OR title ILIKE 'Power restored: Brgy. Barangay 5, San Jose%');

-- One-tap power reports (and their timelines).
DELETE FROM public.complaint_status_history
WHERE complaint_id IN (SELECT id FROM public.complaints
                       WHERE user_id = '6469fdbb-8279-4fff-acc5-9beb4903376d'
                         AND complaint_type = 'Power interruptions');
DELETE FROM public.complaints
WHERE user_id = '6469fdbb-8279-4fff-acc5-9beb4903376d'
  AND complaint_type = 'Power interruptions';

-- Second OMECO account linked live (05-0500-0001, or 05-0500-0002 if used instead).
DELETE FROM public.account_verification_requests
WHERE user_id = '6469fdbb-8279-4fff-acc5-9beb4903376d'
  AND upper(account_number) LIKE '05-0500-000%';
DELETE FROM public.customer_accounts
WHERE user_id = '6469fdbb-8279-4fff-acc5-9beb4903376d'
  AND upper(account_number) LIKE '05-0500-000%'
  AND NOT EXISTS (SELECT 1 FROM public.electricity_bills b WHERE b.customer_account_id = customer_accounts.id);

-- "Billing concerns" back to Submitted, unassigned, no timeline.
DELETE FROM public.complaint_status_history
WHERE complaint_id IN (SELECT id FROM public.complaints WHERE tracking_number = 'OMC-261120-98CEB');
UPDATE public.complaints
SET status = 'submitted', assigned_to = NULL, assigned_at = NULL, updated_at = created_at
WHERE tracking_number = 'OMC-261120-98CEB';

-- "Low voltage" not rated yet.
UPDATE public.complaints
SET rating = NULL, rating_comment = NULL, rated_at = NULL
WHERE tracking_number = 'OMC-261120-2C280';

-- Meter reading 13052 back to waiting for review.
UPDATE public.meter_readings
SET status = 'submitted', review_note = NULL, reviewed_at = NULL
WHERE customer_account_id = 'a188fede-9af9-4713-a18d-192ae3157b6e' AND kwh_value = 13052;

COMMIT;

-- =====================================================================
-- PART B - Remove all demo data (after the video is finished; run PART A first)
-- =====================================================================
BEGIN;

-- Demo bills (June–November 2026) and everything tied to them
DELETE FROM public.notifications
WHERE bill_id IN (SELECT id FROM public.electricity_bills
                  WHERE customer_account_id = 'a188fede-9af9-4713-a18d-192ae3157b6e'
                    AND billing_month IN ('June 2026','July 2026','August 2026','September 2026','October 2026','November 2026'));
DELETE FROM public.payments
WHERE customer_account_id = 'a188fede-9af9-4713-a18d-192ae3157b6e'
  AND reference_number IN (SELECT payment_reference FROM public.electricity_bills
                           WHERE customer_account_id = 'a188fede-9af9-4713-a18d-192ae3157b6e');
DELETE FROM public.electricity_bills
WHERE customer_account_id = 'a188fede-9af9-4713-a18d-192ae3157b6e'
  AND billing_month IN ('June 2026','July 2026','August 2026','September 2026','October 2026','November 2026');

-- Demo concerns (and their timelines / alerts)
DELETE FROM public.notifications
WHERE user_id = '6469fdbb-8279-4fff-acc5-9beb4903376d' AND type = 'complaint';
DELETE FROM public.complaint_status_history
WHERE complaint_id IN (SELECT id FROM public.complaints
                       WHERE user_id = '6469fdbb-8279-4fff-acc5-9beb4903376d'
                         AND tracking_number IN ('OMC-261120-98CEB', 'OMC-261120-2C280'));
DELETE FROM public.complaints
WHERE user_id = '6469fdbb-8279-4fff-acc5-9beb4903376d'
  AND tracking_number IN ('OMC-261120-98CEB', 'OMC-261120-2C280');

-- Demo meter readings
DELETE FROM public.meter_readings
WHERE customer_account_id = 'a188fede-9af9-4713-a18d-192ae3157b6e' AND kwh_value IN (12846, 13052);

-- Demo advisory (and its alert)
DELETE FROM public.notifications
WHERE announcement_id IN (SELECT id FROM public.announcements WHERE title = 'Scheduled maintenance: San Jose Barangay 5 feeder');
DELETE FROM public.announcements WHERE title = 'Scheduled maintenance: San Jose Barangay 5 feeder';

COMMIT;

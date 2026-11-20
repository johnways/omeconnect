-- Phase 18: customer features
--   1. App feature switches (payments / AI turn on when their keys are set)
--   2. Daily bill reminders (3 days before, due today, 1 day overdue) via pg_cron
--   3. Power status for the customer's area + staff "mark area restored"
--   4. Concern timeline (with staff notes), photos and satisfaction rating
--   5. Meter reading submission with photo
--   6. Bill charge breakdown (optional) and CSV import of the breakdown

-- ---------------------------------------------------------------- 1. settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'false'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
CREATE POLICY "Anyone can read app settings" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.app_settings FROM anon, authenticated;
GRANT SELECT ON public.app_settings TO anon, authenticated;
INSERT INTO public.app_settings (key, value) VALUES
  ('payments_enabled', 'false'::jsonb),
  ('ai_assistant_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------- 2. reminders
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.electricity_bills
  ADD COLUMN IF NOT EXISTS due_today_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS overdue_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.queue_due_bill_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
DECLARE
  total integer := 0;
  n integer;
  ph_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  -- 3 days before
  WITH b AS (
    UPDATE public.electricity_bills AS eb SET due_reminder_sent_at = now()
    FROM public.customer_accounts ca
    WHERE eb.customer_account_id = ca.id AND ca.user_id IS NOT NULL AND ca.verification_status = 'verified'
      AND eb.outstanding_balance > 0 AND eb.due_date BETWEEN ph_today + 1 AND ph_today + 3
      AND eb.due_reminder_sent_at IS NULL
    RETURNING eb.id, ca.user_id, eb.billing_month, eb.due_date, eb.outstanding_balance, ca.account_number
  )
  INSERT INTO public.notifications (user_id, title, message, type, bill_id)
  SELECT user_id, 'Bill due soon',
         billing_month || ' bill (₱' || to_char(outstanding_balance, 'FM999,999,990.00') || ') for account ' || account_number
           || ' is due on ' || to_char(due_date, 'FMMonth DD') || '.',
         'billing', id
  FROM b;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  -- due today
  WITH b AS (
    UPDATE public.electricity_bills AS eb SET due_today_sent_at = now(), due_reminder_sent_at = COALESCE(eb.due_reminder_sent_at, now())
    FROM public.customer_accounts ca
    WHERE eb.customer_account_id = ca.id AND ca.user_id IS NOT NULL AND ca.verification_status = 'verified'
      AND eb.outstanding_balance > 0 AND eb.due_date = ph_today AND eb.due_today_sent_at IS NULL
    RETURNING eb.id, ca.user_id, eb.billing_month, eb.outstanding_balance, ca.account_number
  )
  INSERT INTO public.notifications (user_id, title, message, type, bill_id)
  SELECT user_id, 'Bill due today',
         billing_month || ' bill (₱' || to_char(outstanding_balance, 'FM999,999,990.00') || ') for account ' || account_number
           || ' is due today. Pay on time to avoid penalties.',
         'billing', id
  FROM b;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  -- one day overdue (sent once)
  WITH b AS (
    UPDATE public.electricity_bills AS eb SET overdue_sent_at = now()
    FROM public.customer_accounts ca
    WHERE eb.customer_account_id = ca.id AND ca.user_id IS NOT NULL AND ca.verification_status = 'verified'
      AND eb.outstanding_balance > 0 AND eb.due_date = ph_today - 1 AND eb.overdue_sent_at IS NULL
    RETURNING eb.id, ca.user_id, eb.billing_month, eb.outstanding_balance, ca.account_number
  )
  INSERT INTO public.notifications (user_id, title, message, type, bill_id)
  SELECT user_id, 'Bill overdue',
         billing_month || ' bill (₱' || to_char(outstanding_balance, 'FM999,999,990.00') || ') for account ' || account_number
           || ' is past due. Please pay as soon as possible to avoid disconnection.',
         'billing', id
  FROM b;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_bill_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_bill_notifications() TO service_role;

-- Every day 8:00 AM Philippine time (00:00 UTC).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'omeconnect-bill-reminders';
SELECT cron.schedule('omeconnect-bill-reminders', '0 0 * * *', $cron$SELECT public.queue_due_bill_notifications();$cron$);

-- ---------------------------------------------------------------- 3. power status
-- What a customer sees for THEIR barangay. Counts other people's reports
-- without revealing who sent them.
CREATE OR REPLACE FUNCTION public.get_power_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  u public.users%ROWTYPE;
  reports int := 0;
  mine text;
  advisories jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  SELECT * INTO u FROM public.users WHERE id = me;

  IF u.barangay IS NOT NULL THEN
    SELECT count(*) INTO reports FROM public.complaints c
    WHERE c.complaint_type = 'Power interruptions'
      AND c.status NOT IN ('resolved', 'closed', 'rejected')
      AND c.created_at > now() - interval '12 hours'
      AND c.municipality = u.municipality AND c.barangay = u.barangay;
  END IF;

  SELECT c.tracking_number INTO mine FROM public.complaints c
  WHERE c.user_id = me AND c.complaint_type = 'Power interruptions'
    AND c.status NOT IN ('resolved', 'closed', 'rejected')
    AND c.created_at > now() - interval '24 hours'
  ORDER BY c.created_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('title', a.title, 'content', left(a.content, 400), 'category', a.category,
           'area', a.affected_area, 'urgent', a.is_urgent, 'at', COALESCE(a.published_at, a.created_at)) ORDER BY COALESCE(a.published_at, a.created_at) DESC), '[]'::jsonb)
  INTO advisories
  FROM (SELECT * FROM public.announcements a
        WHERE a.is_published
          AND a.category IN ('Power interruption', 'Scheduled maintenance')
          AND COALESCE(a.published_at, a.created_at) > now() - interval '3 days'
          AND (a.affected_area IS NULL OR a.affected_area = '' OR a.affected_area = u.municipality)
        ORDER BY COALESCE(a.published_at, a.created_at) DESC LIMIT 5) a;

  RETURN jsonb_build_object(
    'municipality', u.municipality, 'barangay', u.barangay,
    'reports', reports, 'my_report', mine, 'advisories', advisories,
    'status', CASE WHEN reports > 0 OR mine IS NOT NULL THEN 'outage'
                   WHEN jsonb_array_length(advisories) > 0 THEN 'advisory' ELSE 'normal' END);
END;
$$;
REVOKE ALL ON FUNCTION public.get_power_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_power_status() TO authenticated;

-- ---------------------------------------------------------------- 4. concerns
ALTER TABLE public.complaint_status_history ADD COLUMN IF NOT EXISTS note text;

DROP POLICY IF EXISTS "Customers can read own complaint history" ON public.complaint_status_history;
CREATE POLICY "Customers can read own complaint history" ON public.complaint_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_status_history.complaint_id AND c.user_id = (SELECT auth.uid())));
GRANT SELECT ON public.complaint_status_history TO authenticated;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS photo_paths text[],
  ADD COLUMN IF NOT EXISTS rating smallint,
  ADD COLUMN IF NOT EXISTS rating_comment text,
  ADD COLUMN IF NOT EXISTS rated_at timestamptz;

CREATE OR REPLACE FUNCTION public.paths_in_user_folder(p_paths text[], p_user uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT p_paths IS NULL OR (
    COALESCE(array_length(p_paths, 1), 0) <= 3
    AND p_user IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM unnest(p_paths) AS p WHERE p !~ ('^' || p_user::text || '/(concerns|meter)/[0-9]+-[0-9a-z]+\.jpg$'))
  );
$$;

ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_photo_paths_own;
ALTER TABLE public.complaints ADD CONSTRAINT complaints_photo_paths_own CHECK (public.paths_in_user_folder(photo_paths, user_id));
ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_rating_range;
ALTER TABLE public.complaints ADD CONSTRAINT complaints_rating_range CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

-- Customers set rating only through rate_complaint().
CREATE OR REPLACE FUNCTION public.guard_complaint_customer_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.rating := NULL; NEW.rating_comment := NULL; NEW.rated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS complaint_guard_customer_fields ON public.complaints;
CREATE TRIGGER complaint_guard_customer_fields BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.guard_complaint_customer_fields();

CREATE OR REPLACE FUNCTION public.rate_complaint(p_tracking_number text, p_rating int, p_comment text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  c public.complaints%ROWTYPE;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Rating must be 1 to 5 stars.'; END IF;
  SELECT * INTO c FROM public.complaints WHERE tracking_number = p_tracking_number AND user_id = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Concern not found.'; END IF;
  IF c.status NOT IN ('resolved', 'closed') THEN RAISE EXCEPTION 'You can rate a concern after it is resolved.'; END IF;
  IF c.rated_at IS NOT NULL THEN RAISE EXCEPTION 'You already rated this concern. Thank you!'; END IF;
  UPDATE public.complaints
  SET rating = p_rating, rating_comment = NULLIF(left(btrim(COALESCE(p_comment, '')), 500), ''), rated_at = now()
  WHERE id = c.id;
  RETURN jsonb_build_object('rated', true);
END;
$$;
REVOKE ALL ON FUNCTION public.rate_complaint(text, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_complaint(text, int, text) TO authenticated;

-- Private bucket for customer photos: <user id>/concerns/... and <user id>/meter/...
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('customer-uploads', 'customer-uploads', false, 2097152, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/jpeg'];

DROP POLICY IF EXISTS "Uploads: owner or staff reads" ON storage.objects;
DROP POLICY IF EXISTS "Uploads: owner uploads" ON storage.objects;
DROP POLICY IF EXISTS "Uploads: owner deletes" ON storage.objects;
CREATE POLICY "Uploads: owner or staff reads" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'customer-uploads'
         AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR public.is_omeco_admin()));
CREATE POLICY "Uploads: owner uploads" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customer-uploads' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
              AND (storage.foldername(name))[2] IN ('concerns', 'meter'));
CREATE POLICY "Uploads: owner deletes" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'customer-uploads' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ---------------------------------------------------------------- 5. meter readings
ALTER TABLE public.meter_readings
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.meter_readings DROP CONSTRAINT IF EXISTS meter_readings_status_allowed;
ALTER TABLE public.meter_readings ADD CONSTRAINT meter_readings_status_allowed CHECK (status IN ('submitted', 'accepted', 'rejected'));
ALTER TABLE public.meter_readings DROP CONSTRAINT IF EXISTS meter_readings_photo_own;
ALTER TABLE public.meter_readings ADD CONSTRAINT meter_readings_photo_own
  CHECK (photo_path IS NULL OR public.paths_in_user_folder(ARRAY[photo_path], submitted_by));
ALTER TABLE public.meter_readings DROP CONSTRAINT IF EXISTS meter_readings_kwh_positive;
ALTER TABLE public.meter_readings ADD CONSTRAINT meter_readings_kwh_positive CHECK (kwh_value IS NULL OR kwh_value >= 0);

DROP POLICY IF EXISTS "Customers can submit own meter readings" ON public.meter_readings;
CREATE POLICY "Customers can submit own meter readings" ON public.meter_readings FOR INSERT TO authenticated
  WITH CHECK (submitted_by = (SELECT auth.uid()) AND status = 'submitted' AND review_note IS NULL AND reviewed_at IS NULL
              AND EXISTS (SELECT 1 FROM public.customer_accounts ca WHERE ca.id = meter_readings.customer_account_id
                          AND ca.user_id = (SELECT auth.uid()) AND ca.verification_status = 'verified'));
DROP POLICY IF EXISTS "Admins can manage meter readings" ON public.meter_readings;
CREATE POLICY "Admins can manage meter readings" ON public.meter_readings FOR ALL TO authenticated
  USING (public.is_omeco_admin()) WITH CHECK (public.is_omeco_admin());
GRANT SELECT, INSERT ON public.meter_readings TO authenticated;
GRANT UPDATE (status, review_note, reviewed_at) ON public.meter_readings TO authenticated;

-- Customers: at most one pending reading per account per day.
CREATE UNIQUE INDEX IF NOT EXISTS meter_readings_one_pending_per_day
  ON public.meter_readings (customer_account_id, reading_date) WHERE status = 'submitted';

-- Staff are told about new readings.
CREATE OR REPLACE FUNCTION public.notify_admins_of_meter_reading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
BEGIN
  IF NEW.status = 'submitted' THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    SELECT aa.user_id, 'New meter reading',
           'A customer sent a meter reading of ' || NEW.kwh_value || ' kWh.', 'admin_meter'
    FROM public.admin_accounts aa WHERE aa.user_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS meter_reading_notify_admins ON public.meter_readings;
CREATE TRIGGER meter_reading_notify_admins AFTER INSERT ON public.meter_readings
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_of_meter_reading();

-- ---------------------------------------------------------------- 6. bill breakdown
ALTER TABLE public.electricity_bills ADD COLUMN IF NOT EXISTS charges jsonb;
ALTER TABLE public.electricity_bills DROP CONSTRAINT IF EXISTS electricity_bills_charges_object;
ALTER TABLE public.electricity_bills ADD CONSTRAINT electricity_bills_charges_object
  CHECK (charges IS NULL OR jsonb_typeof(charges) = 'object');

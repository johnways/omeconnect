-- Phase 19: staff roles, privacy (consent / my data / delete account),
-- management reports, app-error alerts, nightly backups, bill-breakdown import.

-- ---------------------------------------------------------------- staff roles
-- supervisor: everything (incl. staff, security, backups)
-- billing:    bills, account verification, meter readings
-- service:    concerns & outages, account verification, announcements
-- engineering: concerns & outages, announcements, meter readings
ALTER TABLE public.admin_accounts ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'supervisor';
ALTER TABLE public.admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_allowed;
ALTER TABLE public.admin_accounts ADD CONSTRAINT admin_accounts_role_allowed
  CHECK (role IN ('supervisor', 'billing', 'service', 'engineering'));

CREATE OR REPLACE FUNCTION public.staff_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
  SELECT CASE WHEN public.is_omeco_admin()
    THEN (SELECT aa.role FROM public.admin_accounts aa WHERE aa.user_id = (SELECT auth.uid()))
  END;
$$;

CREATE OR REPLACE FUNCTION public.staff_can(p_area text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(CASE public.staff_role()
    WHEN 'supervisor' THEN true
    WHEN 'billing' THEN p_area IN ('bills', 'accounts', 'meter')
    WHEN 'service' THEN p_area IN ('concerns', 'accounts', 'announcements')
    WHEN 'engineering' THEN p_area IN ('concerns', 'announcements', 'meter')
  END, false);
$$;
REVOKE ALL ON FUNCTION public.staff_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_can(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_can(text) TO authenticated;

-- Write limits by role (RESTRICTIVE: customers are not admins, so unaffected).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('electricity_bills', 'bills'), ('customer_accounts', 'accounts'), ('announcements', 'announcements'),
      ('complaints', 'concerns'), ('meter_readings', 'meter'), ('payments', 'bills')) AS v(tbl, area)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Staff role: insert" ON public.%I', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Staff role: update" ON public.%I', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Staff role: delete" ON public.%I', t.tbl);
    EXECUTE format('CREATE POLICY "Staff role: insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_omeco_admin() OR public.staff_can(%L))', t.tbl, t.area);
    EXECUTE format('CREATE POLICY "Staff role: update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_omeco_admin() OR public.staff_can(%L))', t.tbl, t.area);
    EXECUTE format('CREATE POLICY "Staff role: delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_omeco_admin() OR public.staff_can(%L))', t.tbl, t.area);
  END LOOP;
END $$;

-- Add the role check to the existing staff functions.
DO $$
DECLARE
  f record;
  def text;
BEGIN
  FOR f IN SELECT * FROM (VALUES
      ('public.approve_verification_request(uuid,text,text,text)', 'accounts'),
      ('public.reject_verification_request(uuid,text)', 'accounts'),
      ('public.assign_complaint(uuid,uuid)', 'concerns'),
      ('public.import_bills(jsonb,boolean)', 'bills')) AS v(sig, area)
  LOOP
    def := pg_get_functiondef(f.sig::regprocedure);
    IF position('staff_can(' IN def) = 0 THEN
      def := replace(def, 'IF NOT public.is_omeco_admin() THEN',
                     format('IF NOT public.is_omeco_admin() OR NOT public.staff_can(%L) THEN', f.area));
      EXECUTE def;
    END IF;
  END LOOP;
END $$;

-- Concern status change now keeps the staff note in the customer's timeline.
CREATE OR REPLACE FUNCTION public.update_complaint_status(p_complaint_id uuid, p_status text, p_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  c public.complaints%ROWTYPE;
  new_status TEXT := lower(btrim(p_status));
  label TEXT;
  note TEXT := NULLIF(left(btrim(COALESCE(p_note, '')), 300), '');
BEGIN
  IF NOT public.is_omeco_admin() OR NOT public.staff_can('concerns') THEN
    RAISE EXCEPTION 'Only OMECO staff handling concerns can update them.';
  END IF;
  label := CASE new_status
    WHEN 'submitted' THEN 'Submitted' WHEN 'under_review' THEN 'Under review' WHEN 'in_progress' THEN 'In progress'
    WHEN 'resolved' THEN 'Resolved' WHEN 'closed' THEN 'Closed' WHEN 'rejected' THEN 'Not accepted' END;
  IF label IS NULL THEN RAISE EXCEPTION 'Unknown status: %', p_status; END IF;

  SELECT * INTO c FROM public.complaints WHERE id = p_complaint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Concern not found.'; END IF;
  IF c.status = new_status AND note IS NULL THEN
    RETURN jsonb_build_object('status', new_status, 'changed', FALSE);
  END IF;

  UPDATE public.complaints SET status = new_status, updated_at = NOW() WHERE id = p_complaint_id;
  INSERT INTO public.complaint_status_history (complaint_id, old_status, new_status, updated_by, note)
  VALUES (p_complaint_id, c.status, new_status, (SELECT id FROM public.users WHERE id = (SELECT auth.uid())), note);

  IF c.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (c.user_id, 'Concern update',
            'Your concern ' || c.tracking_number || ' is now: ' || label || COALESCE('. ' || note, '.')
              || CASE WHEN new_status IN ('resolved', 'closed') THEN ' Please rate our service in the app.' ELSE '' END,
            'complaint');
  END IF;

  PERFORM public.write_audit_log('complaint.status_changed', 'complaints', p_complaint_id::TEXT,
    jsonb_build_object('tracking_number', c.tracking_number, 'from', c.status, 'to', new_status, 'note', note));
  RETURN jsonb_build_object('status', new_status, 'changed', TRUE);
END;
$$;

-- "Power is back" for a whole barangay: resolves every open outage report there.
CREATE OR REPLACE FUNCTION public.resolve_area_outage(p_municipality text, p_barangay text, p_note text DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  c record;
  n int := 0;
BEGIN
  IF NOT public.is_omeco_admin() OR NOT public.staff_can('concerns') THEN
    RAISE EXCEPTION 'Only OMECO staff handling concerns can do this.';
  END IF;
  FOR c IN SELECT id FROM public.complaints
           WHERE complaint_type = 'Power interruptions' AND status NOT IN ('resolved', 'closed', 'rejected')
             AND municipality IS NOT DISTINCT FROM p_municipality AND barangay IS NOT DISTINCT FROM p_barangay
  LOOP
    PERFORM public.update_complaint_status(c.id, 'resolved', COALESCE(NULLIF(btrim(p_note), ''), 'Power has been restored in your area.'));
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_area_outage(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_area_outage(text, text, text) TO authenticated;

-- Staff review of a customer's meter reading.
CREATE OR REPLACE FUNCTION public.review_meter_reading(p_reading_id uuid, p_accept boolean, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  r public.meter_readings%ROWTYPE;
  owner uuid;
  acct text;
BEGIN
  IF NOT public.is_omeco_admin() OR NOT public.staff_can('meter') THEN
    RAISE EXCEPTION 'Only billing or engineering staff can review meter readings.';
  END IF;
  SELECT * INTO r FROM public.meter_readings WHERE id = p_reading_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reading not found.'; END IF;
  UPDATE public.meter_readings
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
      review_note = NULLIF(left(btrim(COALESCE(p_note, '')), 300), ''), reviewed_at = now()
  WHERE id = p_reading_id;
  SELECT ca.user_id, ca.account_number INTO owner, acct FROM public.customer_accounts ca WHERE ca.id = r.customer_account_id;
  IF owner IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (owner, CASE WHEN p_accept THEN 'Meter reading accepted' ELSE 'Meter reading not accepted' END,
            'Your reading of ' || r.kwh_value || ' kWh for account ' || acct
              || CASE WHEN p_accept THEN ' was accepted.' ELSE ' was not accepted.' END
              || COALESCE(' ' || NULLIF(btrim(p_note), ''), ''), 'account');
  END IF;
  PERFORM public.write_audit_log(CASE WHEN p_accept THEN 'meter.accepted' ELSE 'meter.rejected' END, 'meter_readings', p_reading_id::text,
    jsonb_build_object('account_number', acct, 'reason', NULLIF(btrim(p_note), '')));
  RETURN jsonb_build_object('status', CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END);
END;
$$;
REVOKE ALL ON FUNCTION public.review_meter_reading(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_meter_reading(uuid, boolean, text) TO authenticated;

-- Supervisor tools: add staff (person must already have an app account), change role, remove.
CREATE OR REPLACE FUNCTION public.add_staff_by_email(p_email text, p_role text, p_department text DEFAULT NULL, p_employee_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  target uuid;
BEGIN
  IF public.staff_role() IS DISTINCT FROM 'supervisor' THEN RAISE EXCEPTION 'Only a supervisor can add staff.'; END IF;
  IF p_role NOT IN ('supervisor', 'billing', 'service', 'engineering') THEN RAISE EXCEPTION 'Unknown role.'; END IF;
  SELECT id INTO target FROM public.users WHERE lower(email) = lower(btrim(p_email));
  IF target IS NULL THEN
    RAISE EXCEPTION 'No OMECOnnect account uses %. Ask the person to sign up first, then add them.', btrim(p_email);
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_accounts WHERE user_id = target) THEN RAISE EXCEPTION 'This person is already staff.'; END IF;
  INSERT INTO public.admin_accounts (user_id, role, department, employee_id)
  VALUES (target, p_role, NULLIF(btrim(p_department), ''), NULLIF(btrim(p_employee_id), ''));
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (target, 'You were added as OMECO staff', 'Sign in to the OMECOnnect admin console. You will be asked to set up two-step verification.', 'account');
  PERFORM public.write_audit_log('staff.added', 'admin_accounts', target::text, jsonb_build_object('to', p_role));
  RETURN jsonb_build_object('added', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_staff_role(p_user uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  old_role text;
BEGIN
  IF public.staff_role() IS DISTINCT FROM 'supervisor' THEN RAISE EXCEPTION 'Only a supervisor can change roles.'; END IF;
  IF p_role NOT IN ('supervisor', 'billing', 'service', 'engineering') THEN RAISE EXCEPTION 'Unknown role.'; END IF;
  SELECT role INTO old_role FROM public.admin_accounts WHERE user_id = p_user FOR UPDATE;
  IF old_role IS NULL THEN RAISE EXCEPTION 'Staff member not found.'; END IF;
  IF old_role = 'supervisor' AND p_role <> 'supervisor'
     AND (SELECT count(*) FROM public.admin_accounts WHERE role = 'supervisor') <= 1 THEN
    RAISE EXCEPTION 'Keep at least one supervisor.';
  END IF;
  UPDATE public.admin_accounts SET role = p_role WHERE user_id = p_user;
  PERFORM public.write_audit_log('staff.role_changed', 'admin_accounts', p_user::text, jsonb_build_object('from', old_role, 'to', p_role));
  RETURN jsonb_build_object('role', p_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_staff(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.staff_role() IS DISTINCT FROM 'supervisor' THEN RAISE EXCEPTION 'Only a supervisor can remove staff.'; END IF;
  IF p_user = (SELECT auth.uid()) THEN RAISE EXCEPTION 'You cannot remove yourself.'; END IF;
  UPDATE public.complaints SET assigned_to = NULL, assigned_at = NULL WHERE assigned_to = p_user;
  DELETE FROM public.admin_accounts WHERE user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not found.'; END IF;
  PERFORM public.write_audit_log('staff.removed', 'admin_accounts', p_user::text, '{}'::jsonb);
  RETURN jsonb_build_object('removed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.add_staff_by_email(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_staff_role(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_staff_by_email(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_staff(uuid) TO authenticated;

-- ---------------------------------------------------------------- privacy (RA 10173)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS privacy_consent_at timestamptz;

CREATE OR REPLACE FUNCTION public.accept_privacy_notice()
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  UPDATE public.users SET privacy_consent_at = COALESCE(privacy_consent_at, now())
  WHERE id = (SELECT auth.uid())
  RETURNING privacy_consent_at;
$$;
REVOKE ALL ON FUNCTION public.accept_privacy_notice() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_privacy_notice() TO authenticated;

-- Everything OMECOnnect stores about the signed-in customer.
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  RETURN jsonb_build_object(
    'exported_at', now(),
    'profile', (SELECT to_jsonb(u) - 'role' FROM public.users u WHERE u.id = me),
    'accounts', (SELECT COALESCE(jsonb_agg(to_jsonb(ca)), '[]') FROM public.customer_accounts ca WHERE ca.user_id = me),
    'bills', (SELECT COALESCE(jsonb_agg(to_jsonb(b) - 'due_reminder_sent_at' - 'due_today_sent_at' - 'overdue_sent_at'), '[]')
              FROM public.electricity_bills b JOIN public.customer_accounts ca ON ca.id = b.customer_account_id WHERE ca.user_id = me),
    'payments', (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]') FROM public.payments p JOIN public.customer_accounts ca ON ca.id = p.customer_account_id WHERE ca.user_id = me),
    'meter_readings', (SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]') FROM public.meter_readings m JOIN public.customer_accounts ca ON ca.id = m.customer_account_id WHERE ca.user_id = me),
    'verification_requests', (SELECT COALESCE(jsonb_agg(to_jsonb(v) - 'reviewed_by'), '[]') FROM public.account_verification_requests v WHERE v.user_id = me),
    'concerns', (SELECT COALESCE(jsonb_agg(to_jsonb(c) - 'assigned_to'), '[]') FROM public.complaints c WHERE c.user_id = me),
    'concern_updates', (SELECT COALESCE(jsonb_agg(jsonb_build_object('complaint_id', h.complaint_id, 'status', h.new_status, 'note', h.note, 'at', h.updated_at)), '[]')
                        FROM public.complaint_status_history h JOIN public.complaints c ON c.id = h.complaint_id WHERE c.user_id = me),
    'notifications', (SELECT COALESCE(jsonb_agg(to_jsonb(n)), '[]') FROM public.notifications n WHERE n.user_id = me),
    'assistant_chats', (SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]') FROM public.ai_chat_history a WHERE a.user_id = me),
    'push_devices', (SELECT count(*) FROM public.push_subscriptions s WHERE s.user_id = me));
END;
$$;
REVOKE ALL ON FUNCTION public.export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- Deletes the customer's OMECOnnect account. OMECO's own billing records
-- (accounts, bills, payments) are kept but unlinked; concerns are kept anonymous.
CREATE OR REPLACE FUNCTION public.delete_my_account(p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF upper(btrim(COALESCE(p_confirm, ''))) <> 'DELETE' THEN RAISE EXCEPTION 'Type DELETE to confirm.'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_accounts WHERE user_id = me) THEN
    RAISE EXCEPTION 'Staff accounts cannot be deleted here. Ask a supervisor.';
  END IF;

  UPDATE public.customer_accounts SET user_id = NULL, verification_status = 'unverified' WHERE user_id = me;
  UPDATE public.meter_readings SET photo_path = NULL, submitted_by = NULL WHERE submitted_by = me;
  UPDATE public.complaints SET photo_paths = NULL, user_id = NULL WHERE user_id = me;
  UPDATE public.audit_logs SET user_id = NULL WHERE user_id = me;
  UPDATE public.complaint_status_history SET updated_by = NULL WHERE updated_by = me;
  UPDATE public.announcements SET created_by = NULL WHERE created_by = me;
  DELETE FROM public.users WHERE id = me;
  DELETE FROM auth.users WHERE id = me;

  INSERT INTO public.system_logs (level, message, metadata)
  VALUES ('info', 'Customer deleted their OMECOnnect account', jsonb_build_object('at', now()));
  RETURN jsonb_build_object('deleted', true);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_my_account(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account(text) TO authenticated;

-- ---------------------------------------------------------------- reports
CREATE OR REPLACE FUNCTION public.admin_report_summary(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
DECLARE
  since timestamptz := now() - make_interval(days => GREATEST(1, LEAST(p_days, 3650)));
  result jsonb;
BEGIN
  IF NOT public.is_omeco_admin() THEN RAISE EXCEPTION 'Staff only.'; END IF;
  WITH done AS (
    SELECT c.id, c.complaint_type, c.municipality, c.due_by, c.rating, c.created_at,
           (SELECT min(h.updated_at) FROM public.complaint_status_history h
             WHERE h.complaint_id = c.id AND h.new_status IN ('resolved', 'closed')) AS resolved_at,
           c.status
    FROM public.complaints c WHERE c.created_at >= since
  )
  SELECT jsonb_build_object(
    'days', p_days,
    'concerns_total', (SELECT count(*) FROM done),
    'concerns_resolved', (SELECT count(*) FROM done WHERE resolved_at IS NOT NULL),
    'concerns_on_time', (SELECT count(*) FROM done WHERE resolved_at IS NOT NULL AND (due_by IS NULL OR resolved_at <= due_by)),
    'concerns_open_overdue', (SELECT count(*) FROM done WHERE status NOT IN ('resolved', 'closed', 'rejected') AND due_by < now()),
    'avg_hours_to_resolve', (SELECT round(avg(extract(epoch FROM resolved_at - created_at) / 3600)::numeric, 1) FROM done WHERE resolved_at IS NOT NULL),
    'avg_rating', (SELECT round(avg(rating)::numeric, 2) FROM done WHERE rating IS NOT NULL),
    'ratings', (SELECT count(*) FROM done WHERE rating IS NOT NULL),
    'by_type', (SELECT COALESCE(jsonb_object_agg(complaint_type, n), '{}') FROM (SELECT complaint_type, count(*) n FROM done GROUP BY 1) s),
    'by_area', (SELECT COALESCE(jsonb_object_agg(COALESCE(municipality, 'Not set'), n), '{}') FROM (SELECT municipality, count(*) n FROM done GROUP BY 1) s),
    'bills_issued', (SELECT count(*) FROM public.electricity_bills WHERE created_at >= since),
    'billed_amount', (SELECT COALESCE(sum(total_amount), 0) FROM public.electricity_bills WHERE created_at >= since),
    'outstanding_amount', (SELECT COALESCE(sum(outstanding_balance), 0) FROM public.electricity_bills WHERE created_at >= since),
    'bills_paid', (SELECT count(*) FROM public.electricity_bills WHERE created_at >= since AND (status = 'paid' OR outstanding_balance = 0)),
    'new_customers', (SELECT count(*) FROM public.users u WHERE u.created_at >= since
                       AND NOT EXISTS (SELECT 1 FROM public.admin_accounts aa WHERE aa.user_id = u.id)),
    'signups_by_month', (SELECT COALESCE(jsonb_object_agg(m, n), '{}') FROM (
        SELECT to_char(date_trunc('month', u.created_at), 'YYYY-MM') m, count(*) n FROM public.users u
        WHERE u.created_at >= now() - interval '12 months'
          AND NOT EXISTS (SELECT 1 FROM public.admin_accounts aa WHERE aa.user_id = u.id) GROUP BY 1) s),
    'pending_verifications', (SELECT count(*) FROM public.account_verification_requests WHERE status = 'pending'),
    'pending_meter_readings', (SELECT count(*) FROM public.meter_readings WHERE status = 'submitted'),
    'app_errors', (SELECT count(*) FROM public.system_logs WHERE level = 'client_error' AND created_at >= since)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_report_summary(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_report_summary(int) TO authenticated;

-- ---------------------------------------------------------------- app-error alert
-- 20+ app errors within 15 minutes -> one alert to supervisors per hour.
CREATE OR REPLACE FUNCTION public.alert_on_error_spike()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
DECLARE
  recent int;
BEGIN
  IF NEW.level <> 'client_error' THEN RETURN NEW; END IF;
  SELECT count(*) INTO recent FROM public.system_logs WHERE level = 'client_error' AND created_at > now() - interval '15 minutes';
  IF recent >= 20 AND NOT EXISTS (
       SELECT 1 FROM public.notifications WHERE type = 'admin_alert' AND created_at > now() - interval '1 hour') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    SELECT aa.user_id, 'App errors are increasing',
           recent || ' app errors in the last 15 minutes. Open Security > App errors to see what is failing.', 'admin_alert'
    FROM public.admin_accounts aa WHERE aa.role = 'supervisor';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS system_logs_error_spike ON public.system_logs;
CREATE TRIGGER system_logs_error_spike AFTER INSERT ON public.system_logs
  FOR EACH ROW EXECUTE FUNCTION public.alert_on_error_spike();

-- ---------------------------------------------------------------- nightly backups
-- The "nightly-backup" Edge Function writes a compressed JSON copy of the
-- main tables to the private "backups" bucket and keeps the last 14 days.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 52428800, ARRAY['application/gzip'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800, allowed_mime_types = ARRAY['application/gzip'];

DROP POLICY IF EXISTS "Backups: supervisors read" ON storage.objects;
CREATE POLICY "Backups: supervisors read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND public.staff_role() = 'supervisor');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'backup_hook_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'backup_hook_secret', 'Calls the nightly-backup Edge Function');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.run_nightly_backup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'backup_hook_secret' LIMIT 1;
  IF v_secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://qkhqrerexiikymnftlne.supabase.co/functions/v1/nightly-backup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-backup-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
END;
$$;
REVOKE ALL ON FUNCTION public.run_nightly_backup() FROM PUBLIC, anon, authenticated;

-- The function checks the secret itself (it is a service-only function).
CREATE OR REPLACE FUNCTION public.backup_hook_secret_matches(p_secret text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'backup_hook_secret' AND decrypted_secret = p_secret);
$$;
REVOKE ALL ON FUNCTION public.backup_hook_secret_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_hook_secret_matches(text) TO service_role;

-- 2:00 AM Philippine time (18:00 UTC).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'omeconnect-nightly-backup';
SELECT cron.schedule('omeconnect-nightly-backup', '0 18 * * *', $cron$SELECT public.run_nightly_backup();$cron$);

-- Live updates for the admin "Meter readings" screen.
ALTER PUBLICATION supabase_realtime ADD TABLE public.meter_readings;

-- CSV bill import also reads optional charge columns into electricity_bills.charges
-- (generation, transmission, system_loss, distribution, subsidies, universal, taxes, other_charges).
-- Applied as migration "phase19d_import_bill_charges": adds public.try_numeric(text) and
-- extends the INSERT inside public.import_bills to fill the charges column.

-- Trigger-only functions are not callable through the API.
REVOKE ALL ON FUNCTION public.alert_on_error_spike() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admins_of_meter_reading() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_complaint_sla() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_complaint_customer_fields() FROM PUBLIC, anon, authenticated;

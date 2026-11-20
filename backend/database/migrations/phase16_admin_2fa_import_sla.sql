-- Phase 16: admin two-step verification (required), CSV bill import, and
-- concern assignment with response-time targets (SLA).

-- ---------------------------------------------------------------------------
-- 1. Admin two-step verification is REQUIRED.
--    is_omeco_admin() now only returns true when the admin's session has
--    passed an authenticator code (JWT aal = aal2). Every admin policy and
--    admin RPC uses it, so an admin who only typed a password sees nothing.
--    is_omeco_admin_account() answers "is this an admin account at all?" and
--    is used by the sign-in screens before the code step.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_omeco_admin_account()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_accounts AS aa
    WHERE aa.user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_omeco_admin_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_omeco_admin_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_omeco_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
  SELECT COALESCE((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
     AND EXISTS (
       SELECT 1 FROM public.admin_accounts AS aa
       WHERE aa.user_id = (SELECT auth.uid())
     );
$$;

-- ---------------------------------------------------------------------------
-- 2. CSV bill import. Runs as the signed-in admin (RLS applies).
--    p_rows: [{account_number, billing_month, due_date, total_amount, consumption_kwh}]
--    billing_month: "2026-08" or "August 2026". Returns one result per row.
--    With p_commit = false nothing is saved (preview).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_bills(p_rows jsonb, p_commit boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  item jsonb;
  idx int := 0;
  results jsonb := '[]'::jsonb;
  seen text[] := ARRAY[]::text[];
  acct_no text;
  acct_id uuid;
  acct_status text;
  month_text text;
  month_date date;
  month_label text;
  due date;
  amount numeric;
  kwh numeric;
  problem text;
  key text;
  ok_count int := 0;
BEGIN
  IF NOT public.is_omeco_admin() THEN
    RAISE EXCEPTION 'Only OMECO administrators (signed in with two-step verification) can import bills.';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Expected a list of rows.';
  END IF;
  IF jsonb_array_length(p_rows) > 2000 THEN
    RAISE EXCEPTION 'Too many rows (%). Import at most 2000 at a time.', jsonb_array_length(p_rows);
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    idx := idx + 1;
    problem := NULL;
    acct_id := NULL; acct_status := NULL; month_label := NULL; due := NULL; amount := NULL; kwh := NULL;
    acct_no := btrim(COALESCE(item ->> 'account_number', ''));
    month_text := btrim(COALESCE(item ->> 'billing_month', ''));

    IF acct_no = '' THEN
      problem := 'Account number is missing.';
    ELSE
      SELECT ca.id, ca.verification_status INTO acct_id, acct_status
      FROM public.customer_accounts ca WHERE ca.account_number = acct_no LIMIT 1;
      IF acct_id IS NULL THEN
        problem := 'Account number not found in OMECOnnect.';
      ELSIF acct_status IS DISTINCT FROM 'verified' THEN
        problem := 'Account is not verified yet.';
      END IF;
    END IF;

    IF problem IS NULL THEN
      BEGIN
        IF month_text ~ '^\d{4}-\d{1,2}$' THEN
          month_date := to_date(month_text || '-01', 'YYYY-MM-DD');
        ELSIF month_text ~* '^[a-z]+ \d{4}$' THEN
          month_date := to_date('01 ' || month_text, 'DD FMMonth YYYY');
        ELSE
          problem := 'Billing month must look like 2026-08 or August 2026.';
        END IF;
        IF problem IS NULL THEN
          month_label := to_char(month_date, 'FMMonth YYYY');
        END IF;
      EXCEPTION WHEN OTHERS THEN
        problem := 'Billing month must look like 2026-08 or August 2026.';
      END;
    END IF;

    IF problem IS NULL THEN
      BEGIN
        due := (item ->> 'due_date')::date;
        IF due IS NULL THEN problem := 'Due date is missing.'; END IF;
      EXCEPTION WHEN OTHERS THEN
        problem := 'Due date must look like 2026-09-15.';
      END;
    END IF;

    IF problem IS NULL THEN
      BEGIN
        amount := NULLIF(replace(replace(btrim(item ->> 'total_amount'), ',', ''), '₱', ''), '')::numeric;
        IF amount IS NULL OR amount < 0 THEN problem := 'Amount must be 0 or more.'; END IF;
      EXCEPTION WHEN OTHERS THEN
        problem := 'Amount must be a number, e.g. 2105.60.';
      END;
    END IF;

    IF problem IS NULL THEN
      BEGIN
        kwh := NULLIF(replace(btrim(COALESCE(item ->> 'consumption_kwh', '')), ',', ''), '')::numeric;
        IF kwh < 0 THEN problem := 'kWh cannot be negative.'; END IF;
      EXCEPTION WHEN OTHERS THEN
        problem := 'kWh must be a number, e.g. 188.';
      END;
    END IF;

    IF problem IS NULL THEN
      key := acct_id::text || '|' || month_label;
      IF key = ANY (seen) THEN
        problem := 'Same account and month appears twice in this file.';
      ELSIF EXISTS (SELECT 1 FROM public.electricity_bills b
                    WHERE b.customer_account_id = acct_id AND b.billing_month = month_label) THEN
        problem := 'A bill for this month already exists.';
      ELSE
        seen := seen || key;
      END IF;
    END IF;

    IF problem IS NULL THEN
      ok_count := ok_count + 1;
      IF p_commit THEN
        INSERT INTO public.electricity_bills
          (customer_account_id, billing_month, due_date, total_amount, outstanding_balance, consumption_kwh, status)
        VALUES (acct_id, month_label, due, amount, amount, kwh, 'unpaid');
      END IF;
    END IF;

    results := results || jsonb_build_object(
      'row', idx, 'account_number', acct_no, 'billing_month', COALESCE(month_label, month_text),
      'due_date', due, 'total_amount', amount, 'consumption_kwh', kwh,
      'ok', problem IS NULL, 'error', problem);
  END LOOP;

  RETURN jsonb_build_object('valid', ok_count, 'total', idx, 'saved', CASE WHEN p_commit THEN ok_count ELSE 0 END, 'rows', results);
END;
$$;

REVOKE ALL ON FUNCTION public.import_bills(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_bills(jsonb, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Concern assignment and response-time targets.
-- ---------------------------------------------------------------------------
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_by timestamptz;

-- "Assigned to" points at staff (admin_accounts), NOT users: complaints keeps a
-- single direct link to users (the customer), so users(...) embeds in the API
-- stay unambiguous for old and new admin pages.
ALTER TABLE public.admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_user_id_key;
ALTER TABLE public.admin_accounts ADD CONSTRAINT admin_accounts_user_id_key UNIQUE (user_id);
ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_assigned_to_fkey;
ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_assigned_to_fkey FOREIGN KEY (assigned_to)
  REFERENCES public.admin_accounts(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS complaints_assigned_to_idx ON public.complaints (assigned_to);
CREATE INDEX IF NOT EXISTS complaints_due_by_idx ON public.complaints (due_by);

-- Target hours to resolve each concern type (OMECO can change these here).
CREATE OR REPLACE FUNCTION public.complaint_sla_hours(p_type text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE p_type
    WHEN 'Power interruptions' THEN 4
    WHEN 'Low voltage' THEN 24
    WHEN 'Payment problems' THEN 48
    WHEN 'Billing concerns' THEN 72
    WHEN 'New connection' THEN 120
    ELSE 72
  END;
$$;

-- New concerns get a deadline; customers cannot set assignment or deadline.
CREATE OR REPLACE FUNCTION public.set_complaint_sla()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.is_omeco_admin() THEN
    NEW.assigned_to := NULL;
    NEW.assigned_at := NULL;
  END IF;
  NEW.due_by := COALESCE(NEW.created_at, now()) + make_interval(hours => public.complaint_sla_hours(NEW.complaint_type));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complaint_sla_on_insert ON public.complaints;
CREATE TRIGGER complaint_sla_on_insert
  BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_complaint_sla();

UPDATE public.complaints
SET due_by = created_at + make_interval(hours => public.complaint_sla_hours(complaint_type))
WHERE due_by IS NULL;

-- Assign (or unassign with NULL) a concern to an admin. Notifies the assignee.
CREATE OR REPLACE FUNCTION public.assign_complaint(p_complaint_id uuid, p_assignee uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  c public.complaints%ROWTYPE;
  me uuid := (SELECT auth.uid());
  assignee_name text;
BEGIN
  IF NOT public.is_omeco_admin() THEN
    RAISE EXCEPTION 'Only OMECO administrators can assign concerns.';
  END IF;
  IF p_assignee IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.admin_accounts WHERE user_id = p_assignee) THEN
    RAISE EXCEPTION 'Concerns can only be assigned to OMECO staff.';
  END IF;

  SELECT * INTO c FROM public.complaints WHERE id = p_complaint_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concern not found.';
  END IF;
  IF c.assigned_to IS NOT DISTINCT FROM p_assignee THEN
    RETURN jsonb_build_object('changed', false);
  END IF;

  UPDATE public.complaints
  SET assigned_to = p_assignee,
      assigned_at = CASE WHEN p_assignee IS NULL THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_complaint_id;

  SELECT full_name INTO assignee_name FROM public.users WHERE id = p_assignee;

  IF p_assignee IS NOT NULL AND p_assignee IS DISTINCT FROM me THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (p_assignee, 'Concern assigned to you',
            c.tracking_number || ' · ' || c.complaint_type || ' was assigned to you.', 'admin_complaint');
  END IF;

  PERFORM public.write_audit_log('complaint.assigned', 'complaints', p_complaint_id::text,
    jsonb_build_object('tracking_number', c.tracking_number, 'to', COALESCE(assignee_name, 'Unassigned')));

  RETURN jsonb_build_object('changed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_complaint(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_complaint(uuid, uuid) TO authenticated;

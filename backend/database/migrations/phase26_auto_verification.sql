-- Phase 26: automatic approval of account verification requests.
--
-- When a customer asks to link an OMECO account number, the system checks the
-- request right away. If everything below is fine it is approved and linked
-- automatically (no staff work). Otherwise it stays Pending for staff, with
-- the reasons written on the request, and the customer is told what to add
-- to their profile when the gap is theirs to fix.
--
-- Checks (verification_problems):
--   1. full name has a first and last name
--   2. an email or a mobile number is on the profile
--   3. municipality and barangay are set and inside the OMECO service areas
--   4. the account number looks like an account number (letters/digits/dashes, 4+ digits)
--   5. the account number is not linked to another customer
--   6. an existing OMECO record for that number is in the customer's municipality
--   7. no other customer is asking for the same number at the same time
--   8. the same customer was not rejected before for that number
--
-- Staff can switch automatic approval off (app_settings.auto_verify_enabled)
-- and re-run the check on a request. Editing the profile re-runs the check on
-- the customer's pending requests, so completing the profile finishes it.

-- ---------------------------------------------------------------- setting + columns
INSERT INTO public.app_settings (key, value) VALUES ('auto_verify_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.account_verification_requests
  ADD COLUMN IF NOT EXISTS auto_decision text,
  ADD COLUMN IF NOT EXISTS auto_reasons text[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE public.account_verification_requests
    ADD CONSTRAINT account_verification_requests_auto_decision_check
    CHECK (auto_decision IS NULL OR auto_decision IN ('approved', 'needs_review', 'off'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------- what is missing / wrong
CREATE OR REPLACE FUNCTION public.verification_problems(p_request_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.account_verification_requests%ROWTYPE;
  u public.users%ROWTYPE;
  existing public.customer_accounts%ROWTYPE;
  acct text;
  name text;
  problems text[] := '{}';
BEGIN
  SELECT * INTO req FROM public.account_verification_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN ARRAY['Request not found']; END IF;
  SELECT * INTO u FROM public.users WHERE id = req.user_id;
  IF NOT FOUND THEN RETURN ARRAY['Customer profile not found']; END IF;

  -- 1-3: the customer's profile
  name := btrim(COALESCE(u.full_name, ''));
  IF length(name) < 5 OR array_length(regexp_split_to_array(name, '\s+'), 1) < 2 THEN
    problems := problems || 'Full name (first and last name) is missing'::text;
  END IF;
  IF COALESCE(btrim(u.email), '') = '' AND COALESCE(btrim(u.mobile_number), '') = '' THEN
    problems := problems || 'No email or mobile number on the profile'::text;
  END IF;
  IF COALESCE(u.municipality, '') = '' OR COALESCE(u.barangay, '') = '' THEN
    problems := problems || 'Municipality and barangay are not set'::text;
  ELSIF NOT EXISTS (SELECT 1 FROM public.service_areas s WHERE s.municipality = u.municipality AND s.barangay = u.barangay) THEN
    problems := problems || 'Location is not in the OMECO service area list'::text;
  END IF;

  -- 4: account number shape
  acct := upper(btrim(COALESCE(req.account_number, '')));
  IF acct !~ '^[A-Z0-9][A-Z0-9-]{4,24}$' OR length(regexp_replace(acct, '\D', '', 'g')) < 4 THEN
    problems := problems || 'Account number format looks wrong'::text;
  END IF;

  -- 5-6: OMECO's record for that number
  SELECT * INTO existing FROM public.customer_accounts WHERE upper(account_number) = acct;
  IF FOUND THEN
    IF existing.user_id IS NOT NULL AND existing.user_id <> req.user_id THEN
      problems := problems || 'Account number is already linked to another customer'::text;
    END IF;
    IF existing.service_area IS NOT NULL AND COALESCE(u.municipality, '') <> '' AND existing.service_area <> u.municipality THEN
      problems := problems || ('OMECO record is in ' || existing.service_area || ' but the customer is in ' || u.municipality);
    END IF;
  END IF;

  -- 7-8: other requests for the same number
  IF EXISTS (SELECT 1 FROM public.account_verification_requests o
             WHERE upper(btrim(o.account_number)) = acct AND o.user_id <> req.user_id AND o.status = 'pending' AND o.id <> req.id) THEN
    problems := problems || 'Another customer is also asking for this account number'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM public.account_verification_requests o
             WHERE upper(btrim(o.account_number)) = acct AND o.user_id = req.user_id AND o.status = 'rejected') THEN
    problems := problems || 'This account number was rejected before for this customer'::text;
  END IF;

  RETURN problems;
END;
$$;

-- ---------------------------------------------------------------- linking (shared by staff and system)
CREATE OR REPLACE FUNCTION public.link_verified_account(
  p_request_id uuid, p_account_number text, p_meter_number text, p_note text, p_reviewer uuid, p_auto boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.account_verification_requests%ROWTYPE;
  existing public.customer_accounts%ROWTYPE;
  acct text;
  area text;
  account_id uuid;
BEGIN
  SELECT * INTO req FROM public.account_verification_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification request not found.';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request was already %.', req.status;
  END IF;

  acct := upper(btrim(COALESCE(NULLIF(btrim(p_account_number), ''), req.account_number)));
  IF acct = '' THEN
    RAISE EXCEPTION 'An OMECO account number is required.';
  END IF;

  SELECT municipality INTO area FROM public.users WHERE id = req.user_id;

  SELECT * INTO existing FROM public.customer_accounts WHERE upper(account_number) = acct FOR UPDATE;
  IF FOUND THEN
    IF existing.user_id IS NOT NULL AND existing.user_id <> req.user_id THEN
      RAISE EXCEPTION 'OMECO account % is already linked to another customer.', acct;
    END IF;
    UPDATE public.customer_accounts
    SET user_id = req.user_id,
        verification_status = 'verified',
        status = 'active',
        service_area = COALESCE(existing.service_area, area),
        meter_number = COALESCE(NULLIF(btrim(p_meter_number), ''), existing.meter_number)
    WHERE id = existing.id
    RETURNING id INTO account_id;
  ELSE
    INSERT INTO public.customer_accounts (user_id, account_number, service_area, meter_number, status, verification_status)
    VALUES (req.user_id, acct, area, NULLIF(btrim(p_meter_number), ''), 'active', 'verified')
    RETURNING id INTO account_id;
  END IF;

  UPDATE public.account_verification_requests
  SET status = 'approved', reviewed_by = p_reviewer, reviewed_at = NOW(), review_note = NULLIF(btrim(p_note), ''),
      account_number = acct,
      auto_decision = CASE WHEN p_auto THEN 'approved' ELSE auto_decision END,
      auto_reasons = CASE WHEN p_auto THEN '{}'::text[] ELSE auto_reasons END
  WHERE id = p_request_id;

  UPDATE public.users SET is_verified = TRUE WHERE id = req.user_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (req.user_id, 'Account verified',
          'Your OMECO account ' || acct || ' is now linked to OMECOnnect. You can now view your bills and area announcements.',
          'account');

  PERFORM public.write_audit_log(CASE WHEN p_auto THEN 'verification.auto_approved' ELSE 'verification.approved' END,
    'account_verification_requests', p_request_id::text,
    jsonb_build_object('account_number', acct, 'customer_id', req.user_id, 'customer_account_id', account_id, 'automatic', p_auto));

  RETURN jsonb_build_object('status', 'approved', 'account_number', acct, 'customer_account_id', account_id, 'automatic', p_auto);
END;
$$;

-- Staff approval keeps the same name, arguments and checks as before.
CREATE OR REPLACE FUNCTION public.approve_verification_request(
  p_request_id uuid, p_account_number text DEFAULT NULL, p_meter_number text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_omeco_admin() OR NOT public.staff_can('accounts') THEN
    RAISE EXCEPTION 'Only OMECO administrators can approve verification requests.';
  END IF;
  RETURN public.link_verified_account(p_request_id, p_account_number, p_meter_number, p_note, (SELECT auth.uid()), false);
END;
$$;

-- ---------------------------------------------------------------- the automatic decision
CREATE OR REPLACE FUNCTION public.auto_verify_request(p_request_id uuid, p_notify boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.account_verification_requests%ROWTYPE;
  enabled boolean;
  problems text[];
  for_customer text[];
BEGIN
  SELECT * INTO req FROM public.account_verification_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR req.status <> 'pending' THEN RETURN COALESCE(req.status, 'missing'); END IF;

  SELECT value = 'true'::jsonb INTO enabled FROM public.app_settings WHERE key = 'auto_verify_enabled';
  IF NOT COALESCE(enabled, false) THEN
    UPDATE public.account_verification_requests SET auto_decision = 'off', auto_reasons = '{}' WHERE id = p_request_id;
    RETURN 'off';
  END IF;

  problems := public.verification_problems(p_request_id);
  IF COALESCE(array_length(problems, 1), 0) = 0 THEN
    PERFORM public.link_verified_account(p_request_id, NULL, NULL,
      'Approved automatically: all required information is complete.', NULL, true);
    RETURN 'approved';
  END IF;

  UPDATE public.account_verification_requests
  SET auto_decision = 'needs_review', auto_reasons = problems,
      review_note = 'Needs staff check: ' || array_to_string(problems, '; ')
  WHERE id = p_request_id;

  -- Tell the customer only what they can fix themselves (their profile).
  SELECT array_agg(p) INTO for_customer FROM unnest(problems) AS p
  WHERE p LIKE 'Full name%' OR p LIKE 'No email%' OR p LIKE 'Municipality and barangay%' OR p LIKE 'Location is not%';
  IF p_notify AND COALESCE(array_length(for_customer, 1), 0) > 0 THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (req.user_id, 'Complete your profile to finish verification',
            'To link OMECO account ' || req.account_number || ' faster, please update your Profile: '
            || array_to_string(for_customer, '; ') || '. It is checked again as soon as you save.',
            'account');
  END IF;
  RETURN 'needs_review';
END;
$$;

-- New request -> decide right away. Named "aa_" so it runs before the
-- staff notification trigger (triggers fire in name order).
CREATE OR REPLACE FUNCTION public.auto_verify_new_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.auto_verify_request(NEW.id, true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_auto_verify_request ON public.account_verification_requests;
CREATE TRIGGER aa_auto_verify_request
AFTER INSERT ON public.account_verification_requests
FOR EACH ROW EXECUTE FUNCTION public.auto_verify_new_request();

-- Profile saved -> check the customer's pending requests again.
CREATE OR REPLACE FUNCTION public.reverify_after_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.account_verification_requests WHERE user_id = NEW.id AND status = 'pending' LOOP
    PERFORM public.auto_verify_request(r.id, false);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reverify_pending_requests ON public.users;
CREATE TRIGGER reverify_pending_requests
AFTER UPDATE OF full_name, email, mobile_number, municipality, barangay ON public.users
FOR EACH ROW
WHEN (OLD.full_name IS DISTINCT FROM NEW.full_name OR OLD.email IS DISTINCT FROM NEW.email
      OR OLD.mobile_number IS DISTINCT FROM NEW.mobile_number OR OLD.municipality IS DISTINCT FROM NEW.municipality
      OR OLD.barangay IS DISTINCT FROM NEW.barangay)
EXECUTE FUNCTION public.reverify_after_profile_change();

-- Staff are notified only about requests that still need them.
CREATE OR REPLACE FUNCTION public.notify_admins_of_new_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  customer_name text;
  cur_status text;
  cur_reasons text[];
BEGIN
  SELECT COALESCE(full_name, email, 'A customer') INTO customer_name FROM public.users WHERE id = NEW.user_id;

  IF TG_TABLE_NAME = 'account_verification_requests' THEN
    SELECT status, auto_reasons INTO cur_status, cur_reasons FROM public.account_verification_requests WHERE id = NEW.id;
    IF cur_status IS DISTINCT FROM 'pending' THEN
      RETURN NEW; -- approved automatically: nothing for staff to do
    END IF;
    INSERT INTO public.notifications (user_id, title, message, type)
    SELECT aa.user_id, 'New verification request',
           COALESCE(customer_name, 'A customer') || ' asked to link OMECO account ' || NEW.account_number || '.'
           || CASE WHEN COALESCE(array_length(cur_reasons, 1), 0) > 0
                   THEN ' Needs a check: ' || array_to_string(cur_reasons, '; ') || '.' ELSE '' END,
           'admin_verification'
    FROM public.admin_accounts AS aa;
  ELSE
    INSERT INTO public.notifications (user_id, title, message, type)
    SELECT aa.user_id, 'New concern: ' || NEW.complaint_type,
           COALESCE(customer_name, 'A customer') || ' submitted concern ' || NEW.tracking_number || '.',
           'admin_complaint'
    FROM public.admin_accounts AS aa;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- staff controls
-- Turn automatic approval on/off (supervisors). Turning it on checks the
-- pending requests straight away.
CREATE OR REPLACE FUNCTION public.set_auto_verification(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE r record; approved int := 0;
BEGIN
  IF NOT public.is_omeco_admin() OR public.staff_role() IS DISTINCT FROM 'supervisor' THEN
    RAISE EXCEPTION 'Only a supervisor can change automatic approval.';
  END IF;
  INSERT INTO public.app_settings (key, value, updated_at) VALUES ('auto_verify_enabled', to_jsonb(p_enabled), NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
  PERFORM public.write_audit_log('settings.auto_verify', 'app_settings', 'auto_verify_enabled', jsonb_build_object('enabled', p_enabled));
  IF p_enabled THEN
    FOR r IN SELECT id FROM public.account_verification_requests WHERE status = 'pending' ORDER BY created_at LOOP
      IF public.auto_verify_request(r.id, false) = 'approved' THEN approved := approved + 1; END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('enabled', p_enabled, 'approved_now', approved);
END;
$$;

-- Run the check again on one request (staff with the accounts area).
CREATE OR REPLACE FUNCTION public.recheck_verification_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result text; reasons text[];
BEGIN
  IF NOT public.is_omeco_admin() OR NOT public.staff_can('accounts') THEN
    RAISE EXCEPTION 'Only OMECO administrators can check verification requests.';
  END IF;
  result := public.auto_verify_request(p_request_id, false);
  SELECT auto_reasons INTO reasons FROM public.account_verification_requests WHERE id = p_request_id;
  RETURN jsonb_build_object('result', result, 'reasons', to_jsonb(COALESCE(reasons, '{}')));
END;
$$;

-- ---------------------------------------------------------------- privileges
REVOKE ALL ON FUNCTION public.verification_problems(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_verified_account(uuid, text, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_verify_request(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_verify_new_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverify_after_profile_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_auto_verification(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recheck_verification_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_auto_verification(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recheck_verification_request(uuid) TO authenticated;

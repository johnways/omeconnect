-- OMECOnnect: admin operations for the dashboard.
-- Run after phase9_customer_concerns.sql.
--
--  * approve_verification_request / reject_verification_request: one safe step
--    that links (or refuses) the OMECO account, notifies the customer and logs it.
--  * update_complaint_status: changes a concern's status, keeps history,
--    notifies the customer and logs it.
--  * Admins are notified (notifications table) when a customer submits a
--    verification request or a concern.
--  * Audit log entries for announcements and bills; admins can read the audit log.
-- Every function checks public.is_omeco_admin() itself; RLS stays on.

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION public.write_audit_log(p_action TEXT, p_entity_type TEXT, p_entity_id TEXT, p_details JSONB)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES ((SELECT id FROM public.users WHERE id = (SELECT auth.uid())), p_action, p_entity_type, p_entity_id, p_details);
$$;
REVOKE EXECUTE ON FUNCTION public.write_audit_log(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- verification
CREATE OR REPLACE FUNCTION public.approve_verification_request(
  p_request_id UUID,
  p_account_number TEXT DEFAULT NULL,
  p_meter_number TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.account_verification_requests%ROWTYPE;
  existing public.customer_accounts%ROWTYPE;
  acct TEXT;
  area TEXT;
  account_id UUID;
BEGIN
  IF NOT public.is_omeco_admin() THEN
    RAISE EXCEPTION 'Only OMECO administrators can approve verification requests.';
  END IF;

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
  SET status = 'approved', reviewed_by = (SELECT auth.uid()), reviewed_at = NOW(), review_note = NULLIF(btrim(p_note), ''),
      account_number = acct
  WHERE id = p_request_id;

  UPDATE public.users SET is_verified = TRUE WHERE id = req.user_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (req.user_id, 'Account verified',
          'Your OMECO account ' || acct || ' is now linked to OMECOnnect. You can now view your bills and area announcements.',
          'account');

  PERFORM public.write_audit_log('verification.approved', 'account_verification_requests', p_request_id::TEXT,
    jsonb_build_object('account_number', acct, 'customer_id', req.user_id, 'customer_account_id', account_id));

  RETURN jsonb_build_object('status', 'approved', 'account_number', acct, 'customer_account_id', account_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_verification_request(p_request_id UUID, p_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.account_verification_requests%ROWTYPE;
  reason TEXT := NULLIF(btrim(p_note), '');
BEGIN
  IF NOT public.is_omeco_admin() THEN
    RAISE EXCEPTION 'Only OMECO administrators can reject verification requests.';
  END IF;
  IF reason IS NULL OR char_length(reason) < 5 THEN
    RAISE EXCEPTION 'Please give the customer a reason (at least 5 characters).';
  END IF;

  SELECT * INTO req FROM public.account_verification_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification request not found.';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request was already %.', req.status;
  END IF;

  UPDATE public.account_verification_requests
  SET status = 'rejected', reviewed_by = (SELECT auth.uid()), reviewed_at = NOW(), review_note = reason
  WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (req.user_id, 'Account verification not approved',
          'OMECO could not verify account ' || req.account_number || ': ' || reason ||
          ' You can submit a corrected account number from your Profile.',
          'account');

  PERFORM public.write_audit_log('verification.rejected', 'account_verification_requests', p_request_id::TEXT,
    jsonb_build_object('account_number', req.account_number, 'customer_id', req.user_id, 'reason', reason));

  RETURN jsonb_build_object('status', 'rejected');
END;
$$;

-- ---------------------------------------------------------------- complaints
CREATE OR REPLACE FUNCTION public.update_complaint_status(p_complaint_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.complaints%ROWTYPE;
  new_status TEXT := lower(btrim(p_status));
  label TEXT;
  note TEXT := NULLIF(btrim(p_note), '');
BEGIN
  IF NOT public.is_omeco_admin() THEN
    RAISE EXCEPTION 'Only OMECO administrators can update concerns.';
  END IF;

  label := CASE new_status
    WHEN 'submitted' THEN 'Submitted'
    WHEN 'under_review' THEN 'Under review'
    WHEN 'in_progress' THEN 'In progress'
    WHEN 'resolved' THEN 'Resolved'
    WHEN 'closed' THEN 'Closed'
    WHEN 'rejected' THEN 'Not accepted'
  END;
  IF label IS NULL THEN
    RAISE EXCEPTION 'Unknown status: %', p_status;
  END IF;

  SELECT * INTO c FROM public.complaints WHERE id = p_complaint_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concern not found.';
  END IF;
  IF c.status = new_status AND note IS NULL THEN
    RETURN jsonb_build_object('status', new_status, 'changed', FALSE);
  END IF;

  UPDATE public.complaints SET status = new_status, updated_at = NOW() WHERE id = p_complaint_id;

  INSERT INTO public.complaint_status_history (complaint_id, old_status, new_status, updated_by)
  VALUES (p_complaint_id, c.status, new_status,
          (SELECT id FROM public.users WHERE id = (SELECT auth.uid())));

  IF c.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (c.user_id, 'Concern update',
            'Your concern ' || c.tracking_number || ' is now: ' || label || COALESCE('. ' || note, '.'),
            'complaint');
  END IF;

  PERFORM public.write_audit_log('complaint.status_changed', 'complaints', p_complaint_id::TEXT,
    jsonb_build_object('tracking_number', c.tracking_number, 'from', c.status, 'to', new_status, 'note', note));

  RETURN jsonb_build_object('status', new_status, 'changed', TRUE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_verification_request(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_verification_request(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_complaint_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_verification_request(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_verification_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_complaint_status(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------- notify admins
CREATE OR REPLACE FUNCTION public.notify_admins_of_new_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  customer_name TEXT;
BEGIN
  SELECT COALESCE(full_name, email, 'A customer') INTO customer_name FROM public.users WHERE id = NEW.user_id;

  IF TG_TABLE_NAME = 'account_verification_requests' THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    SELECT aa.user_id, 'New verification request',
           COALESCE(customer_name, 'A customer') || ' asked to link OMECO account ' || NEW.account_number || '.',
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
REVOKE EXECUTE ON FUNCTION public.notify_admins_of_new_item() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_admins_new_verification ON public.account_verification_requests;
CREATE TRIGGER notify_admins_new_verification
  AFTER INSERT ON public.account_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_of_new_item();

DROP TRIGGER IF EXISTS notify_admins_new_complaint ON public.complaints;
CREATE TRIGGER notify_admins_new_complaint
  AFTER INSERT ON public.complaints
  FOR EACH ROW WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.notify_admins_of_new_item();

-- ---------------------------------------------------------------- audit for announcements and bills
CREATE OR REPLACE FUNCTION public.audit_admin_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'announcements' THEN
    PERFORM public.write_audit_log('announcement.' || lower(TG_OP), 'announcements',
      COALESCE(NEW.id, OLD.id)::TEXT,
      jsonb_build_object('title', COALESCE(NEW.title, OLD.title), 'area', COALESCE(NEW.affected_area, OLD.affected_area),
                         'published', COALESCE(NEW.is_published, OLD.is_published)));
  ELSE
    PERFORM public.write_audit_log('bill.' || lower(TG_OP), 'electricity_bills',
      COALESCE(NEW.id, OLD.id)::TEXT,
      jsonb_build_object('billing_month', COALESCE(NEW.billing_month, OLD.billing_month),
                         'amount', COALESCE(NEW.total_amount, OLD.total_amount),
                         'status', COALESCE(NEW.status, OLD.status)));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_admin_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_announcements ON public.announcements;
CREATE TRIGGER audit_announcements
  AFTER INSERT OR UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();

DROP TRIGGER IF EXISTS audit_bills ON public.electricity_bills;
CREATE TRIGGER audit_bills
  AFTER INSERT OR UPDATE OR DELETE ON public.electricity_bills
  FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();

ALTER TABLE public.announcements ALTER COLUMN created_by SET DEFAULT auth.uid();

-- ---------------------------------------------------------------- read access for admins
DROP POLICY IF EXISTS "Admins can read the audit log" ON public.audit_logs;
CREATE POLICY "Admins can read the audit log"
  ON public.audit_logs FOR SELECT TO authenticated USING (public.is_omeco_admin());
REVOKE ALL ON public.audit_logs FROM anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

DROP POLICY IF EXISTS "Admins can read complaint history" ON public.complaint_status_history;
CREATE POLICY "Admins can read complaint history"
  ON public.complaint_status_history FOR SELECT TO authenticated USING (public.is_omeco_admin());
REVOKE ALL ON public.complaint_status_history FROM anon, authenticated;
GRANT SELECT ON public.complaint_status_history TO authenticated;

-- OMECOnnect auth, verification, RLS, and notification migration.
-- Run after supabase_schema.sql in the Supabase SQL Editor.

ALTER TABLE public.users
  ALTER COLUMN id DROP DEFAULT,
  DROP COLUMN IF EXISTS password_hash;

ALTER TABLE public.customer_accounts
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bill_id UUID REFERENCES public.electricity_bills(id) ON DELETE CASCADE;

ALTER TABLE public.electricity_bills
  ADD COLUMN IF NOT EXISTS due_reminder_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.account_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT
);

CREATE INDEX IF NOT EXISTS customer_accounts_user_id_idx
  ON public.customer_accounts(user_id);
CREATE INDEX IF NOT EXISTS electricity_bills_account_created_idx
  ON public.electricity_bills(customer_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS announcements_area_published_idx
  ON public.announcements(affected_area, is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS verification_requests_user_created_idx
  ON public.account_verification_requests(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS admin_accounts_user_id_unique
  ON public.admin_accounts(user_id);

CREATE OR REPLACE FUNCTION public.is_omeco_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_accounts AS aa
    WHERE aa.user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_omeco_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_omeco_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, mobile_number, role, is_verified)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.email),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'mobile_number', ''),
    'customer',
    FALSE
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        mobile_number = EXCLUDED.mobile_number;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_omeco ON auth.users;
CREATE TRIGGER on_auth_user_created_omeco
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.notify_customers_of_announcement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF NEW.is_published IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.is_published IS DISTINCT FROM TRUE) THEN
    INSERT INTO public.notifications (user_id, title, message, type, announcement_id)
    SELECT DISTINCT ca.user_id, NEW.title, NEW.content, 'service', NEW.id
    FROM public.customer_accounts AS ca
    WHERE ca.user_id IS NOT NULL
      AND ca.verification_status = 'verified'
      AND (NEW.affected_area IS NULL OR ca.service_area = NEW.affected_area);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS announcement_customer_notifications ON public.announcements;
CREATE TRIGGER announcement_customer_notifications
  AFTER INSERT OR UPDATE OF is_published ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.notify_customers_of_announcement();

CREATE OR REPLACE FUNCTION public.notify_customer_of_new_bill()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  account_user_id UUID;
BEGIN
  SELECT ca.user_id
  INTO account_user_id
  FROM public.customer_accounts AS ca
  WHERE ca.id = NEW.customer_account_id
    AND ca.verification_status = 'verified';

  IF account_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, bill_id)
    VALUES (
      account_user_id,
      'New electricity bill',
      'A new bill is available. Sign in to view the balance and due date.',
      'billing',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS new_bill_customer_notification ON public.electricity_bills;
CREATE TRIGGER new_bill_customer_notification
  AFTER INSERT ON public.electricity_bills
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_of_new_bill();

CREATE OR REPLACE FUNCTION public.queue_due_bill_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  queued_count INTEGER;
BEGIN
  WITH due_bills AS (
    UPDATE public.electricity_bills AS b
    SET due_reminder_sent_at = NOW()
    FROM public.customer_accounts AS ca
    WHERE b.customer_account_id = ca.id
      AND ca.user_id IS NOT NULL
      AND ca.verification_status = 'verified'
      AND b.outstanding_balance > 0
      AND b.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
      AND b.due_reminder_sent_at IS NULL
    RETURNING b.id, b.customer_account_id, b.due_date
  )
  INSERT INTO public.notifications (user_id, title, message, type, bill_id)
  SELECT ca.user_id,
         'Bill due soon',
         'A bill is due on ' || due_bills.due_date::TEXT || '. Sign in to view your account.',
         'billing',
         due_bills.id
  FROM due_bills
  JOIN public.customer_accounts AS ca
    ON ca.id = due_bills.customer_account_id;

  GET DIAGNOSTICS queued_count = ROW_COUNT;
  RETURN queued_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_due_bill_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_due_bill_notifications() TO service_role;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electricity_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view own account" ON public.customer_accounts;
DROP POLICY IF EXISTS "Users can view own bills" ON public.electricity_bills;
DROP POLICY IF EXISTS "Admins can view all accounts" ON public.customer_accounts;
DROP POLICY IF EXISTS "Admins can view all complaints" ON public.complaints;
DROP POLICY IF EXISTS "Users can view own announcements" ON public.announcements;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own chat history" ON public.ai_chat_history;
DROP POLICY IF EXISTS "Customers can create verification requests" ON public.account_verification_requests;
DROP POLICY IF EXISTS "Customers can view own verification requests" ON public.account_verification_requests;
DROP POLICY IF EXISTS "Admins can manage verification requests" ON public.account_verification_requests;
DROP POLICY IF EXISTS "Admins can manage customer accounts" ON public.customer_accounts;
DROP POLICY IF EXISTS "Admins can manage bills" ON public.electricity_bills;
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "Customers can view own chat history" ON public.ai_chat_history;
DROP POLICY IF EXISTS "Customers can create own chat history" ON public.ai_chat_history;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can view own admin account" ON public.admin_accounts;
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view own meter readings" ON public.meter_readings;
DROP POLICY IF EXISTS "Users can view own complaints" ON public.complaints;
DROP POLICY IF EXISTS "Admins can manage complaints" ON public.complaints;
DROP POLICY IF EXISTS "Customers can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Customers can view own meter readings" ON public.meter_readings;
DROP POLICY IF EXISTS "Customers can view own complaints" ON public.complaints;

CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.is_omeco_admin());

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Customers can view verified linked accounts"
  ON public.customer_accounts FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND verification_status = 'verified')
    OR public.is_omeco_admin()
  );

CREATE POLICY "Admins can manage customer accounts"
  ON public.customer_accounts FOR ALL TO authenticated
  USING (public.is_omeco_admin())
  WITH CHECK (public.is_omeco_admin());

CREATE POLICY "Customers can view own bills"
  ON public.electricity_bills FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_accounts AS ca
      WHERE ca.id = customer_account_id
        AND ca.user_id = (SELECT auth.uid())
        AND ca.verification_status = 'verified'
    )
    OR public.is_omeco_admin()
  );

CREATE POLICY "Admins can manage bills"
  ON public.electricity_bills FOR ALL TO authenticated
  USING (public.is_omeco_admin())
  WITH CHECK (public.is_omeco_admin());

CREATE POLICY "Customers can view area announcements"
  ON public.announcements FOR SELECT TO authenticated
  USING (
    is_published IS TRUE
    AND (
      affected_area IS NULL
      OR EXISTS (
        SELECT 1 FROM public.customer_accounts AS ca
        WHERE ca.user_id = (SELECT auth.uid())
          AND ca.verification_status = 'verified'
          AND ca.service_area = announcements.affected_area
      )
    )
  );

CREATE POLICY "Admins can manage announcements"
  ON public.announcements FOR ALL TO authenticated
  USING (public.is_omeco_admin())
  WITH CHECK (public.is_omeco_admin());

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_omeco_admin());

CREATE POLICY "Users can mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Customers can create own verification requests"
  ON public.account_verification_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

CREATE POLICY "Customers can view own verification requests"
  ON public.account_verification_requests FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_omeco_admin());

CREATE POLICY "Admins can manage verification requests"
  ON public.account_verification_requests FOR UPDATE TO authenticated
  USING (public.is_omeco_admin())
  WITH CHECK (public.is_omeco_admin());

CREATE POLICY "Users can view own admin account"
  ON public.admin_accounts FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_omeco_admin());

CREATE POLICY "Admins can manage complaints"
  ON public.complaints FOR ALL TO authenticated
  USING (public.is_omeco_admin())
  WITH CHECK (public.is_omeco_admin());

CREATE POLICY "Customers can view own payments"
  ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_accounts AS ca
      WHERE ca.id = customer_account_id
        AND ca.user_id = (SELECT auth.uid())
        AND ca.verification_status = 'verified'
    )
    OR public.is_omeco_admin()
  );

CREATE POLICY "Customers can view own meter readings"
  ON public.meter_readings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_accounts AS ca
      WHERE ca.id = customer_account_id
        AND ca.user_id = (SELECT auth.uid())
        AND ca.verification_status = 'verified'
    )
    OR public.is_omeco_admin()
  );

CREATE POLICY "Customers can view own complaints"
  ON public.complaints FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_accounts AS ca
      WHERE ca.id = customer_account_id
        AND ca.user_id = (SELECT auth.uid())
        AND ca.verification_status = 'verified'
    )
    OR public.is_omeco_admin()
  );

CREATE POLICY "Customers can view own chat history"
  ON public.ai_chat_history FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Customers can create own chat history"
  ON public.ai_chat_history FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.users FROM anon, authenticated;
REVOKE ALL ON public.customer_accounts FROM anon, authenticated;
REVOKE ALL ON public.electricity_bills FROM anon, authenticated;
REVOKE ALL ON public.payments FROM anon, authenticated;
REVOKE ALL ON public.meter_readings FROM anon, authenticated;
REVOKE ALL ON public.announcements FROM anon, authenticated;
REVOKE ALL ON public.notifications FROM anon, authenticated;
REVOKE ALL ON public.complaints FROM anon, authenticated;
REVOKE ALL ON public.account_verification_requests FROM anon, authenticated;
REVOKE ALL ON public.admin_accounts FROM anon, authenticated;
REVOKE ALL ON public.ai_chat_history FROM anon, authenticated;

GRANT SELECT ON public.users TO authenticated;
GRANT UPDATE (full_name, mobile_number) ON public.users TO authenticated;
GRANT SELECT ON public.customer_accounts TO authenticated;
GRANT SELECT ON public.electricity_bills TO authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT ON public.meter_readings TO authenticated;
GRANT SELECT ON public.announcements TO authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.electricity_bills TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
GRANT SELECT ON public.payments, public.meter_readings TO authenticated;
GRANT SELECT, INSERT ON public.account_verification_requests TO authenticated;
GRANT UPDATE (status, reviewed_by, reviewed_at, review_note)
  ON public.account_verification_requests TO authenticated;
GRANT SELECT ON public.admin_accounts TO authenticated;
GRANT SELECT, INSERT ON public.ai_chat_history TO authenticated;

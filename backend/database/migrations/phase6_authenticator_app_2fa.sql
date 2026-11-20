-- OMECOnnect: optional authenticator-app (TOTP) two-step verification.
-- Run after phase5_phone_verification_required.sql.
--
-- Customers who turn on an authenticator app must enter its 6-digit code after
-- signing in. These RESTRICTIVE policies make the database enforce that: a
-- session that skipped the code (aal1) cannot read or change their data.
-- Customers without a verified authenticator are unaffected.

CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      OR NOT EXISTS (
        SELECT 1
        FROM auth.mfa_factors AS f
        WHERE f.user_id = (SELECT auth.uid())
          AND f.status = 'verified'
      );
$$;

REVOKE EXECUTE ON FUNCTION public.mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'customer_accounts', 'electricity_bills', 'payments',
    'meter_readings', 'notifications', 'complaints', 'ai_chat_history',
    'account_verification_requests', 'announcements'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Require 2-step when enabled" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Require 2-step when enabled" ON public.%I
         AS RESTRICTIVE FOR ALL TO authenticated
         USING (public.mfa_satisfied())
         WITH CHECK (public.mfa_satisfied())', t);
  END LOOP;
END;
$$;

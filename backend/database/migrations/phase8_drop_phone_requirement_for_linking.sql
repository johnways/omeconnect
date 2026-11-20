-- OMECOnnect: customers no longer need a verified mobile number to sign in or to
-- request account linking (e.g. Google sign-in goes straight to the dashboard).
-- Run after phase7_service_coverage_and_location.sql.
--
-- Staff still verify every OMECO account number before any bill is shown, so
-- this only removes the extra phone check, not the account verification.

DROP POLICY IF EXISTS "Customers can create own verification requests" ON public.account_verification_requests;
CREATE POLICY "Customers can create own verification requests"
  ON public.account_verification_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

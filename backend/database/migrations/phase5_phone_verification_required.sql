-- OMECOnnect: every customer must verify a mobile number by SMS OTP.
-- Run after phase4_google_and_phone_auth.sql.
--
-- 1. Keep public.users in sync when Supabase Auth confirms a new email or phone
--    (sign-up now starts with the phone; the email is confirmed later by link).
-- 2. Server-side rule: a customer can only ask OMECO staff to link an
--    electricity account after their mobile number is verified. The app also
--    enforces this, but the database is the real gate.

CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    UPDATE public.users
    SET email = COALESCE(NULLIF(NEW.email, ''), email),
        mobile_number = CASE
          WHEN NEW.phone_confirmed_at IS NOT NULL AND NULLIF(NEW.phone, '') IS NOT NULL
            THEN '+' || ltrim(NEW.phone, '+')
          ELSE mobile_number
        END
    WHERE id = NEW.id;
  EXCEPTION WHEN unique_violation THEN
    -- Never block a sign-in because of a stale duplicate profile email.
    NULL;
  END;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_auth_user_updated() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_updated_omeco ON auth.users;
CREATE TRIGGER on_auth_user_updated_omeco
  AFTER UPDATE OF email, phone, phone_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_updated();

CREATE OR REPLACE FUNCTION public.has_verified_phone()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = (SELECT auth.uid())
      AND u.phone_confirmed_at IS NOT NULL
      AND NULLIF(u.phone, '') IS NOT NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_verified_phone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_verified_phone() TO authenticated;

DROP POLICY IF EXISTS "Customers can create own verification requests" ON public.account_verification_requests;
CREATE POLICY "Customers can create own verification requests"
  ON public.account_verification_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND public.has_verified_phone()
  );

-- OMECOnnect: support Google sign-in and phone (SMS OTP) sign-in.
-- Run after phase3_function_privileges.sql.
--
-- Phone-only users have no email, so users.email must allow NULL
-- (the UNIQUE constraint still applies to non-null emails).
-- Google puts the display name in "full_name" or "name" metadata.

ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_phone TEXT := NULLIF(NEW.phone, '');
BEGIN
  INSERT INTO public.users (id, full_name, email, mobile_number, role, is_verified)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
      NEW.email,
      CASE WHEN user_phone IS NOT NULL THEN '+' || ltrim(user_phone, '+') END,
      'Customer'
    ),
    NULLIF(NEW.email, ''),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'mobile_number', ''),
      CASE WHEN user_phone IS NOT NULL THEN '+' || ltrim(user_phone, '+') END
    ),
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

-- CREATE OR REPLACE keeps existing grants, but re-assert the lockdown.
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

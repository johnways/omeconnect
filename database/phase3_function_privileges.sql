-- OMECOnnect: lock down SECURITY DEFINER function execution.
-- Run after phase2_supabase_auth_and_access.sql.
--
-- Supabase grants EXECUTE on new public functions directly to anon and
-- authenticated (default privileges), so REVOKE ... FROM PUBLIC alone does not
-- stop them being called via /rest/v1/rpc/<name>.

-- Trigger functions: never called directly. Triggers still fire, because
-- Postgres only checks EXECUTE when the trigger is created.
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_customers_of_announcement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_customer_of_new_bill() FROM PUBLIC, anon, authenticated;

-- Due-date reminders: only pg_cron / trusted server (service_role).
REVOKE EXECUTE ON FUNCTION public.queue_due_bill_notifications() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_bill_notifications() TO service_role;

-- Admin check: needed by signed-in users (the apps call rpc/is_omeco_admin
-- with the user's token) and inside RLS policies; not by signed-out visitors.
REVOKE EXECUTE ON FUNCTION public.is_omeco_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_omeco_admin() TO authenticated;

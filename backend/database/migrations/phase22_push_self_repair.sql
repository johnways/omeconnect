-- Phase 22: phones repair their own pop-up registration.
-- When Google's push service says a phone's registration expired (HTTP 404/410),
-- the send-push function deletes it. The app asks this on every open: if the
-- server no longer knows this phone's registration, the app makes a new one.

create or replace function public.has_push_subscription(p_endpoint text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.push_subscriptions
    where endpoint = p_endpoint and user_id = (select auth.uid())
  );
$$;

revoke all on function public.has_push_subscription(text) from public, anon;
grant execute on function public.has_push_subscription(text) to authenticated;

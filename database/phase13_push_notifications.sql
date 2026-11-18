-- Phase 13: phone pop-up notifications (Web Push).
-- Every new row in public.notifications (announcements, bills, verification
-- results, concern updates…) is also sent as a pop-up to the phones the user
-- turned notifications on for. Flow:
--   notifications INSERT -> trigger -> pg_net HTTP call -> Edge Function "send-push"
--   -> Web Push service (Google/Apple/Microsoft) -> phone notification bar.
-- Keys and the shared secret live only in Supabase Vault (encrypted).

create extension if not exists pg_net with schema extensions;

-- Phones/browsers that agreed to receive notifications.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select on public.push_subscriptions to authenticated;

drop policy if exists "Users can view own push subscriptions" on public.push_subscriptions;
create policy "Users can view own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- Save this device for the signed-in user (moves it if another user had it).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Invalid push subscription.';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- Public key the app needs to subscribe (safe to share).
create or replace function public.get_push_public_key()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_public' limit 1;
$$;
revoke all on function public.get_push_public_key() from public;
grant execute on function public.get_push_public_key() to anon, authenticated;

-- For the Edge Function only (service_role): keys + shared secret.
create or replace function public.push_service_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'public_key',  (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_public'  limit 1),
    'private_key', (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_private' limit 1),
    'hook_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret'   limit 1));
$$;

-- Stores the push keys once (the Edge Function generates them server-side).
create or replace function public.push_service_store_keys(p_public text, p_private text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from vault.secrets where name = 'push_vapid_private') then return; end if;
  perform vault.create_secret(p_public, 'push_vapid_public', 'Web Push public key (VAPID)');
  perform vault.create_secret(p_private, 'push_vapid_private', 'Web Push private key (VAPID)');
end $$;

revoke all on function public.push_service_config() from public, anon, authenticated;
revoke all on function public.push_service_store_keys(text, text) from public, anon, authenticated;
grant execute on function public.push_service_config() to service_role;
grant execute on function public.push_service_store_keys(text, text) to service_role;

-- Shared secret so only this database can ask the Edge Function to send pushes.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_hook_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_hook_secret',
                                'Shared secret: database trigger -> send-push Edge Function');
  end if;
end $$;

-- New notification -> pop-up (only if that user has a phone registered).
create or replace function public.push_on_new_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
begin
  if new.user_id is null
     or not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    return new;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_hook_secret' limit 1;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://qkhqrerexiikymnftlne.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 8000);
  return new;
exception when others then
  -- A push problem must never stop the in-app notification from being saved.
  return new;
end $$;

revoke all on function public.push_on_new_notification() from public, anon, authenticated;

drop trigger if exists push_new_notification on public.notifications;
create trigger push_new_notification
  after insert on public.notifications
  for each row execute function public.push_on_new_notification();

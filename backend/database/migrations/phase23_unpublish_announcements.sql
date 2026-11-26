-- Phase 23: unpublishing an announcement removes it from customers' screens at once.
--
-- Problem: when staff unpublished an announcement, customers kept seeing it.
--   * Its notifications ("OMECO advisory" alerts) stayed in every customer's
--     notification list.
--   * Supabase Realtime only sends a customer the rows they may read; an
--     unpublished announcement is hidden by row-level security, so the
--     "unpublished" change never reached the customer app.
--
-- Fix: when an announcement goes from published to unpublished, delete its
-- notifications. The deletion reaches every customer app over Realtime, which
-- refreshes and drops both the alert and the advisory. Publishing it again
-- (existing trigger announcement_customer_notifications) creates fresh
-- notifications, so it shows again with a new alert - and no duplicate old ones.

create or replace function public.withdraw_announcement_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_published is true and new.is_published is not true then
    delete from public.notifications where announcement_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.withdraw_announcement_notifications() from public, anon, authenticated;

drop trigger if exists announcement_withdraw_notifications on public.announcements;
create trigger announcement_withdraw_notifications
  after update of is_published on public.announcements
  for each row execute function public.withdraw_announcement_notifications();

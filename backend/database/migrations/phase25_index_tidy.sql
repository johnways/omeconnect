-- Phase 25: performance tidy-up from the Supabase performance advisor (system test, Nov 2026).

-- 1) Index the two foreign keys that had no covering index.
create index if not exists electricity_rates_created_by_idx on public.electricity_rates (created_by);
create index if not exists meter_readings_submitted_by_idx on public.meter_readings (submitted_by);

-- 2) admin_accounts had two identical unique indexes on user_id
--    (constraint admin_accounts_user_id_key + plain index admin_accounts_user_id_unique).
--    complaints.assigned_to pointed at the plain one, so re-create that link on the
--    constraint (same rule: ON DELETE SET NULL), then drop the duplicate.
alter table public.complaints drop constraint if exists complaints_assigned_to_fkey;
drop index if exists public.admin_accounts_user_id_unique;
alter table public.complaints
  add constraint complaints_assigned_to_fkey
  foreign key (assigned_to) references public.admin_accounts (user_id) on delete set null;

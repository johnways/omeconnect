-- Phase 24: scheduled outages, area outage board, richer management dashboard.

-- 1) Scheduled power interruptions: optional start/end time on announcements.
--    The customer app lists upcoming ones as an "outage calendar".
alter table public.announcements
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

alter table public.announcements drop constraint if exists announcements_schedule_order;
alter table public.announcements add constraint announcements_schedule_order
  check (starts_at is null or ends_at is null or ends_at > starts_at);

-- 2) Outage board: open power-interruption reports per barangay in the signed-in
--    customer's municipality (counts only; never names or details).
create or replace function public.get_municipality_outages()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  me uuid := (select auth.uid());
  town text;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  select municipality into town from public.users where id = me;
  if town is null then
    return jsonb_build_object('municipality', null, 'areas', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'municipality', town,
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object('barangay', barangay, 'reports', n, 'since', first_at) order by n desc, barangay)
      from (
        select c.barangay, count(*) as n, min(c.created_at) as first_at
        from public.complaints c
        where c.complaint_type = 'Power interruptions'
          and c.status not in ('resolved', 'closed', 'rejected')
          and c.created_at > now() - interval '12 hours'
          and c.municipality = town
          and c.barangay is not null
        group by c.barangay
      ) s), '[]'::jsonb));
end;
$$;
revoke all on function public.get_municipality_outages() from public, anon;
grant execute on function public.get_municipality_outages() to authenticated;

-- 3) Management dashboard: collection, overdue accounts, outages per barangay.
create or replace function public.admin_report_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $function$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 3650)));
  result jsonb;
begin
  if not public.is_omeco_admin() then raise exception 'Staff only.'; end if;
  with done as (
    select c.id, c.complaint_type, c.municipality, c.barangay, c.due_by, c.rating, c.created_at,
           (select min(h.updated_at) from public.complaint_status_history h
             where h.complaint_id = c.id and h.new_status in ('resolved', 'closed')) as resolved_at,
           c.status
    from public.complaints c where c.created_at >= since
  )
  select jsonb_build_object(
    'days', p_days,
    'concerns_total', (select count(*) from done),
    'concerns_resolved', (select count(*) from done where resolved_at is not null),
    'concerns_on_time', (select count(*) from done where resolved_at is not null and (due_by is null or resolved_at <= due_by)),
    'concerns_open_overdue', (select count(*) from done where status not in ('resolved', 'closed', 'rejected') and due_by < now()),
    'avg_hours_to_resolve', (select round(avg(extract(epoch from resolved_at - created_at) / 3600)::numeric, 1) from done where resolved_at is not null),
    'avg_rating', (select round(avg(rating)::numeric, 2) from done where rating is not null),
    'ratings', (select count(*) from done where rating is not null),
    'by_type', (select coalesce(jsonb_object_agg(complaint_type, n), '{}') from (select complaint_type, count(*) n from done group by 1) s),
    'by_area', (select coalesce(jsonb_object_agg(coalesce(municipality, 'Not set'), n), '{}') from (select municipality, count(*) n from done group by 1) s),
    'outages_by_barangay', (select coalesce(jsonb_object_agg(label, n), '{}') from (
        select coalesce(barangay, 'Not set') || ', ' || coalesce(municipality, '—') as label, count(*) n
        from done where complaint_type = 'Power interruptions' group by 1 order by 2 desc limit 8) s),
    'bills_issued', (select count(*) from public.electricity_bills where created_at >= since),
    'billed_amount', (select coalesce(sum(total_amount), 0) from public.electricity_bills where created_at >= since),
    'outstanding_amount', (select coalesce(sum(outstanding_balance), 0) from public.electricity_bills where created_at >= since),
    'bills_paid', (select count(*) from public.electricity_bills where created_at >= since and (status = 'paid' or outstanding_balance = 0)),
    'collected_amount', (select coalesce(sum(amount), 0) from public.payments where payment_date >= since and coalesce(status, 'paid') = 'paid'),
    'overdue_accounts', (select count(distinct customer_account_id) from public.electricity_bills
                          where coalesce(outstanding_balance, 0) > 0 and status <> 'paid' and due_date < current_date),
    'overdue_amount', (select coalesce(sum(outstanding_balance), 0) from public.electricity_bills
                        where coalesce(outstanding_balance, 0) > 0 and status <> 'paid' and due_date < current_date),
    'new_customers', (select count(*) from public.users u where u.created_at >= since
                       and not exists (select 1 from public.admin_accounts aa where aa.user_id = u.id)),
    'signups_by_month', (select coalesce(jsonb_object_agg(m, n), '{}') from (
        select to_char(date_trunc('month', u.created_at), 'YYYY-MM') m, count(*) n from public.users u
        where u.created_at >= now() - interval '12 months'
          and not exists (select 1 from public.admin_accounts aa where aa.user_id = u.id) group by 1) s),
    'pending_verifications', (select count(*) from public.account_verification_requests where status = 'pending'),
    'pending_meter_readings', (select count(*) from public.meter_readings where status = 'submitted'),
    'app_errors', (select count(*) from public.system_logs where level = 'client_error' and created_at >= since)
  ) into result;
  return result;
end;
$function$;

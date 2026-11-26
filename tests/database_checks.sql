-- OMECOnnect database checks. Run in Supabase > SQL Editor (or ask Claude to run it).
-- Everything runs inside a transaction that is rolled back: nothing is changed.
-- Each check raises an error with a clear message if it fails; "All database checks passed." if not.
begin;

do $$
declare
  t numeric;
  someone uuid;
  other_bill uuid;
  seen int;
begin
  -- 1) Billing: compute_bill matches the published totals (residential sample rates).
  t := (public.compute_bill(188, 'residential', current_date)->>'total')::numeric;
  if t <> 2374.41 then raise exception 'compute_bill(188 kWh) = %, expected 2374.41', t; end if;
  t := (public.compute_bill(33, 'residential', current_date)->>'total')::numeric;
  if t <> 421.40 then raise exception 'compute_bill(33 kWh) = %, expected 421.40', t; end if;

  -- 2) Privacy: a signed-in customer cannot read another customer's bills.
  select ca.user_id, b.id into someone, other_bill
  from public.electricity_bills b join public.customer_accounts ca on ca.id = b.customer_account_id
  where ca.user_id is not null limit 1;
  if other_bill is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal1')::text, true);
    set local role authenticated;
    select count(*) into seen from public.electricity_bills where id = other_bill;
    reset role;
    if seen <> 0 then raise exception 'A stranger could read another customer''s bill.'; end if;
  end if;

  -- 3) Visitors who are not signed in cannot read customer tables.
  --    (Either no rows, or - stronger - no access to the table at all.)
  begin
    set local role anon;
    select count(*) into seen from public.electricity_bills;
    reset role;
    if seen <> 0 then raise exception 'Bills are visible without signing in.'; end if;
  exception when insufficient_privilege then
    reset role; -- access refused: correct
  end;

  -- 4) Unpublished announcements are hidden from customers.
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into seen from public.announcements where is_published is not true;
  reset role;
  if seen <> 0 then raise exception 'Customers can see unpublished announcements.'; end if;

  raise notice 'All database checks passed.';
end $$;

rollback;

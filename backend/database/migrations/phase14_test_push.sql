-- Phase 14: "send me a test notification" for the signed-in customer.
-- Inserts a notification for the caller only; the phase-13 trigger then sends
-- it to their registered phones as a pop-up. Limited to one test per 30 s.
create or replace function public.send_test_push()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_devices int;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select count(*) into v_devices from public.push_subscriptions where user_id = auth.uid();
  if v_devices = 0 then
    return jsonb_build_object('sent', false, 'devices', 0);
  end if;
  if exists (select 1 from public.notifications
             where user_id = auth.uid() and type = 'test' and created_at > now() - interval '30 seconds') then
    return jsonb_build_object('sent', false, 'devices', v_devices, 'reason', 'wait');
  end if;
  insert into public.notifications (user_id, title, message, type)
  values (auth.uid(), 'OMECOnnect test', 'Pop-up alerts are working on this phone. 🎉', 'test');
  return jsonb_build_object('sent', true, 'devices', v_devices);
end $$;

revoke all on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;

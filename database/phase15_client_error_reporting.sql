-- Phase 15: errors that happen on customers' phones / admins' browsers are
-- recorded in public.system_logs so OMECO can see and fix them (admin
-- dashboard -> Security -> App errors).
-- * Apps call public.log_client_error(...) — nothing else can write the table.
-- * Messages are size-limited and logging pauses during an error flood.
-- * Only OMECO admins can read the logs.

revoke all on public.system_logs from anon, authenticated;
grant select on public.system_logs to authenticated;

drop policy if exists "Admins can read system logs" on public.system_logs;
create policy "Admins can read system logs" on public.system_logs
  for select to authenticated using ((select public.is_omeco_admin()));

create index if not exists system_logs_created_idx on public.system_logs (created_at desc);

create or replace function public.log_client_error(
  p_message text,
  p_source text default null,
  p_app text default null,
  p_page text default null,
  p_user_agent text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_message), '') = '' then return; end if;
  -- Flood guard: at most 300 app errors per 10 minutes in total.
  if (select count(*) from public.system_logs
      where level = 'client_error' and created_at > now() - interval '10 minutes') >= 300 then
    return;
  end if;
  insert into public.system_logs (level, message, metadata)
  values (
    'client_error',
    left(p_message, 500),
    jsonb_build_object(
      'source', left(p_source, 300),
      'app', left(p_app, 20),
      'page', left(p_page, 200),
      'user_agent', left(p_user_agent, 200),
      'user_id', auth.uid()
    )
  );
end $$;

revoke all on function public.log_client_error(text, text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text, text) to anon, authenticated;

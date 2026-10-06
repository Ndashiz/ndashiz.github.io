-- L'Ardoise — kill switch driven from Jarvis (nav → L'Ardoise). Run by hand in the project shared with
-- LazyPO (hrvx…), AFTER schema.sql and shared_project.sql. It reuses LazyPO's switch plumbing
-- (lazypo/app_settings_schema.sql): the table app_settings (publicly readable flags), app_flag(), and
-- the secret in app_settings_secret — the one Jarvis already holds as LAZYPO_SETTINGS_SECRET.
--
-- ksar_disabled = true:
--   front  — ksar/app.js shows a pause screen instead of the app (no sign-in, no sign-up, no data)
--   RLS    — restrictive policies: no read and no write on any ardoise_* table, whoever asks
--   e-mail — ardoise_send_reminders() sends nothing
-- GitHub Pages still serves the static files: there is no Worker on ndashiz.be/ksar.

insert into public.app_settings (key, value) values ('ksar_disabled', 'false'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- write: Jarvis, with the shared secret
create or replace function public.ardoise_set_disabled(p_value boolean, p_secret text)
returns public.app_settings
language plpgsql security definer set search_path = public as $$
declare
  r public.app_settings;
begin
  if p_secret is null or not exists (select 1 from public.app_settings_secret where secret = p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_value is null then
    raise exception 'value must be a boolean' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_by)
  values ('ksar_disabled', to_jsonb(p_value), 'jarvis')
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = 'jarvis'
  returning * into r;
  return r;
end $$;
revoke all on function public.ardoise_set_disabled(boolean, text) from public;
grant execute on function public.ardoise_set_disabled(boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------- read: a few counts for the Jarvis tab
-- Counts only, no e-mail and no consumption figure. Same secret as the switch.
create or replace function public.ardoise_stats(p_secret text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_secret is null or not exists (select 1 from public.app_settings_secret where secret = p_secret) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'accounts',    (select count(*) from public.ardoise_profiles where onboarded_at is not null),
    'active7d',    (select count(distinct user_id) from public.ardoise_entries where updated_at > now() - interval '7 days'),
    'days7d',      (select count(*) from public.ardoise_entries where updated_at > now() - interval '7 days'),
    'reminders7d', (select count(*) from public.ardoise_reminder_log where sent_at > now() - interval '7 days')
  );
end $$;
revoke all on function public.ardoise_stats(text) from public;
grant execute on function public.ardoise_stats(text) to anon, authenticated;

-- ---------------------------------------------------------------- RLS locks (restrictive = AND with "own rows")
do $$
declare
  t text;
begin
  foreach t in array array['ardoise_profiles', 'ardoise_entries', 'ardoise_weeks', 'ardoise_config', 'ardoise_admins', 'ardoise_reminder_log'] loop
    execute format('drop policy if exists "ksar_kill_switch" on public.%I', t);
    execute format(
      'create policy "ksar_kill_switch" on public.%I as restrictive for all to anon, authenticated '
      'using (not public.app_flag(''ksar_disabled'')) with check (not public.app_flag(''ksar_disabled''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- check
select key, value, updated_at, updated_by from public.app_settings where key = 'ksar_disabled';

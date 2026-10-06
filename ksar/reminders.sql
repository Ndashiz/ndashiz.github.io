-- L'Ardoise — weekly reminder e-mail (FR7). Run by hand in the Supabase SQL editor, AFTER schema.sql,
-- once the Resend side is ready:
--   1. resend.com: create an API key and verify the sending domain (ndashiz.be: SPF + DKIM records).
--   2. Store the key in Vault (once, then clear the editor):
--        select vault.create_secret('re_xxxxxxxx', 'ardoise_resend_key');
--   3. Run this file. Test with:  select public.ardoise_send_reminders();
--      Delivery results land in net._http_response (pg_net is asynchronous); sends in ardoise_reminder_log.
--
-- Decisions (FR7.2):
--   timing  — each user picks a weekday (reminder_day, Monday by default); the job runs daily at 08:00 UTC
--             and only writes to the users whose day it is (Brussels calendar);
--   trigger — only users with reminders on whose previous week is incomplete (fewer than 7 days logged);
--             after 4 reminders without any new entry, it stops until the user logs again;
--   content — a nudge with the link plus a progress snippet: days logged last week, and standard drinks
--             against the objective when alcohol is tracked.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.ardoise_send_reminders() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  app_url constant text := 'https://ndashiz.be/ksar/';
  sender  constant text := 'L''Ardoise <rappel@ndashiz.be>';
  today   date := (now() at time zone 'Europe/Brussels')::date;
  lw      date := (date_trunc('week', (now() at time zone 'Europe/Brussels')::date) - interval '7 days')::date;
  w       jsonb := coalesce((select value from public.ardoise_config where key = 'poids'), '{}'::jsonb);
  api_key text;
  r       record;
  who     text;
  subject text;
  snippet text;
  req     bigint;
  sent    integer := 0;
begin
  -- Site paused from Jarvis (kill_switch.sql): no reminder points to a page that cannot be used.
  if to_regprocedure('public.app_flag(text)') is not null then
    if public.app_flag('ksar_disabled') then
      return 0;
    end if;
  end if;

  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'ardoise_resend_key';
  if api_key is null then
    raise notice 'ardoise: no ardoise_resend_key in Vault, nothing sent';
    return 0;
  end if;

  for r in
    select * from (
    select p.user_id, p.reminder_email, p.pseudo, p.objectifs,
           coalesce((p.habits #>> '{alcool,use}')::boolean, false) and coalesce((p.habits #>> '{alcool,issue}')::boolean, false) as tracks_alcohol,
           (select count(*) from public.ardoise_entries e where e.user_id = p.user_id and e.date between lw and lw + 6) as logged,
           (select coalesce(sum(
               e.pils * coalesce((w->>'pils')::numeric, 1) + e.vin * coalesce((w->>'vin')::numeric, 1)
             + e.speciale * coalesce((w->>'speciale')::numeric, 2) + e.cocktail * coalesce((w->>'cocktail')::numeric, 1.5)
             + e.shot * coalesce((w->>'shot')::numeric, 1) + e.sans_alcool * coalesce((w->>'sans_alcool')::numeric, 0)), 0)
              from public.ardoise_entries e where e.user_id = p.user_id and e.date between lw and lw + 6) as units
      from public.ardoise_profiles p
     where p.reminder_enabled
       and p.reminder_email is not null
       and p.onboarded_at is not null
       and p.reminder_day = extract(isodow from today)
       and (p.last_reminder_at is null or p.last_reminder_at < now() - interval '6 days')
       and p.reminder_count < 4
    ) due
     where due.logged < 7                                -- the previous week is incomplete
     limit 90                                            -- Resend free tier: 100 e-mails a day
  loop

    who := replace(replace(replace(coalesce(nullif(trim(r.pseudo), ''), 'toi'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
    subject := case when r.logged = 0 then 'Ton ardoise t''attend'
                    else format('Complète ta semaine : %s %s à noter', 7 - r.logged, case when 7 - r.logged > 1 then 'jours' else 'jour' end) end;
    snippet := format('La semaine dernière : %s jour%s noté%s sur 7', r.logged, case when r.logged > 1 then 's' else '' end, case when r.logged > 1 then 's' else '' end);
    if r.tracks_alcohol and r.logged > 0 then
      snippet := snippet || format(', %s verres standard pour un objectif de %s',
        replace(trim(to_char(r.units, 'FM990.0')), '.', ','), coalesce(r.objectifs->>'semaine', '10'));
    end if;
    snippet := snippet || '.';

    select net.http_post(
      url     := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'from', sender,
        'to', jsonb_build_array(r.reminder_email),
        'subject', subject,
        'text', format(
          E'Salut %s,\n\n%s\n'
          || E'Prends une minute pour compléter ta semaine, même avec « rien du tout » : chaque jour noté rapporte des points et garde ton personnage à jour.\n\n%s\n\n'
          || E'Tu reçois ce rappel parce que tu l''as activé. Pour l''arrêter ou changer de jour : Réglages, puis Rappels par e-mail.',
          coalesce(nullif(trim(r.pseudo), ''), 'toi'), snippet, app_url),
        'html', format(
          '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#1b2326;line-height:1.5">'
          '<p style="font-size:18px;font-weight:bold;margin:0 0 12px">Salut %s,</p>'
          '<p style="background:#f0f3f1;border-radius:10px;padding:12px 14px">%s</p>'
          '<p>Prends une minute pour compléter ta semaine, même avec « rien du tout » : chaque jour noté rapporte des points et garde ton personnage à jour.</p>'
          '<p style="margin:24px 0"><a href="%s" style="background:#263234;color:#eef2ee;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Compléter mon ardoise</a></p>'
          '<p style="font-size:12px;color:#64707a">Tu reçois ce rappel parce que tu l''as activé. Pour l''arrêter ou changer de jour : Réglages, puis Rappels par e-mail.</p></div>',
          who, snippet, app_url)
      )
    ) into req;

    update public.ardoise_profiles
       set last_reminder_at = now(), reminder_count = reminder_count + 1
     where user_id = r.user_id;
    insert into public.ardoise_reminder_log (user_id, kind, request_id)
    values (r.user_id, case when r.logged = 0 then 'idle' else 'incomplete' end, req);
    sent := sent + 1;
  end loop;

  return sent;
end $$;

revoke all on function public.ardoise_send_reminders() from public, anon, authenticated;

-- Every day at 08:00 UTC (10:00 in Brussels in summer, 09:00 in winter).
select cron.unschedule('ardoise-reminders') where exists (select 1 from cron.job where jobname = 'ardoise-reminders');
select cron.schedule('ardoise-reminders', '0 8 * * *', $$select public.ardoise_send_reminders()$$);

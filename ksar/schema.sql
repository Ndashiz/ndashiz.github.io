-- L'Ardoise — database schema. Run by hand in the SQL editor of a DEDICATED Supabase project
-- (EU region), not LazyPO's: every sign-up creates an auth user and ardoise_delete_me() deletes it.
-- Idempotent: safe to run again after an edit.

-- ---------------------------------------------------------------- tables
create table if not exists public.ardoise_profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  pseudo           text check (char_length(pseudo) <= 40),
  look             jsonb not null default '{}'::jsonb,   -- character: {skin, hair, style}
  habits           jsonb not null default '{}'::jsonb,   -- questionnaire: {alcool|cigarettes|drogues: {use, issue, ...}}
  objectifs        jsonb not null default '{}'::jsonb,   -- {semaine, soiree, exces, jours_sans, cigarettes_jour, drogues_semaine}
  reminder_email   text check (reminder_email is null or reminder_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  reminder_enabled boolean not null default false,
  reminder_day     smallint not null default 1 check (reminder_day between 1 and 7),   -- ISO weekday, 1 = Monday
  consent_at       timestamptz,                          -- explicit consent to store health-related data (GDPR art. 9)
  onboarded_at     timestamptz,
  tutorial_done_at timestamptz,
  baseline_week    date,                                 -- Monday of the measurement-only first week
  last_bilan_week  date,                                 -- Monday of the last weekly summary shown
  -- bookkeeping, server-side only (see ardoise_profiles_guard)
  last_entry_at    timestamptz,
  last_reminder_at timestamptz,
  reminder_count   integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.ardoise_entries (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date         date not null,                            -- the evening; cigarettes count for the whole day
  pils         smallint not null default 0 check (pils between 0 and 199),
  vin          smallint not null default 0 check (vin between 0 and 199),
  speciale     smallint not null default 0 check (speciale between 0 and 199),
  cocktail     smallint not null default 0 check (cocktail between 0 and 199),
  shot         smallint not null default 0 check (shot between 0 and 199),
  sans_alcool  smallint not null default 0 check (sans_alcool between 0 and 199),
  cigarettes   smallint not null default 0 check (cigarettes between 0 and 199),
  joint        smallint not null default 0 check (joint between 0 and 199),
  autre_drogue smallint not null default 0 check (autre_drogue between 0 and 199),
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, date)
);

-- Weekly answers: sport sessions (FR5.2.1) and the tips the user chose to apply (points, P2).
create table if not exists public.ardoise_weeks (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week       date not null check (extract(isodow from week) = 1),
  sport      smallint not null default 0 check (sport between 0 and 21),
  advice     text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);

-- Global settings edited by admins without a code change (FR4.4): the weighting matrix.
create table if not exists public.ardoise_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.ardoise_config (key, value) values
  ('poids', '{"pils":1,"vin":1,"speciale":2,"cocktail":1.5,"shot":1,"sans_alcool":0,"cigarettes":1,"joint":1,"autre_drogue":2}')
on conflict (key) do nothing;

-- Who may edit ardoise_config. Add yourself once:
--   insert into public.ardoise_admins (user_id) select id from auth.users where email = 'you@example.com';
create table if not exists public.ardoise_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table if not exists public.ardoise_reminder_log (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  sent_at    timestamptz not null default now(),
  kind       text not null,
  request_id bigint                                      -- pg_net request, see net._http_response
);

-- ---------------------------------------------------------------- RLS
alter table public.ardoise_profiles     enable row level security;
alter table public.ardoise_entries      enable row level security;
alter table public.ardoise_weeks        enable row level security;
alter table public.ardoise_config       enable row level security;
alter table public.ardoise_admins       enable row level security;
alter table public.ardoise_reminder_log enable row level security;

create or replace function public.ardoise_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ardoise_admins where user_id = auth.uid());
$$;

drop policy if exists "own profile" on public.ardoise_profiles;
create policy "own profile" on public.ardoise_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own entries" on public.ardoise_entries;
create policy "own entries" on public.ardoise_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own weeks" on public.ardoise_weeks;
create policy "own weeks" on public.ardoise_weeks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "config readable" on public.ardoise_config;
create policy "config readable" on public.ardoise_config for select to authenticated using (true);
drop policy if exists "config admin write" on public.ardoise_config;
create policy "config admin write" on public.ardoise_config for update to authenticated
  using ((select public.ardoise_is_admin())) with check ((select public.ardoise_is_admin()));

drop policy if exists "own admin row" on public.ardoise_admins;
create policy "own admin row" on public.ardoise_admins for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "own reminders" on public.ardoise_reminder_log;
create policy "own reminders" on public.ardoise_reminder_log for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.ardoise_profiles, public.ardoise_entries, public.ardoise_weeks,
              public.ardoise_config, public.ardoise_admins, public.ardoise_reminder_log from anon;
grant select, insert, update, delete on public.ardoise_profiles, public.ardoise_entries, public.ardoise_weeks to authenticated;
grant select, update on public.ardoise_config to authenticated;
grant select on public.ardoise_admins, public.ardoise_reminder_log to authenticated;

-- ---------------------------------------------------------------- triggers
-- A client may not touch the reminder bookkeeping (it would silence or spam its own reminders).
create or replace function public.ardoise_profiles_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.last_entry_at := null; new.last_reminder_at := null; new.reminder_count := 0; new.created_at := now();
    else
      new.last_entry_at := old.last_entry_at; new.last_reminder_at := old.last_reminder_at;
      new.reminder_count := old.reminder_count; new.created_at := old.created_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ardoise_profiles_guard on public.ardoise_profiles;
create trigger ardoise_profiles_guard before insert or update on public.ardoise_profiles
  for each row execute function public.ardoise_profiles_guard();

create or replace function public.ardoise_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ardoise_entries_touch on public.ardoise_entries;
create trigger ardoise_entries_touch before update on public.ardoise_entries for each row execute function public.ardoise_touch();
drop trigger if exists ardoise_weeks_touch on public.ardoise_weeks;
create trigger ardoise_weeks_touch before update on public.ardoise_weeks for each row execute function public.ardoise_touch();

create or replace function public.ardoise_config_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists ardoise_config_stamp on public.ardoise_config;
create trigger ardoise_config_stamp before update on public.ardoise_config for each row execute function public.ardoise_config_stamp();

-- Any saved day counts as activity: it resets the reminder counter.
create or replace function public.ardoise_entries_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.ardoise_profiles set last_entry_at = now(), reminder_count = 0 where user_id = new.user_id;
  return null;
end $$;
drop trigger if exists ardoise_entries_activity on public.ardoise_entries;
create trigger ardoise_entries_activity after insert or update on public.ardoise_entries
  for each row execute function public.ardoise_entries_activity();

-- ---------------------------------------------------------------- account deletion (GDPR)
-- Deletes the caller's auth user; every row above goes with it (on delete cascade).
create or replace function public.ardoise_delete_me() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.ardoise_delete_me() from public, anon;
grant execute on function public.ardoise_delete_me() to authenticated;
revoke all on function public.ardoise_entries_activity() from public, anon, authenticated;

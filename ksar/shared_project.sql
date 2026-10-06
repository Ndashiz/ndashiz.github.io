-- L'Ardoise inside the Supabase project it shares with LazyPO and LazySyndic (hrvx…).
-- Run by hand in that project's SQL editor, AFTER schema.sql. Never needed in a dedicated project.
--
-- LazyPO's trigger on_auth_user_created (lazypo/users_schema.sql, handle_new_user) gives EVERY new
-- auth user a LazyPO profile (allowed_modules = ['quiz']) and posts a "vient de s'inscrire sur LazyPO"
-- admin notification. L'Ardoise sign-ups carry raw_user_meta_data.app = 'ksar' (app.js, signUp):
-- these two guards drop exactly those two inserts, without touching LazyPO's function.
-- A ksar user who later goes to LazyPO on purpose can still get a profile: LazyPO's own client-side
-- insert (auth.js saveProfile) runs at trigger depth 1 and is never skipped.

create or replace function public.ardoise_is_ksar_signup(uid uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select u.raw_user_meta_data->>'app' = 'ksar' from auth.users u where u.id = uid), false);
$$;
revoke all on function public.ardoise_is_ksar_signup(uuid) from public, anon, authenticated;

-- pg_trigger_depth() > 1 = the insert comes from another trigger (here handle_new_user), not from a client.
create or replace function public.ardoise_skip_lazypo_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 and public.ardoise_is_ksar_signup(new.id) then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists ardoise_skip_lazypo_profile on public.profiles;
create trigger ardoise_skip_lazypo_profile before insert on public.profiles
  for each row execute function public.ardoise_skip_lazypo_profile();

-- Read through to_jsonb(): if LazyPO's live table ever lacks these columns, the guard does nothing
-- instead of failing (an error here would block every LazyPO sign-up).
create or replace function public.ardoise_skip_lazypo_signup_notif() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(new);
begin
  if rec->>'type' = 'signup' and pg_trigger_depth() > 1
     and rec->>'related_user_id' is not null
     and public.ardoise_is_ksar_signup((rec->>'related_user_id')::uuid) then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists ardoise_skip_lazypo_signup_notif on public.admin_notifications;
create trigger ardoise_skip_lazypo_signup_notif before insert on public.admin_notifications
  for each row execute function public.ardoise_skip_lazypo_signup_notif();

-- Check after a test sign-up on ndashiz.be/ksar/ (both should return 0 rows for that e-mail):
--   select p.* from public.profiles p join auth.users u on u.id = p.id where u.email = 'test@…';
--   select n.* from public.admin_notifications n join auth.users u on u.id = n.related_user_id where u.email = 'test@…';

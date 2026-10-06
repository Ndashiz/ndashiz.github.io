# L'Ardoise — `ndashiz.be/ksar/`

Habit-reduction app for alcohol, cigarettes and drugs: daily logging, a weekly score that drives an
illustrated character, points that reward effort, data-triggered advice and a weekly reminder e-mail.
Static vanilla JS (no build), Supabase for accounts and data. UI in French.

## Files

| File | Role |
|---|---|
| `index.html` | Shell: fonts, `app.css`, then `supabase.min.js` → `config.js` → `core.js` → `avatar.js` → `app.js` |
| `core.js` | Pure logic (no DOM, no network): weighting matrix, weekly stats, score, points, advice triggers, onboarding suggestions. `node ksar/core.test.js` |
| `avatar.js` | The character, four flat-vector scenes drawn in SVG (suit + convertible → city car → smoking wreck → cardboard + shopping cart), three looks (skin, hair colour, haircut) |
| `app.js` | Views: landing + account, questionnaire, tutorial, main screen, weekly table, settings, weekly summary |
| `schema.sql` | Tables, RLS, triggers, `ardoise_delete_me()` — run by hand |
| `kill_switch.sql` | The switch Jarvis flips (nav → L'Ardoise): `ksar_disabled` in LazyPO's `app_settings`, RLS locks on every `ardoise_*` table, counts for the Jarvis page — run by hand, after `shared_project.sql` |
| `shared_project.sql` | Guards for the project shared with LazyPO: a ksar sign-up gets no LazyPO profile or admin notification — run by hand, after `schema.sql` |
| `reminders.sql` | Weekly e-mail via `pg_cron` + `pg_net` + Resend — run by hand, after `schema.sql` |
| `config.js` | Supabase URL + anon key (public by design, RLS protects the data) |
| `supabase.min.js` | supabase-js 2.108.2, same vendored build as LazyPO (works with the `sb_publishable_` key; its presence bug does not matter here, no realtime) |

## Setup (once)

L'Ardoise runs in the Supabase project it shares with LazyPO and LazySyndic (`hrvx…`, same URL and
publishable key as `lazypo/auth.js`, already in `config.js`). All its objects are prefixed `ardoise_`.

1. **SQL editor** (hrvx project) — run `schema.sql`, then `shared_project.sql`.
   The second file matters: LazyPO's `on_auth_user_created` trigger gives every new auth user a LazyPO
   profile (quiz access) and a "s'est inscrit sur LazyPO" admin notification. L'Ardoise sign-ups are tagged
   `raw_user_meta_data.app = 'ksar'` and the two guards there drop exactly those inserts.
2. **Auth → URL configuration** — keep LazyPO's Site URL; *add* redirect URLs `https://ndashiz.be/ksar/`
   and `http://localhost:3100/ksar/`. Auth e-mail templates are shared with LazyPO: keep their wording
   neutral (no "LazyPO") or confirmation e-mails will name the wrong app.
3. **Reminders** — on resend.com, create an API key and verify `ndashiz.be` (SPF + DKIM DNS records), then
   `select vault.create_secret('re_…', 'ardoise_resend_key');` and run `reminders.sql`.
   Test with `select public.ardoise_send_reminders();`.
4. **Kill switch** — run `kill_switch.sql`. Jarvis (nav → L'Ardoise) then takes the site down or brings it
   back with the LazyPO secret it already holds (`LAZYPO_SETTINGS_SECRET`). When it is on: the app shows a
   pause screen (open tabs switch within 5 minutes), RLS refuses every `ardoise_*` row, and the reminder
   job sends nothing. GitHub Pages still serves the files — there is no Worker on `/ksar`. No data is deleted.
5. **Admin** — to edit the weighting matrix from the app (Settings → Administration):
   `insert into public.ardoise_admins (user_id) select id from auth.users where email = '…';`

Accounts are shared across ndashiz.be: someone who already has a LazyPO or LazySyndic login signs in to
L'Ardoise with the same password. "Supprimer mon compte" (`ardoise_delete_me()`) erases all L'Ardoise data
and deletes the login only when no other app (LazyPO profile, LazySyndic membership) still uses it.

To move to a dedicated project later: run `schema.sql` there (skip `shared_project.sql`), point
`config.js` at it, and copy the `ardoise_*` rows over.

Push to `main` → GitHub Pages. Bump the `?v=` query strings in `index.html` when shipping a change,
or Cloudflare may serve the old JS for ~10 minutes.

## Decisions on the requirements' open questions

| Question | Decision |
|---|---|
| Points direction (Q1, P2) | Two numbers. **Score /100** = consumption vs objectives, drives the character. **Points** = reward, never decrease: 10 per logged day, 30 for a full week, 15 per sport session, 40 per objective met, 5 per logged alcohol-free day, 10 per applied tip, plus a bonus per unit under the objective |
| Reminder (Q2, FR7.2) | Per-user weekday (Monday by default). Sent only if the previous week has fewer than 7 logged days. Content = nudge + two-line snippet (days logged, standard drinks vs objective). Stops after 4 reminders without a new entry |
| Weighting matrices (Q3, FR4) | Alcohol in Belgian standard drinks (beer 1, wine 1, special beer 2, cocktail 1.5, shot 1, alcohol-free 0); cigarettes 1 each; drugs in "occasions" (joint 1, other drug 2). Global, admin-editable in `ardoise_config` |
| Benchmarks by age | The questionnaire asks the age (18+ only; stored as `habits.birth_year`). Next to the objectives (and in Settings), the user sees the Belgian figures for their age band — Sciensano, Health Interview Survey 2023-2024, crude %, `BE_HIS` in `core.js`: more than 10 drinks a week, monthly binge, daily drinking, mean weekly drinks of weekly drinkers, respect of the 4 recommendations, daily smoking and cigarettes a day, cannabis and other drugs in the past year (15-64 only) — on a scale with the health limit, the user today and the objective |
| Objective definition (Q4, P3) | Both. The questionnaire proposes absolute objectives (a step down, capped at the health limits). The first week is a measurement-only baseline (neutral character); its summary offers objectives at −20 % of what was measured |
| State thresholds (Q5) | 80+ top form · 60–79 OK · 40–59 declining · below 40 lowest state. Trend shown vs the mean of the 4 previous weeks; tips move to the top of the page when the week is declining |
| Privacy (Q6) | Explicit consent at sign-up (stored as `consent_at`), RLS on every table, no third-party tracking, JSON export and full account deletion from Settings |
| P1 (soften lowest state) | Not applied to the drawing: the lowest state stays "à la rue" as first requested. The copy is supportive rather than judging, and the help line appears for heavy weeks. Switching the drawing to "tired" is a one-function change in `avatar.js` |
| P5 (safety line) | Belgian help lines in the footer, and highlighted in the tips panel / weekly summary / onboarding when a week is heavy (`needsHelp()`), with the warning about stopping alcohol abruptly |

## Data model

`ardoise_profiles` (one per user: pseudo, look, questionnaire answers, objectives, reminder settings,
baseline week) · `ardoise_entries` (one row per user and day, counts per type) · `ardoise_weeks` (sport
sessions and applied tips per week) · `ardoise_config` (weighting matrix) · `ardoise_admins` ·
`ardoise_reminder_log`. Score and points are computed client-side from entries, never stored.

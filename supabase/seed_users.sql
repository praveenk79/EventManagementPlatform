-- ============================================================================
-- Event Platform — SEED DATA: 10 test users (display / assignment only)
--
-- PURPOSE: populate the app with people so you can test role assignment,
-- committee membership, and task assignment. These make the Users page and
-- assignee dropdowns look real.
--
-- IMPORTANT — THESE USERS CANNOT LOG IN.
--   The app uses Google sign-in only. Creating an auth.users row does NOT
--   create a Google account, so nobody can actually authenticate as these
--   seeded users. They exist purely so you (a real signed-in admin) can assign
--   them roles/committees/tasks and see the app populated. Every seeded email
--   ends in "@seed.test" so they're easy to spot and delete later.
--
-- HOW IT WORKS
--   Your schema.sql defines a trigger (handle_new_user) that auto-creates a
--   public.profiles row whenever a row is inserted into auth.users. So this
--   file only inserts into auth.users; the profiles appear automatically.
--
-- HOW TO RUN
--   1. Back up first (real users already exist in this project).
--   2. Paste into Supabase Dashboard → SQL Editor → Run.
--
-- SAFE TO RE-RUN: guarded with `where not exists` per email. (auth.users has
-- only a PARTIAL unique index on email, so `on conflict (email)` is rejected
-- with "no unique or exclusion constraint matching" — hence the guard instead.)
--
-- CLEANUP (removes all seeded users + their memberships/profiles via cascade):
--   delete from auth.users where email like '%@seed.test';
-- ============================================================================

begin;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
select
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  v.email,
  '',                       -- no password; these can't log in anyway
  now(),                    -- mark confirmed so they look like normal accounts
  now(),
  now(),
  '{"provider":"seed","providers":["seed"]}'::jsonb,
  jsonb_build_object('full_name', v.full_name)
from (values
  ('aisha.rahman@seed.test',    'Aisha Rahman'),
  ('ben.carter@seed.test',      'Ben Carter'),
  ('chen.wei@seed.test',        'Chen Wei'),
  ('diana.osei@seed.test',      'Diana Osei'),
  ('emilio.santos@seed.test',   'Emilio Santos'),
  ('farah.iqbal@seed.test',     'Farah Iqbal'),
  ('george.mwangi@seed.test',   'George Mwangi'),
  ('hana.kim@seed.test',        'Hana Kim'),
  ('ivan.petrov@seed.test',     'Ivan Petrov'),
  ('julia.nowak@seed.test',     'Julia Nowak')
) as v(email, full_name)
where not exists (
  select 1 from auth.users u where u.email = v.email
);

commit;

-- After running, go to Admin → Users to see them, then assign system roles and
-- committee memberships from that screen (or from each committee's Members panel).

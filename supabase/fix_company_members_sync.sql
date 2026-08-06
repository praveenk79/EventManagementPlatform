-- ============================================================================
-- Event Platform — FIX: keep company_members in sync with profiles
--
-- WHAT WENT WRONG
-- companies.sql (step 1a) added a stricter function, is_company_admin(uuid),
-- which ONLY trusts a real row in company_members. It has no legacy fallback
-- to profiles.system_role the way is_admin() does. events.sql (step 2a) then
-- switched committee/event creation over to is_company_admin(). But nothing
-- was ever added to WRITE a company_members row when:
--   a. a brand-new person signs up (handle_new_user() in schema.sql only
--      ever touched profiles), or
--   b. an existing admin promotes someone to admin via /admin-users (that
--      page's saveEdit() only ever updates profiles.system_role).
-- Result: someone can be system_role = 'admin' and see every admin page
-- (those still check the older, fallback-having is_admin()), but the moment
-- they try to CREATE a committee or event, is_company_admin() has nothing to
-- check and Postgres blocks it with "new row violates row-level security
-- policy" — exactly the error hit when creating a committee just now.
--
-- WHAT THIS FILE DOES
--   1. Backfills a company_members row for anyone in profiles who doesn't
--      have one yet (same "Default Company" every existing user already
--      belongs to — this just catches anyone who signed up after
--      companies.sql's one-time backfill ran).
--   2. Rewrites handle_new_user() (from schema.sql) so every future signup
--      gets a company_members row the moment their profile is created, not
--      just a profiles row.
--   3. Adds a trigger on profiles: whenever system_role changes to/from
--      'admin' or 'super_admin', company_members.role is kept in sync
--      automatically — so promoting someone via /admin-users is enough, no
--      app code needs to remember to also touch company_members.
--
-- HOW TO RUN
-- Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to re-run. Nothing is dropped, no data is lost.
--
-- WHAT SHOULD CHANGE AFTER RUNNING THIS
-- Nothing visibly, except: creating a committee or event will now work for
-- every existing admin, and it will keep working for every future signup or
-- promotion without this ever needing to be run again.
-- ============================================================================


-- ============================================================================
-- 1. BACKFILL — anyone in profiles missing a company_members row joins the
--    one company that already exists (mirrors companies.sql section 5).
-- ============================================================================

do $$
declare
  v_company_id uuid;
begin
  select id into v_company_id from public.companies where slug = 'default';

  if v_company_id is null then
    raise exception 'No "default" company found — this fix expects companies.sql to have already run';
  end if;

  insert into public.company_members (company_id, user_id, role)
  select
    v_company_id,
    p.id,
    case when p.system_role in ('admin', 'super_admin') then 'admin' else 'member' end
  from public.profiles p
  where not exists (
    select 1 from public.company_members cm where cm.user_id = p.id
  );
end $$;


-- ============================================================================
-- 2. FIX SIGNUP — every new profile also gets a company_members row.
--
-- SAME NAME/SIGNATURE as schema.sql's handle_new_user(), so the existing
-- trigger (on_auth_user_created) picks up this new body with no other change.
-- New signups join "Default Company" as a plain member — matches today's
-- backfill behavior exactly, just done automatically going forward instead
-- of needing a one-time script.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_company_id uuid;
begin
  v_role := case when public.is_super_admin_email(new.email) then 'super_admin' else 'member' end;

  insert into public.profiles (id, email, full_name, avatar_url, system_role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    v_role
  )
  on conflict (id) do nothing;

  select id into v_company_id from public.companies where slug = 'default';

  if v_company_id is not null then
    insert into public.company_members (company_id, user_id, role)
    values (v_company_id, new.id, case when v_role = 'super_admin' then 'admin' else 'member' end)
    on conflict do nothing;
  end if;

  return new;
end;
$$;


-- ============================================================================
-- 3. FIX PROMOTION — keep company_members.role in sync whenever
--    profiles.system_role changes, so /admin-users' "make admin" toggle is
--    enough on its own.
--
-- Only touches role, and only for the person's existing company_members row
-- (everyone already has one after section 1). Owners are never touched —
-- companies.sql already protects the owner role with its own trigger
-- (guard_company_member_role); this trigger only ever writes 'admin' or
-- 'member', so it can't accidentally create or remove an owner.
-- ============================================================================

create or replace function public.sync_company_member_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.system_role is distinct from old.system_role then
    update public.company_members
    set role = case when new.system_role in ('admin', 'super_admin') then 'admin' else 'member' end
    where user_id = new.id
      and role <> 'owner';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_company_member_role on public.profiles;
create trigger profiles_sync_company_member_role
  after update on public.profiles
  for each row execute function public.sync_company_member_role();


-- ============================================================================
-- 4. CHECK IT WORKED
--
--   -- 1. Nobody in profiles is missing a company_members row (should be 0):
--   select count(*) from public.profiles p
--    where not exists (select 1 from public.company_members cm where cm.user_id = p.id);
--
--   -- 2. Every profiles.system_role of 'admin'/'super_admin' has a matching
--   --    company_members.role of 'admin' or 'owner' (should be 0 mismatches):
--   select count(*) from public.profiles p
--     join public.company_members cm on cm.user_id = p.id
--    where p.system_role in ('admin', 'super_admin')
--      and cm.role = 'member';
--
-- THEN THE TEST THAT ACTUALLY MATTERS: sign in as the admin who hit the
-- error, go to /admin-committees, and create a committee. It should succeed.
-- ============================================================================

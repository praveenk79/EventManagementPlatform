-- ============================================================================
-- Event Platform — STEP 1a: COMPANIES (the tenant layer)
--
-- WHAT THIS IS FOR
-- Today the database assumes one customer. This adds the top layer that turns
-- it into something you can sell to many customers:
--
--     Company  (this file)
--       └── Event      (step 2a — not in this file)
--             └── Committee, tasks, chat, files, program  (already built)
--
-- HOW TO RUN
-- Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to re-run. Nothing is dropped. No existing table is modified.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- It does not touch committees, tasks, chat, files, folders, lists or the
-- program. It does not create events. Those come in step 2a. This file is
-- kept small on purpose so you can verify it before anything is built on it.
--
-- WHAT SHOULD CHANGE IN THE APP AFTER RUNNING THIS
-- Nothing, visibly. Every existing user is backfilled into one company, so
-- "admin of everything" and "admin of my company" resolve to the same people.
-- That is the whole point: if the app looks different after this, something
-- is wrong. Section 6 tells you how to check.
--
-- WHY NOW
-- The backfill in section 5 is a handful of rows today because you have one
-- customer. With twenty live customers this same step becomes a migration
-- project. This is the cheapest it will ever be.
-- ============================================================================


-- ============================================================================
-- 1. COMPANIES
-- ============================================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- slug is the short url-safe handle ("acme-nonprofit"). Globally unique,
  -- because a company is the top of the tree. Events and committees are only
  -- unique *within* their parent — see step 2a.
  slug text unique not null,
  -- 'suspended' switches a customer off (non-payment, contract ended) without
  -- deleting a thing. Section 3 makes this actually revoke access.
  status text not null default 'active' check (status in ('active', 'suspended')),
  -- your own private notes about the account; never shown to the customer
  notes text default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 2. COMPANY MEMBERSHIP
--
-- Three roles, and they are about the COMPANY, not about a committee:
--   owner  - the admin you assign when provisioning. Only platform staff can
--            create or change an owner, so a customer cannot lock themselves
--            out or promote a colleague above the person you hold accountable.
--   admin  - full control inside the company (create events, committees, users)
--   member - belongs to the company; sees only what committee membership grants
--
-- Per your decision on 2026-07-27: ONE PERSON BELONGS TO ONE COMPANY. The
-- unique index below enforces it, and it is load-bearing — it is what lets
-- is_admin() take no arguments (there is never any question of "admin of
-- which company"). If you ever need one person in two companies, dropping
-- that index is the easy part; every is_admin() call site then needs a
-- company argument, which is the expensive part. Know that before changing it.
-- ============================================================================

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz default now()
);

create unique index if not exists company_members_user_unique
  on public.company_members(user_id);

create index if not exists company_members_company_id_idx
  on public.company_members(company_id);


-- ============================================================================
-- 3. WHO AM I
--
-- All security definer + stable, and called from policies as (select fn()) —
-- same reason as the existing helpers in schema.sql: a plain invoker-rights
-- function used inside a table's own policy makes Postgres recurse into that
-- policy and raise "infinite recursion detected" (42P17).
-- ============================================================================

-- Platform staff = you. This is NOT a customer role — it is the vendor of the
-- software. Bootstrapped from the same two hardcoded addresses already in
-- schema.sql, so you can never lock yourself out of your own product by
-- editing a row.
create or replace function public.is_platform_staff()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select public.is_super_admin_email(public.current_user_email());
$$;

revoke execute on function public.is_platform_staff() from public;
grant execute on function public.is_platform_staff() to authenticated;


-- The caller's company, or null.
-- Null for platform staff who belong to no customer company, for anyone not
-- yet provisioned, and — importantly — for a SUSPENDED company. Everything
-- else builds on this function, so suspending a company revokes its users'
-- access everywhere at once without touching any of their data.
create or replace function public.my_company_id()
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select cm.company_id
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.user_id = auth.uid()
    and c.status = 'active'
    and not public.is_deleted_user()
  limit 1;
$$;

revoke execute on function public.my_company_id() from public;
grant execute on function public.my_company_id() to authenticated;


-- Is the caller an owner/admin of this specific company?
create or replace function public.is_company_admin(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    public.is_platform_staff()
    or (
      target_company_id is not null
      and target_company_id = public.my_company_id()
      and exists (
        select 1 from public.company_members
        where user_id = auth.uid()
          and company_id = target_company_id
          and role in ('owner', 'admin')
      )
    );
$$;

revoke execute on function public.is_company_admin(uuid) from public;
grant execute on function public.is_company_admin(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- is_admin() — SAME NAME, SAME SIGNATURE, NEW MEANING.
--
--   Before: "I have system_role admin"        = admin of the entire database
--   After:  "I am platform staff, OR I am owner/admin of my own company"
--
-- Roughly 55 RLS policies call is_admin(). Because the signature is unchanged,
-- every one of them keeps working and silently becomes company-scoped. That is
-- what makes this migration affordable instead of a rewrite.
--
-- NOTE ON ORDERING: soft_delete_users.sql already replaced the is_admin() from
-- schema.sql, and this replaces that one. It keeps the is_deleted_user() check
-- that file added — a removed user stays locked out. If you ever re-run
-- soft_delete_users.sql, re-run THIS file afterwards or you will silently
-- revert to global admin.
--
-- profiles.system_role is still honoured during the transition so nobody in
-- flight loses access, but it is now legacy. company_members.role is the real
-- source of truth from here on.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    public.is_platform_staff()
    or (
      not public.is_deleted_user()
      and (
        exists (
          select 1
          from public.company_members cm
          join public.companies c on c.id = cm.company_id
          where cm.user_id = auth.uid()
            and cm.role in ('owner', 'admin')
            and c.status = 'active'
        )
        -- legacy fallback, transitional: honours the old global flag so that
        -- anyone who was an admin before this file ran stays one until they
        -- are properly attached to a company. Safe to delete once you have
        -- confirmed every admin has a company_members row.
        or exists (
          select 1 from public.profiles
          where id = auth.uid() and system_role in ('admin', 'super_admin')
        )
      )
    );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;


-- ============================================================================
-- 4. RLS
-- ============================================================================

alter table public.companies       enable row level security;
alter table public.company_members enable row level security;

-- A customer sees exactly one company: their own. You see all of them.
drop policy if exists "View own company, staff view all" on public.companies;
create policy "View own company, staff view all"
  on public.companies for select
  using (
    (select public.is_platform_staff())
    or id = (select public.my_company_id())
  );

-- ONLY platform staff create companies. This is the manual provisioning you
-- asked for — there is deliberately no self-serve signup path anywhere.
drop policy if exists "Only platform staff create companies" on public.companies;
create policy "Only platform staff create companies"
  on public.companies for insert
  with check ((select public.is_platform_staff()));

-- A company admin may rename their own company. They may NOT change its
-- status or slug — RLS can restrict rows but not columns, so that part is
-- enforced by the trigger in section 4b.
drop policy if exists "Staff or company admin update company" on public.companies;
create policy "Staff or company admin update company"
  on public.companies for update
  using (
    (select public.is_platform_staff())
    or (select public.is_company_admin(id))
  );

drop policy if exists "Only platform staff delete companies" on public.companies;
create policy "Only platform staff delete companies"
  on public.companies for delete
  using ((select public.is_platform_staff()));


-- You can see your colleagues; nobody outside your company.
drop policy if exists "View company colleagues" on public.company_members;
create policy "View company colleagues"
  on public.company_members for select
  using (
    (select public.is_platform_staff())
    or company_id = (select public.my_company_id())
  );

drop policy if exists "Staff or company admin add members" on public.company_members;
create policy "Staff or company admin add members"
  on public.company_members for insert
  with check ((select public.is_company_admin(company_id)));

drop policy if exists "Staff or company admin update members" on public.company_members;
create policy "Staff or company admin update members"
  on public.company_members for update
  using ((select public.is_company_admin(company_id)));

drop policy if exists "Staff or company admin remove members" on public.company_members;
create policy "Staff or company admin remove members"
  on public.company_members for delete
  using ((select public.is_company_admin(company_id)));


-- --- 4b. Column guards -----------------------------------------------------

-- Stop a customer admin un-suspending their own account or changing their slug.
create or replace function public.guard_company_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_staff() then
    new.status := old.status;
    new.slug   := old.slug;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_guard_update on public.companies;
create trigger companies_guard_update
  before update on public.companies
  for each row execute function public.guard_company_update();


-- Only platform staff may create, change or remove an 'owner'. Without this a
-- customer admin could promote themselves to owner, or delete the owner row
-- and leave the account headless.
--
-- auth.uid() is null when this runs from the Supabase SQL Editor (or any
-- direct psql/migration session) rather than through the app's API — there is
-- no logged-in user to check is_platform_staff() against. Only someone with
-- your database credentials can run SQL that way, so null auth.uid() is
-- trusted the same as platform staff. This is what let the section 5 backfill
-- assign the first owner row.
create or replace function public.guard_company_member_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.is_platform_staff() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' and new.role = 'owner' then
    raise exception 'Only platform staff may assign the owner role';
  end if;

  if tg_op = 'UPDATE' and (old.role = 'owner' or new.role = 'owner') then
    raise exception 'Only platform staff may change the owner role';
  end if;

  if tg_op = 'DELETE' and old.role = 'owner' then
    raise exception 'Only platform staff may remove a company owner';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists company_members_guard_role on public.company_members;
create trigger company_members_guard_role
  before insert or update on public.company_members
  for each row execute function public.guard_company_member_role();

drop trigger if exists company_members_guard_delete on public.company_members;
create trigger company_members_guard_delete
  before delete on public.company_members
  for each row execute function public.guard_company_member_role();


-- ============================================================================
-- 5. BACKFILL — your existing users become company #1
--
-- Runs once, safe to re-run. Do not skip this: without it my_company_id()
-- returns null for everyone and the new policies hide everything.
-- ============================================================================

do $$
declare
  v_company_id uuid;
  v_owner_id   uuid;
begin
  -- The first hardcoded super-admin address that actually has a profile
  -- becomes the owner of the default company.
  select id into v_owner_id
  from public.profiles
  where public.is_super_admin_email(email)
  order by created_at
  limit 1;

  insert into public.companies (name, slug, notes, created_by)
  select 'Default Company', 'default',
         'Auto-created by companies.sql — rename this to your real customer',
         v_owner_id
  where not exists (select 1 from public.companies where slug = 'default');

  select id into v_company_id from public.companies where slug = 'default';

  -- Everyone who already exists joins it, preserving whether they were an
  -- admin under the old global system_role. Owner is set first so the
  -- one-row-per-user index does not hand the slot to a plain member.
  if v_owner_id is not null then
    insert into public.company_members (company_id, user_id, role)
    select v_company_id, v_owner_id, 'owner'
    where not exists (
      select 1 from public.company_members where user_id = v_owner_id
    );
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
-- 6. REALTIME
-- Runs automatically as part of this file now — no separate manual step.
-- Wrapped so re-running the file (or a table already being in the
-- publication) never raises an error.
-- ============================================================================

do $$
begin
  execute 'alter publication supabase_realtime add table public.companies';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.company_members';
exception when duplicate_object then null;
end $$;


-- ============================================================================
-- 7. CHECK IT WORKED
--
--   -- 1. One company, and every existing user is in it:
--   select c.name, cm.role, count(*)
--     from public.company_members cm
--     join public.companies c on c.id = cm.company_id
--    group by 1, 2 order by 2;
--
--   -- 2. Nobody was left behind (should be 0):
--   select count(*) from public.profiles p
--    where not exists (select 1 from public.company_members cm
--                       where cm.user_id = p.id);
--
--   -- 3. You are still staff, still an admin, and now have a company:
--   select public.is_platform_staff(),   -- true
--          public.is_admin(),            -- true
--          public.my_company_id();       -- a uuid, not null
--
--   -- 4. There is exactly one owner:
--   select count(*) from public.company_members where role = 'owner';   -- 1
--
-- THEN THE TEST THAT ACTUALLY MATTERS — this file rewrote is_admin(), which
-- around 55 policies depend on. Sign in to the app and confirm:
--   - the admin nav still appears
--   - a committee workspace still loads its tasks, chat, files and members
--   - /admin-users still lists people
--   - /programs still shows the schedule
-- Nothing should look different. If something vanished, check query 3 first:
-- a null my_company_id() means the backfill did not attach your user.
--
-- TO ROLL BACK (only safe before step 2a is run):
--   drop table if exists public.company_members cascade;
--   drop table if exists public.companies cascade;
--   -- then re-run soft_delete_users.sql to restore the previous is_admin().
-- ============================================================================

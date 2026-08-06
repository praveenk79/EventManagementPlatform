-- ============================================================================
-- Event Platform — STEP 2a: EVENTS (the middle layer) + real event isolation
--
-- WHAT THIS IS FOR
--     Company           (step 1a — companies.sql, already run)
--       └── Event        <- THIS FILE
--             └── Committee, tasks, chat, files, folders, lists, program
--                 (already built, now correctly isolated per event/company)
--
-- HOW TO RUN
-- Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to re-run. Nothing is dropped that holds data. No existing row is lost.
--
-- WHAT THIS FILE DOES
--   1. Creates `events`, scoped to a company.
--   2. Adds `committees.event_id` and `program_days.event_id`, backfills every
--      existing committee/program day into one "Default Event", then makes
--      the column required.
--   3. Fixes two real cross-tenant leaks found while building this:
--        a. `is_committee_member()` / `is_committee_head()` granted access to
--           ANY committee to ANY company admin — they never checked that the
--           committee's company matched the admin's own company. With one
--           company this was invisible. With two, Company A's admin could
--           read/write Company B's committee just by knowing its id.
--        b. Three RLS policies (committees select, committee_members select,
--           tasks select) call `is_admin()` directly, which means "admin of
--           MY company" with no check against the row being read — same leak,
--           one level up.
--   4. Moves `committees.slug` and `program_days.day_number` from globally
--      unique to unique-within-their-event — unblocks event #2 ever having a
--      "Food" committee or a "Day 1".
--   5. Narrows program-day/session visibility from "any signed-in user" to
--      "a member of one of this event's committees, or an admin of its
--      company" — the same visibility rule committees already use. This is a
--      deliberate behavior change: today ANY signed-in user (any company) can
--      see the program; after this, only people connected to that event can.
--
-- WHY THE FIX IS CHEAP
-- Every table below `committees` (tasks, chat, files, folders, lists,
-- comments, vendor links) already routes through `is_committee_member()` /
-- `is_committee_head()` and nothing else — confirmed by grepping every other
-- .sql file in this folder for a bare `is_admin()` call gating a
-- committee-scoped row; there is none outside the three policies fixed below.
-- So rewriting those two functions' bodies fixes every one of those tables
-- for free, the same trick step 1a used for `is_admin()`.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--   - Does not touch the `profiles` cross-company leak ("Authenticated users
--     can view all profiles") — flagged, out of scope for this step.
--   - Does not add a create-event UI or event switcher — that is step 2b.
--   - Does not add event-level roles (event admin/organizer) — per your
--     decision, a company admin runs every event in their company. No new
--     table for that.
--   - Does not enforce `events.status` beyond hiding an archived event's
--     program/committees from plain members — company admins can still see
--     an archived event. There is no "suspend an event" workflow yet.
--
-- NOTE ON ORDERING IN THIS FILE
-- The functions in section 3 reference `committees.event_id`, so that column
-- must exist BEFORE those functions are created — `language sql` functions
-- are validated against the current schema at creation time, not lazily at
-- call time. That is why "add the column" (section 2) comes before "write
-- functions that use it" (section 3), even though conceptually you might
-- expect the events table + helpers to be introduced together first.
-- ============================================================================


-- ============================================================================
-- 1. EVENTS
-- ============================================================================

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  -- unique WITHIN a company only — see section 2 for why this must not be global.
  slug text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  start_date date,
  end_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists events_company_slug_unique
  on public.events(company_id, slug);

create index if not exists events_company_id_idx on public.events(company_id);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- Only platform staff may move an event to a different company. Not a
-- realistic operation, but cheap to close off at the source rather than rely
-- solely on downstream RLS.
create or replace function public.guard_event_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_staff() then
    new.company_id := old.company_id;
  end if;
  return new;
end;
$$;

drop trigger if exists events_guard_update on public.events;
create trigger events_guard_update
  before update on public.events
  for each row execute function public.guard_event_update();


-- ============================================================================
-- 2. committees.event_id + BACKFILL + per-event slug uniqueness
--
-- Done before section 3's functions are created — see "NOTE ON ORDERING"
-- above.
-- ============================================================================

alter table public.committees add column if not exists event_id uuid references public.events(id) on delete cascade;
alter table public.program_days add column if not exists event_id uuid references public.events(id) on delete cascade;

do $$
declare
  v_company_id uuid;
  v_event_id   uuid;
begin
  select id into v_company_id from public.companies where slug = 'default';

  if v_company_id is null then
    raise exception 'No "default" company found — run companies.sql before events.sql';
  end if;

  insert into public.events (company_id, name, slug, created_by)
  select v_company_id, 'Default Event', 'default',
         (select created_by from public.companies where id = v_company_id)
  where not exists (
    select 1 from public.events where company_id = v_company_id and slug = 'default'
  );

  select id into v_event_id
  from public.events where company_id = v_company_id and slug = 'default';

  update public.committees set event_id = v_event_id where event_id is null;
  update public.program_days set event_id = v_event_id where event_id is null;
end $$;

alter table public.committees alter column event_id set not null;
alter table public.program_days alter column event_id set not null;

create index if not exists committees_event_id_idx on public.committees(event_id);
create index if not exists program_days_event_id_idx on public.program_days(event_id);

-- Drop whatever the existing single-column unique constraints are actually
-- named (found dynamically rather than assumed — they were declared
-- inline/table-level in schema.sql, so Postgres's auto-generated name is an
-- implementation detail this file shouldn't hardcode and risk a silent no-op
-- against).
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.committees'::regclass
    and contype = 'u'
    and conkey = array[(select attnum from pg_attribute
                         where attrelid = 'public.committees'::regclass and attname = 'slug')];
  if v_conname is not null then
    execute format('alter table public.committees drop constraint %I', v_conname);
  end if;
end $$;

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.program_days'::regclass
    and contype = 'u'
    and conkey = array[(select attnum from pg_attribute
                         where attrelid = 'public.program_days'::regclass and attname = 'day_number')];
  if v_conname is not null then
    execute format('alter table public.program_days drop constraint %I', v_conname);
  end if;
end $$;

do $$
begin
  alter table public.committees
    add constraint committees_event_slug_unique unique (event_id, slug);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.program_days
    add constraint program_days_event_day_unique unique (event_id, day_number);
exception when duplicate_object then null;
end $$;


-- ============================================================================
-- 3. WHO CAN SEE / MANAGE AN EVENT
--
-- Same reasoning as companies.sql section 3: security definer + stable +
-- called from policies as (select fn()), or Postgres raises "infinite
-- recursion detected in policy" (42P17) when a policy's own table is queried
-- from inside a plain function referenced by that same policy.
-- ============================================================================

-- Admin of the event's own company (or platform staff). Reuses
-- is_company_admin() from companies.sql rather than re-deriving the same
-- check.
create or replace function public.is_event_admin(target_event_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id
      and public.is_company_admin(e.company_id)
  );
$$;

revoke execute on function public.is_event_admin(uuid) from public;
grant execute on function public.is_event_admin(uuid) to authenticated;


-- Company admin of the event, OR sits on at least one of the event's
-- committees while the event is still active. There is no separate "I'm
-- generally part of this event" flag — your committee row IS your event
-- membership, same as it already is your event's task/chat access.
create or replace function public.is_event_member(target_event_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    public.is_event_admin(target_event_id)
    or exists (
      select 1
      from public.committees c
      join public.committee_members cm on cm.committee_id = c.id
      join public.events e on e.id = c.event_id
      where c.event_id = target_event_id
        and cm.user_id = auth.uid()
        and e.status = 'active'
    );
$$;

revoke execute on function public.is_event_member(uuid) from public;
grant execute on function public.is_event_member(uuid) to authenticated;


-- ============================================================================
-- 4. THE ACTUAL FIX — is_committee_member() / is_committee_head(), rewritten
--    to check the committee's OWN company, not just "is the caller an admin
--    of SOME company". SAME NAME, SAME SIGNATURE — every table that already
--    calls these (tasks, chat, files, folders, lists, comments) becomes
--    correctly isolated with no changes to those files, exactly like
--    is_admin() in companies.sql section 3.
--
--    Before: is_admin() OR <a membership row exists>
--            -> is_admin() means "I am admin of MY company", so this was
--               true for ANY committee, in ANY company, for ANY admin.
--    After:  is_event_admin(this committee's event) OR <a membership row>
--            -> only true if the caller admins THIS committee's own company.
-- ============================================================================

create or replace function public.is_committee_member(target_committee_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.committee_members
      where committee_id = target_committee_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.committees c
      where c.id = target_committee_id
        and public.is_event_admin(c.event_id)
    );
$$;

revoke execute on function public.is_committee_member(uuid) from public;
grant execute on function public.is_committee_member(uuid) to authenticated;

create or replace function public.is_committee_head(target_committee_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.committee_members
      where committee_id = target_committee_id and user_id = auth.uid() and role = 'head'
    )
    or exists (
      select 1 from public.committees c
      where c.id = target_committee_id
        and public.is_event_admin(c.event_id)
    );
$$;

revoke execute on function public.is_committee_head(uuid) from public;
grant execute on function public.is_committee_head(uuid) to authenticated;


-- ============================================================================
-- 5. RLS — events table, and the three bare-is_admin() policies that leaked
-- ============================================================================

alter table public.events enable row level security;

drop policy if exists "Members and company admins view events" on public.events;
create policy "Members and company admins view events"
  on public.events for select
  using ((select public.is_event_member(id)));

drop policy if exists "Company admins create events" on public.events;
create policy "Company admins create events"
  on public.events for insert
  with check ((select public.is_company_admin(company_id)));

drop policy if exists "Company admins update events" on public.events;
create policy "Company admins update events"
  on public.events for update
  using ((select public.is_company_admin(company_id)))
  with check ((select public.is_company_admin(company_id)));

drop policy if exists "Company admins delete events" on public.events;
create policy "Company admins delete events"
  on public.events for delete
  using ((select public.is_company_admin(company_id)));


-- --- committees — THIS REPLACES 4 POLICIES FROM schema.sql ------------------
-- The select policy dropped its bare `is_admin() OR ...` — is_committee_member()
-- already covers the (now correctly scoped) admin case, so the OR was the leak.
-- insert/update/delete move from "any admin" to "admin of THIS event's company".

drop policy if exists "Admins and members can view committees" on public.committees;
create policy "Members and company admins view committees"
  on public.committees for select
  using ((select public.is_committee_member(id)));

drop policy if exists "Only admins manage committees" on public.committees;
create policy "Company admins create committees"
  on public.committees for insert
  with check ((select public.is_event_admin(event_id)));

drop policy if exists "Only admins update committees" on public.committees;
create policy "Company admins update committees"
  on public.committees for update
  using ((select public.is_event_admin(event_id)))
  with check ((select public.is_event_admin(event_id)));

drop policy if exists "Only admins delete committees" on public.committees;
create policy "Company admins delete committees"
  on public.committees for delete
  using ((select public.is_event_admin(event_id)));


-- --- committee_members — replaces 1 policy from schema.sql ------------------
-- Same fix: drop the bare is_admin() OR; is_committee_member() already covers
-- it, correctly scoped this time. user_id = auth.uid() stays — seeing your own
-- membership row is never a cross-tenant leak.

drop policy if exists "View own membership or fellow members, admins view all" on public.committee_members;
create policy "View own membership, fellow members, or company admin"
  on public.committee_members for select
  using (
    user_id = auth.uid()
    or (select public.is_committee_member(committee_id))
  );


-- --- tasks — replaces 1 policy from schema.sql ------------------------------
-- insert/update/delete were already fixed by volunteer_create_tasks.sql (they
-- only call is_committee_member/is_committee_head, no bare is_admin()) and
-- inherit today's fix automatically. Only select still had the leak.

drop policy if exists "Committee members and admins view tasks" on public.tasks;
create policy "Committee members and company admins view tasks"
  on public.tasks for select
  using ((select public.is_committee_member(committee_id)));


-- --- program_days / program_sessions — replaces 4 policies from schema.sql --
-- Was "any authenticated user can view" (cross-company leak) + bare is_admin()
-- to manage (same "any admin, any company" leak as above). Now scoped to the
-- event the same way committees are.

drop policy if exists "Any authenticated user can view program days" on public.program_days;
create policy "Event members and company admins view program days"
  on public.program_days for select
  using ((select public.is_event_member(event_id)));

drop policy if exists "Only admins manage program days" on public.program_days;
create policy "Company admins manage program days"
  on public.program_days for all
  using ((select public.is_event_admin(event_id)))
  with check ((select public.is_event_admin(event_id)));

drop policy if exists "Any authenticated user can view program sessions" on public.program_sessions;
create policy "Event members and company admins view program sessions"
  on public.program_sessions for select
  using (
    exists (
      select 1 from public.program_days d
      where d.id = program_sessions.program_day_id
        and (select public.is_event_member(d.event_id))
    )
  );

drop policy if exists "Only admins manage program sessions" on public.program_sessions;
create policy "Company admins manage program sessions"
  on public.program_sessions for all
  using (
    exists (
      select 1 from public.program_days d
      where d.id = program_sessions.program_day_id
        and (select public.is_event_admin(d.event_id))
    )
  )
  with check (
    exists (
      select 1 from public.program_days d
      where d.id = program_day_id
        and (select public.is_event_admin(d.event_id))
    )
  );


-- ============================================================================
-- 6. REALTIME — automatic, safe to re-run (same pattern as companies.sql §6)
-- ============================================================================

do $$
begin
  execute 'alter publication supabase_realtime add table public.events';
exception when duplicate_object then null;
end $$;


-- ============================================================================
-- 7. CHECK IT WORKED
--
--   -- 1. One event, and every existing committee/program day is in it:
--   select e.name, count(distinct c.id) as committees, count(distinct d.id) as program_days
--     from public.events e
--     left join public.committees c on c.event_id = e.id
--     left join public.program_days d on d.event_id = e.id
--    group by e.id, e.name;
--
--   -- 2. Nobody was left behind (both should be 0):
--   select count(*) from public.committees where event_id is null;
--   select count(*) from public.program_days where event_id is null;
--
--   -- 3. Slug/day_number are now per-event, not global. This should succeed
--      with no duplicate-key error, since it's a different event. Clean up
--      the test row after:
--   -- insert into public.events (company_id, name, slug) values
--   --   ((select company_id from public.events where slug='default'), 'Test Event', 'test-event');
--   -- delete from public.events where slug = 'test-event';
--
-- THEN THE TEST THAT ACTUALLY MATTERS — this file rewrote is_committee_member()
-- and is_committee_head(), which everything below committees depends on. Sign
-- in and confirm, same as after companies.sql:
--   - the admin nav still appears
--   - a committee workspace still loads its tasks, chat, files and members
--   - /programs still shows the schedule
--   - /admin-committees, /admin-users still work
-- Nothing should look different — you have exactly one company and one event,
-- so nothing changes yet. This is the point: verify at zero-risk now, before
-- step 2b lets a second event exist.
--
-- TO ROLL BACK (only safe immediately after running, before any second event
-- or committee is created against the new schema):
--   drop table if exists public.events cascade;
--   alter table public.committees drop column if exists event_id;
--   alter table public.program_days drop column if exists event_id;
--   -- then re-run schema.sql to restore the original is_committee_member()/
--   -- is_committee_head() definitions (or soft_delete_users.sql +
--   -- companies.sql, whichever you last ran, to get back to the pre-events
--   -- state of those two functions).
-- ============================================================================

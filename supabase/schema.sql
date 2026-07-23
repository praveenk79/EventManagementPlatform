-- ============================================================================
-- Event Platform — production schema (v2)
--
-- HOW TO RUN THIS
--   1. BACK UP FIRST. This project has real signed-up users and possibly real
--      task rows already. Before running anything below, either:
--        - Supabase Dashboard → Database → Backups → trigger a manual backup, or
--        - Table Editor → export `tasks` (and any other table) to CSV, or
--        - if you're on a plan with branching, dry-run this whole file against
--          a branch/copy of production first.
--   2. Paste this entire file into Supabase Dashboard → SQL Editor → Run.
--      It is wrapped in a single transaction: if anything fails, nothing is
--      committed.
--   3. READ THE CAVEAT in the "tasks" section before trusting old task→committee
--      links — the automatic backfill only covers the 12 committees that were
--      hardcoded in the app before this migration. If you created extra
--      committees through the old admin screen and logged tasks against them,
--      those specific rows will end up with a NULL committee_id and need a
--      manual follow-up UPDATE (see caveat for the exact query to check).
--
-- This file is safe to re-run: every statement is written to be idempotent
-- (create/alter ... if not exists, on conflict do nothing, etc.) except the
-- one-time `tasks` column migration, which guards itself with a check so it
-- won't run twice.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Generic updated_at trigger, reused by every mutable table below.
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- profiles — one row per auth.users row, this is the real identity+role table
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,
  system_role text not null default 'member' check (system_role in ('member', 'admin', 'super_admin')),
  created_at timestamptz default now()
);

-- Looks up the CURRENT email for a user directly from auth.users, rather than
-- trusting a point-in-time JWT claim — required so the two hardcoded
-- super-admin addresses can never be "locked out" by a stale token.
create or replace function public.current_user_email()
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select email from auth.users where id = auth.uid();
$$;

revoke execute on function public.current_user_email() from public;
grant execute on function public.current_user_email() to authenticated;

create or replace function public.is_super_admin_email(check_email text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select lower(check_email) in (
    'praveen.konduru@gmail.com',
    'praveenkonduru79@gmail.com'
  );
$$;

revoke execute on function public.is_super_admin_email(text) from public;
grant execute on function public.is_super_admin_email(text) to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    is_super_admin_email(current_user_email())
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and system_role in ('admin', 'super_admin')
    );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Creates a profile row automatically whenever someone signs up via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, system_role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    case when public.is_super_admin_email(new.email) then 'super_admin' else 'member' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- One-time backfill for anyone who already signed up before this migration ran.
insert into public.profiles (id, email, full_name, avatar_url, system_role)
select
  u.id,
  u.email,
  u.raw_user_meta_data->>'full_name',
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
  case when public.is_super_admin_email(u.email) then 'super_admin' else 'member' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Always re-assert super_admin for the two hardcoded addresses, even if a row
-- already existed with a different role (e.g. from before this migration).
update public.profiles
set system_role = 'super_admin'
where is_super_admin_email(email) and system_role <> 'super_admin';

-- Guards against a non-admin promoting themselves via a direct PATCH — RLS
-- alone cannot restrict this to specific columns, so this trigger is required.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.system_role is distinct from old.system_role and not public.is_admin() then
    new.system_role := old.system_role;
  end if;
  -- The two hardcoded addresses can never be demoted, even by another admin.
  if public.is_super_admin_email(new.email) then
    new.system_role := 'super_admin';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role_change on public.profiles;
create trigger profiles_guard_role_change
  before update on public.profiles
  for each row execute function public.guard_profile_role_change();

-- ============================================================================
-- committees + committee_members
-- ============================================================================

create table if not exists public.committees (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text default '',
  archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.committee_members (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'volunteer' check (role in ('volunteer', 'head')),
  created_at timestamptz default now(),
  unique (committee_id, user_id)
);

create index if not exists committee_members_user_id_idx on public.committee_members(user_id);
create index if not exists committee_members_committee_id_idx on public.committee_members(committee_id);

-- Helper functions that reference committee_members. These MUST be
-- security definer + called from policies as `(select fn())` — a plain
-- (invoker-rights) function referenced from inside committee_members' own
-- RLS policy causes Postgres to recurse into that same policy while
-- evaluating the function, which raises "infinite recursion detected in
-- policy" (42P17). security definer breaks that cycle because the function
-- body runs with the privileges of its owner, not subject to the caller's
-- RLS on committee_members.
create or replace function public.is_committee_member(target_committee_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.committee_members
      where committee_id = target_committee_id and user_id = auth.uid()
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
    public.is_admin()
    or exists (
      select 1 from public.committee_members
      where committee_id = target_committee_id and user_id = auth.uid() and role = 'head'
    );
$$;

revoke execute on function public.is_committee_head(uuid) from public;
grant execute on function public.is_committee_head(uuid) to authenticated;

-- Seed the 12 committees that existed as hardcoded slugs before this
-- migration (src/lib/rbac.ts). Needed before the tasks backfill below can map
-- old free-text committee_id values onto real committee rows.
insert into public.committees (slug, name, description)
values
  ('committee_youth', 'Youth Conference', 'Youth track coordination'),
  ('committee_awards', 'Award Committee', 'Award selection and recognition'),
  ('committee_speakers', 'Speaker Coordination', 'Speaker recruitment and scheduling'),
  ('committee_registration', 'Registration Committee', 'Registration and check-in'),
  ('committee_website', 'Website Communications', 'Website content and updates'),
  ('committee_flyer', 'Flyer Design', 'Marketing flyers and materials'),
  ('committee_sponsors', 'Sponsor Coordination', 'Sponsorship management'),
  ('committee_hotel', 'Hotel & Accommodation', 'Hotel booking and coordination'),
  ('committee_food', 'Food Committee', 'Catering and dining arrangements'),
  ('committee_travel', 'Travel Arrangements', 'Transportation and travel logistics'),
  ('committee_entertainment', 'Entertainment Group', 'Entertainment and activities'),
  ('committee_executive', 'Executive Dinner', 'Executive event planning')
on conflict (slug) do nothing;

-- ============================================================================
-- tasks — ALTER the existing table in place. Never dropped/recreated.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'committee_id'
      and data_type = 'text'
  ) then
    -- 1. Add the new uuid column alongside the old text one.
    alter table public.tasks add column if not exists committee_id_new uuid references public.committees(id);

    -- 2. Backfill by matching the old free-text committee_id to a committee slug.
    --    CAVEAT: this only maps the 12 committees seeded above. If additional
    --    committees were created through the old /admin-committees screen
    --    (which used ids like 'committee_1234567890'), tasks logged against
    --    those will NOT match here and committee_id_new will stay NULL for
    --    those specific rows. After running this migration, check:
    --      select id, committee_id, title from public.tasks where committee_id_new is null;
    --    ...and manually UPDATE those rows once you've re-created the missing
    --    committee(s) in the new `committees` table.
    update public.tasks t
    set committee_id_new = c.id
    from public.committees c
    where t.committee_id = c.slug and t.committee_id_new is null;

    -- 3. Add assignee_id (real profile reference) alongside the old free-text
    --    assignee. Deliberately NOT auto-populated from the old text value —
    --    the old assignee was a hand-typed/selected display name with no
    --    reliable mapping to a real signed-up user, and guessing wrong would
    --    silently grant that real person update rights over someone else's
    --    task. Leave null; admins/heads reassign manually post-migration.
    alter table public.tasks add column if not exists assignee_id uuid references public.profiles(id) on delete set null;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'tasks' and column_name = 'assignee'
    ) then
      alter table public.tasks rename column assignee to assignee_name_legacy;
    end if;

    alter table public.tasks add column if not exists created_by uuid references public.profiles(id) on delete set null;

    -- 4. Swap the old text column out for the new uuid one.
    alter table public.tasks drop column committee_id;
    alter table public.tasks rename column committee_id_new to committee_id;
    alter table public.tasks alter column committee_id set not null;
  end if;
end;
$$;

create index if not exists tasks_committee_id_idx on public.tasks(committee_id);
create index if not exists tasks_assignee_id_idx on public.tasks(assignee_id);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Restricts a plain assignee (not head/admin of the task's committee) to only
-- changing status on their own task — otherwise a volunteer could quietly
-- change priority/due_date/assignee on their own task, which would undermine
-- the whole point of admins/heads getting accurate live visibility without
-- having to double-check everything themselves.
create or replace function public.guard_task_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_committee_head(new.committee_id) then
    return new;
  end if;

  if old.assignee_id = auth.uid() then
    new.committee_id := old.committee_id;
    new.title := old.title;
    new.priority := old.priority;
    new.due_date := old.due_date;
    new.assignee_id := old.assignee_id;
    new.assignee_name_legacy := old.assignee_name_legacy;
    new.created_by := old.created_by;
    return new;
  end if;

  raise exception 'Not authorized to update this task';
end;
$$;

drop trigger if exists tasks_guard_update on public.tasks;
create trigger tasks_guard_update
  before update on public.tasks
  for each row execute function public.guard_task_update();

-- ============================================================================
-- programs — event schedule, up to 5 days
-- ============================================================================

create table if not exists public.program_days (
  id uuid primary key default gen_random_uuid(),
  day_number int not null check (day_number between 1 and 5),
  date date,
  created_at timestamptz default now(),
  unique (day_number)
);

create table if not exists public.program_sessions (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references public.program_days(id) on delete cascade,
  order_index int not null default 0,
  time_label text,
  duration_minutes int,
  session_type text default 'session',
  title text not null,
  location text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists program_sessions_day_id_idx on public.program_sessions(program_day_id);

drop trigger if exists program_sessions_set_updated_at on public.program_sessions;
create trigger program_sessions_set_updated_at
  before update on public.program_sessions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- committee_files + committee_messages — first real implementation of these;
-- the old UI wrote fake metadata to localStorage without ever touching
-- Storage or a table.
-- ============================================================================

create table if not exists public.committee_files (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  file_size_bytes bigint,
  created_at timestamptz default now()
);

create index if not exists committee_files_committee_id_idx on public.committee_files(committee_id);

create table if not exists public.committee_messages (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists committee_messages_committee_id_created_at_idx on public.committee_messages(committee_id, created_at);

-- Storage bucket for committee file uploads. Files are stored under a
-- `<committee_id>/<filename>` path so storage.objects policies below can
-- scope access by committee membership using the same is_committee_member().
insert into storage.buckets (id, name, public)
values ('committee-files', 'committee-files', false)
on conflict (id) do nothing;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.committees enable row level security;
alter table public.committee_members enable row level security;
alter table public.tasks enable row level security;
alter table public.program_days enable row level security;
alter table public.program_sessions enable row level security;
alter table public.committee_files enable row level security;
alter table public.committee_messages enable row level security;

-- --- profiles ---------------------------------------------------------------
-- Every signed-in user can see everyone's basic profile (needed to show names
-- across committees/tasks). No INSERT policy: rows are only ever created by
-- the handle_new_user() trigger, never directly by a client.

drop policy if exists "Authenticated users can view all profiles" on public.profiles;
create policy "Authenticated users can view all profiles"
  on public.profiles for select
  using (auth.role() = 'authenticated');

drop policy if exists "Users can update own profile, admins can update any" on public.profiles;
create policy "Users can update own profile, admins can update any"
  on public.profiles for update
  using (auth.uid() = id or (select public.is_admin()))
  with check (auth.uid() = id or (select public.is_admin()));

-- --- committees --------------------------------------------------------------

drop policy if exists "Admins and members can view committees" on public.committees;
create policy "Admins and members can view committees"
  on public.committees for select
  using ((select public.is_admin()) or (select public.is_committee_member(id)));

drop policy if exists "Only admins manage committees" on public.committees;
create policy "Only admins manage committees"
  on public.committees for insert
  with check ((select public.is_admin()));

drop policy if exists "Only admins update committees" on public.committees;
create policy "Only admins update committees"
  on public.committees for update
  using ((select public.is_admin()));

drop policy if exists "Only admins delete committees" on public.committees;
create policy "Only admins delete committees"
  on public.committees for delete
  using ((select public.is_admin()));

-- --- committee_members -------------------------------------------------------

drop policy if exists "View own membership or fellow members, admins view all" on public.committee_members;
create policy "View own membership or fellow members, admins view all"
  on public.committee_members for select
  using (
    (select public.is_admin())
    or user_id = auth.uid()
    or (select public.is_committee_member(committee_id))
  );

drop policy if exists "Heads and admins manage committee membership" on public.committee_members;
create policy "Heads and admins manage committee membership"
  on public.committee_members for insert
  with check ((select public.is_committee_head(committee_id)));

drop policy if exists "Heads and admins update committee membership" on public.committee_members;
create policy "Heads and admins update committee membership"
  on public.committee_members for update
  using ((select public.is_committee_head(committee_id)));

drop policy if exists "Heads and admins remove committee membership" on public.committee_members;
create policy "Heads and admins remove committee membership"
  on public.committee_members for delete
  using ((select public.is_committee_head(committee_id)));

-- --- tasks --------------------------------------------------------------------
-- Replaces the old single "any authenticated user can do anything" policy.

drop policy if exists "Authenticated users can manage tasks" on public.tasks;

drop policy if exists "Committee members and admins view tasks" on public.tasks;
create policy "Committee members and admins view tasks"
  on public.tasks for select
  using ((select public.is_admin()) or (select public.is_committee_member(committee_id)));

drop policy if exists "Heads and admins create tasks" on public.tasks;
create policy "Heads and admins create tasks"
  on public.tasks for insert
  with check ((select public.is_committee_head(committee_id)));

drop policy if exists "Heads or assignees update tasks" on public.tasks;
create policy "Heads or assignees update tasks"
  on public.tasks for update
  using (
    (select public.is_committee_head(committee_id))
    or assignee_id = auth.uid()
  );

drop policy if exists "Heads and admins delete tasks" on public.tasks;
create policy "Heads and admins delete tasks"
  on public.tasks for delete
  using ((select public.is_committee_head(committee_id)));

-- --- program_days / program_sessions ------------------------------------------
-- Every signed-in user (including plain "member") can view the event program.
-- Only admins can edit it.

drop policy if exists "Any authenticated user can view program days" on public.program_days;
create policy "Any authenticated user can view program days"
  on public.program_days for select
  using (auth.role() = 'authenticated');

drop policy if exists "Only admins manage program days" on public.program_days;
create policy "Only admins manage program days"
  on public.program_days for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Any authenticated user can view program sessions" on public.program_sessions;
create policy "Any authenticated user can view program sessions"
  on public.program_sessions for select
  using (auth.role() = 'authenticated');

drop policy if exists "Only admins manage program sessions" on public.program_sessions;
create policy "Only admins manage program sessions"
  on public.program_sessions for all
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- --- committee_files / committee_messages -------------------------------------

drop policy if exists "Committee members view files" on public.committee_files;
create policy "Committee members view files"
  on public.committee_files for select
  using ((select public.is_committee_member(committee_id)));

drop policy if exists "Committee members upload files" on public.committee_files;
create policy "Committee members upload files"
  on public.committee_files for insert
  with check ((select public.is_committee_member(committee_id)));

drop policy if exists "Uploader or head deletes file" on public.committee_files;
create policy "Uploader or head deletes file"
  on public.committee_files for delete
  using (uploaded_by = auth.uid() or (select public.is_committee_head(committee_id)));

drop policy if exists "Committee members view messages" on public.committee_messages;
create policy "Committee members view messages"
  on public.committee_messages for select
  using ((select public.is_committee_member(committee_id)));

drop policy if exists "Committee members send messages" on public.committee_messages;
create policy "Committee members send messages"
  on public.committee_messages for insert
  with check ((select public.is_committee_member(committee_id)));

drop policy if exists "Author or head deletes message" on public.committee_messages;
create policy "Author or head deletes message"
  on public.committee_messages for delete
  using (user_id = auth.uid() or (select public.is_committee_head(committee_id)));

-- --- storage.objects (committee-files bucket) ---------------------------------
-- Files are uploaded under a `<committee_id>/<filename>` path. Table RLS on
-- committee_files above does NOT protect the underlying bytes — Storage has
-- its own RLS on storage.objects, so it must be scoped here too.

drop policy if exists "Committee members view own committee files" on storage.objects;
create policy "Committee members view own committee files"
  on storage.objects for select
  using (
    bucket_id = 'committee-files'
    and (select public.is_committee_member((storage.foldername(name))[1]::uuid))
  );

drop policy if exists "Committee members upload to own committee folder" on storage.objects;
create policy "Committee members upload to own committee folder"
  on storage.objects for insert
  with check (
    bucket_id = 'committee-files'
    and (select public.is_committee_member((storage.foldername(name))[1]::uuid))
  );

drop policy if exists "Committee members delete own committee files" on storage.objects;
create policy "Committee members delete own committee files"
  on storage.objects for delete
  using (
    bucket_id = 'committee-files'
    and (select public.is_committee_member((storage.foldername(name))[1]::uuid))
  );

commit;

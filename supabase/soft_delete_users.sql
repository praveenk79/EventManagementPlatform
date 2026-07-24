-- ============================================================================
-- Event Platform — soft delete for users
--
-- WHAT THIS IS FOR
-- Admins need a Delete on the user management screen. A hard delete is wrong
-- here: people are attached to tasks they were assigned and messages they sent,
-- and removing the row would turn all of that history into "Unknown". So this
-- is a SOFT delete — the profile row stays (history intact), but the person
-- loses all access and disappears from the active user list.
--
-- WHAT "DELETED" MEANS, CONCRETELY
--   * deleted_at is stamped, so the UI can filter them out
--   * all their committee memberships are removed (they're on no committee)
--   * system_role is forced back to 'member'
--   * they can no longer read or write ANYTHING (see the RLS section below)
--   * their name still shows on old tasks and chat messages
--   * their auth account still exists, so they can sign in — but they'll see an
--     empty app and be bounced out by middleware. Signing in does NOT undo the
--     deletion (handle_new_user uses `on conflict do nothing`).
--
-- HOW TO RUN
-- Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to re-run.
-- ============================================================================

begin;

-- Null = active. Timestamped = deleted (and by whom, for accountability).
alter table public.profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

-- Active-user lookups are the common case.
create index if not exists profiles_deleted_at_idx
  on public.profiles(deleted_at)
  where deleted_at is null;

-- ----------------------------------------------------------------------------
-- Make deletion actually mean something
--
-- This is the important part. Without it, "deleted" is only a UI filter: a
-- deleted user with a live session, or anyone calling the API directly, would
-- still have full access. is_admin() and is_committee_member() are the two
-- gates every other policy in the app is built on, so denying deleted users
-- there revokes access everywhere at once — including tables added later.
--
-- Note is_committee_head() calls is_admin() but has its own membership lookup,
-- so it needs the check too.
-- ----------------------------------------------------------------------------
create or replace function public.is_deleted_user()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and deleted_at is not null
  );
$$;

revoke execute on function public.is_deleted_user() from public;
grant execute on function public.is_deleted_user() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    not public.is_deleted_user()
    and (
      is_super_admin_email(current_user_email())
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and system_role in ('admin', 'super_admin')
      )
    );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_committee_member(target_committee_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    not public.is_deleted_user()
    and (
      public.is_admin()
      or exists (
        select 1 from public.committee_members
        where committee_id = target_committee_id and user_id = auth.uid()
      )
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
    not public.is_deleted_user()
    and (
      public.is_admin()
      or exists (
        select 1 from public.committee_members
        where committee_id = target_committee_id and user_id = auth.uid() and role = 'head'
      )
    );
$$;

revoke execute on function public.is_committee_head(uuid) from public;
grant execute on function public.is_committee_head(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- The delete + restore actions
--
-- Done as functions rather than a plain UPDATE from the client because deleting
-- has to do three things atomically (stamp, strip memberships, reset role). A
-- client doing three separate writes could half-fail and leave someone
-- "deleted" but still sitting on a committee.
-- ----------------------------------------------------------------------------
create or replace function public.soft_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer          -- needs to write another user's row + memberships
set search_path = public, pg_temp
as $$
begin
  -- Any admin can delete (user's choice), but the check must happen here since
  -- security definer bypasses RLS.
  if not public.is_admin() then
    raise exception 'Only admins can delete users';
  end if;

  -- The two hardcoded super admin addresses are permanent everywhere else in
  -- this schema; deleting them would lock you out of your own app.
  if public.is_super_admin_email((select email from public.profiles where id = target_user_id)) then
    raise exception 'This account is permanent and cannot be deleted';
  end if;

  -- Deleting yourself is always a mistake, never an intent.
  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id and deleted_at is null) then
    raise exception 'User not found or already deleted';
  end if;

  update public.profiles
     set deleted_at = now(),
         deleted_by = auth.uid(),
         system_role = 'member'
   where id = target_user_id;

  delete from public.committee_members where user_id = target_user_id;
end;
$$;

revoke execute on function public.soft_delete_user(uuid) from public;
grant execute on function public.soft_delete_user(uuid) to authenticated;

-- Undo. Restores them as a plain member on no committees — roles are NOT
-- brought back, since we don't store what they were. Re-assign manually.
create or replace function public.restore_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can restore users';
  end if;

  update public.profiles
     set deleted_at = null,
         deleted_by = null
   where id = target_user_id;
end;
$$;

revoke execute on function public.restore_user(uuid) from public;
grant execute on function public.restore_user(uuid) to authenticated;

commit;

-- ============================================================================
-- VERIFY (run after the transaction commits)
--
--   -- 1. Columns exist:
--   select column_name from information_schema.columns
--    where table_name = 'profiles' and column_name in ('deleted_at','deleted_by');
--
--   -- 2. Nobody is deleted yet:
--   select count(*) from public.profiles where deleted_at is not null;   -- 0
--
--   -- 3. Your own admin access still works (MOST IMPORTANT CHECK — this
--   --    rewrote is_admin/is_committee_member/is_committee_head, so if these
--   --    return false for you, STOP and tell Claude before going further):
--   select public.is_deleted_user();   -- expect false
--   -- Then just load the app: /admin should still open, committees still list.
--
--   -- 4. After deleting someone from the UI, confirm the side effects:
--   select email, deleted_at, system_role from public.profiles where deleted_at is not null;
--   select count(*) from public.committee_members cm
--     join public.profiles p on p.id = cm.user_id where p.deleted_at is not null;  -- 0
-- ============================================================================

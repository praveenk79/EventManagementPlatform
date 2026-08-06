-- ============================================================================
-- Event Platform — let volunteers create their own tasks
--
-- WHAT THIS IS FOR
-- Today only a committee head can create a task. So a volunteer who needs to
-- write down "call the printer back" has nowhere to put it — they have to ask
-- their head to create it for them, which in practice means it goes in WhatsApp
-- instead. This lets any committee member add a task to their own committee.
--
-- HOW TO RUN
-- Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Changes policies and one trigger function only. No table or column changes,
-- no data touched. Safe to re-run.
--
-- WHAT STAYS THE SAME
-- Heads keep full control: they can still edit, reassign, reprioritise and
-- delete anything in their committee. A volunteer gets no new power over anyone
-- else's work — only the ability to add and manage their own.
--
-- ⚠️  THIS FILE REPLACES guard_task_update()
-- That function is the thing that stops a volunteer editing fields they
-- shouldn't. It is defined in schema.sql (~line 330). If task editing starts
-- behaving oddly after running this, this is the file to look at.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Any committee member can create a task
-- ----------------------------------------------------------------------------
-- The old policy required is_committee_head(). Now any member of the committee
-- may insert — but with two guard rails:
--
--   * created_by must be you. Without this, someone could file a task under
--     another person's name, and the audit trail of who added what becomes
--     worthless.
--   * a non-head may only leave the task unassigned or assign it to themselves.
--     Handing work to other people is a head's job; otherwise any volunteer
--     could drop tasks onto a colleague's list.
--
-- Heads skip the assignee restriction entirely, which is why the is_committee_head
-- branch comes first.
drop policy if exists "Heads and admins create tasks" on public.tasks;
drop policy if exists "Committee members create tasks" on public.tasks;
create policy "Committee members create tasks"
  on public.tasks for insert
  with check (
    (select public.is_committee_member(committee_id))
    and created_by = auth.uid()
    and (
      (select public.is_committee_head(committee_id))
      or assignee_id is null
      or assignee_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Let people edit and delete the tasks they created
-- ----------------------------------------------------------------------------
-- Without this, creating a task would be a one-way door: a volunteer could add
-- "Call printer" with a typo and have no way to fix or remove it, because the
-- update rules only ever recognised heads and assignees. That is the kind of
-- dead end that makes a feature worse than not having it.

drop policy if exists "Heads or assignees update tasks" on public.tasks;
drop policy if exists "Heads, assignees or creators update tasks" on public.tasks;
create policy "Heads, assignees or creators update tasks"
  on public.tasks for update
  using (
    (select public.is_committee_head(committee_id))
    or assignee_id = auth.uid()
    or created_by = auth.uid()
  );

-- Delete: heads as before, plus your own task — but only while nobody else has
-- been put on it. Once a head assigns your task to someone, it has become the
-- committee's work item and is no longer yours to remove.
drop policy if exists "Heads and admins delete tasks" on public.tasks;
drop policy if exists "Heads or creators delete own tasks" on public.tasks;
create policy "Heads or creators delete own tasks"
  on public.tasks for delete
  using (
    (select public.is_committee_head(committee_id))
    or (
      created_by = auth.uid()
      and (assignee_id is null or assignee_id = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Rewrite the update guard
-- ----------------------------------------------------------------------------
-- The policy above says WHO may attempt an update. This trigger says WHICH
-- FIELDS each of them may actually change — the policy alone cannot express
-- "you may edit this row, but only this column".
--
-- How it behaves, in plain terms:
--   * Head or admin  → change anything.
--   * You created it and it is yours (unassigned, or assigned to you)
--                    → change the title, priority and due date. You may also
--                      claim it or release it, but not push it onto someone else.
--   * You are only the assignee (a head created it and gave it to you)
--                    → change the status. Nothing else. Unchanged from before.
--   * Anyone else     → rejected.
--
-- NOTE ON THE SILENT REVERT, which is pre-existing behaviour kept here on
-- purpose: when someone edits a field they are not allowed to change, the old
-- value is quietly put back rather than the save being rejected. The save
-- appears to succeed and the value snaps back with no explanation. That is
-- confusing, and the fix belongs in the UI (hide or disable those fields for
-- people who cannot change them) rather than here — raising an exception
-- instead would break the existing status-only update path that volunteers use
-- every day. Flagged in ARCHITECTURE.md as a known rough edge.
create or replace function public.guard_task_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Heads and admins: unrestricted.
  if public.is_committee_head(new.committee_id) then
    return new;
  end if;

  -- Your own task, still yours: you own the details but cannot hand it to
  -- someone else, and cannot move it to a different committee.
  if old.created_by = auth.uid()
     and (old.assignee_id is null or old.assignee_id = auth.uid()) then
    new.committee_id := old.committee_id;
    new.created_by := old.created_by;
    new.assignee_name_legacy := old.assignee_name_legacy;
    -- Claiming or releasing your own task is allowed; assigning it to a third
    -- party is not, so anything other than null-or-you is reverted.
    if new.assignee_id is not null and new.assignee_id <> auth.uid() then
      new.assignee_id := old.assignee_id;
    end if;
    return new;
  end if;

  -- Assigned to you by someone else: status only. Unchanged from before.
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

-- The trigger itself is unchanged; recreated so this file works whether or not
-- schema.sql has been re-run since.
drop trigger if exists tasks_guard_update on public.tasks;
create trigger tasks_guard_update
  before update on public.tasks
  for each row execute function public.guard_task_update();

commit;

-- ============================================================================
-- CHECK IT WORKED
--
--   -- 1. Four task policies, with the new names:
--   select policyname, cmd from pg_policies
--    where tablename = 'tasks' order by cmd;
--   -- expect: Committee members create tasks (INSERT),
--   --         Heads or creators delete own tasks (DELETE),
--   --         Committee members and admins view tasks (SELECT),
--   --         Heads, assignees or creators update tasks (UPDATE)
--
--   -- 2. The trigger is still attached:
--   select tgname from pg_trigger where tgname = 'tasks_guard_update';
--
-- THEN TEST IN THE APP with a second Google account that is a volunteer (not a
-- head) on one committee:
--   a. Add a task           → should work
--   b. Rename that task     → should work
--   c. Delete that task     → should work
--   d. Rename a task the head created and assigned to you
--                           → title snaps back, status still changes (expected)
--   e. Assign your task to another member
--                           → assignee snaps back to unassigned (expected)
-- ============================================================================

-- ============================================================================
-- Event Platform — comments / notes on tasks
--
-- WHAT THIS IS FOR
-- So a committee head can ask "where are we on this?" on the task itself, and
-- the assignee can answer there — instead of that conversation happening in
-- WhatsApp where it's detached from the work.
--
-- WHO CAN DO WHAT
--   * view + add: anyone who can see the task (its committee's members, plus
--     admins). Deliberately NOT restricted to the head/assignee — the whole
--     point is a two-way note between them.
--   * delete: the comment's author, or the committee head.
--   * edit: nobody. Comments are immutable, matching how chat messages already
--     work in this schema. Changing that later is a schema change, not a UI one.
--
-- HOW TO RUN
-- Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Then re-run supabase/enable_realtime.sql (it gained task_comments), so two
-- people looking at the same task see each other's comments live.
-- Safe to re-run.
-- ============================================================================

begin;

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now()
);

-- Comments are always read as "all comments on this task, oldest first".
create index if not exists task_comments_task_id_created_at_idx
  on public.task_comments(task_id, created_at);

-- Which committee owns a task? security definer so the policies below can read
-- `tasks` without going through tasks' own RLS (which would filter the lookup
-- and make the policy fail for legitimate viewers). Same pattern as
-- list_committee_id() in lists.sql.
create or replace function public.task_committee_id(target_task_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select committee_id from public.tasks where id = target_task_id;
$$;

revoke execute on function public.task_committee_id(uuid) from public;
grant execute on function public.task_committee_id(uuid) to authenticated;

alter table public.task_comments enable row level security;

drop policy if exists "Committee members view task comments" on public.task_comments;
create policy "Committee members view task comments"
  on public.task_comments for select
  using ((select public.is_committee_member((select public.task_committee_id(task_id)))));

-- author_id is pinned to the caller so a comment can't be attributed to someone
-- else by a hand-crafted request.
drop policy if exists "Committee members add task comments" on public.task_comments;
create policy "Committee members add task comments"
  on public.task_comments for insert
  with check (
    author_id = auth.uid()
    and (select public.is_committee_member((select public.task_committee_id(task_id))))
  );

drop policy if exists "Author or head deletes task comment" on public.task_comments;
create policy "Author or head deletes task comment"
  on public.task_comments for delete
  using (
    author_id = auth.uid()
    or (select public.is_committee_head((select public.task_committee_id(task_id))))
  );

commit;

-- ============================================================================
-- WHY A SEPARATE TABLE AND NOT A `notes` COLUMN ON tasks
-- tasks has a guard_task_update() trigger that silently reverts every column
-- except `status` when the editor is a non-head assignee. A notes column would
-- therefore be un-writable by exactly the people who most need to write in it —
-- the volunteers doing the work. A separate table sidesteps that entirely.
--
-- VERIFY (run after the transaction commits)
--
--   -- 1. Table + policies exist:
--   select count(*) from public.task_comments;                        -- 0
--   select policyname from pg_policies where tablename = 'task_comments';  -- 3 rows
--
--   -- 2. After adding a comment in the app:
--   select t.title, p.email, c.body, c.created_at
--     from public.task_comments c
--     join public.tasks t on t.id = c.task_id
--     left join public.profiles p on p.id = c.author_id
--    order by c.created_at desc limit 5;
--
--   -- 3. Realtime picked it up (after re-running enable_realtime.sql):
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename = 'task_comments';
-- ============================================================================

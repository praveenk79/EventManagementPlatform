-- ============================================================================
-- Event Platform — unread chat tracking
--
-- WHAT THIS IS FOR
-- The chat bubble's badge previously showed the TOTAL number of messages in a
-- committee (it said "47" forever, even after you'd read everything). To show a
-- real unread count we need to remember, per person per committee, the last
-- time they actually looked at that chat. That's all this table is.
--
-- HOW TO RUN
-- Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Additive only: creates one table + one function. Nothing existing is
-- modified or dropped. Safe to re-run (idempotent).
--
-- AFTER RUNNING
-- Also re-run supabase/enable_realtime.sql (it gained committee_chat_reads),
-- so that reading the chat on your phone clears the badge on your laptop.
-- ============================================================================

begin;

-- One row per (person, committee). `last_read_at` is the moment that person
-- last had the chat panel open. A message is "unread" for you if it was sent
-- after your last_read_at and you weren't the sender.
create table if not exists public.committee_chat_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, committee_id)
);

-- Badge lookups are always "my rows", so index the user side.
create index if not exists committee_chat_reads_user_id_idx
  on public.committee_chat_reads(user_id);

alter table public.committee_chat_reads enable row level security;

-- Read state is private: you can only ever see or change your own.
-- Deliberately NOT visible to heads/admins — "has Praveen read this yet?" is
-- surveillance, not coordination, and nothing in the app needs it.
drop policy if exists "Users view own chat reads" on public.committee_chat_reads;
create policy "Users view own chat reads"
  on public.committee_chat_reads for select
  using (user_id = auth.uid());

drop policy if exists "Users insert own chat reads" on public.committee_chat_reads;
create policy "Users insert own chat reads"
  on public.committee_chat_reads for insert
  with check (user_id = auth.uid());

drop policy if exists "Users update own chat reads" on public.committee_chat_reads;
create policy "Users update own chat reads"
  on public.committee_chat_reads for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Stamps "I have now read this committee's chat", using the SERVER clock.
--
-- Why a function instead of the app just writing a timestamp: a device with a
-- fast/wrong clock would send a time slightly in the future, which would mark
-- messages that haven't arrived yet as already read — they'd never show as
-- unread. now() here is Postgres's clock, so every user agrees.
--
-- The greatest(...) makes it monotonic: a slow request that lands out of order
-- can't rewind your read position and resurrect a stale badge.
create or replace function public.mark_committee_chat_read(target_committee_id uuid)
returns timestamptz
language plpgsql
security invoker            -- runs as the caller, so RLS above still applies
set search_path = public, pg_temp
as $$
declare
  stamped timestamptz;
begin
  insert into public.committee_chat_reads (user_id, committee_id, last_read_at)
  values (auth.uid(), target_committee_id, now())
  on conflict (user_id, committee_id)
    do update set last_read_at = greatest(public.committee_chat_reads.last_read_at, now())
  returning last_read_at into stamped;

  return stamped;
end;
$$;

revoke execute on function public.mark_committee_chat_read(uuid) from public;
grant execute on function public.mark_committee_chat_read(uuid) to authenticated;

commit;

-- ============================================================================
-- VERIFY (run after the transaction commits)
--
--   -- 1. Table exists and is empty (nobody has opened a chat yet):
--   select count(*) from public.committee_chat_reads;   -- 0
--
--   -- 2. RLS is on, with exactly 3 policies:
--   select policyname from pg_policies
--    where tablename = 'committee_chat_reads';
--
--   -- 3. The function works and returns a timestamp. Swap in a real
--   --    committee id from `select id, name from public.committees;`
--   --    Run this from the APP (open a committee chat), not the SQL editor —
--   --    in the editor auth.uid() is null and the insert will fail RLS,
--   --    which is correct behaviour, not a bug.
--
--   -- 4. Confirm realtime picked it up (after re-running enable_realtime.sql):
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename = 'committee_chat_reads';
-- ============================================================================

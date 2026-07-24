-- ============================================================================
-- Enable Realtime replication for tables the app already subscribes to.
--
-- HOW TO RUN THIS
--   Paste into Supabase Dashboard → SQL Editor → Run.
--
-- WHY THIS IS NEEDED
--   The app's client code (auth-context.tsx, committee/[id]/page.tsx,
--   committee/[id]/lists/[listId]/page.tsx) already calls
--   supabase.channel(...).on('postgres_changes', ...) for these tables.
--   But Postgres logical replication only streams changes for tables that
--   have been explicitly added to the `supabase_realtime` publication —
--   schema.sql and lists.sql never did this, so every "live update without
--   refresh" feature (chat, task edits, list collaboration, and role changes)
--   has been silently inert: the subscription connects, but no events ever
--   arrive, so the UI only updates on next page load/refresh.
--
-- This is safe to re-run — each table is only added if it isn't already in
-- the publication (Postgres has no "ADD TABLE IF NOT EXISTS" syntax, so we
-- check pg_publication_tables ourselves before adding).
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'committee_members',
    'tasks',
    'committee_messages',
    'committee_list_rows',
    'committee_list_columns',
    -- Added with supabase/chat_reads.sql: lets reading the chat on one device
    -- clear the unread badge on that user's other open devices.
    'committee_chat_reads',
    -- Added with supabase/task_comments.sql: two people on the same task see
    -- each other's comments appear without a refresh.
    'task_comments'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Verify afterwards with:
--   select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime';

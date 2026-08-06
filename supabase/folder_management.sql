-- ============================================================================
-- Event Platform — folder management for documents
--
-- WHAT THIS IS FOR
-- Today every committee's files sit in one flat list. This adds real folders
-- (nested, renameable, like Google Drive) plus the option to share a folder with
-- everyone signed in to the event rather than just that one committee.
--
-- HOW TO RUN
-- Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Additive: creates one table, adds three nullable columns to committee_files,
-- and REPLACES one storage policy (see the warning below). Safe to re-run.
--
-- ⚠️  ONE IMPORTANT CHANGE — READ THIS
-- This file replaces the storage policy "Committee members view own committee
-- files". That policy currently says: you can download a file only if you are a
-- member of the committee whose id is the first part of the file's path. That is
-- what makes "shared with everyone" impossible today — the database would say
-- the file is visible, but Storage would refuse the download and it would fail
-- silently with no error the user could understand.
--
-- The replacement keeps exactly the same rule for normal files, and adds one
-- extra allowance: a file sitting in a folder marked "shared with everyone" can
-- also be downloaded by any signed-in user. Uploading and deleting stay
-- members-only — outsiders can look, never touch.
--
-- Nothing becomes public to the internet. The bucket stays private and every
-- download still goes through a short-lived signed URL. "Everyone" means every
-- signed-in member of this event, never anonymous visitors.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Folders
-- ----------------------------------------------------------------------------
-- A folder is a real row with a parent, not a prefix baked into the file's
-- storage path. That is the whole reason renaming a folder is cheap: the files
-- inside it keep their storage paths untouched, so nothing has to be copied or
-- rewritten. (S3-style "folders" are just filename prefixes, which is why
-- renaming one there means rewriting every object underneath.)
--
-- parent_id null = a top-level folder in that committee.
create table if not exists public.committee_folders (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  parent_id uuid references public.committee_folders(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  -- 'committee' = only this committee's members.
  -- 'everyone'   = any signed-in member of the event may view and download.
  visibility text not null default 'committee'
    check (visibility in ('committee', 'everyone')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- on delete restrict above is deliberate: Postgres itself refuses to delete a
-- folder that still has sub-folders. Combined with the app-level check on files,
-- a folder with anything inside it cannot be deleted by accident. Losing a real
-- customer's signed contract to a misclick is not a recoverable mistake.

create index if not exists committee_folders_committee_id_idx
  on public.committee_folders(committee_id);
create index if not exists committee_folders_parent_id_idx
  on public.committee_folders(parent_id);

-- No two folders side by side with the same name. Case-insensitive, so you can't
-- end up with "Invoices" next to "invoices" and wonder which one you filed in.
-- Two indexes because Postgres treats null as "not equal to anything", so a
-- single unique index would let you create unlimited duplicates at the top level.
create unique index if not exists committee_folders_unique_name_in_parent
  on public.committee_folders(committee_id, parent_id, lower(name))
  where parent_id is not null;
create unique index if not exists committee_folders_unique_name_at_root
  on public.committee_folders(committee_id, lower(name))
  where parent_id is null;

-- ----------------------------------------------------------------------------
-- Guard rails on the folder tree
-- ----------------------------------------------------------------------------
-- Two things can break a tree, and both are checked here in the database rather
-- than only in the UI, because the UI is not the only thing that can write.
--
-- 1. A loop. If you drag folder A inside its own child B, then A's parent is B
--    and B's parent is A. Nothing is wrong with either row on its own, but the
--    folder has become unreachable and any code walking up the tree spins
--    forever. This is the classic way a folder feature hangs a page.
-- 2. Absurd depth. Ten levels is far more than anyone needs and keeps the
--    breadcrumb bar readable.
create or replace function public.check_folder_tree()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  ancestor uuid;
  depth int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A folder cannot be inside itself.';
  end if;

  -- A sub-folder must stay in the same committee as its parent, otherwise a
  -- folder could be reparented across committees and quietly carry its files
  -- out of the permission boundary they were filed under.
  if (select committee_id from public.committee_folders where id = new.parent_id)
     is distinct from new.committee_id then
    raise exception 'A folder must live in the same committee as its parent.';
  end if;

  -- Walk up the chain of parents. If we meet this folder on the way up, the move
  -- would create a loop.
  ancestor := new.parent_id;
  while ancestor is not null loop
    depth := depth + 1;
    if ancestor = new.id then
      raise exception 'That would put a folder inside one of its own sub-folders.';
    end if;
    if depth > 10 then
      raise exception 'Folders can only be nested 10 levels deep.';
    end if;
    select parent_id into ancestor from public.committee_folders where id = ancestor;
  end loop;

  return new;
end;
$$;

drop trigger if exists check_folder_tree_trigger on public.committee_folders;
create trigger check_folder_tree_trigger
  before insert or update of parent_id, committee_id on public.committee_folders
  for each row execute function public.check_folder_tree();

-- ----------------------------------------------------------------------------
-- Files gain a folder, a type, and a vendor slot
-- ----------------------------------------------------------------------------
-- folder_id null means the file sits at the committee's root, which is how every
-- file that already exists is treated. Nothing needs migrating.
alter table public.committee_files
  add column if not exists folder_id uuid references public.committee_folders(id) on delete restrict;

-- What kind of document this is. Optional, but captured from day one because
-- adding it later means someone hand-tagging hundreds of existing files.
alter table public.committee_files
  add column if not exists doc_type text
    check (doc_type is null or doc_type in
      ('invoice', 'contract', 'receipt', 'template', 'reference', 'other'));

-- Vendor management is coming. This column is deliberately unused for now: one
-- nullable column added today costs nothing and saves a migration later, when
-- you want "show me every invoice from this caterer". No foreign key yet because
-- there is no vendors table to point at.
alter table public.committee_files
  add column if not exists vendor_id uuid;

create index if not exists committee_files_folder_id_idx
  on public.committee_files(folder_id);

-- ----------------------------------------------------------------------------
-- Who can see what
-- ----------------------------------------------------------------------------
alter table public.committee_folders enable row level security;

-- Is this folder shared with everyone? Used by the policies below.
-- Security definer so it can read the folders table without the caller needing
-- permission to — otherwise checking "is this shared?" would itself require the
-- access we are trying to decide about.
create or replace function public.folder_is_shared(target_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select visibility = 'everyone' from public.committee_folders where id = target_folder_id),
    false
  );
$$;

-- Same question, asked about a file by its storage path. Storage policies only
-- know a file's path, so this is how they reach the folder's visibility.
create or replace function public.file_is_shared(target_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.committee_files f
      join public.committee_folders d on d.id = f.folder_id
     where f.storage_path = target_storage_path
       and d.visibility = 'everyone'
  );
$$;

revoke execute on function public.folder_is_shared(uuid) from public;
revoke execute on function public.file_is_shared(text) from public;
grant execute on function public.folder_is_shared(uuid) to authenticated;
grant execute on function public.file_is_shared(text) to authenticated;

-- View: your own committee's folders, plus anything shared with everyone.
drop policy if exists "View own committee folders and shared folders" on public.committee_folders;
create policy "View own committee folders and shared folders"
  on public.committee_folders for select
  using (
    (select public.is_committee_member(committee_id))
    or visibility = 'everyone'
  );

-- Create, rename, move, delete: heads of that committee and admins only.
-- Volunteers can upload into folders but not rearrange the filing cabinet —
-- the same split already used for tasks, where heads own the structure and
-- volunteers do the work. Without this, twelve committees produce "Docs",
-- "documents" and "Files" side by side within a week.
drop policy if exists "Heads manage own committee folders" on public.committee_folders;
create policy "Heads manage own committee folders"
  on public.committee_folders for insert
  with check ((select public.is_committee_head(committee_id)));

drop policy if exists "Heads update own committee folders" on public.committee_folders;
create policy "Heads update own committee folders"
  on public.committee_folders for update
  using ((select public.is_committee_head(committee_id)))
  with check ((select public.is_committee_head(committee_id)));

drop policy if exists "Heads delete own committee folders" on public.committee_folders;
create policy "Heads delete own committee folders"
  on public.committee_folders for delete
  using ((select public.is_committee_head(committee_id)));

-- --- committee_files: widen SELECT to cover shared folders -------------------
-- The existing policy on committee_files is members-only. A file in a shared
-- folder needs to be listable by outsiders too.
drop policy if exists "View own committee files and shared files" on public.committee_files;
create policy "View own committee files and shared files"
  on public.committee_files for select
  using (
    (select public.is_committee_member(committee_id))
    or (folder_id is not null and (select public.folder_is_shared(folder_id)))
  );

-- ----------------------------------------------------------------------------
-- Storage — the actual file bytes
-- ----------------------------------------------------------------------------
-- Table permissions above control who can see a file's *name and details*.
-- They do not control the bytes: Storage has its own separate rules, so the
-- same decision has to be repeated here. Miss this and a shared file appears in
-- the list but the download fails.
--
-- Replaces the policy from schema.sql line ~596. Same rule as before, plus the
-- shared-folder allowance.
drop policy if exists "Committee members view own committee files" on storage.objects;
drop policy if exists "View committee files and shared files" on storage.objects;
create policy "View committee files and shared files"
  on storage.objects for select
  using (
    bucket_id = 'committee-files'
    and (
      -- unchanged from before: a member of the committee in path segment 1
      (select public.is_committee_member((storage.foldername(name))[1]::uuid))
      -- new: the file lives in a folder shared with everyone
      or (select public.file_is_shared(name))
    )
  );

-- Upload and delete are deliberately NOT widened. Someone outside the committee
-- can view and download a shared file, never add to or remove from it. One
-- committee owns each folder and stays responsible for what is in it.
-- (The existing INSERT and DELETE policies from schema.sql are left untouched.)

commit;

-- ============================================================================
-- REALTIME
-- After running this, add committee_folders to the realtime publication so a
-- folder someone else creates appears without a refresh:
--
--   alter publication supabase_realtime add table public.committee_folders;
--
-- (Skip if it is already there — re-adding raises an error, which is harmless.)
-- ============================================================================

-- ============================================================================
-- CHECK IT WORKED
--
--   -- 1. The table exists and is empty:
--   select count(*) from public.committee_folders;                  -- 0
--
--   -- 2. Files gained the three new columns, all null on existing rows:
--   select count(*) as total, count(folder_id) as with_folder
--     from public.committee_files;         -- with_folder should be 0
--
--   -- 3. The storage policy was replaced — you should see exactly one row,
--   --    named "View committee files and shared files":
--   select policyname from pg_policies
--    where tablename = 'objects' and cmd = 'SELECT'
--      and policyname ilike '%committee files%';
--
--   -- 4. Upload/delete on storage are still members-only (2 rows, unchanged):
--   select policyname, cmd from pg_policies
--    where tablename = 'objects' and cmd in ('INSERT', 'DELETE');
--
--   -- 5. Realtime picked up the new table:
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename = 'committee_folders';
--
-- IF FILE DOWNLOADS BREAK AFTER THIS, this file is the place to look — step 3
-- above replaced the policy that guards every file download in the app.
-- ============================================================================

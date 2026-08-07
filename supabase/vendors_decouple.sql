-- Decouple vendors from committees entirely
-- Run this in the Supabase SQL Editor, after supabase/vendors.sql.
--
-- The previous pass tied vendor documents to committee-scoped storage
-- (every upload needs a committee_id, because that's how the committee-files
-- bucket's RLS works), which forced a "which committee does this belong to"
-- decision onto every vendor-document interaction even though vendors are a
-- flat, company-wide directory. This removes the tie in both directions:
-- vendors stop referencing committees, and committee files stop referencing
-- vendors. Vendor documents get their own table and their own storage
-- bucket, with permissions matching vendor management itself (admin, or any
-- committee head) instead of committee membership.
--
-- Assumes no real data yet in the columns being dropped — this feature was
-- only just built and not yet used for real. If you already attached a real
-- document for testing, note the file before running this (its
-- committee_files row will lose its vendor tag, though the file itself is
-- untouched).

alter table public.vendors drop column if exists owning_committee_id;
drop index if exists public.vendors_owning_committee_id_idx;

alter table public.committee_files
  drop constraint if exists committee_files_vendor_id_fkey;
alter table public.committee_files drop column if exists vendor_id;

-- ============================================================================
-- vendor_files — a vendor document's only home now. Independent of
-- committees entirely.
-- ============================================================================
create table if not exists public.vendor_files (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  file_name text not null,
  file_size_bytes bigint,
  storage_path text not null,
  doc_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists vendor_files_vendor_id_idx on public.vendor_files(vendor_id);

alter table public.vendor_files enable row level security;

drop policy if exists "Non-deleted users view vendor documents" on public.vendor_files;
create policy "Non-deleted users view vendor documents"
  on public.vendor_files for select
  using (not public.is_deleted_user());

drop policy if exists "Heads and admins attach vendor documents" on public.vendor_files;
create policy "Heads and admins attach vendor documents"
  on public.vendor_files for insert
  with check (public.is_any_committee_head());

drop policy if exists "Heads and admins delete vendor documents" on public.vendor_files;
create policy "Heads and admins delete vendor documents"
  on public.vendor_files for delete
  using (public.is_any_committee_head());

-- No update policy — a document is replaced by delete + re-attach, not
-- edited in place.

-- ============================================================================
-- vendor-files storage bucket — separate from committee-files. No
-- path-parsing trick needed: permission isn't scoped to anything in the
-- path (unlike committee-files, which parses a committee id out of it),
-- since vendor document access follows the same admin-or-any-head rule
-- everywhere. Path convention (${vendorId}/${timestamp}-${fileName}) is
-- organizational only now, not RLS-load-bearing.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('vendor-files', 'vendor-files', false)
on conflict (id) do nothing;

drop policy if exists "View vendor files" on storage.objects;
create policy "View vendor files"
  on storage.objects for select
  using (bucket_id = 'vendor-files' and not public.is_deleted_user());

drop policy if exists "Heads and admins upload vendor files" on storage.objects;
create policy "Heads and admins upload vendor files"
  on storage.objects for insert
  with check (bucket_id = 'vendor-files' and public.is_any_committee_head());

drop policy if exists "Heads and admins delete vendor files" on storage.objects;
create policy "Heads and admins delete vendor files"
  on storage.objects for delete
  using (bucket_id = 'vendor-files' and public.is_any_committee_head());

-- Realtime — same idempotent pattern already used in vendors.sql.
do $$
begin
  alter publication supabase_realtime add table public.vendor_files;
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- CHECK IT WORKED
--
--   -- 1. Old columns are gone:
--   select column_name from information_schema.columns
--    where table_name = 'vendors' and column_name = 'owning_committee_id';        -- 0 rows
--   select column_name from information_schema.columns
--    where table_name = 'committee_files' and column_name = 'vendor_id';          -- 0 rows
--
--   -- 2. New table + bucket exist:
--   select count(*) from public.vendor_files;                                     -- 0
--   select id from storage.buckets where id = 'vendor-files';                     -- 1 row
--
--   -- 3. Policies present:
--   select policyname, cmd from pg_policies where tablename = 'vendor_files';     -- 3 rows
--
--   -- 4. Realtime picked it up:
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename = 'vendor_files';
-- ============================================================================

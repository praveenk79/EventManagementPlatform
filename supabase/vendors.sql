-- ============================================================================
-- Event Platform — vendor management
--
-- WHAT THIS IS FOR
-- One place for every supplier the event deals with: caterer, printer, AV crew,
-- hotel, florist. Today that lives in someone's phone contacts and a WhatsApp
-- thread. This gives each vendor a row with contact details, which committee
-- owns the relationship, and a link to their invoices and contracts.
--
-- HOW TO RUN
-- Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Additive only: creates one table and turns the existing unused
-- committee_files.vendor_id column into a real foreign key. Nothing is dropped.
-- Safe to re-run.
--
-- RUN supabase/folder_management.sql FIRST — this file expects the vendor_id
-- column that file added. If you have not run it, this one will fail with
-- "column vendor_id does not exist", which is harmless: run that first, then
-- come back to this.
--
-- ONE DESIGN NOTE WORTH KNOWING
-- Vendors are company-wide, NOT owned by a committee or an event — the
-- opposite of folders. A caterer serves the whole company across every event
-- it runs; the Food committee just manages the relationship for one event. If
-- each committee (or each event) had its own vendor list you would get the
-- same caterer entered three times, with three different phone numbers, and
-- no way to see the total picture. So: one shared directory per company, with
-- an optional "which committee looks after this one" pointer. Whether vendors
-- should ever split by event was explicitly left as an open question in
-- MULTI_TENANT_PLAN.md ("parked — not needed to decide yet") — this file does
-- not decide it either; it just finally builds the table the UI has been
-- expecting since 2026-07-25.
-- ============================================================================

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  contact_name text,
  email text,
  phone text,
  website text,
  notes text not null default '',
  status text not null default 'potential' check (status in ('potential', 'active', 'past', 'rejected')),
  owning_committee_id uuid references public.committees(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One caterer, one row — duplicate names fail loudly with a Postgres unique
-- violation (23505), which the UI translates into a plain-language message.
create unique index if not exists vendors_name_unique_idx on public.vendors (lower(trim(name)));
create index if not exists vendors_owning_committee_id_idx on public.vendors(owning_committee_id);

drop trigger if exists vendors_set_updated_at on public.vendors;
create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

-- No table is scoped to "any committee I'm head of" today — is_committee_head()
-- always takes a specific committee id. Vendors need a company-wide version:
-- true for an admin, or for anyone who heads at least one committee. Reading
-- committee_members for auth.uid() is safe without an extra company check —
-- a user can only ever be a member of committees in their own company.
create or replace function public.is_any_committee_head()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select public.is_admin() or exists (
    select 1 from public.committee_members
    where user_id = auth.uid() and role = 'head'
  );
$$;

revoke execute on function public.is_any_committee_head() from public;
grant execute on function public.is_any_committee_head() to authenticated;

alter table public.vendors enable row level security;

drop policy if exists "Non-deleted users view vendor directory" on public.vendors;
create policy "Non-deleted users view vendor directory"
  on public.vendors for select
  using (not public.is_deleted_user());

drop policy if exists "Heads and admins add vendors" on public.vendors;
create policy "Heads and admins add vendors"
  on public.vendors for insert
  with check (public.is_any_committee_head());

drop policy if exists "Heads and admins edit vendors" on public.vendors;
create policy "Heads and admins edit vendors"
  on public.vendors for update
  using (public.is_any_committee_head())
  with check (public.is_any_committee_head());

-- Real delete, not soft — vendors carry no history of their own, and their
-- documents survive via the on-delete-set-null FK below. Admin-only since a
-- deleted vendor loses every committee's linked documents' vendor label.
drop policy if exists "Admins delete vendors" on public.vendors;
create policy "Admins delete vendors"
  on public.vendors for delete
  using (public.is_admin());

-- The FK folder_management.sql couldn't add yet, because vendors didn't exist.
-- on delete set null: deleting a vendor keeps its linked documents, just
-- unlinks them, rather than deleting invoices/contracts along with the vendor.
alter table public.committee_files
  drop constraint if exists committee_files_vendor_id_fkey;
alter table public.committee_files
  add constraint committee_files_vendor_id_fkey
  foreign key (vendor_id) references public.vendors(id) on delete set null;

-- Baked in rather than left as a comment to copy-paste separately — a past
-- migration (companies.sql) got this wrong once already: a follow-up step
-- left as a comment got skipped after a failed-then-retried run. Wrapped so
-- it's safe to re-run.
do $$
begin
  alter publication supabase_realtime add table public.vendors;
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- CHECK IT WORKED
--
--   -- 1. Table exists and is empty:
--   select count(*) from public.vendors;                    -- 0
--
--   -- 2. Four policies present (select / insert / update / delete):
--   select policyname, cmd from pg_policies where tablename = 'vendors';
--
--   -- 3. The documents link is a real foreign key now:
--   select conname from pg_constraint
--    where conname = 'committee_files_vendor_id_fkey';      -- 1 row
--
--   -- 4. Realtime picked it up:
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename = 'vendors';
--
--   -- 5. Sanity-check the duplicate guard — this second insert should FAIL
--   --    with a unique violation, which is correct behaviour:
--   -- insert into public.vendors (name) values ('Test Caterer');
--   -- insert into public.vendors (name) values ('test caterer');   -- errors
--   -- delete from public.vendors where lower(name) = 'test caterer';
-- ============================================================================

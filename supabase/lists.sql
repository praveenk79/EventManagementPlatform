-- ============================================================================
-- Event Platform — "Lists" feature (dynamic, spreadsheet-style tables)
--
-- HOW TO RUN THIS
--   1. BACK UP FIRST (Supabase Dashboard → Database → Backups → manual backup).
--      This adds NEW tables only — it does not alter or drop anything that
--      already exists — but a backup is still the right habit on a live DB.
--   2. Paste this whole file into Supabase Dashboard → SQL Editor → Run.
--      Wrapped in a single transaction: if anything fails, nothing commits.
--   3. Safe to re-run — every statement is idempotent.
--
-- WHAT THIS CREATES
--   committee_lists         — one row per list (e.g. "Speakers") inside a committee
--   committee_list_columns  — the user-defined columns of a list (name + type + order)
--   committee_list_rows     — the rows; cell values stored as JSONB keyed by column id
--
-- PERMISSIONS (enforced by RLS below, mirroring tasks/files)
--   - View a list + its rows:      anyone in the committee (volunteer or head) or an admin
--   - Add / edit / delete ROWS:    anyone in the committee (volunteer or head) or an admin
--   - Create list, change COLUMNS,
--     rename or delete the list:   committee head or admin only
--   Templates themselves are defined in application code (src/lib/list-templates.ts),
--   not in the database, so there is nothing template-related to secure here.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- committee_lists
-- ----------------------------------------------------------------------------
create table if not exists public.committee_lists (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  name text not null,
  description text default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists committee_lists_committee_id_idx on public.committee_lists(committee_id);

drop trigger if exists committee_lists_set_updated_at on public.committee_lists;
create trigger committee_lists_set_updated_at
  before update on public.committee_lists
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- committee_list_columns
--   type is validated in the app; kept as free text here so new column types
--   can ship without a schema migration. position drives left-to-right order.
-- ----------------------------------------------------------------------------
create table if not exists public.committee_list_columns (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.committee_lists(id) on delete cascade,
  label text not null,
  type text not null default 'text'
    check (type in ('text', 'number', 'date', 'select', 'checkbox', 'person', 'link')),
  options jsonb not null default '[]'::jsonb, -- for 'select': the allowed choices
  position int not null default 0,
  created_at timestamptz default now()
);

create index if not exists committee_list_columns_list_id_idx on public.committee_list_columns(list_id);

-- ----------------------------------------------------------------------------
-- committee_list_rows
--   cells: JSONB object keyed by column id -> value. Storing the whole row as
--   one JSONB blob means adding/removing a column never requires touching row
--   storage, and a row read is a single row fetch.
-- ----------------------------------------------------------------------------
create table if not exists public.committee_list_rows (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.committee_lists(id) on delete cascade,
  cells jsonb not null default '{}'::jsonb,
  position int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists committee_list_rows_list_id_idx on public.committee_list_rows(list_id);

drop trigger if exists committee_list_rows_set_updated_at on public.committee_list_rows;
create trigger committee_list_rows_set_updated_at
  before update on public.committee_list_rows
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Helper: does a given list belong to a committee the caller can access?
-- security definer so it can read committee_lists without recursing into the
-- policies being defined below (same pattern as is_committee_member in schema.sql).
-- ----------------------------------------------------------------------------
create or replace function public.list_committee_id(target_list_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select committee_id from public.committee_lists where id = target_list_id;
$$;

revoke execute on function public.list_committee_id(uuid) from public;
grant execute on function public.list_committee_id(uuid) to authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.committee_lists enable row level security;
alter table public.committee_list_columns enable row level security;
alter table public.committee_list_rows enable row level security;

-- --- committee_lists ---------------------------------------------------------
drop policy if exists "Committee members view lists" on public.committee_lists;
create policy "Committee members view lists"
  on public.committee_lists for select
  using ((select public.is_committee_member(committee_id)));

drop policy if exists "Heads and admins create lists" on public.committee_lists;
create policy "Heads and admins create lists"
  on public.committee_lists for insert
  with check ((select public.is_committee_head(committee_id)));

drop policy if exists "Heads and admins update lists" on public.committee_lists;
create policy "Heads and admins update lists"
  on public.committee_lists for update
  using ((select public.is_committee_head(committee_id)));

drop policy if exists "Heads and admins delete lists" on public.committee_lists;
create policy "Heads and admins delete lists"
  on public.committee_lists for delete
  using ((select public.is_committee_head(committee_id)));

-- --- committee_list_columns (structure = heads/admins only) ------------------
drop policy if exists "Committee members view list columns" on public.committee_list_columns;
create policy "Committee members view list columns"
  on public.committee_list_columns for select
  using ((select public.is_committee_member((select public.list_committee_id(list_id)))));

drop policy if exists "Heads and admins insert list columns" on public.committee_list_columns;
create policy "Heads and admins insert list columns"
  on public.committee_list_columns for insert
  with check ((select public.is_committee_head((select public.list_committee_id(list_id)))));

drop policy if exists "Heads and admins update list columns" on public.committee_list_columns;
create policy "Heads and admins update list columns"
  on public.committee_list_columns for update
  using ((select public.is_committee_head((select public.list_committee_id(list_id)))));

drop policy if exists "Heads and admins delete list columns" on public.committee_list_columns;
create policy "Heads and admins delete list columns"
  on public.committee_list_columns for delete
  using ((select public.is_committee_head((select public.list_committee_id(list_id)))));

-- --- committee_list_rows (rows = any committee member) -----------------------
drop policy if exists "Committee members view list rows" on public.committee_list_rows;
create policy "Committee members view list rows"
  on public.committee_list_rows for select
  using ((select public.is_committee_member((select public.list_committee_id(list_id)))));

drop policy if exists "Committee members insert list rows" on public.committee_list_rows;
create policy "Committee members insert list rows"
  on public.committee_list_rows for insert
  with check ((select public.is_committee_member((select public.list_committee_id(list_id)))));

drop policy if exists "Committee members update list rows" on public.committee_list_rows;
create policy "Committee members update list rows"
  on public.committee_list_rows for update
  using ((select public.is_committee_member((select public.list_committee_id(list_id)))));

drop policy if exists "Committee members delete list rows" on public.committee_list_rows;
create policy "Committee members delete list rows"
  on public.committee_list_rows for delete
  using ((select public.is_committee_member((select public.list_committee_id(list_id)))));

commit;

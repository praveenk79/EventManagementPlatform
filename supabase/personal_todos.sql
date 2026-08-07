-- Personal todos
-- Run this in the Supabase SQL Editor (do not run migrations against the live
-- DB from the app — deliver as a file, per project convention).
--
-- A fully private, per-user todo list — separate from committee `tasks`.
-- Intentionally not committee-scoped: it's for things that were never a
-- committee task in the first place ("call the caterer"). No head/admin can
-- ever see another user's rows; only the owner can read or write their own.

create table if not exists public.personal_todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists personal_todos_user_id_idx
  on public.personal_todos(user_id);

alter table public.personal_todos enable row level security;

-- Own-rows-only, full access. There is no policy that lets anyone else (head,
-- admin, super_admin) read or write another user's todos — that's the point.
drop policy if exists "Users manage own personal todos" on public.personal_todos;
create policy "Users manage own personal todos"
  on public.personal_todos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

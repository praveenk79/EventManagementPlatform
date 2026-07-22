-- Run this in Supabase Dashboard → SQL Editor

create table if not exists public.tasks (
  id uuid default gen_random_uuid() primary key,
  committee_id text not null,
  title text not null,
  assignee text default '',
  status text default 'todo' check (status in ('todo', 'in_progress', 'review', 'done', 'blocked')),
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tasks enable row level security;

create policy "Authenticated users can manage tasks"
  on public.tasks for all
  using (auth.role() = 'authenticated');

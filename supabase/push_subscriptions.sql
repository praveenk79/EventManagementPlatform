-- Push notification subscriptions
-- Run this in the Supabase SQL Editor (do not run migrations against the live
-- DB from the app — deliver as a file, per project convention).
--
-- Each row is one browser/device that a user has allowed notifications on.
-- A single user can have several (phone + laptop), so `endpoint` (unique per
-- device) is the natural key, not user_id.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  -- The Web Push subscription keys (p256dh + auth), stored as sent by the
  -- browser. Needed by the server to encrypt each push payload.
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- A user manages only their own subscriptions from the client. The server-side
-- sender uses the service_role key, which bypasses RLS, so it can read every
-- recipient's subscription when fanning out a notification.
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

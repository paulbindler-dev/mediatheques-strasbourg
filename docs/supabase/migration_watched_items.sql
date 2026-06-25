-- Migration: watched_items
-- Run once in Supabase Dashboard → SQL Editor
-- Stores items from wishlists that the user wants to monitor for availability

create table if not exists watched_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  rsc_id     text not null,
  docbase    text not null default 'IGUANA_2',
  title      text not null,
  created_at timestamptz default now(),
  unique (user_id, rsc_id)
);

alter table watched_items enable row level security;
create policy "own_watched" on watched_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

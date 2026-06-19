-- Run this in Supabase Dashboard → SQL Editor
-- Users are managed by Supabase Auth (no extra table needed)

-- Iguana session cookies (stored encrypted with AES-256-GCM)
create table iguana_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  instance_ci_enc text not null,
  instance_st_enc text not null,
  updated_at timestamptz default now()
);
alter table iguana_sessions enable row level security;
create policy "own_session" on iguana_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Web Push subscriptions
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
create policy "own_push" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Wishlist (V3)
create table wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('ps5', 'film', 'bd')),
  title text not null,
  external_id text,
  thumbnail_url text,
  created_at timestamptz default now()
);
alter table wishlists enable row level security;
create policy "own_wishlist" on wishlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

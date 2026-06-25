-- Migration: booking_states
-- Run this once in Supabase Dashboard → SQL Editor
-- Tracks IsAvailable per booking to detect transitions and avoid duplicate notifications

create table if not exists booking_states (
  user_id    uuid references auth.users(id) on delete cascade not null,
  booking_id text not null,
  is_available boolean not null default false,
  updated_at timestamptz default now(),
  primary key (user_id, booking_id)
);

alter table booking_states enable row level security;
-- Only accessible via service role (cron) — no user-facing policy needed

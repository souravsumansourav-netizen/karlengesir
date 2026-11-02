-- ============================================================
-- Notes Board Schema for Supabase
-- Run this file in your Supabase SQL Editor.
-- ============================================================

-- Ensure pgcrypto extension is available for gen_random_uuid()
create extension if not exists "pgcrypto";

-- Notes table
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index on updated_at desc for fast newest-first sorting
create index if not exists idx_notes_updated_at on notes(updated_at desc);

-- Enable Row-Level Security
alter table notes enable row level security;

-- Public read access: Anyone can read notes
create policy "notes: public read"
  on notes for select
  using (true);

-- Direct client modifications (insert, update, delete) are disallowed.
-- All write operations are executed server-side via API routes using the service role key.

-- ============================================================
-- Notes Board Schema & Row-Level Security Policies for Supabase
-- Run this entire script in your Supabase SQL Editor.
-- Dashboard -> SQL Editor -> New Query -> Paste & Run
-- ============================================================

-- Ensure pgcrypto extension is available for gen_random_uuid()
create extension if not exists "pgcrypto";

-- 1. Notes table
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Index on updated_at desc for fast newest-first sorting
create index if not exists idx_notes_updated_at on notes(updated_at desc);

-- 3. Enable Row-Level Security
alter table notes enable row level security;

-- 4. Clean up any previous restrictive policies
drop policy if exists "notes: public read" on notes;
drop policy if exists "notes: public insert" on notes;
drop policy if exists "notes: public update" on notes;
drop policy if exists "notes: public delete" on notes;

-- 5. Public read access: Anyone can view notes
create policy "notes: public read"
  on notes for select
  using (true);

-- 6. Public insert access: Anyone can create a note without authentication
create policy "notes: public insert"
  on notes for insert
  with check (true);

-- 7. Public update access: Anyone can edit a note
create policy "notes: public update"
  on notes for update
  using (true);

-- 8. Public delete access: Anyone can delete a note
create policy "notes: public delete"
  on notes for delete
  using (true);

-- ============================================================
-- Adhyantra File Share – Supabase Database Schema
-- Run this entire file in your Supabase SQL Editor.
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Tables ──────────────────────────────────────────────────

-- 1. subjects: Categorization for uploaded files
create table if not exists subjects (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  slug       text unique not null,
  created_at timestamptz not null default now()
);

-- 2. admins: Authorised admin users referencing Supabase Auth
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- 3. files: Metadata for files stored in Backblaze B2 / Storage
create table if not exists files (
  id               uuid primary key default gen_random_uuid(),
  subject_id       uuid references subjects(id) on delete set null,
  file_name        text not null,
  storage_key      text not null,
  storage_provider text not null default 'b2',
  mime_type        text,
  size_bytes       bigint not null,
  description      text,
  uploader_name    text not null default 'Anonymous',
  download_count   int  not null default 0,
  created_at       timestamptz not null default now()
);

-- ─── Indexes ─────────────────────────────────────────────────
create index if not exists idx_files_subject_id on files(subject_id);
create index if not exists idx_files_created_at on files(created_at desc);
create index if not exists idx_files_storage_key on files(storage_key);

-- ─── Helpers ─────────────────────────────────────────────────

-- Returns TRUE when calling JWT belongs to an admin row
create or replace function is_admin()
  returns boolean
  language sql
  security definer
  stable
as $$
  select exists (
    select 1 from admins where user_id = auth.uid()
  );
$$;

-- ─── Row-Level Security ──────────────────────────────────────

alter table subjects enable row level security;
alter table admins   enable row level security;
alter table files    enable row level security;

-- subjects policies:
-- Anyone can view
create policy "subjects: public read"
  on subjects for select using (true);

-- Admin can manage subjects (insert, update, delete)
create policy "subjects: admin insert"
  on subjects for insert with check (is_admin());

create policy "subjects: admin update"
  on subjects for update using (is_admin());

create policy "subjects: admin delete"
  on subjects for delete using (is_admin());

-- admins policies:
-- Authenticated users can check if their own user_id is an admin
create policy "admins: self read"
  on admins for select using (user_id = auth.uid());

-- files policies:
-- Anyone can view file listings
create policy "files: public read"
  on files for select using (true);

-- Direct client inserts disabled; file rows inserted strictly via backend API routes (service role)
create policy "files: no direct client insert"
  on files for insert with check (false);

-- Update and Delete allowed only for verified admins
create policy "files: admin update"
  on files for update using (is_admin());

create policy "files: admin delete"
  on files for delete using (is_admin());

-- ─── RPCs ────────────────────────────────────────────────────

-- Increment download count securely without granting direct table UPDATE to anonymous clients
create or replace function increment_download_count(file_id uuid)
  returns void
  language plpgsql
  security definer
as $$
begin
  update files
  set download_count = download_count + 1
  where id = file_id;
end;
$$;

-- Aggregate total storage usage across all uploaded files
create or replace function get_storage_usage()
  returns table (total_bytes bigint, file_count bigint)
  language sql
  security definer
  stable
as $$
  select
    coalesce(sum(size_bytes), 0)::bigint as total_bytes,
    count(*)::bigint as file_count
  from files;
$$;

-- ─── Seed Data: Sample Subjects ──────────────────────────────
insert into subjects (name, slug) values
  ('Mathematics',      'mathematics'),
  ('Computer Science', 'computer-science'),
  ('Physics',          'physics'),
  ('English',          'english'),
  ('General',          'general')
on conflict (slug) do nothing;

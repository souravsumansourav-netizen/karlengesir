-- ============================================================
-- Adhyantra File Share – Supabase Schema
-- Run this entire file in the Supabase SQL editor (once).
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Helpers ─────────────────────────────────────────────────
-- Returns TRUE when the calling JWT belongs to an admin row
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

-- ─── Tables ──────────────────────────────────────────────────

-- subjects
create table if not exists subjects (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  slug       text unique not null,
  created_at timestamptz default now()
);

-- admins  (populated manually after creating the user in Auth)
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- files
create table if not exists files (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid references subjects(id) on delete set null,
  file_name      text not null,
  storage_path   text not null,
  mime_type      text,
  size_bytes     bigint,
  description    text,
  uploader_name  text not null default 'Anonymous',
  download_count int  not null default 0,
  created_at     timestamptz default now()
);

-- ─── Row-Level Security ──────────────────────────────────────

alter table subjects enable row level security;
alter table admins   enable row level security;
alter table files    enable row level security;

-- subjects policies
create policy "subjects: anyone can view"
  on subjects for select using (true);

create policy "subjects: anyone can insert"
  on subjects for insert with check (true);

create policy "subjects: admin update"
  on subjects for update using (is_admin());

create policy "subjects: admin delete"
  on subjects for delete using (is_admin());

-- admins policies (admins can see own row; nobody else)
create policy "admins: self read"
  on admins for select using (user_id = auth.uid());

-- files policies
create policy "files: anyone can view"
  on files for select using (true);

create policy "files: anyone can insert"
  on files for insert with check (true);

create policy "files: admin update"
  on files for update using (is_admin());

create policy "files: admin delete"
  on files for delete using (is_admin());

-- ─── RPC: increment download count (security definer) ────────
create or replace function increment_download_count(file_id uuid)
  returns void
  language plpgsql
  security definer
as $$
begin
  update files set download_count = download_count + 1 where id = file_id;
end;
$$;

-- ─── RPC: delete file + storage object atomically ────────────
-- Caller must be admin (checked inside via is_admin()).
create or replace function admin_delete_file(file_id uuid)
  returns text
  language plpgsql
  security definer
as $$
declare
  v_path text;
begin
  if not is_admin() then
    raise exception 'Not authorised';
  end if;

  select storage_path into v_path from files where id = file_id;
  if v_path is null then
    raise exception 'File not found';
  end if;

  delete from files where id = file_id;
  -- Actual storage deletion is done client-side via supabase.storage.remove()
  -- after this RPC confirms the DB row is gone.
  return v_path;
end;
$$;

-- ─── Storage bucket "shared-files" ───────────────────────────
-- Create the bucket via the Supabase dashboard or the CLI:
--   supabase storage create-bucket shared-files --public
--
-- Then add these Storage Policies via the dashboard → Storage → Policies
-- (SQL editor currently cannot create storage policies directly).
--
-- Policy 1 – Public read
--   Bucket: shared-files | Operation: SELECT | Expression: true
--
-- Policy 2 – Anyone can upload
--   Bucket: shared-files | Operation: INSERT | Expression: true
--
-- Policy 3 – Admin delete
--   Bucket: shared-files | Operation: DELETE | Expression: is_admin()
--
-- Policy 4 – Admin update (optional, for future rename)
--   Bucket: shared-files | Operation: UPDATE | Expression: is_admin()

-- ─── Seed: sample subjects ────────────────────────────────────
insert into subjects (name, slug) values
  ('Mathematics',    'mathematics'),
  ('Computer Science', 'computer-science'),
  ('Physics',        'physics'),
  ('English',        'english'),
  ('General',        'general')
on conflict do nothing;

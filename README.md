# FileShare — Upload, Browse & Download

A full-stack file sharing app built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase**.

---

## Features

- **Anyone** (no login): browse files, search/filter by subject, upload files, download files
- **Admin** (Supabase Auth): everything above + delete files, manage subjects
- Drag-and-drop multi-file upload with per-file progress bars
- Subject-based organisation with subject chips / sidebar filter
- Gallery (grid) and list view with image thumbnails and inline preview (image, PDF, audio, video)
- Dark / light mode toggle
- RLS enforced at the database level — not just hidden UI buttons

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS + custom CSS design system |
| Backend | Supabase (Postgres + Storage + Auth) |
| Client lib | @supabase/supabase-js + @supabase/ssr |

---

## Step-by-Step Setup

### 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) → **New project**
2. Note your **Project URL** and **Anon (public) key** from *Settings → API*

### 2. Run the SQL Schema

1. Open your project's **SQL Editor** (Supabase dashboard sidebar)
2. Copy and paste the entire content of `supabase/schema.sql`
3. Click **Run**

This creates:
- `subjects` table (name, slug, timestamps)
- `files` table (metadata, storage path, download count)
- `admins` table (references `auth.users`)
- RLS policies (SELECT for everyone; INSERT for everyone on files/subjects; UPDATE/DELETE admin-only)
- `is_admin()` helper function
- `increment_download_count()` RPC (security definer)
- `admin_delete_file()` RPC (security definer)
- Sample subjects seed data

### 3. Create the Storage Bucket

**Option A – Dashboard:**
1. Go to **Storage** → **New bucket**
2. Name: `shared-files`, enable **Public bucket**
3. Click **Save**

**Option B – CLI:**
```bash
npx supabase storage create-bucket shared-files --public
```

### 4. Add Storage Policies

In **Storage → Policies → shared-files**, add 4 policies:

| Name | Operation | Expression |
|---|---|---|
| Public read | SELECT | `true` |
| Anyone upload | INSERT | `true` |
| Admin delete | DELETE | `(select is_admin())` |
| Admin update | UPDATE | `(select is_admin())` |

### 5. Create the Admin User

1. In the Supabase dashboard → **Authentication → Users → Invite user** (or Add user)
2. Enter an email and password for the admin account
3. Copy the user's UUID from the **Users** table
4. Go to **SQL Editor** and run:

```sql
INSERT INTO admins (user_id) VALUES ('paste-user-uuid-here');
```

### 6. Configure Environment Variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

> ⚠️ **Never** expose the service-role key to the client. If you need it for server-only tasks (e.g., admin Server Actions), add it as `SUPABASE_SERVICE_ROLE_KEY` and only use it in API routes or Server Actions.

### 7. Install Dependencies & Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Folder Structure

```
.
├── app/
│   ├── globals.css           # Design system & component styles
│   ├── layout.tsx            # Root layout (ThemeProvider, Navbar, Toaster)
│   ├── page.tsx              # Home page (hero + file browser)
│   └── admin/
│       ├── login/page.tsx    # Admin login
│       ├── page.tsx          # Admin dashboard
│       ├── files/page.tsx    # File management
│       └── subjects/page.tsx # Subject management
├── components/
│   ├── Navbar.tsx
│   ├── ThemeProvider.tsx
│   ├── UploadModal.tsx
│   ├── FileCard.tsx
│   ├── FileIcon.tsx
│   ├── Filters.tsx
│   └── LoadingSkeleton.tsx
├── hooks/
│   ├── useAdmin.ts
│   ├── useFiles.ts
│   └── useUpload.ts
├── lib/
│   ├── constants.ts
│   ├── database.types.ts
│   ├── utils.ts
│   └── supabase/
│       ├── client.ts         # Browser client
│       └── server.ts         # Server client (cookies)
├── middleware.ts             # Route protection for /admin/*
├── supabase/
│   └── schema.sql
└── .env.local
```

---

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

In the Vercel dashboard → **Settings → Environment Variables**, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Security Notes

- **RLS** is enabled on all tables. DELETE and UPDATE operations require `is_admin()` to return `true`.
- **Storage policies** enforce the same — anon users cannot delete objects.
- Filenames are sanitized (`lib/utils.ts → sanitizeFilename`) before upload.
- User-provided text (filenames, descriptions, uploader names) is rendered via React's built-in escaping — no `dangerouslySetInnerHTML`.
- File size is capped at `MAX_FILE_SIZE_MB` (default 1024 MB / 1 GB) — both client-side and can be enforced at the Storage bucket level.
- For public-facing production: consider adding **Cloudflare Turnstile** or rate-limiting to the upload endpoint to prevent abuse.

---

## Configuration

Edit `lib/constants.ts` to change:

```ts
export const MAX_FILE_SIZE_MB = 1024; // 1 GB (Change to 500 or your Supabase plan limit)
```

---

## Sample Data

The `supabase/schema.sql` seeds 5 subjects automatically:
- Mathematics
- Computer Science
- Physics
- English
- General

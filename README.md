# FileShare — Supabase + Backblaze B2 (S3-Compatible)

A modern full-stack file sharing web app (upload, browse, download) built with **Next.js 15 (App Router) + TypeScript + Tailwind CSS + Supabase (Postgres & Auth) + Backblaze B2 (S3-compatible Storage)**.

Operates **100% on free tiers with no credit card required**:
- **Backblaze B2**: 10 GB free storage with 3x free download bandwidth per day.
- **Supabase**: 500 MB Postgres database and Auth on the free tier.
- Supports single files of **200 MB – 500 MB+** (bypassing Supabase Storage's 50 MB limit and Vercel's 4.5 MB serverless payload limit via direct browser-to-B2 presigned uploads).

---

## Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │             Next.js App              │
                      │        (Vercel / Localhost)          │
                      └───┬──────────────────────────────┬───┘
                          │                              │
         1. /api/upload/init (Rate limit & Quota)        │ 4. /api/upload/complete
                          │                              │
                          ▼                              ▼
                 ┌─────────────────┐           ┌──────────────────┐
                 │  Supabase Auth  │           │ Supabase Postgres│
                 │  & Admin Client │           │  (Metadata Only) │
                 └─────────────────┘           └──────────────────┘
                          │
  2. Presigned PUT / Multipart URLs
                          │
                          ▼
            ┌───────────────────────────┐
            │   Client Browser Engine   │
            │  3 Parallel Part Workers  │
            │  Retries & ETag Capture   │
            └─────────────┬─────────────┘
                          │
                          │ 3. Direct Upload Stream (0 to 500 MB+)
                          │    (Bypasses Vercel Serverless Limits)
                          ▼
            ┌───────────────────────────┐
            │    Backblaze B2 Storage   │
            │    (Private S3 Bucket)    │
            └───────────────────────────┘
```

---

## Features

- **Anyone (No Login Required)**:
  - Browse and search files by name, description, and uploader.
  - Filter by Subject chips, sort by newest, oldest, name, or size.
  - Grid & List view toggle.
  - Inline preview for **Images, PDF documents, Audio (`.mp3`, `.wav`), and Video (`.mp4`, `.webm`)**.
  - Direct download with original filename preserved (`ResponseContentDisposition`).
  - Drag-and-drop multi-file upload with live byte-level progress bars and cancel buttons.
- **Admin (Supabase Auth)**:
  - `/admin/login` (email + password).
  - `/admin` dashboard with Backblaze B2 storage quota usage bar ("X GB of 9.5 GB used").
  - Admin button to clean up stale unfinished multipart uploads older than 24 hours.
  - Delete files (single and bulk delete): deletes from Backblaze B2 and Supabase database.
  - Manage subjects: create, rename, and delete (deletion blocked if subject contains files).
  - Delete buttons shown only to authorized admins.

---

## Step-by-Step Setup Guide

### 1. Supabase Setup (Database & Auth)

1. Create a free account at [https://supabase.com](https://supabase.com) and create a **New Project**.
2. Go to **Settings → API**:
   - Copy **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`).
   - Copy **Anon / Public key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
   - Copy **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`) — *keep this secret!*
3. Go to **SQL Editor** in the Supabase dashboard:
   - Paste the contents of `supabase/schema.sql` and click **Run**.
   - This creates `subjects`, `files`, `admins` tables, strict RLS policies, RPCs, and indexes.
4. Create an Admin User:
   - Go to **Authentication → Users** → Click **Add user** → **Create user**.
   - Enter an email and password (e.g. `admin@example.com`).
   - Copy the newly created user's **User UID**.
   - Return to **SQL Editor** and insert the UID into the `admins` table:
     ```sql
     insert into admins (user_id) values ('PASTE_USER_UID_HERE');
     ```

---

### 2. Backblaze B2 Setup (Private S3 Bucket & Application Key)

1. Create a free account at [https://www.backblaze.com/b2/cloud-storage.html](https://www.backblaze.com/b2/cloud-storage.html).
2. Create a Bucket:
   - Go to **B2 Cloud Storage → Buckets** → Click **Create a Bucket**.
   - **Bucket Unique Name**: e.g. `my-fileshare-bucket` (set as `B2_BUCKET`).
   - **Files in Bucket are**: Select **Private** (keep `allPrivate`).
   - Leave default encryption and Object Lock disabled, then click **Create a Bucket**.
   - Note the **Endpoint** displayed on your bucket details (e.g. `s3.us-west-004.backblazeb2.com`).
     - `B2_ENDPOINT`: `s3.us-west-004.backblazeb2.com`
     - `B2_REGION`: `us-west-004` (the region prefix before `.backblazeb2.com`).
3. Create a Bucket-Restricted Application Key:
   - Go to **Account → Application Keys** → Click **Add a New Application Key**.
   - **Name of key**: `fileshare-app-key`.
   - **Allow access to Bucket(s)**: Select your bucket (`my-fileshare-bucket`).
   - **Type of Access**: Select **Read and Write**.
   - Click **Create New Key**.
   - Copy both:
     - **keyID** (`B2_KEY_ID`).
     - **applicationKey** (`B2_APPLICATION_KEY`) — *note: this is only shown once!*

---

### 3. Apply CORS to the Backblaze B2 Bucket

To allow browsers to upload directly to Backblaze B2 via presigned URLs and read the `ETag` response header for multipart uploads, apply the CORS configuration:

#### Option A: Using the official `b2` CLI
```bash
# 1. Install b2 CLI (macOS / Linux / Windows)
brew install b2-tools
# or via python: pip install b2

# 2. Authenticate
b2 authorize-account <B2_KEY_ID> <B2_APPLICATION_KEY>

# 3. Update your bucket with cors.json (while keeping bucket allPrivate)
b2 update-bucket --corsRules "$(cat cors.json)" my-fileshare-bucket allPrivate
```

#### Option B: Via AWS CLI (S3 API)
```bash
aws s3api put-bucket-cors \
  --endpoint-url https://s3.us-west-004.backblazeb2.com \
  --bucket my-fileshare-bucket \
  --cors-configuration file://cors.json
```

---

### 4. Local Development

1. Clone and enter repository:
   ```bash
   cd "Kar lenge sir"
   ```

2. Copy `.env.example` to `.env.local` and fill in your credentials:
   ```bash
   cp .env.example .env.local
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

---

### 5. Deploying to Vercel

Because file chunks upload **directly from the user's browser to Backblaze B2 via presigned URLs**, Vercel's **4.5 MB Serverless Function Request Body limit does NOT apply**. You can seamlessly upload 200 MB, 500 MB, or larger files!

1. Push your repository to GitHub.
2. In [Vercel Dashboard](https://vercel.com) → **Add New Project** → Import your repository.
3. Add the following **Environment Variables** in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Server-only)
   - `B2_KEY_ID` (Server-only)
   - `B2_APPLICATION_KEY` (Server-only)
   - `B2_BUCKET` (Server-only)
   - `B2_ENDPOINT` (Server-only)
   - `B2_REGION` (Server-only)
   - `MAX_FILE_SIZE_MB` = `500`
   - `STORAGE_QUOTA_GB` = `9.5`
   - `STORAGE_PROVIDER` = `b2`
4. Update `cors.json` to replace `https://YOUR-APP.vercel.app` with your actual Vercel domain, and re-run the `b2 update-bucket` command.
5. Click **Deploy**.

---

## Security & Protection Features

1. **Storage Quota Enforcement**:
   - The server computes total stored bytes before generating presigned URLs. Any file that would push total usage above `STORAGE_QUOTA_GB` (9.5 GB) is immediately rejected with HTTP 400.
2. **Server-Side Admin Deletion**:
   - Deletion checks user session cookies and verifies against the `admins` table on the server before issuing S3 `DeleteObject` and Postgres `DELETE`. Anonymous delete attempts are rejected with HTTP 403 Forbidden.
3. **Orphaned Chunk Cleanup**:
   - Cancelled uploads immediately trigger `POST /api/upload/abort` (`AbortMultipartUpload`).
   - The Admin dashboard includes a "Clean Stale Uploads" button to remove any incomplete uploads older than 24 hours.
4. **Rate Limiting**:
   - In-memory sliding window rate limiter protects `/api/upload/init` against spam.

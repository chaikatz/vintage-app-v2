# VINTAGE - A Museum for Your Memories

A photo-sharing app focused on nostalgia and authenticity. No performances. Just real memories.

## Quick Deploy Guide

### Step 1: Set Up Supabase Database

1. Go to your Supabase project: https://supabase.com/dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire contents of `supabase-schema.sql` and paste it
5. Click **Run** (or press Cmd+Enter)
6. You should see "Success" messages

### Step 2: Deploy to Vercel

1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Connect your GitHub account if needed
4. Select the `vintage-app` repository
5. In **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://qvbnxzysuseidhibkuft.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
6. Click **Deploy**
7. Wait 2-3 minutes
8. Your app is live!

## Features

- 📸 Photo upload with EXIF date extraction
- 🎨 5 vintage filters (Slim Aarons, Film Noir, Vintage Warm, Cool B&W, Faded Film)
- 📅 Orange camera-style date stamps
- 🕰️ "On This Day" memory resurfacing
- 📤 Instagram Story export
- ❤️ Likes and social feed
- 👤 User profiles

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Backend**: Supabase (Auth, Database, Storage)
- **Deployment**: Vercel

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

---

Built with Claude as co-CEO 🤝

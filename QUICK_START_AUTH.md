# Google OAuth Quick Start Guide

This is a condensed, step-by-step guide to get Google OAuth authentication working in 15 minutes.

---

## Prerequisites

- Node.js 20.20.2 or higher
- A Google account
- A code editor

---

## Step 1: Set Up Supabase (5 minutes)

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Enter:
   - Name: `event-platform`
   - Database Password: (create a strong password)
   - Region: (choose closest to you)
4. Click **"Create new project"**
5. Wait ~2 minutes for setup to complete

### 2. Get Your API Credentials

1. In Supabase dashboard, click **Settings** (⚙️) → **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGc...` (long string)

### 3. Update Your `.env.local` File

Create a file named `.env.local` in your project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**Replace** the placeholder values with your actual Supabase credentials!

---

## Step 2: Set Up Google OAuth (5 minutes)

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Go to **APIs & Services** → **Credentials**
4. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**

### 2. Configure Consent Screen (First Time Only)

If prompted:
1. Click **"CONFIGURE CONSENT SCREEN"**
2. Choose **"External"**
3. Fill in:
   - App name: `Event Platform`
   - User support email: (your email)
   - Developer contact: (your email)
4. Click **"SAVE AND CONTINUE"** through all steps

### 3. Create OAuth Client

1. Go back to **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. Choose **"Web application"**
4. Name: `Event Platform Web Client`
5. Add **Authorized redirect URIs**:
   ```
   https://xxxxx.supabase.co/auth/v1/callback
   ```
   **⚠️ Replace `xxxxx.supabase.co` with YOUR Supabase URL!**
6. Click **"CREATE"**
7. Copy the **Client ID** and **Client Secret**

---

## Step 3: Configure Google in Supabase (2 minutes)

1. Go to your Supabase dashboard
2. Click **Authentication** (🔐) → **Providers**
3. Find **"Google"** and toggle it **ON**
4. Paste:
   - **Client ID**: (from Google)
   - **Client Secret**: (from Google)
5. Click **"Save"**

### Configure Site URL

1. Still in Supabase, go to **Authentication** → **URL Configuration**
2. Set:
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs** (add these):
     ```
     http://localhost:3000/**
     http://localhost:3000/auth/callback
     ```
3. Click **"Save"**

---

## Step 4: Test It! (3 minutes)

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Development Server

```bash
npm run dev
```

### 3. Test Google Login

1. Open `http://localhost:3000/auth/login`
2. Click **"Continue with Google"**
3. Select your Google account
4. Grant permissions
5. You should be redirected to `/admin`

### 4. Verify It Worked

1. Check the top-right corner - you should see your user profile
2. Click on your profile → **"Sign Out"** to test logout
3. In Supabase dashboard, go to **Authentication** → **Users**
4. You should see your user listed!

---

## Troubleshooting

### "redirect_uri_mismatch" Error

**Solution**: Add this EXACT URL to Google OAuth redirect URIs:
```
https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback
```
(Replace `YOUR-PROJECT-ID` with your actual Supabase project ID)

### "Authentication failed"

**Solutions**:
1. Check `.env.local` has correct values
2. Restart dev server: `Ctrl+C` then `npm run dev`
3. Clear browser cache
4. Check Supabase project is active (not paused)

### Still seeing "Sign In" button after login

**Solution**: Hard refresh the page (`Cmd+Shift+R` or `Ctrl+Shift+R`)

### Can't see environment variables

**Solution**: 
1. Make sure `.env.local` is in the project root (same folder as `package.json`)
2. Restart the dev server
3. Check the file is named `.env.local` (not `.env.local.txt`)

---

## Next Steps

✅ **You're done!** Google OAuth is now working.

Optional enhancements:
- Add email/password authentication (already implemented)
- Enable email verification in Supabase settings
- Set up database tables for users, committees, tasks
- Deploy to production (see `GOOGLE_OAUTH_SETUP.md` for production setup)

---

## Files Created

The following files handle authentication:

- `src/lib/supabase/client.ts` - Browser Supabase client
- `src/lib/supabase/server.ts` - Server Supabase client
- `src/lib/supabase/utils.ts` - Auth helper functions
- `src/middleware.ts` - Session management
- `src/app/auth/callback/route.ts` - OAuth callback handler
- `src/app/auth/login/page.tsx` - Login page with Google button
- `src/app/auth/register/page.tsx` - Register page with Google button
- `src/components/UserMenu.tsx` - User profile menu
- `src/components/Navigation.tsx` - Updated with auth state

---

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key from Supabase | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` |
| `NEXT_PUBLIC_SITE_URL` | Your app URL | `http://localhost:3000` |

---

**Need more details?** See `GOOGLE_OAUTH_SETUP.md` for the comprehensive guide with troubleshooting and production deployment.

**Last Updated**: 2026-07-22

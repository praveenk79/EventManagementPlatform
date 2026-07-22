# Google OAuth Setup Guide for Supabase

This guide walks you through setting up Google OAuth authentication for your event platform application.

## Prerequisites

- A Supabase project (create one at [supabase.com](https://supabase.com))
- A Google Cloud account

---

## Step 1: Set Up Supabase Project

### 1.1 Create a Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Fill in:
   - **Project Name**: `event-platform` (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your users
4. Click **"Create new project"** (takes ~2 minutes)

### 1.2 Get Your API Keys

1. Once the project is created, go to **Settings** (⚙️ icon in sidebar)
2. Click **"API"** in the left menu
3. Copy the following values:
   - **Project URL**: `https://xxxxxxxxxxxxx.supabase.co`
   - **anon/public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 1.3 Update Your `.env.local` File

Create or update `.env.local` in your project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**⚠️ Important**: Never commit `.env.local` to version control!

---

## Step 2: Set Up Google OAuth Credentials

### 2.1 Create OAuth Credentials in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **"APIs & Services"** → **"Credentials"**
4. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**

### 2.2 Configure OAuth Consent Screen (if not done)

If prompted, you need to configure the OAuth consent screen first:

1. Click **"CONFIGURE CONSENT SCREEN"**
2. Choose **"External"** (unless you have a Google Workspace)
3. Fill in the required fields:
   - **App name**: `Event Platform` (or your app name)
   - **User support email**: Your email
   - **Developer contact information**: Your email
4. Click **"SAVE AND CONTINUE"**
5. Skip the "Scopes" step (click **"SAVE AND CONTINUE"**)
6. Skip "Test users" (click **"SAVE AND CONTINUE"**)
7. Click **"BACK TO DASHBOARD"**

### 2.3 Create OAuth Client ID

1. Go back to **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. Choose **"Web application"**
4. Fill in:
   - **Name**: `Event Platform Web Client`
   - **Authorized JavaScript origins**:
     ```
     http://localhost:3000
     https://your-production-domain.com
     ```
   - **Authorized redirect URIs**:
     ```
     https://xxxxxxxxxxxxx.supabase.co/auth/v1/callback
     http://localhost:3000/auth/callback
     https://your-production-domain.com/auth/callback
     ```
     
     **⚠️ Replace `xxxxxxxxxxxxx.supabase.co` with your actual Supabase project URL!**

5. Click **"CREATE"**
6. Copy the **Client ID** and **Client Secret**

---

## Step 3: Configure Google OAuth in Supabase

### 3.1 Enable Google Provider

1. Go to your Supabase dashboard
2. Navigate to **Authentication** (🔐 icon in sidebar)
3. Click **"Providers"** in the left menu
4. Find **"Google"** in the list
5. Toggle it **ON**

### 3.2 Add Google Credentials

In the Google provider settings:

1. Paste your **Google Client ID**
2. Paste your **Google Client Secret**
3. **Redirect URL** should be pre-filled:
   ```
   https://xxxxxxxxxxxxx.supabase.co/auth/v1/callback
   ```
4. Click **"Save"**

### 3.3 Configure Site URL

1. In Supabase, go to **Authentication** → **"URL Configuration"**
2. Set the following:
   - **Site URL**: `http://localhost:3000` (for development)
   - **Redirect URLs**: Add these URLs (one per line):
     ```
     http://localhost:3000/auth/callback
     http://localhost:3000/**
     https://your-production-domain.com/auth/callback
     https://your-production-domain.com/**
     ```
3. Click **"Save"**

---

## Step 4: Test the Authentication Flow

### 4.1 Start Your Development Server

```bash
npm run dev
```

Your app should be running on `http://localhost:3000`

### 4.2 Test Google Login

1. Navigate to `http://localhost:3000/auth/login`
2. Click **"Continue with Google"** button
3. You should be redirected to Google's OAuth consent screen
4. Select your Google account
5. Grant permissions
6. You should be redirected back to your app at `/admin`

### 4.3 Verify Authentication

1. Open browser DevTools (F12)
2. Go to **Application** → **Cookies**
3. Look for Supabase session cookies (they start with `sb-`)
4. Check the **Console** for any errors

### 4.4 Check Supabase Dashboard

1. Go to **Authentication** → **"Users"** in Supabase
2. You should see your newly created user with:
   - Email from Google
   - Provider: `google`
   - Created timestamp

---

## Step 5: Production Deployment

### 5.1 Update Environment Variables

In your production hosting platform (Vercel, Netlify, etc.):

1. Add the environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_SITE_URL=https://your-production-domain.com
   ```

### 5.2 Update Google OAuth Redirect URIs

1. Go back to [Google Cloud Console](https://console.cloud.google.com/)
2. Go to **"APIs & Services"** → **"Credentials"**
3. Click on your OAuth 2.0 Client ID
4. Add production URLs to **"Authorized redirect URIs"**:
   ```
   https://your-production-domain.com/auth/callback
   ```
5. Add production domain to **"Authorized JavaScript origins"**:
   ```
   https://your-production-domain.com
   ```
6. Click **"Save"**

### 5.3 Update Supabase Redirect URLs

1. In Supabase dashboard, go to **Authentication** → **"URL Configuration"**
2. Update **Site URL**: `https://your-production-domain.com`
3. Add production redirect URL:
   ```
   https://your-production-domain.com/auth/callback
   https://your-production-domain.com/**
   ```
4. Click **"Save"**

---

## Troubleshooting

### Error: "redirect_uri_mismatch"

- **Cause**: The redirect URI in your Google OAuth config doesn't match the one Supabase is using
- **Fix**: Make sure you added `https://xxxxxxxxxxxxx.supabase.co/auth/v1/callback` to Google OAuth redirect URIs

### Error: "Invalid login credentials"

- **Cause**: Environment variables not set correctly
- **Fix**: Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct

### Users can log in but get logged out immediately

- **Cause**: Middleware or cookie issues
- **Fix**: Check that middleware is properly configured and cookies are being set

### "Authentication failed. Please try again."

- **Cause**: Code exchange failed in the callback route
- **Fix**: 
  - Check browser console for errors
  - Verify redirect URLs are configured correctly in both Google and Supabase
  - Check that the callback route (`/auth/callback/route.ts`) is working

### Google OAuth consent screen shows "This app isn't verified"

- **Cause**: Your app is in testing mode
- **Fix**: 
  - This is normal during development
  - Users can click "Advanced" → "Go to [App Name] (unsafe)" to proceed
  - For production, you need to verify your app with Google (optional for small apps)

---

## Security Best Practices

1. **Never commit `.env.local`** to version control
2. **Use Row Level Security (RLS)** in Supabase for database tables
3. **Implement proper role-based access control** (you already have RBAC system)
4. **Enable email confirmations** for production (in Supabase Authentication settings)
5. **Set up rate limiting** to prevent abuse
6. **Use HTTPS** in production (redirect HTTP to HTTPS)

---

## Next Steps

1. ✅ Google OAuth is now working!
2. **Set up database tables** for users, committees, tasks, etc.
3. **Migrate localStorage data** to Supabase database
4. **Implement Row Level Security (RLS)** policies
5. **Add real-time subscriptions** for live updates
6. **Implement file storage** using Supabase Storage

---

## Useful Links

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Supabase Google OAuth Guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Next.js App Router with Supabase](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Google Cloud Console](https://console.cloud.google.com/)

---

**Last Updated**: 2026-07-22

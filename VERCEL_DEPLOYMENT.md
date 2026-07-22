# Deploying to Vercel - Step-by-Step Guide

This guide walks you through deploying your event platform to Vercel with proper Google OAuth and Supabase configuration.

---

## Step 1: Push Code to GitHub

Vercel deploys from GitHub, so first push your code:

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit with Google OAuth authentication"

# Add remote repository (replace with your repo URL)
git remote add origin https://github.com/YOUR-USERNAME/event-platform.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## Step 2: Create Vercel Project

### 2.1 Import from GitHub

1. Go to [vercel.com](https://vercel.com)
2. Click **"Add New..."** → **"Project"**
3. Click **"Import Git Repository"**
4. Find your `event-platform` repository and click **"Import"**

### 2.2 Configure Project Settings

1. **Project Name**: `event-platform` (or your preferred name)
2. **Framework Preset**: Next.js (should auto-detect)
3. **Root Directory**: `./event-platform` (if using monorepo structure)
4. Click **"Deploy"**

Vercel will start the initial deployment (may fail due to missing env vars — that's expected).

---

## Step 3: Add Environment Variables to Vercel

### 3.1 Go to Project Settings

1. In Vercel dashboard, click on your `event-platform` project
2. Go to **Settings** → **Environment Variables**

### 3.2 Add Supabase Credentials

Add these environment variables (from your `.env.local`):

| Key | Value | Example |
|-----|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL | `https://pwojflpzruhjxywbqggv.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key | `sb_publishable_AL_fEWDjgRFLikmifP5enw_xJg1umbA` |
| `NEXT_PUBLIC_SITE_URL` | Your production domain | `https://event-platform.vercel.app` |

**Steps:**
1. Click **"Add New"**
2. Enter `NEXT_PUBLIC_SUPABASE_URL` and paste your Supabase URL
3. Click **"Add New"** again
4. Enter `NEXT_PUBLIC_SUPABASE_ANON_KEY` and paste your anon key
5. Click **"Add New"** again
6. Enter `NEXT_PUBLIC_SITE_URL` and enter your Vercel domain
7. Click **"Save"**

**⚠️ Important**: Make sure these are set for **Production** environment!

---

## Step 4: Update Google OAuth Redirect URIs

### 4.1 Get Your Vercel Domain

1. In Vercel project, go to **Deployments** or **Settings** → **Domains**
2. Your default domain is: `event-platform.vercel.app` (or custom domain if set)
3. Copy this domain

### 4.2 Update Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Add to **"Authorized redirect URIs"**:
   ```
   https://event-platform.vercel.app/auth/callback
   ```
   (Replace `event-platform.vercel.app` with your actual domain)
5. Add to **"Authorized JavaScript origins"**:
   ```
   https://event-platform.vercel.app
   ```
6. Click **"Save"**

---

## Step 5: Update Supabase Site URL

### 5.1 Configure Supabase for Production

1. Go to Supabase Dashboard
2. Select your project
3. Go to **Authentication** → **URL Configuration**
4. Update:
   - **Site URL**: `https://event-platform.vercel.app`
   - **Redirect URLs**: Add these (one per line):
     ```
     https://event-platform.vercel.app/auth/callback
     https://event-platform.vercel.app/**
     ```
5. Click **"Save"**

---

## Step 6: Redeploy to Vercel

### 6.1 Trigger New Deployment

Now that env vars are set, redeploy:

1. In Vercel dashboard, go to **Deployments**
2. Click the latest deployment (the failed one)
3. Click **"Redeploy"** button in the top right
4. Confirm **"Redeploy"**

Wait for the build to complete (usually 2-3 minutes).

### 6.2 Check Deployment Status

- ✅ **Green checkmark** = Deployment successful
- ❌ **Red X** = Deployment failed (check build logs)

---

## Step 7: Test Production Deployment

### 7.1 Test Google Login

1. Go to `https://event-platform.vercel.app/auth/login`
2. Click **"Continue with Google"**
3. You should be redirected to Google OAuth
4. After authorizing, you should be logged in ✅

### 7.2 Test Email/Password Registration

1. Go to `https://event-platform.vercel.app/auth/register`
2. Fill in the registration form
3. Click **"Create Account"**
4. You should be logged in ✅

### 7.3 Test Sign Out

1. Click your profile avatar (top right)
2. Click **"Sign Out"**
3. You should be redirected to login page ✅

---

## Step 8: Set Up Custom Domain (Optional)

If you have a custom domain:

### 8.1 Add Domain to Vercel

1. In Vercel project, go to **Settings** → **Domains**
2. Click **"Add"**
3. Enter your domain (e.g., `event-platform.com`)
4. Vercel will show DNS configuration instructions
5. Update DNS records at your domain registrar

### 8.2 Update Google OAuth & Supabase

Repeat steps 4 and 5 above, but use your custom domain instead of `event-platform.vercel.app`.

---

## Troubleshooting

### Build Fails with "Node.js version"

**Error**: `"You are using Node.js 16. For Next.js, Node.js version "^18.18.0 || ^19.8.0 || >= 20.0.0" is required."`

**Solution**: Vercel uses Node.js 16 by default. Add to `package.json`:
```json
{
  "engines": {
    "node": ">=20.0.0"
  }
}
```

Or set in Vercel project settings:
1. Go to **Settings** → **General**
2. Scroll to **Node.js Version**
3. Select **20.x** or **22.x**
4. Redeploy

### "Authentication failed" on Production

**Causes**:
1. Environment variables not set correctly
2. Google OAuth redirect URI mismatch
3. Supabase Site URL not updated

**Solutions**:
1. Check Vercel env vars are set to **Production** (not Preview)
2. Verify Google OAuth has your production domain
3. Check Supabase Site URL matches your domain
4. Check browser console for specific error messages

### "redirect_uri_mismatch" Error

**Cause**: Google OAuth redirect URI doesn't match production domain

**Solution**:
1. In Google Cloud Console, verify redirect URI is exactly:
   ```
   https://YOUR-DOMAIN.vercel.app/auth/callback
   ```
2. Or for custom domain:
   ```
   https://your-custom-domain.com/auth/callback
   ```
3. Save and wait ~5 minutes for changes to propagate
4. Clear browser cache and try again

### "PKCE code verifier not found" Error

**Cause**: Cookies not being set across OAuth redirect

**Solution**:
1. Ensure environment variables are set correctly
2. Check that middleware is deployed (check `.next/server/middleware.js` in Vercel logs)
3. Clear browser cookies and try again
4. Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

---

## Viewing Logs

To debug issues:

1. Go to Vercel project → **Deployments**
2. Click the deployment
3. Go to **Logs** tab
4. View **Build Logs** or **Runtime Logs**
5. Search for errors

---

## Auto-Deploy on Push

By default, Vercel auto-deploys when you push to GitHub:

1. Make changes locally
2. Commit and push:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push
   ```
3. Vercel automatically starts a new deployment
4. Check progress in **Deployments** tab

---

## Production Checklist

- [ ] Environment variables set in Vercel (Production)
- [ ] Google OAuth redirect URI updated with Vercel domain
- [ ] Supabase Site URL updated with Vercel domain
- [ ] Node.js version set to 20+ in Vercel
- [ ] Initial deployment successful (green checkmark)
- [ ] Google OAuth login tested on production
- [ ] Email/password signup tested
- [ ] Sign out tested
- [ ] No errors in Vercel runtime logs

---

## Next Steps (Phase 3)

After confirming production deployment works:

1. Set up database schema in Supabase
2. Migrate localStorage data to Supabase
3. Add real-time features
4. Set up file storage
5. Monitor production usage in Vercel analytics

---

## Useful Links

- [Vercel Dashboard](https://vercel.com/dashboard)
- [Vercel Next.js Documentation](https://vercel.com/docs/frameworks/nextjs)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Vercel Custom Domains](https://vercel.com/docs/concepts/projects/custom-domains)

---

**Status**: Production deployment guide created ✅

**Last Updated**: 2026-07-22

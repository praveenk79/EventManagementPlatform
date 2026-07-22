# Supabase Setup Guide - Step by Step

## 🎯 Follow These Steps

### Step 1: Create Supabase Account (5 minutes)

1. **Sign Up/Sign In**
   - I've opened https://supabase.com in your browser
   - Click "Start your project" or "Sign In"
   - Use GitHub login (recommended) or email

2. **Create New Project**
   - Click "New Project"
   - Fill in:
     - **Project Name**: `tech-event-platform` (or any name you like)
     - **Database Password**: Create a strong password (SAVE THIS!)
     - **Region**: Choose closest to you
     - **Plan**: Free (perfect for starting)
   - Click "Create new project"
   - Wait 2-3 minutes for setup

---

### Step 2: Get Your Credentials (2 minutes)

Once your project is ready:

1. Go to **Settings** (gear icon in sidebar)
2. Click **API** in the left menu
3. Copy these two values:

   ```
   Project URL: https://xxxxx.supabase.co
   anon public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

---

### Step 3: Add Credentials to Your Project (1 minute)

Open Terminal and run:

```bash
cd event-platform

# Create environment file
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=paste-your-project-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-your-anon-key-here
EOF
```

**IMPORTANT**: Replace the placeholder values with your actual Supabase credentials!

---

### Step 4: Set Up Database (3 minutes)

1. In Supabase Dashboard, go to **SQL Editor** (in sidebar)
2. Click **New Query**
3. I'll help you copy the schema - it's in `event-platform/database/schema.sql`
4. Paste the entire contents
5. Click **Run** (or press Cmd+Enter)
6. You should see "Success. No rows returned"

---

### Step 5: Verify Setup (1 minute)

Check that tables were created:
1. In Supabase, go to **Table Editor** (in sidebar)
2. You should see these tables:
   - profiles
   - events
   - sessions
   - teams
   - tasks
   - meetings
   - notifications

---

### Step 6: Restart Dev Server

```bash
# Stop the current server (Ctrl+C in terminal)
# Then restart with:
cd event-platform
nvm use 20
npm run dev
```

---

## 🎉 Done! Login Will Work

After these steps:
- Login page will create real accounts
- Registration will work
- Users can sign in
- Data will be stored in Supabase

---

## 📝 What We're About to Do Together

1. ✅ Open Supabase (already done!)
2. ⏳ You create account & project
3. ⏳ You copy credentials
4. ⏳ I'll help you add credentials to .env.local
5. ⏳ I'll copy database schema for you to run
6. ✅ Test login!

**Ready? Let's do this! Tell me once you've signed up to Supabase.**

# Debugging Public Sessions - Step by Step Guide

## Step 1: Check Browser Console (Most Important!)

1. Open your browser's Developer Console (F12 or Right-click → Inspect → Console tab)
2. Look for the debug logs when the dashboard loads
3. Check for these messages:
   - `✅ Query with .eq('is_public', true) succeeded. Found X sessions`
   - `📊 Total sessions in database: X`
   - `📊 Public sessions in sample: X`
   - `⚠️ No public sessions found...`

## Step 2: Verify Sessions Are Actually Public

### Option A: Check in Supabase Dashboard
1. Go to your Supabase Dashboard → Table Editor → `rp_sessions`
2. Look at the `is_public` column
3. Check if any sessions have `is_public = true` (or `t`)

### Option B: Run SQL Query
Go to Supabase Dashboard → SQL Editor and run:
```sql
SELECT id, name, is_public, status, user_a, user_b 
FROM rp_sessions 
WHERE is_public = true 
LIMIT 10;
```

## Step 3: Check RLS (Row Level Security) Policies

**This is the most likely issue!** Supabase RLS policies might be blocking access.

### Check if RLS is enabled:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'rp_sessions';
```

If `rowsecurity = true`, RLS is enabled and you need a policy that allows SELECT on public sessions.

### Create/Check RLS Policy for Public Sessions:
Go to Supabase Dashboard → Authentication → Policies → `rp_sessions`

You should have a policy like:
```sql
-- Allow anyone to view public sessions
CREATE POLICY "Anyone can view public sessions"
ON rp_sessions
FOR SELECT
USING (is_public = true);

-- Or if you want authenticated users only:
CREATE POLICY "Authenticated users can view public sessions"
ON rp_sessions
FOR SELECT
TO authenticated
USING (is_public = true);
```

## Step 4: Test the "Make Public" Button

1. Go to a session page (`/session/[sessionId]`)
2. Click the "Make Public" button
3. Check browser console for: `✅ Session made public successfully`
4. Verify in database that `is_public` changed to `true`

## Step 5: Check Session Status

Public sessions should be `active` or `paused`, NOT `closed`.

Run this query:
```sql
SELECT id, name, is_public, status, is_active
FROM rp_sessions
WHERE is_public = true;
```

All returned sessions should have `status IN ('active', 'paused')` (or NULL, but not 'closed').

## Step 6: Verify Database Schema

Make sure the `is_public` column exists:
```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'rp_sessions'
AND column_name = 'is_public';
```

Should return:
- `column_name`: is_public
- `data_type`: boolean
- `column_default`: false
- `is_nullable`: NO

## Step 7: Check if You're Filtering Your Own Sessions

The code filters out sessions where you're a participant. To test:
1. Create a session with another account
2. Make that session public
3. Log in with your account
4. Check if it appears in "Sessions to Watch"

## Quick Fix: Disable RLS (FOR TESTING ONLY!)

If you want to quickly test without RLS:
```sql
ALTER TABLE rp_sessions DISABLE ROW LEVEL SECURITY;
```

**WARNING:** This disables all RLS policies. Only use for testing, then re-enable with:
```sql
ALTER TABLE rp_sessions ENABLE ROW LEVEL SECURITY;
```

## Most Common Issues:

1. **RLS Policy Missing** (90% of cases) - No policy allowing SELECT on public sessions
2. **Sessions Not Actually Public** - `is_public` is still `false` in database
3. **All Sessions Are Closed** - Closed sessions are filtered out
4. **User is a Participant** - Your own sessions are filtered out from "Sessions to Watch"




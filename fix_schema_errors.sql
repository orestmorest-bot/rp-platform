-- ============================================================================
-- FIXES FOR SCHEMA ERRORS
-- ============================================================================
-- This file contains fixes for the SQL schema errors
-- Run this after your main schema file
-- ============================================================================

-- Fix 1: Add DROP POLICY IF EXISTS before creating "Anyone can view public sessions" policy
DROP POLICY IF EXISTS "Anyone can view public sessions" ON public.rp_sessions;

-- Now create the policy (if you want to add it)
CREATE POLICY "Anyone can view public sessions"
ON public.rp_sessions
FOR SELECT
USING (is_public = true);

-- Fix 2: Fix the syntax error in the trigger (if it exists in your schema)
-- The line should be:
-- WHEN (OLD.last_seen IS DISTINCT FROM NEW.last_seen)
-- NOT: WHEN (OLD.last_seen IS DISTINCT FROMhis code NEW.last_seen)

-- Fix the trigger if it exists with the error
DROP TRIGGER IF EXISTS trigger_update_max_viewers_update ON public.rp_session_viewers;

CREATE TRIGGER trigger_update_max_viewers_update
  AFTER UPDATE ON public.rp_session_viewers
  FOR EACH ROW
  WHEN (OLD.last_seen IS DISTINCT FROM NEW.last_seen)
  EXECUTE FUNCTION update_session_max_viewers();




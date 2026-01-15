-- Add max_viewers column to track peak viewer count per session
ALTER TABLE public.rp_sessions
ADD COLUMN IF NOT EXISTS max_viewers INTEGER DEFAULT 0;

-- Create table to track active session viewers
CREATE TABLE IF NOT EXISTS public.rp_session_viewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.rp_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_rp_session_viewers_session_id ON public.rp_session_viewers(session_id);
CREATE INDEX IF NOT EXISTS idx_rp_session_viewers_user_id ON public.rp_session_viewers(user_id);
CREATE INDEX IF NOT EXISTS idx_rp_session_viewers_last_seen ON public.rp_session_viewers(last_seen);

-- Enable RLS
ALTER TABLE public.rp_session_viewers ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view viewers of public sessions
DROP POLICY IF EXISTS "Anyone can view session viewers" ON public.rp_session_viewers;
CREATE POLICY "Anyone can view session viewers"
ON public.rp_session_viewers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.rp_sessions
    WHERE rp_sessions.id = rp_session_viewers.session_id
    AND rp_sessions.is_public = true
  )
  OR
  EXISTS (
    SELECT 1 FROM public.rp_sessions
    WHERE rp_sessions.id = rp_session_viewers.session_id
    AND (rp_sessions.user_a = auth.uid() OR rp_sessions.user_b = auth.uid())
  )
);

-- Policy: Users can insert themselves as viewers
DROP POLICY IF EXISTS "Users can join as viewers" ON public.rp_session_viewers;
CREATE POLICY "Users can join as viewers"
ON public.rp_session_viewers
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own viewer record
DROP POLICY IF EXISTS "Users can update their viewer status" ON public.rp_session_viewers;
CREATE POLICY "Users can update their viewer status"
ON public.rp_session_viewers
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can remove themselves as viewers
DROP POLICY IF EXISTS "Users can leave session view" ON public.rp_session_viewers;
CREATE POLICY "Users can leave session view"
ON public.rp_session_viewers
FOR DELETE
USING (auth.uid() = user_id);

-- Function to update max_viewers when viewer count changes
CREATE OR REPLACE FUNCTION update_session_max_viewers()
RETURNS TRIGGER AS $$
DECLARE
  session_uuid UUID;
  current_viewer_count INTEGER;
  current_max_viewers INTEGER;
BEGIN
  -- Get the session_id (NEW for INSERT/UPDATE, OLD for DELETE)
  session_uuid := COALESCE(NEW.session_id, OLD.session_id);
  
  IF session_uuid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Get current viewer count (all active viewers)
  -- Note: We count all viewers, not just active ones in last 2 minutes, 
  -- because when someone joins we want to include them in the count immediately
  SELECT COUNT(*) INTO current_viewer_count
  FROM public.rp_session_viewers
  WHERE session_id = session_uuid;
  
  -- Get current max_viewers for the session
  SELECT COALESCE(max_viewers, 0) INTO current_max_viewers
  FROM public.rp_sessions
  WHERE id = session_uuid;
  
  -- Update max_viewers if current count is higher (only increase, never decrease)
  -- This tracks the lifetime peak viewer count
  IF current_viewer_count > current_max_viewers THEN
    UPDATE public.rp_sessions
    SET max_viewers = current_viewer_count
    WHERE id = session_uuid;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update max_viewers on insert
DROP TRIGGER IF EXISTS trigger_update_max_viewers_insert ON public.rp_session_viewers;
CREATE TRIGGER trigger_update_max_viewers_insert
  AFTER INSERT ON public.rp_session_viewers
  FOR EACH ROW
  EXECUTE FUNCTION update_session_max_viewers();

-- Trigger to update max_viewers on update (when last_seen is updated)
DROP TRIGGER IF EXISTS trigger_update_max_viewers_update ON public.rp_session_viewers;
CREATE TRIGGER trigger_update_max_viewers_update
  AFTER UPDATE ON public.rp_session_viewers
  FOR EACH ROW
  WHEN (OLD.last_seen IS DISTINCT FROM NEW.last_seen)
  EXECUTE FUNCTION update_session_max_viewers();

-- ============================================================================
-- ADD SESSION METADATA (if not already added)
-- ============================================================================

-- Add session metadata fields: name, style, and is_public
ALTER TABLE public.rp_sessions
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS style TEXT,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- RLS POLICY FOR PUBLIC SESSIONS VIEWING
-- ============================================================================

-- Allow anyone to view public sessions (DROP IF EXISTS to avoid errors)
DROP POLICY IF EXISTS "Anyone can view public sessions" ON public.rp_sessions;
CREATE POLICY "Anyone can view public sessions"
ON public.rp_sessions
FOR SELECT
USING (is_public = true);


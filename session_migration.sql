-- Migration script to add active/inactive session features
-- Run this in your Supabase SQL editor after running session_schema.sql

-- Add new columns to rp_sessions table (if they don't exist)
DO $$ 
BEGIN
  -- Add is_active column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rp_sessions' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.rp_sessions ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;

  -- Add last_message_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rp_sessions' AND column_name = 'last_message_at'
  ) THEN
    ALTER TABLE public.rp_sessions ADD COLUMN last_message_at TIMESTAMPTZ;
  END IF;

  -- Add reminder_sent_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rp_sessions' AND column_name = 'reminder_sent_at'
  ) THEN
    ALTER TABLE public.rp_sessions ADD COLUMN reminder_sent_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS rp_sessions_is_active_idx ON public.rp_sessions (is_active);
CREATE INDEX IF NOT EXISTS rp_sessions_last_message_at_idx ON public.rp_sessions (last_message_at);

-- Update existing sessions to have is_active = true
UPDATE public.rp_sessions SET is_active = true WHERE is_active IS NULL;

-- Update last_message_at for existing sessions based on latest message
UPDATE public.rp_sessions s
SET last_message_at = (
  SELECT MAX(created_at)
  FROM public.rp_session_messages
  WHERE session_id = s.id
)
WHERE last_message_at IS NULL;

-- -----------------------
-- RP SESSION FEEDBACK TABLE
-- -----------------------
-- Check if table exists and handle migration from rating to tags
DO $$
BEGIN
  -- If table exists with rating column, migrate it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rp_session_feedback' AND column_name = 'rating'
  ) THEN
    -- Add tags column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'rp_session_feedback' AND column_name = 'tags'
    ) THEN
      ALTER TABLE public.rp_session_feedback ADD COLUMN tags TEXT[] DEFAULT '{}';
    END IF;
    
    -- Drop rating column (optional - comment out if you want to keep it)
    -- ALTER TABLE public.rp_session_feedback DROP COLUMN IF EXISTS rating;
  END IF;
END $$;

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.rp_session_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.rp_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback TEXT,
  tags TEXT[] DEFAULT '{}',
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

-- Add is_approved and approved_at columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rp_session_feedback' AND column_name = 'is_approved'
  ) THEN
    ALTER TABLE public.rp_session_feedback ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rp_session_feedback' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE public.rp_session_feedback ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rp_session_feedback_session_id_idx ON public.rp_session_feedback (session_id);
CREATE INDEX IF NOT EXISTS rp_session_feedback_user_id_idx ON public.rp_session_feedback (user_id);

-- Enable RLS for feedback table
ALTER TABLE public.rp_session_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rp_session_feedback_select_participants" ON public.rp_session_feedback;
CREATE POLICY "rp_session_feedback_select_participants"
  ON public.rp_session_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rp_sessions s
      WHERE s.id = session_id AND (auth.uid() = s.user_a OR auth.uid() = s.user_b)
    )
  );

DROP POLICY IF EXISTS "rp_session_feedback_insert_participants" ON public.rp_session_feedback;
CREATE POLICY "rp_session_feedback_insert_participants"
  ON public.rp_session_feedback FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.rp_sessions s
      WHERE s.id = session_id AND (auth.uid() = s.user_a OR auth.uid() = s.user_b)
    )
  );

DROP POLICY IF EXISTS "rp_session_feedback_update_participants" ON public.rp_session_feedback;
CREATE POLICY "rp_session_feedback_update_participants"
  ON public.rp_session_feedback FOR UPDATE
  USING (
    -- Allow update if user is the feedback giver OR if user is the session participant receiving feedback
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.rp_sessions s
      WHERE s.id = session_id 
        AND (auth.uid() = s.user_a OR auth.uid() = s.user_b)
        AND auth.uid() != user_id
    )
  )
  WITH CHECK (
    -- Same check for WITH CHECK
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.rp_sessions s
      WHERE s.id = session_id 
        AND (auth.uid() = s.user_a OR auth.uid() = s.user_b)
        AND auth.uid() != user_id
    )
  );


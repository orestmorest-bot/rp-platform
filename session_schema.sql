-- Roleplay Session Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------
-- RP SESSIONS TABLE
-- -----------------------
CREATE TABLE IF NOT EXISTS public.rp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  closed_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_active_session UNIQUE (user_a, user_b, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS rp_sessions_user_a_idx ON public.rp_sessions (user_a);
CREATE INDEX IF NOT EXISTS rp_sessions_user_b_idx ON public.rp_sessions (user_b);
CREATE INDEX IF NOT EXISTS rp_sessions_status_idx ON public.rp_sessions (status);
CREATE INDEX IF NOT EXISTS rp_sessions_is_active_idx ON public.rp_sessions (is_active);
CREATE INDEX IF NOT EXISTS rp_sessions_last_message_at_idx ON public.rp_sessions (last_message_at);

-- -----------------------
-- RP SESSION CHARACTERS TABLE
-- -----------------------
CREATE TABLE IF NOT EXISTS public.rp_session_characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.rp_sessions(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, character_id)
);

CREATE INDEX IF NOT EXISTS rp_session_characters_session_id_idx ON public.rp_session_characters (session_id);
CREATE INDEX IF NOT EXISTS rp_session_characters_character_id_idx ON public.rp_session_characters (character_id);

-- -----------------------
-- RP SESSION MESSAGES TABLE
-- -----------------------
CREATE TABLE IF NOT EXISTS public.rp_session_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.rp_sessions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN ('ooc', 'narration')),
  body TEXT NOT NULL,
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS rp_session_messages_session_id_idx ON public.rp_session_messages (session_id);
CREATE INDEX IF NOT EXISTS rp_session_messages_sender_id_idx ON public.rp_session_messages (sender_id);
CREATE INDEX IF NOT EXISTS rp_session_messages_created_at_idx ON public.rp_session_messages (created_at);

-- -----------------------
-- RP RESPONSE TIMES TABLE
-- -----------------------
CREATE TABLE IF NOT EXISTS public.rp_response_times (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.rp_sessions(id) ON DELETE CASCADE,
  response_time_seconds INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rp_response_times_user_id_idx ON public.rp_response_times (user_id);
CREATE INDEX IF NOT EXISTS rp_response_times_session_id_idx ON public.rp_response_times (session_id);

-- -----------------------
-- RP SESSION FEEDBACK TABLE
-- -----------------------
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

CREATE INDEX IF NOT EXISTS rp_session_feedback_session_id_idx ON public.rp_session_feedback (session_id);
CREATE INDEX IF NOT EXISTS rp_session_feedback_user_id_idx ON public.rp_session_feedback (user_id);

-- -----------------------
-- RLS POLICIES
-- -----------------------

-- RP Sessions
ALTER TABLE public.rp_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rp_sessions_select_participants" ON public.rp_sessions;
CREATE POLICY "rp_sessions_select_participants"
  ON public.rp_sessions FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "rp_sessions_insert_participants" ON public.rp_sessions;
CREATE POLICY "rp_sessions_insert_participants"
  ON public.rp_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "rp_sessions_update_participants" ON public.rp_sessions;
CREATE POLICY "rp_sessions_update_participants"
  ON public.rp_sessions FOR UPDATE
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- RP Session Characters
ALTER TABLE public.rp_session_characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rp_session_characters_select_participants" ON public.rp_session_characters;
CREATE POLICY "rp_session_characters_select_participants"
  ON public.rp_session_characters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rp_sessions s
      WHERE s.id = session_id AND (auth.uid() = s.user_a OR auth.uid() = s.user_b)
    )
  );

DROP POLICY IF EXISTS "rp_session_characters_insert_participants" ON public.rp_session_characters;
CREATE POLICY "rp_session_characters_insert_participants"
  ON public.rp_session_characters FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rp_sessions s
      WHERE s.id = session_id AND (auth.uid() = s.user_a OR auth.uid() = s.user_b)
    ) AND
    EXISTS (
      SELECT 1 FROM public.characters c
      WHERE c.id = character_id AND c.user_id = auth.uid()
    )
  );

-- RP Session Messages
ALTER TABLE public.rp_session_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rp_session_messages_select_participants" ON public.rp_session_messages;
CREATE POLICY "rp_session_messages_select_participants"
  ON public.rp_session_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rp_sessions s
      WHERE s.id = session_id AND (auth.uid() = s.user_a OR auth.uid() = s.user_b)
    )
  );

DROP POLICY IF EXISTS "rp_session_messages_insert_sender" ON public.rp_session_messages;
CREATE POLICY "rp_session_messages_insert_sender"
  ON public.rp_session_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.rp_sessions s
      WHERE s.id = session_id AND (auth.uid() = s.user_a OR auth.uid() = s.user_b)
    )
  );

DROP POLICY IF EXISTS "rp_session_messages_update_sender" ON public.rp_session_messages;
CREATE POLICY "rp_session_messages_update_sender"
  ON public.rp_session_messages FOR UPDATE
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- RP Response Times
ALTER TABLE public.rp_response_times ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rp_response_times_select_public" ON public.rp_response_times;
CREATE POLICY "rp_response_times_select_public"
  ON public.rp_response_times FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "rp_response_times_insert_trigger" ON public.rp_response_times;
CREATE POLICY "rp_response_times_insert_trigger"
  ON public.rp_response_times FOR INSERT
  WITH CHECK (true); -- Only inserted by trigger

-- RP Session Feedback
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

-- -----------------------
-- FUNCTIONS AND TRIGGERS
-- -----------------------

-- Function to calculate response time (only when session is active)
CREATE OR REPLACE FUNCTION calculate_response_time()
RETURNS TRIGGER AS $$
DECLARE
  prev_message RECORD;
  response_seconds INTEGER;
  session_is_active BOOLEAN;
BEGIN
  -- Check if session is active
  SELECT is_active INTO session_is_active
  FROM public.rp_sessions
  WHERE id = NEW.session_id;
  
  -- Only calculate response time if session is active
  IF session_is_active = true THEN
    -- Get the previous message in this session from a different user
    SELECT * INTO prev_message
    FROM public.rp_session_messages
    WHERE session_id = NEW.session_id
      AND sender_id != NEW.sender_id
      AND created_at < NEW.created_at
    ORDER BY created_at DESC
    LIMIT 1;

    -- If there's a previous message from the other user, calculate response time
    IF prev_message IS NOT NULL THEN
      response_seconds := EXTRACT(EPOCH FROM (NEW.created_at - prev_message.created_at))::INTEGER;
      
      -- Insert response time record
      INSERT INTO public.rp_response_times (user_id, session_id, response_time_seconds)
      VALUES (NEW.sender_id, NEW.session_id, response_seconds)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Update last_message_at on session
  UPDATE public.rp_sessions
  SET last_message_at = NEW.created_at
  WHERE id = NEW.session_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to calculate response time on message insert
DROP TRIGGER IF EXISTS calculate_response_time_trigger ON public.rp_session_messages;
CREATE TRIGGER calculate_response_time_trigger
  AFTER INSERT ON public.rp_session_messages
  FOR EACH ROW
  EXECUTE FUNCTION calculate_response_time();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_rp_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on rp_sessions table
DROP TRIGGER IF EXISTS update_rp_sessions_updated_at_trigger ON public.rp_sessions;
CREATE TRIGGER update_rp_sessions_updated_at_trigger
  BEFORE UPDATE ON public.rp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_rp_sessions_updated_at();














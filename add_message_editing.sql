-- Add edited_at for message editing and RLS update policies

-- DM messages
ALTER TABLE public.dm_messages
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "dm_messages_update_sender" ON public.dm_messages;
CREATE POLICY "dm_messages_update_sender"
  ON public.dm_messages FOR UPDATE
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- RP session messages
ALTER TABLE public.rp_session_messages
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "rp_session_messages_update_sender" ON public.rp_session_messages;
CREATE POLICY "rp_session_messages_update_sender"
  ON public.rp_session_messages FOR UPDATE
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);


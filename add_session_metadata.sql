-- Add session metadata fields: name, style, and is_public
ALTER TABLE public.rp_sessions
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS style TEXT,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;





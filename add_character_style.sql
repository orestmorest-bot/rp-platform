-- Add style column to characters table
ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS style TEXT;

-- Add comment
COMMENT ON COLUMN public.characters.style IS 'Character style/genre (fantasy, sci-fi, gothic, egypt, modern, medieval, steampunk, cyberpunk)';






-- Add portrait_url column to characters table
-- Run this in your Supabase SQL editor if the column doesn't exist yet

ALTER TABLE characters 
ADD COLUMN IF NOT EXISTS portrait_url TEXT;




















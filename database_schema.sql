-- Writer Profiles Table
-- This table stores writer profile information
CREATE TABLE IF NOT EXISTS writers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  portrait_url TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE writers ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read writer profiles
CREATE POLICY "Writers are viewable by everyone"
  ON writers FOR SELECT
  USING (true);

-- Policy: Users can only insert their own profile
CREATE POLICY "Users can insert their own writer profile"
  ON writers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own profile
CREATE POLICY "Users can update their own writer profile"
  ON writers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only delete their own profile
CREATE POLICY "Users can delete their own writer profile"
  ON writers FOR DELETE
  USING (auth.uid() = user_id);

-- Likes Table
-- This table stores likes on writer profiles
CREATE TABLE IF NOT EXISTS writer_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  writer_id UUID NOT NULL REFERENCES writers(id) ON DELETE CASCADE,
  liker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(writer_id, liker_id) -- Prevent duplicate likes
);

-- Enable RLS
ALTER TABLE writer_likes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read likes
CREATE POLICY "Likes are viewable by everyone"
  ON writer_likes FOR SELECT
  USING (true);

-- Policy: Authenticated users can like writers
CREATE POLICY "Authenticated users can like writers"
  ON writer_likes FOR INSERT
  WITH CHECK (auth.uid() = liker_id);

-- Policy: Users can only unlike their own likes
CREATE POLICY "Users can delete their own likes"
  ON writer_likes FOR DELETE
  USING (auth.uid() = liker_id);

-- Comments Table
-- This table stores comments on writer profiles
CREATE TABLE IF NOT EXISTS writer_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  writer_id UUID NOT NULL REFERENCES writers(id) ON DELETE CASCADE,
  commenter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE writer_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read comments
CREATE POLICY "Comments are viewable by everyone"
  ON writer_comments FOR SELECT
  USING (true);

-- Policy: Authenticated users can comment
CREATE POLICY "Authenticated users can comment"
  ON writer_comments FOR INSERT
  WITH CHECK (auth.uid() = commenter_id);

-- Policy: Users can only update their own comments
CREATE POLICY "Users can update their own comments"
  ON writer_comments FOR UPDATE
  USING (auth.uid() = commenter_id)
  WITH CHECK (auth.uid() = commenter_id);

-- Policy: Users can only delete their own comments
CREATE POLICY "Users can delete their own comments"
  ON writer_comments FOR DELETE
  USING (auth.uid() = commenter_id);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_writers_user_id ON writers(user_id);
CREATE INDEX IF NOT EXISTS idx_writer_likes_writer_id ON writer_likes(writer_id);
CREATE INDEX IF NOT EXISTS idx_writer_likes_liker_id ON writer_likes(liker_id);
CREATE INDEX IF NOT EXISTS idx_writer_comments_writer_id ON writer_comments(writer_id);
CREATE INDEX IF NOT EXISTS idx_writer_comments_commenter_id ON writer_comments(commenter_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on writers table
CREATE TRIGGER update_writers_updated_at
  BEFORE UPDATE ON writers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-update updated_at on writer_comments table
CREATE TRIGGER update_writer_comments_updated_at
  BEFORE UPDATE ON writer_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();




















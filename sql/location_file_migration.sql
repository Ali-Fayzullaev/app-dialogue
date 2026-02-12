-- Migration: Add location and file support to messages
-- Run this in Supabase SQL Editor

-- Add new columns to messages table for location support
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION DEFAULT NULL,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION DEFAULT NULL,
ADD COLUMN IF NOT EXISTS location_name TEXT DEFAULT NULL;

-- Add new columns for file/document support
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS file_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT NULL;

-- Note: If you have a constraint on media_type, you may need to update it
-- Run this only if you get errors about media_type values:
-- ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_media_type_check;

-- =============================================
-- FIX user_presence table (if you see presence errors)
-- =============================================

-- Create user_presence table if not exists
CREATE TABLE IF NOT EXISTS user_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read all presence" ON user_presence;
DROP POLICY IF EXISTS "Users can update own presence" ON user_presence;
DROP POLICY IF EXISTS "Users can insert own presence" ON user_presence;

-- Create RLS policies for user_presence
CREATE POLICY "Users can read all presence" 
ON user_presence FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can update own presence" 
ON user_presence FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own presence" 
ON user_presence FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Allow upsert (insert + update)
DROP POLICY IF EXISTS "Users can upsert own presence" ON user_presence;
CREATE POLICY "Users can upsert own presence"
ON user_presence FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_presence_online ON user_presence (is_online) WHERE is_online = true;

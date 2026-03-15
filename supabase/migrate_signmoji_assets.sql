-- Migration: Add video support columns to signmoji_assets table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ektfblooeqotdyljdlxw/sql

-- ==========================================
-- 1. Extend signmoji_assets table
-- ==========================================
ALTER TABLE signmoji_assets ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE signmoji_assets ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE signmoji_assets ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE signmoji_assets ADD COLUMN IF NOT EXISTS video_transform JSONB;
ALTER TABLE signmoji_assets ADD COLUMN IF NOT EXISTS source_app TEXT DEFAULT 'signmoji';

-- ==========================================
-- 2. Fix storage bucket RLS policies for 'icon' bucket
--    WITHOUT these, uploads from the app are BLOCKED with:
--    "new row violates row-level security policy"
-- ==========================================

-- Make bucket public if not already
UPDATE storage.buckets SET public = true WHERE id = 'icon';

-- Allow anyone to upload files to the icon bucket
CREATE POLICY "Allow public upload to icon bucket"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'icon');

-- Allow anyone to read/select files from the icon bucket
CREATE POLICY "Allow public read from icon bucket"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'icon');

-- Allow anyone to update/overwrite files in the icon bucket
CREATE POLICY "Allow public update in icon bucket"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'icon');

-- Allow anyone to delete files from the icon bucket
CREATE POLICY "Allow public delete from icon bucket"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'icon');

-- ==========================================
-- 3. Extend global_library table with video/icon/language
-- ==========================================
ALTER TABLE global_library ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE global_library ADD COLUMN IF NOT EXISTS icon_url TEXT;
ALTER TABLE global_library ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'ASL';

-- ==========================================
-- 4. Verify
-- ==========================================
SELECT 'signmoji_assets columns:' as info;
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'signmoji_assets' ORDER BY ordinal_position;

SELECT 'global_library columns:' as info;
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'global_library' ORDER BY ordinal_position;

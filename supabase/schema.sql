-- SQL for creating the centralized word library schema
-- You can run this in your Supabase SQL Editor

-- Table for the global library (managed by admins)
CREATE TABLE IF NOT EXISTS global_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word TEXT NOT NULL UNIQUE,
  synonyms TEXT[] DEFAULT '{}',
  label TEXT NOT NULL,
  icon TEXT DEFAULT 'bell', -- Sticker/image icon: icon name, data:URL, or https:// URL to image
  video_url TEXT,             -- Sign video URL from Supabase storage bucket
  icon_url TEXT,              -- Separate sticker/image icon URL (Supabase storage)
  language TEXT DEFAULT 'ASL', -- Sign language: ASL, PSL, BSL, Other
  vibration_pattern INTEGER[] DEFAULT '{200}',
  color TEXT DEFAULT 'bg-blue-500',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table for user-specific custom words
CREATE TABLE IF NOT EXISTS user_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- Optional: if you use Supabase Auth
  device_id TEXT, -- For anonymous scaling
  word TEXT NOT NULL,
  synonyms TEXT[] DEFAULT '{}',
  label TEXT NOT NULL,
  icon TEXT DEFAULT 'bell',
  vibration_pattern INTEGER[] DEFAULT '{200}',
  color TEXT DEFAULT 'bg-blue-500',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS (Row Level Security)
ALTER TABLE global_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_triggers ENABLE ROW LEVEL SECURITY;

-- Handle Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read global_library') THEN
        CREATE POLICY "Allow public read global_library" ON global_library FOR SELECT USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public insert global_library') THEN
        CREATE POLICY "Allow public insert global_library" ON global_library FOR INSERT WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public update global_library') THEN
        CREATE POLICY "Allow public update global_library" ON global_library FOR UPDATE USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public delete global_library') THEN
        CREATE POLICY "Allow public delete global_library" ON global_library FOR DELETE USING (true);
    END IF;
END $$;

-- SEED DATA: Populate initial library only if words don't exist
INSERT INTO global_library (word, synonyms, label, icon, icon_url, vibration_pattern, color)
VALUES 
('hey', '{"hello", "excuse me", "listen"}', 'Call / Name', 'user', null, '{200, 100, 200, 100, 400}', 'bg-blue-500'),
('water', '{"drink", "thirsty", "liquid", "aqua"}', 'Water / Drink', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80', '{100, 300, 100}', 'bg-cyan-500'),
('door', '{"knock", "bell", "entrance", "delivery", "outside"}', 'Door / Visitor', 'door-open', null, '{100, 50, 100, 50, 100}', 'bg-amber-500'),
('fire', '{"smoke", "burn", "burning", "hot", "smell"}', 'Fire / Danger', 'flame', null, '{1000, 200, 1000}', 'bg-red-600'),
('help', '{"emergency", "danger", "hurt", "pain", "ambulance"}', 'Help / Emergency', 'alert-triangle', null, '{500, 100, 500, 100, 500}', 'bg-rose-600'),
('cat', '{"meow", "kitten", "feline", "pet"}', 'Cat Meowing', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&q=80', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&q=80', '{100, 100, 300}', 'bg-yellow-500'),
('dog', '{"bark", "barking", "puppy", "wolf"}', 'Dog Barking', 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&q=80', 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&q=80', '{100, 100, 400}', 'bg-orange-500'),
('food', '{"eat", "meal", "hungry", "dinner", "lunch"}', 'Food / Eat', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80', '{200, 100, 200}', 'bg-green-500'),
('baby', '{"crying", "cry", "infant", "child"}', 'Baby Crying', 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400&q=80', 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400&q=80', '{50, 50, 50, 50, 200}', 'bg-pink-500'),
('home', '{"house", "apartment", "residence"}', 'Home', 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&q=80', 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&q=80', '{150, 150, 150}', 'bg-teal-500'),
('sleep', '{"tired", "bed", "rest", "nap"}', 'Sleep', 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=400&q=80', 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=400&q=80', '{400, 400}', 'bg-indigo-400')
ON CONFLICT (word) DO NOTHING;

-- ==========================================
-- SignMoji Assets table (for cross-device icon/asset sync)
-- ==========================================
CREATE TABLE IF NOT EXISTS signmoji_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'image',  -- 'image', 'icon', or 'sign_emoji'
  url TEXT NOT NULL,           -- Primary URL
  video_url TEXT,              -- Supabase storage URL
  category TEXT,               -- SignCategory
  language TEXT,               -- ASL, PSL, BSL, Other
  video_transform JSONB,      -- { x, y, scale }
  source_app TEXT DEFAULT 'signmoji',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE signmoji_assets ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read signmoji_assets') THEN
        CREATE POLICY "Allow public read signmoji_assets" ON signmoji_assets FOR SELECT USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public insert signmoji_assets') THEN
        CREATE POLICY "Allow public insert signmoji_assets" ON signmoji_assets FOR INSERT WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public update signmoji_assets') THEN
        CREATE POLICY "Allow public update signmoji_assets" ON signmoji_assets FOR UPDATE USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public delete signmoji_assets') THEN
        CREATE POLICY "Allow public delete signmoji_assets" ON signmoji_assets FOR DELETE USING (true);
    END IF;
END $$;

-- ==========================================
-- Caregiver & Real-time Tracking Schema
-- ==========================================

-- Table for live alerts (broadcasting to caregivers)
CREATE TABLE IF NOT EXISTS live_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_name TEXT,
  trigger_label TEXT,
  trigger_word TEXT,
  trigger_color TEXT,
  trigger_icon TEXT,
  detected_text TEXT,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table for device health/status
CREATE TABLE IF NOT EXISTS device_status (
  device_id TEXT PRIMARY KEY,
  user_name TEXT,
  is_listening BOOLEAN DEFAULT false,
  battery_level FLOAT,
  latitude FLOAT,
  longitude FLOAT,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table for remote commands (pokes/nudges)
CREATE TABLE IF NOT EXISTS device_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  command TEXT NOT NULL, -- e.g., 'poke'
  sender_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE live_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for demo purposes
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Manage live_alerts') THEN
        CREATE POLICY "Public Manage live_alerts" ON live_alerts FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Manage device_status') THEN
        CREATE POLICY "Public Manage device_status" ON device_status FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Manage device_commands') THEN
        CREATE POLICY "Public Manage device_commands" ON device_commands FOR ALL USING (true);
    END IF;
END $$;

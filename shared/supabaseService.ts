/**
 * Shared Supabase client used by both SilentEar and SignMoji.
 * Provides asset management and global_library integration.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Support both import.meta.env (Vite) and process.env (defined by vite.config)
const getEnv = (key: string): string => {
  try {
    // @ts-ignore - process.env is injected by Vite define
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      // @ts-ignore
      return process.env[key];
    }
  } catch {}
  try {
    // @ts-ignore - import.meta.env
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch {}
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

let client: SupabaseClient | null = null;

const getClient = (): SupabaseClient | null => {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[shared/supabase] Supabase credentials not configured');
    return null;
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return client;
};

export interface AssetRecord {
  id: string;
  name: string;
  type: string;
  url: string;
  createdAt?: number;
}

/** Extended record for sign_emoji entries in signmoji_assets */
export interface SignEmojiRecord {
  id: string;
  name: string;
  type: 'sign_emoji';
  url: string;             // icon/sticker URL (Supabase storage)
  video_url: string;       // video URL (Supabase storage)
  category?: string;
  language?: string;
  video_transform?: { x: number; y: number; scale: number } | null;
  source_app?: string;
  created_at?: string;
}

export interface GlobalLibraryRecord {
  id: string;
  word: string;
  synonyms: string[];
  label: string;
  icon: string;
  video_url?: string;       // Sign video URL from Supabase storage
  icon_url?: string;        // Sticker/image icon URL from Supabase storage
  language?: string;        // Sign language: ASL, PSL, BSL, Other
  vibration_pattern: number[];
  color: string;
  is_active: boolean;
  source_app?: string;
  linked_emoji_id?: string;
}

export const supabase = {
  /** Get the raw Supabase client (for advanced usage) */
  getClient,

  /** Fetch all assets from the signmoji_assets table (excludes sign_emoji entries) */
  async fetchAssets(): Promise<AssetRecord[]> {
    const sb = getClient();
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from('signmoji_assets')
        .select('*')
        .neq('type', 'sign_emoji')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type || 'image',
        url: row.url,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
      }));
    } catch (e) {
      console.warn('[shared/supabase] fetchAssets error:', e);
      return [];
    }
  },

  /** Insert or update an asset */
  async upsertAsset(asset: AssetRecord): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    try {
      const { error } = await sb
        .from('signmoji_assets')
        .upsert([{
          id: asset.id,
          name: asset.name,
          type: asset.type,
          url: asset.url,
          created_at: asset.createdAt ? new Date(asset.createdAt).toISOString() : new Date().toISOString(),
        }], { onConflict: 'id' });
      if (error) throw error;
    } catch (e) {
      console.warn('[shared/supabase] upsertAsset error:', e);
    }
  },

  /** Delete an asset by ID */
  async deleteAsset(id: string): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    try {
      const { error } = await sb
        .from('signmoji_assets')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (e) {
      console.warn('[shared/supabase] deleteAsset error:', e);
    }
  },

  // ─── Sign Emoji CRUD (type='sign_emoji' in signmoji_assets) ───

  /** Fetch all sign emojis from signmoji_assets (type=sign_emoji) */
  async fetchSignEmojis(): Promise<SignEmojiRecord[]> {
    const sb = getClient();
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from('signmoji_assets')
        .select('*')
        .eq('type', 'sign_emoji')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        type: 'sign_emoji' as const,
        url: row.url,
        video_url: row.video_url || '',
        category: row.category || 'Other',
        language: row.language || 'ASL',
        video_transform: row.video_transform || null,
        source_app: row.source_app || 'signmoji',
        created_at: row.created_at,
      }));
    } catch (e) {
      console.warn('[shared/supabase] fetchSignEmojis error:', e);
      return [];
    }
  },

  /** Upsert a full sign emoji into signmoji_assets */
  async upsertSignEmoji(emoji: {
    id: string;
    name: string;
    iconUrl: string;
    videoUrl: string;
    category?: string;
    language?: string;
    videoTransform?: { x: number; y: number; scale: number } | null;
  }): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    try {
      const { error } = await sb
        .from('signmoji_assets')
        .upsert([{
          id: emoji.id,
          name: emoji.name,
          type: 'sign_emoji',
          url: emoji.iconUrl,
          video_url: emoji.videoUrl,
          category: emoji.category || 'Other',
          language: emoji.language || 'ASL',
          video_transform: emoji.videoTransform || null,
          source_app: 'signmoji',
        }], { onConflict: 'id' });
      if (error) throw error;
      console.log('[shared/supabase] Sign emoji synced:', emoji.name);
    } catch (e) {
      console.warn('[shared/supabase] upsertSignEmoji error:', e);
    }
  },

  /** Delete a sign emoji by ID */
  async deleteSignEmoji(id: string): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    try {
      const { error } = await sb
        .from('signmoji_assets')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (e) {
      console.warn('[shared/supabase] deleteSignEmoji error:', e);
    }
  },

  /** Upload a file to the 'icon' storage bucket */
  async uploadMedia(file: File | Blob, fileName?: string): Promise<string | null> {
    const sb = getClient();
    if (!sb) {
      console.error('[shared/supabase] Supabase client not initialized');
      return null;
    }
    try {
      const name = fileName || `${Math.random().toString(36).substring(2)}_${Date.now()}.webm`;
      console.log('[uploadMedia] Uploading to icon bucket:', name, 'Size:', file.size, 'bytes');
      
      const { error } = await sb.storage
        .from('icon')
        .upload(name, file, { upsert: true });
      
      if (error) {
        console.error('[uploadMedia] Upload error:', error);
        throw error;
      }
      
      const { data } = sb.storage.from('icon').getPublicUrl(name);
      
      if (!data || !data.publicUrl) {
        console.error('[uploadMedia] No public URL in response:', data);
        return null;
      }
      
      console.log('[uploadMedia] Public URL:', data.publicUrl);
      return data.publicUrl;
    } catch (e) {
      console.error('[shared/supabase] uploadMedia error:', e);
      return null;
    }
  },

  /** Insert or update a trigger in the global_library (for cross-app sync) */
  async upsertGlobalTrigger(trigger: {
    id: string;
    word: string;
    synonyms: string[];
    label: string;
    icon: string;
    videoUrl?: string;      // Sign video URL
    iconUrl?: string;       // Sticker/image icon URL
    language?: string;      // ASL, PSL, BSL, Other
    vibrationPattern: number[];
    color: string;
    sourceApp?: string;
    linkedEmojiId?: string;
  }): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    try {
      const { error } = await sb
        .from('global_library')
        .upsert([{
          id: trigger.id,
          word: trigger.word,
          synonyms: trigger.synonyms,
          label: trigger.label,
          icon: trigger.icon,
          video_url: trigger.videoUrl || null,
          icon_url: trigger.iconUrl || null,
          language: trigger.language || 'ASL',
          vibration_pattern: trigger.vibrationPattern,
          color: trigger.color,
          is_active: true,
        }], { onConflict: 'word' });
      if (error) throw error;
      console.log('[shared/supabase] Trigger synced to global_library:', trigger.word, '| video:', trigger.videoUrl?.substring(0, 60));
    } catch (e) {
      console.warn('[shared/supabase] upsertGlobalTrigger error:', e);
    }
  },

  /** Fetch all active triggers from global_library */
  async fetchGlobalLibrary(): Promise<GlobalLibraryRecord[]> {
    const sb = getClient();
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from('global_library')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('[shared/supabase] fetchGlobalLibrary error:', e);
      return [];
    }
  },
};

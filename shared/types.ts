/**
 * Shared types used by both SilentEar and SignMoji apps.
 * This module defines the data contracts for cross-app communication via Supabase.
 */

export interface SharedSignEmoji {
  id: string;
  name: string;
  videoUrl: string;
  iconUrl: string;            // literal icon / sticker URL or data URL
  category: string;           // SignCategory value
  language?: string;          // 'ASL' | 'PSL' | 'BSL' | 'Other'
  createdAt: number;
  sourceApp: 'signmoji' | 'silentear';
  videoTransform?: {
    x: number;
    y: number;
    scale: number;
  };
}

export interface SharedTrigger {
  id: string;
  word: string;
  synonyms: string[];
  label: string;
  icon: string;               // Primary display: icon name, data URL, or https URL
  videoUrl?: string;           // Sign video URL from Supabase storage
  iconUrl?: string;            // Sticker/image icon URL from Supabase storage
  language?: string;           // Sign language: ASL, PSL, BSL, Other
  vibrationPattern: number[];
  color: string;              // Tailwind class like 'bg-indigo-500'
  linkedSignEmoji?: string;   // ID of the SignEmoji this trigger was created from
  sourceApp?: 'signmoji' | 'silentear';
  createdAt?: number;
}

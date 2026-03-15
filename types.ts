
export interface TriggerWord {
  id: string;
  word: string; // The primary keyword/intent (e.g., 'water')
  synonyms?: string[]; // Alternative words (e.g., 'drink', 'thirsty')
  label: string; // Display label
  icon: string; // Primary display: can be icon name, image URL, or video URL
  videoUrl?: string; // Sign video URL (from Supabase storage)
  iconUrl?: string; // Sticker/image icon URL (separate from video)
  vibrationPattern: number[];
  color: string;
  language?: string; // Sign language tag: ASL, PSL, BSL, Other
  sourceApp?: 'signmoji' | 'silentear';
  linkedSignEmoji?: string;
}

export type SignLanguagePreference = 'ASL' | 'PSL' | 'BSL' | 'All';

export type DeviceMode = 'mobile' | 'watch';
export type MonitoringMode = 'alert' | 'conversation';
export type ProcessingMode = 'cloud' | 'offline';

export interface QuietHours {
  enabled: boolean;
  start: string; // "23:00"
  end: string;   // "07:00"
  bypassDanger: boolean; // Always alert for fire/danger
}

export interface EmergencyContact {
  name: string;
  phone: string;
  autoCall: boolean;
}

export type AppLanguage = 'en-US' | 'es-ES' | 'ar-SA' | 'fr-FR' | 'de-DE' | 'hi-IN' | 'zh-CN' | 'ja-JP' | 'pt-BR' | 'ur-PK';

export interface AlertState {
  active: boolean;
  trigger?: TriggerWord;
  timestamp?: number;
  detectedText?: string;
  source?: ProcessingMode;
}

export enum AppRoute {
  HOME = 'home',
  SETTINGS = 'settings',
  LISTEN = 'listen',
  HISTORY = 'history',
  SPEAK = 'speak',
  CAREGIVER = 'caregiver',
  LIBRARY = 'library'
}

export interface DeviceStatus {
  deviceId: string;
  isOnline: boolean;
  batteryLevel?: number;
  lastActive: number;
  latitude?: number;
  longitude?: number;
  isListening: boolean;
  userName: string;
}

export interface CaregiverRequest {
  id: string;
  caregiverId: string;
  deviceId: string;
  status: 'pending' | 'approved' | 'rejected';
  caregiverName: string;
}

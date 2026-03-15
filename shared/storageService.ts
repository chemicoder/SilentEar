/**
 * Shared storage service for cross-app data persistence.
 * Uses localStorage as primary store with Supabase cloud sync.
 * Both SilentEar and SignMoji read/write through this service.
 */

import { SharedSignEmoji, SharedTrigger } from './types';
import { supabase } from './supabaseService';

const EMOJIS_KEY = 'shared_sign_emojis';
const TRIGGERS_KEY = 'shared_sign_triggers';

type EventType = 'emojis' | 'triggers' | 'all';
type Listener = () => void;

const listeners: Map<EventType, Set<Listener>> = new Map();

const emit = (type: EventType) => {
  listeners.get(type)?.forEach(fn => fn());
  if (type !== 'all') {
    listeners.get('all')?.forEach(fn => fn());
  }
};

// ─── Emoji Storage ───

const getSharedEmojis = (): SharedSignEmoji[] => {
  try {
    const raw = localStorage.getItem(EMOJIS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveSharedEmoji = async (emoji: SharedSignEmoji): Promise<void> => {
  const emojis = getSharedEmojis();
  const idx = emojis.findIndex(e => e.id === emoji.id);
  if (idx >= 0) {
    emojis[idx] = { ...emojis[idx], ...emoji };
  } else {
    emojis.unshift(emoji);
  }
  localStorage.setItem(EMOJIS_KEY, JSON.stringify(emojis));
  emit('emojis');
  // Note: global_library sync is handled by saveSharedTrigger during Export
};

const removeSharedEmoji = async (id: string): Promise<void> => {
  const emojis = getSharedEmojis().filter(e => e.id !== id);
  localStorage.setItem(EMOJIS_KEY, JSON.stringify(emojis));
  emit('emojis');
};

// ─── Trigger Storage ───

const getSharedTriggers = (): SharedTrigger[] => {
  try {
    const raw = localStorage.getItem(TRIGGERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveSharedTrigger = async (trigger: SharedTrigger): Promise<void> => {
  const triggers = getSharedTriggers();
  const idx = triggers.findIndex(t => t.id === trigger.id);
  if (idx >= 0) {
    triggers[idx] = { ...triggers[idx], ...trigger };
  } else {
    triggers.unshift(trigger);
  }
  localStorage.setItem(TRIGGERS_KEY, JSON.stringify(triggers));
  emit('triggers');

  // Cloud sync: also push to global_library - WAIT for this to complete
  return supabase.upsertGlobalTrigger({
    id: trigger.id,
    word: trigger.word,
    synonyms: trigger.synonyms,
    label: trigger.label,
    icon: trigger.icon,
    videoUrl: trigger.videoUrl,
    iconUrl: trigger.iconUrl,
    language: trigger.language,
    vibrationPattern: trigger.vibrationPattern,
    color: trigger.color,
    sourceApp: trigger.sourceApp || 'signmoji',
    linkedEmojiId: trigger.linkedSignEmoji,
  }).catch(e => {
    console.warn('[storageService] Trigger cloud sync failed:', e);
    throw e; // Re-throw so caller knows about the failure
  });
};

const removeSharedTriggerByEmojiId = (emojiId: string): void => {
  const triggers = getSharedTriggers().filter(t => t.linkedSignEmoji !== emojiId);
  localStorage.setItem(TRIGGERS_KEY, JSON.stringify(triggers));
  emit('triggers');
};

// ─── Subscription ───

const subscribe = (type: EventType, fn: Listener): (() => void) => {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }
  listeners.get(type)!.add(fn);
  return () => {
    listeners.get(type)?.delete(fn);
  };
};

// ─── Cloud Sync ───

const syncWithCloud = async (): Promise<void> => {
  try {
    const cloudTriggers = await supabase.fetchGlobalLibrary();
    if (!cloudTriggers.length) return;

    // Merge cloud triggers into local emojis
    const localEmojis = getSharedEmojis();
    const localIds = new Set(localEmojis.map(e => e.id));
    let changed = false;

    for (const ct of cloudTriggers) {
      if (!localIds.has(ct.id)) {
        localEmojis.push({
          id: ct.id,
          name: ct.label || ct.word,
          videoUrl: '',
          iconUrl: ct.icon,
          category: 'Other',
          createdAt: Date.now(),
          sourceApp: 'silentear',
        });
        changed = true;
      }
    }

    if (changed) {
      localStorage.setItem(EMOJIS_KEY, JSON.stringify(localEmojis));
      emit('emojis');
    }
  } catch (e) {
    console.warn('[storageService] syncWithCloud failed:', e);
  }
};

// ─── Public API ───

export const sharedStorage = {
  getSharedEmojis,
  saveSharedEmoji,
  removeSharedEmoji,
  getSharedTriggers,
  saveSharedTrigger,
  removeSharedTriggerByEmojiId,
  subscribe,
  syncWithCloud,
  uploadMedia: supabase.uploadMedia,
};

// ─── Converter ───

export const convertSignEmojiToTrigger = (
  emoji: SharedSignEmoji,
  options: {
    synonyms?: string[];
    vibrationPattern?: number[];
    color?: string;
  } = {}
): SharedTrigger => {
  return {
    id: crypto.randomUUID(),
    word: emoji.name.toLowerCase(),
    synonyms: options.synonyms || [],
    label: emoji.name,
    // For backwards compat, `icon` stores the video URL (primary display)
    icon: emoji.videoUrl || emoji.iconUrl,
    // But NOW also store them separately for SilentEar to show both
    videoUrl: emoji.videoUrl || '',
    iconUrl: emoji.iconUrl || '',
    language: emoji.language || 'ASL',
    vibrationPattern: options.vibrationPattern || [200, 100, 200],
    color: options.color || 'bg-indigo-500',
    linkedSignEmoji: emoji.id,
    sourceApp: emoji.sourceApp || 'signmoji',
    createdAt: Date.now(),
  };
};

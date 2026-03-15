import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { AlertState } from '../types';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '') as string;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '') as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SyncLibraryItem {
  id: string;
  word: string;
  synonyms: string[];
  label: string;
  icon: string;
  video_url?: string;
  icon_url?: string;
  language?: string;
  vibration_pattern: number[];
  color: string;
}

export const libraryService = {
  async fetchGlobalLibrary(): Promise<SyncLibraryItem[]> {
    try {
      if (!supabaseUrl || !supabaseAnonKey) {
        console.warn('Supabase credentials missing, using local defaults');
        return [];
      }

      const { data, error } = await supabase
        .from('global_library')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching global library:', err);
      return [];
    }
  },

  async syncUserTrigger(trigger: any) {
    // This allows users to "contribute" or save their triggers to the cloud
    try {
      // Strip the client-side id to let Supabase auto-generate UUID
      const { id, ...rest } = trigger;
      const { data, error } = await supabase
        .from('user_triggers')
        .insert([{ ...rest, device_id: id }]);
      if (error) throw error;

      // Also upsert into global_library so uploaded icons/videos persist for all users
      const { error: globalError } = await supabase
        .from('global_library')
        .upsert([{
          id: trigger.id,
          word: trigger.word,
          synonyms: trigger.synonyms || [],
          label: trigger.label,
          icon: trigger.icon,
          vibration_pattern: trigger.vibration_pattern,
          color: trigger.color,
          is_active: true
        }], { onConflict: 'id' });
      if (globalError) console.warn('global_library upsert warning:', globalError);

      return data;
    } catch (err) {
      console.error('Error syncing user trigger:', err);
    }
  },

  async uploadMedia(file: File): Promise<string | null> {
    try {
      if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase not configured');

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('trigger-media')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('trigger-media')
        .getPublicUrl(fileName);

      return data.publicUrl;
    } catch (err) {
      console.error('Error uploading media:', err);
      throw err; // Re-throw so caller can handle fallback
    }
  },

  // --- Feature 8: Caregiver Dashboard & Security ---
  async broadcastAlert(alert: AlertState, userName: string) {
    try {
      if (!supabaseUrl || !supabaseAnonKey) return;
      const deviceId = this.getDeviceId();

      await supabase.from('live_alerts').insert([{
        device_id: deviceId,
        user_name: userName,
        trigger_label: alert.trigger?.label || 'Unknown',
        trigger_word: alert.trigger?.word || '',
        trigger_color: alert.trigger?.color || 'bg-slate-500',
        trigger_icon: alert.trigger?.icon || 'zap',
        detected_text: alert.detectedText || '',
        source: alert.source || 'offline',
        created_at: new Date().toISOString()
      }]);
    } catch (err) {
      console.error('Error broadcasting alert:', err);
    }
  },

  getDeviceId() {
    let id = localStorage.getItem('silentear_device_id');
    if (!id) {
      id = Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('silentear_device_id', id);
    }
    return id;
  },

  async updateDeviceStatus(status: Partial<any>) {
    try {
      const deviceId = this.getDeviceId();
      const { error } = await supabase
        .from('device_status')
        .upsert([{
          device_id: deviceId,
          ...status,
          last_active: new Date().toISOString()
        }], { onConflict: 'device_id' });
      if (error) throw error;
    } catch (err) {
      console.error('Error updating status:', err);
    }
  },

  async fetchDeviceStatus(deviceId: string) {
    try {
      const { data, error } = await supabase
        .from('device_status')
        .select('*')
        .eq('device_id', deviceId)
        .single();
      if (error) return null;
      return data;
    } catch (err) {
      return null;
    }
  },

  async sendPoke(targetDeviceId: string, senderName: string) {
    try {
      await supabase.from('device_commands').insert([{
        device_id: targetDeviceId,
        command: 'poke',
        sender_name: senderName,
        created_at: new Date().toISOString()
      }]);
    } catch (err) {
      console.error('Error sending poke:', err);
    }
  },

  subscribeToCommands(deviceId: string, onCommand: (cmd: any) => void): RealtimeChannel {
    return supabase
      .channel(`commands:${deviceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_commands', filter: `device_id=eq.${deviceId}` },
        (payload) => onCommand(payload.new)
      )
      .subscribe();
  },

  subscribeToCaregiverAlerts(deviceId: string, onAlert: (payload: any) => void): RealtimeChannel {
    return supabase
      .channel(`caregiver-alerts:${deviceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_alerts', filter: `device_id=eq.${deviceId}` },
        (payload) => onAlert(payload.new)
      )
      .subscribe();
  },

  subscribeToStatusUpdates(deviceId: string, onUpdate: (payload: any) => void): RealtimeChannel {
    return supabase
      .channel(`status:${deviceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'device_status', filter: `device_id=eq.${deviceId}` },
        (payload) => onUpdate(payload.new)
      )
      .subscribe();
  },

  unsubscribeCaregiver(channel: RealtimeChannel) {
    if (channel) supabase.removeChannel(channel);
  },

  async fetchRecentAlerts(deviceId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('live_alerts')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching caregiver alerts:', err);
      return [];
    }
  }
};

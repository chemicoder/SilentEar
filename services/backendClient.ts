/**
 * Backend Client — Connects frontend to the Cloud Run backend
 *
 * Provides:
 * 1. WebSocket connection for Gemini Live API proxy
 * 2. REST client for AI intelligence endpoints
 * 3. REST client for Firestore operations
 */

const CLOUD_RUN_URL = 'https://silentear-backend-308537622796.us-central1.run.app';

const getBackendUrl = (): string => {
  // Explicit env override (dev or custom deployment)
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  // Capacitor (APK) — not served from Cloud Run, need absolute URL
  if (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:' ||
      window.location.hostname === 'localhost' && !window.location.port) {
    return CLOUD_RUN_URL;
  }
  // Cloud Run serves frontend + backend on same origin — use relative URLs
  return '';
};

const getWsUrl = (): string => {
  const backendUrl = getBackendUrl();
  if (backendUrl) {
    // Convert http(s) to ws(s)
    return backendUrl.replace(/^http/, 'ws') + '/ws/live';
  }
  // Same origin
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/live`;
};

// ── WebSocket Live Session ──

export interface LiveSessionCallbacks {
  onReady: () => void;
  onTranscription: (text: string) => void;
  onToolCall: (alertId: string, context: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

export interface LiveSessionConfig {
  userName: string;
  deviceId: string;
  triggers: Array<{
    id: string;
    word: string;
    synonyms?: string[];
    label: string;
  }>;
}

export class BackendLiveSession {
  private ws: WebSocket | null = null;
  private callbacks: LiveSessionCallbacks;

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
  }

  connect(config: LiveSessionConfig): void {
    const url = getWsUrl();
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      // Send setup message with configuration
      this.ws?.send(JSON.stringify({
        type: 'setup',
        userName: config.userName,
        deviceId: config.deviceId,
        triggers: config.triggers,
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'ready':
            this.callbacks.onReady();
            break;
          case 'transcription':
            this.callbacks.onTranscription(msg.text);
            break;
          case 'tool_call':
            this.callbacks.onToolCall(msg.alertId, msg.context);
            break;
          case 'error':
            this.callbacks.onError(msg.message);
            break;
          case 'closed':
            this.callbacks.onClose();
            break;
        }
      } catch (e) {
        console.warn('[BackendClient] Failed to parse message:', e);
      }
    };

    this.ws.onerror = () => {
      this.callbacks.onError('WebSocket connection error');
    };

    this.ws.onclose = () => {
      this.callbacks.onClose();
    };
  }

  sendAudio(base64Data: string, mimeType = 'audio/pcm;rate=16000'): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'audio',
        data: base64Data,
        mimeType,
      }));
    }
  }

  close(): void {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'close' }));
      }
      this.ws.close();
      this.ws = null;
    }
  }
}

// ── REST API Client ──

const api = async (path: string, body?: any): Promise<any> => {
  const baseUrl = getBackendUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

export const backendIntelligence = {
  async analyzeScene(recentAlerts: any[], recentTranscript: string[], userName: string) {
    return api('/api/intelligence/scene', { recentAlerts, recentTranscript, userName });
  },

  async refineTranscript(fragments: string[]) {
    const result = await api('/api/intelligence/refine', { fragments });
    return result?.refined || null;
  },

  async discoverTriggers(recentTranscript: string[], existingTriggers: any[], recentAlerts?: any[]) {
    const result = await api('/api/intelligence/discover-triggers', { recentTranscript, existingTriggers, recentAlerts });
    return result?.suggestions || [];
  },

  async suggestPhrases(currentText: string, sceneContext?: string, recentAlerts?: any[], recentTranscript?: string[]): Promise<string[]> {
    return api('/api/intelligence/voice-suggest', { currentText, sceneContext, recentAlerts, recentTranscript });
  },

  async predictCompletion(currentText: string, sceneContext?: string): Promise<string> {
    const result = await api('/api/intelligence/voice-complete', { currentText, sceneContext });
    return result?.completion || '';
  },
};

export const backendFirestore = {
  async storeAlert(alert: any) {
    return api('/api/firestore/alerts', alert);
  },

  async getAlerts(deviceId: string) {
    return api(`/api/firestore/alerts/${encodeURIComponent(deviceId)}`);
  },

  async updateDeviceStatus(status: any) {
    return api('/api/firestore/devices/status', status);
  },

  async getDeviceStatus(deviceId: string) {
    return api(`/api/firestore/devices/${encodeURIComponent(deviceId)}`);
  },

  async syncTrigger(trigger: any) {
    return api('/api/firestore/triggers', trigger);
  },

  async getTriggers() {
    return api('/api/firestore/triggers');
  },
};

/** Check if backend is available */
export const isBackendAvailable = async (): Promise<boolean> => {
  try {
    const baseUrl = getBackendUrl();
    const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
};

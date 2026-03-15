/**
 * Shared AI utilities for Gemini and Groq integration.
 * Used by SignMoji's geminiService for icon generation, category suggestion, and video search.
 */

// ─── AI Configuration ───

export const AI_CONFIG = {
  // Gemini 3 Flash — primary reasoning model (free tier available)
  GEMINI_MODEL: 'gemini-3-flash-preview',
  // Gemini 3 Pro Image (Nano Banana Pro) — highest quality image generation
  IMAGE_MODEL: 'gemini-3-pro-image-preview',
  // Live Audio Stream — kept on 2.5 Flash for native audio support
  LIVE_AUDIO_MODEL: 'gemini-2.5-flash-native-audio-preview-12-2025',
  MAX_RETRIES: 2,
  RETRY_DELAY: 1500,
};

// ─── Key Manager ───

const getApiKeys = (): string[] => {
  // Support both import.meta.env and process.env
  let raw = '';
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env) {
      // @ts-ignore
      raw = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    }
  } catch {}
  if (!raw) {
    try {
      // @ts-ignore
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        // @ts-ignore
        raw = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || '';
      }
    } catch {}
  }
  return raw.split(',').map((k: string) => k.trim()).filter(Boolean);
};

const getGroqKey = (): string => {
  let key = '';
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env) {
      // @ts-ignore
      key = process.env.GROQ_API_KEY || '';
    }
  } catch {}
  if (!key) {
    try {
      // @ts-ignore
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        // @ts-ignore
        key = import.meta.env.VITE_GROQ_API_KEY || import.meta.env.GROQ_API_KEY || '';
      }
    } catch {}
  }
  return key;
};

let currentKeyIndex = 0;

export const aiKeyManager = {
  getKey(): string {
    const keys = getApiKeys();
    if (keys.length === 0) throw new Error('No Gemini API key configured');
    return keys[currentKeyIndex % keys.length];
  },

  rotateKey(): void {
    const keys = getApiKeys();
    if (keys.length > 1) {
      currentKeyIndex = (currentKeyIndex + 1) % keys.length;
      console.log(`[AI] Rotated to API key ${currentKeyIndex + 1}/${keys.length}`);
    }
  },

  hasGroq(): boolean {
    return !!getGroqKey();
  },
};

// ─── AI Client Factory ───

let cachedClient: any = null;
let cachedClientKey: string = '';
let _genaiConstructor: any = null;

/**
 * Call this once at app startup with the GoogleGenAI constructor from @google/genai.
 * Example: `import { GoogleGenAI } from '@google/genai'; initAiClient(GoogleGenAI);`
 */
export const initAiClient = (GoogleGenAICtor: any): void => {
  _genaiConstructor = GoogleGenAICtor;
  cachedClient = null; // Force re-creation on next getAiClient call
  cachedClientKey = '';
};

export const getAiClient = (): any => {
  const key = aiKeyManager.getKey();
  if (cachedClient && cachedClientKey === key) return cachedClient;

  if (_genaiConstructor) {
    cachedClient = new _genaiConstructor({ apiKey: key });
    cachedClientKey = key;
    return cachedClient;
  }

  throw new Error(
    'AI client not initialized. Call initAiClient(GoogleGenAI) at app startup.'
  );
};

// ─── Error Handler with Retry + Key Rotation ───

export const handleAiError = async <T>(fn: () => Promise<T>): Promise<T> => {
  let lastError: any;
  for (let attempt = 0; attempt <= AI_CONFIG.MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';
      const status = error?.status || error?.httpStatusCode || 0;

      // Rate limit or quota exceeded → rotate key and retry
      if (status === 429 || status === 503 || msg.includes('quota') || msg.includes('rate')) {
        console.warn(`[AI] Rate limited (attempt ${attempt + 1}), rotating key...`);
        aiKeyManager.rotateKey();
        cachedClient = null; // Force re-creation with new key
        await new Promise(r => setTimeout(r, AI_CONFIG.RETRY_DELAY * (attempt + 1)));
        continue;
      }

      // Other errors: retry once then throw
      if (attempt < AI_CONFIG.MAX_RETRIES) {
        await new Promise(r => setTimeout(r, AI_CONFIG.RETRY_DELAY));
        continue;
      }
    }
  }
  throw lastError;
};

// ─── Free Icon Generation (no API key needed) ───

export const generateFreeIcon = (name: string): string => {
  const encoded = encodeURIComponent(
    `A cute minimal flat vector sticker of ${name}, white background, emoji style, centered, simple`
  );
  return `https://image.pollinations.ai/prompt/${encoded}?width=256&height=256&nologo=true&seed=${Date.now()}`;
};

// ─── Groq Integration ───

export const callGroq = async (prompt: string, systemPrompt?: string): Promise<string> => {
  const key = getGroqKey();
  if (!key) throw new Error('No Groq API key');

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages,
      max_tokens: 200,
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Groq API error: ${resp.status}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
};

// ─── Response Text Extraction ───

export const getResponseText = (result: any): string => {
  // Handle various Gemini SDK response shapes
  try {
    // Shape: result.text (newer SDK)
    if (typeof result?.text === 'string') return result.text;

    // Shape: result.response?.text() (older SDK)
    if (typeof result?.response?.text === 'function') return result.response.text();

    // Shape: result.candidates[0].content.parts[0].text
    const parts = result?.candidates?.[0]?.content?.parts ||
                  result?.response?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text) return part.text;
    }
  } catch {}
  return '';
};

/**
 * Gemini 3 Intelligence Layer for SilentEar
 * 
 * Uses Gemini 3 Flash (gemini-3-flash-preview) with thinking_level control for:
 * 1. Scene Intelligence — Multi-event reasoning to understand situational context
 * 2. Smart Transcript Refinement — Cleans noisy speech fragments into coherent English
 * 3. AI Trigger Auto-Discovery — Suggests new trigger words from conversation patterns
 *
 * All functions use thinking_level: "low" for minimal latency in a real-time accessibility app.
 */

import { getAiClient, handleAiError, AI_CONFIG } from '../shared/index';
import { TriggerWord, AlertState } from '../types';

// ─── Scene Intelligence ───
// Analyzes recent alerts + transcript context to provide situational awareness.
// Example: "Someone is knocking on the door while the TV is on in the background."

interface SceneAnalysis {
  summary: string;      // e.g., "Someone is at the door calling your name"
  urgency: 'low' | 'medium' | 'high' | 'critical';
  suggestion?: string;  // e.g., "You may want to check the front door"
}

let lastSceneAnalysisTime = 0;
const SCENE_ANALYSIS_COOLDOWN = 10000; // Don't analyze more than once per 10s

export const analyzeScene = async (
  recentAlerts: AlertState[],
  recentTranscript: string[],
  userName: string
): Promise<SceneAnalysis | null> => {
  const now = Date.now();
  if (now - lastSceneAnalysisTime < SCENE_ANALYSIS_COOLDOWN) return null;
  if (recentAlerts.length === 0 && recentTranscript.length === 0) return null;

  lastSceneAnalysisTime = now;

  try {
    return await handleAiError(async () => {
      const ai = getAiClient();

      const alertSummary = recentAlerts.slice(0, 10).map(a => 
        `[${new Date(a.timestamp || 0).toLocaleTimeString()}] ${a.trigger?.label}: "${a.detectedText}"`
      ).join('\n');

      const transcriptText = recentTranscript.slice(-20).join(' ');

      const prompt = `You are SilentEar AI, an accessibility assistant for a deaf user named "${userName}".

Recent detected alerts:
${alertSummary || 'None'}

Recent transcript of surrounding audio:
${transcriptText || 'No speech detected'}

Analyze the scene. Respond ONLY with valid JSON (no markdown, no code fences):
{"summary": "1-sentence description of what's happening around the user", "urgency": "low|medium|high|critical", "suggestion": "optional 1-sentence actionable advice"}`;

      const result = await ai.models.generateContent({
        model: AI_CONFIG.GEMINI_MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: 'low' },
          responseMimeType: 'application/json',
        }
      });

      const text = typeof result?.text === 'string' ? result.text : '';
      const parsed = JSON.parse(text);
      return parsed as SceneAnalysis;
    });
  } catch (e) {
    console.warn('[Gemini3] Scene analysis failed:', e);
    return null;
  }
};


// ─── Smart Transcript Refinement ───
// Takes choppy/noisy speech fragments and produces clean, coherent English.

let lastRefineTime = 0;
const REFINE_COOLDOWN = 8000;
let pendingFragments: string[] = [];

export const queueTranscriptFragment = (fragment: string) => {
  if (fragment && fragment.trim().length > 2) {
    pendingFragments.push(fragment.trim());
    // Keep only last 30 fragments
    if (pendingFragments.length > 30) pendingFragments = pendingFragments.slice(-30);
  }
};

export const refineTranscript = async (): Promise<string | null> => {
  const now = Date.now();
  if (now - lastRefineTime < REFINE_COOLDOWN) return null;
  if (pendingFragments.length < 3) return null;

  lastRefineTime = now;
  const fragments = [...pendingFragments];
  pendingFragments = []; // Clear processed fragments

  try {
    return await handleAiError(async () => {
      const ai = getAiClient();

      const prompt = `You are an intelligent speech-to-text post-processor for a deaf accessibility app.

These are raw speech recognition fragments captured from ambient audio (may be noisy, choppy, repeated, or partial):
${fragments.map((f, i) => `${i + 1}. "${f}"`).join('\n')}

Reconstruct these into clean, coherent English sentences. Fix grammar, remove duplicates, and fill obvious gaps. Keep all meaningful content. Be concise.

Respond with ONLY the refined text (no quotes, no explanation).`;

      const result = await ai.models.generateContent({
        model: AI_CONFIG.GEMINI_MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: 'low' },
        }
      });

      const text = typeof result?.text === 'string' ? result.text.trim() : '';
      return text || null;
    });
  } catch (e) {
    console.warn('[Gemini3] Transcript refinement failed:', e);
    // Put fragments back if processing failed
    pendingFragments = [...fragments, ...pendingFragments];
    return null;
  }
};


// ─── AI Trigger Auto-Discovery ───
// Analyzes recent conversation/sounds and suggests new trigger words.

interface TriggerSuggestion {
  word: string;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
}

let lastDiscoveryTime = 0;
const DISCOVERY_COOLDOWN = 30000; // Once per 30s

export const discoverNewTriggers = async (
  recentTranscript: string[],
  existingTriggers: TriggerWord[]
): Promise<TriggerSuggestion[]> => {
  const now = Date.now();
  if (now - lastDiscoveryTime < DISCOVERY_COOLDOWN) return [];
  if (recentTranscript.length < 5) return [];

  lastDiscoveryTime = now;

  try {
    return await handleAiError(async () => {
      const ai = getAiClient();

      const existingWords = existingTriggers.map(t => t.word).join(', ');
      const transcriptText = recentTranscript.slice(-30).join(' ');

      const prompt = `You are SilentEar AI helping a deaf user stay aware of their environment.

Current trigger words the user monitors: ${existingWords}

Recent audio transcript from their environment:
"${transcriptText}"

Analyze the transcript and suggest 1-3 NEW important words/sounds the user should add to their monitoring list. Only suggest words that appear frequently or are safety-relevant. Don't suggest words already in their list.

Respond ONLY with valid JSON array (no markdown, no code fences):
[{"word": "example", "reason": "heard frequently in conversation", "urgency": "low|medium|high"}]
If no suggestions, respond with: []`;

      const result = await ai.models.generateContent({
        model: AI_CONFIG.GEMINI_MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: 'low' },
          responseMimeType: 'application/json',
        }
      });

      const text = typeof result?.text === 'string' ? result.text : '[]';
      return JSON.parse(text) as TriggerSuggestion[];
    });
  } catch (e) {
    console.warn('[Gemini3] Trigger discovery failed:', e);
    return [];
  }
};


// ─── Reset (call when listening stops) ───
export const resetGemini3State = () => {
  pendingFragments = [];
  lastSceneAnalysisTime = 0;
  lastRefineTime = 0;
  lastDiscoveryTime = 0;
};

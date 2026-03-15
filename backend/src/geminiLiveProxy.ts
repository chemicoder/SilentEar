/**
 * Gemini Live API WebSocket Proxy
 *
 * Bridges client WebSocket connections to server-side Gemini Live API sessions.
 * - Client sends audio chunks → forwarded to Gemini Live API
 * - Gemini responses (transcriptions, tool calls) → forwarded back to client
 * - Tool call results (alerts) are persisted to Firestore
 */

import { WebSocket } from 'ws';
import { GoogleGenAI, Modality, type LiveServerMessage, type FunctionDeclaration, Type } from '@google/genai';
import { firestoreService } from './services/firestore.js';

interface SetupMessage {
  type: 'setup';
  userName: string;
  deviceId: string;
  triggers: Array<{
    id: string;
    word: string;
    synonyms?: string[];
    label: string;
  }>;
}

interface AudioMessage {
  type: 'audio';
  data: string; // base64 PCM
  mimeType: string;
}

type ClientMessage = SetupMessage | AudioMessage | { type: 'close' };

function safeSend(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function handleLiveSession(ws: WebSocket) {
  let geminiSession: any = null;
  let sessionConfig: SetupMessage | null = null;

  ws.on('message', async (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      safeSend(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    // ── Setup: Initialize Gemini Live API session ──
    if (msg.type === 'setup') {
      sessionConfig = msg;

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        safeSend(ws, { type: 'error', message: 'Server API key not configured' });
        return;
      }

      try {
        const ai = new GoogleGenAI({ apiKey });

        const triggerTool: FunctionDeclaration = {
          name: 'trigger_alert',
          description: 'Call this when an environmental sound, intent, or keyword is heard matching the alert categories. Speed is critical.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              alert_id: { type: Type.STRING, description: 'The ID of the alert to trigger.' },
              context: { type: Type.STRING, description: 'Short summary of what was heard.' }
            },
            required: ['alert_id']
          }
        };

        const systemPrompt = `You are "SilentEar", an ultra-fast audio monitor for a deaf person named "${msg.userName}".
RULES:
- Call trigger_alert IMMEDIATELY when you hear a match. Speed is critical — lives depend on it.
- Transcribe ALL speech continuously in English, even in noisy environments.
- For non-speech sounds (knocking, alarms, glass, crying), trigger INSTANTLY.
- If unsure, trigger anyway — false positives are acceptable, missed alerts are not.

Alert IDs:
${msg.triggers.map((t) => {
          if (t.id === 'name') return `"${t.id}": Someone says "${msg.userName}" or addresses them`;
          return `"${t.id}": ${t.label} — keywords: ${t.word}${t.synonyms?.length ? ', ' + t.synonyms.join(', ') : ''}`;
        }).join('\n')}

Respond ONLY with tool calls. No spoken responses. Transcribe everything.`;

        geminiSession = await ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-latest',
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            tools: [{ functionDeclarations: [triggerTool] }],
            systemInstruction: systemPrompt,
          },
          callbacks: {
            onopen: () => {
              console.log(`[Live] Session opened for ${msg.userName}`);
              safeSend(ws, { type: 'ready' });
            },
            onmessage: async (message: LiveServerMessage) => {
              // Forward transcription
              if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                if (text) {
                  safeSend(ws, { type: 'transcription', text });
                }
              }

              // Forward and process tool calls
              if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls || []) {
                  if (fc.name === 'trigger_alert') {
                    const alertId = (fc.args as any).alert_id;
                    const context = (fc.args as any).context || 'AI Detection';

                    safeSend(ws, {
                      type: 'tool_call',
                      alertId,
                      context,
                      timestamp: Date.now()
                    });

                    // Persist alert to Firestore
                    await firestoreService.storeAlert({
                      alertId,
                      context,
                      deviceId: sessionConfig?.deviceId || 'unknown',
                      userName: sessionConfig?.userName || 'unknown',
                      timestamp: Date.now()
                    });

                    // Send tool response back to Gemini
                    geminiSession?.sendToolResponse({
                      functionResponses: [{
                        id: fc.id,
                        name: fc.name,
                        response: { result: 'Confirmed' }
                      }]
                    });
                  }
                }
              }
            },
            onerror: (e: any) => {
              console.error('[Live] Session error:', e?.message || e);
              safeSend(ws, { type: 'error', message: e?.message || 'Live API error' });
            },
            onclose: (e: any) => {
              console.log('[Live] Session closed', e?.code, e?.reason || '');
              safeSend(ws, { type: 'closed' });
            }
          }
        });
      } catch (err: any) {
        console.error('[Live] Failed to create session:', err?.message);
        safeSend(ws, { type: 'error', message: `Failed to connect: ${err?.message}` });
      }
    }

    // ── Audio: Forward PCM audio to Gemini ──
    if (msg.type === 'audio' && geminiSession) {
      try {
        geminiSession.sendRealtimeInput({
          media: { data: msg.data, mimeType: msg.mimeType || 'audio/pcm;rate=16000' }
        });
      } catch (err: any) {
        console.error('[Live] Audio send error:', err?.message);
      }
    }

    // ── Close: Tear down session ──
    if (msg.type === 'close') {
      if (geminiSession) {
        try { geminiSession.close(); } catch {}
        geminiSession = null;
      }
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    if (geminiSession) {
      try { geminiSession.close(); } catch {}
      geminiSession = null;
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    if (geminiSession) {
      try { geminiSession.close(); } catch {}
      geminiSession = null;
    }
  });
}

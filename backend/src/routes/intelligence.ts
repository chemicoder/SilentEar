/**
 * AI Intelligence REST Endpoints
 *
 * Server-side Gemini API calls for:
 * - Scene analysis
 * - Transcript refinement
 * - Trigger auto-discovery
 * - Voice deck suggestions + completion
 */

import { Router, type Request, type Response } from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const router = Router();

const GEMINI_MODEL = 'gemini-3-flash-preview';

function getAi(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  return new GoogleGenAI({ apiKey });
}

// ── Scene Intelligence ──
router.post('/scene', async (req: Request, res: Response) => {
  try {
    const { recentAlerts, recentTranscript, userName } = req.body;
    const ai = getAi();

    const alertSummary = (recentAlerts || []).slice(0, 10).map((a: any) =>
      `[${new Date(a.timestamp || 0).toLocaleTimeString()}] ${a.trigger?.label}: "${a.detectedText}"`
    ).join('\n');

    const transcriptText = (recentTranscript || []).slice(-20).join(' ');

    const prompt = `You are SilentEar AI, an accessibility assistant for a deaf user named "${userName}".

Recent detected alerts:
${alertSummary || 'None'}

Recent transcript of surrounding audio:
${transcriptText || 'No speech detected'}

Analyze the scene. Respond ONLY with valid JSON (no markdown, no code fences):
{"summary": "1-sentence description of what's happening around the user", "urgency": "low|medium|high|critical", "suggestion": "optional 1-sentence actionable advice"}`;

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
      }
    });

    const text = typeof result?.text === 'string' ? result.text : '';
    res.json(JSON.parse(text));
  } catch (err: any) {
    console.error('[Intelligence] Scene analysis failed:', err?.message);
    res.status(500).json({ error: 'Scene analysis failed' });
  }
});

// ── Smart Transcript Refinement ──
router.post('/refine', async (req: Request, res: Response) => {
  try {
    const { fragments } = req.body;
    if (!fragments || fragments.length < 3) {
      return res.json({ refined: null });
    }

    const ai = getAi();
    const prompt = `You are an intelligent speech-to-text post-processor for a deaf accessibility app.

These are raw speech recognition fragments captured from ambient audio (may be noisy, choppy, repeated, or partial):
${fragments.map((f: string, i: number) => `${i + 1}. "${f}"`).join('\n')}

Reconstruct these into clean, coherent English sentences. Fix grammar, remove duplicates, and fill obvious gaps. Keep all meaningful content. Be concise.

Respond with ONLY the refined text (no quotes, no explanation).`;

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      }
    });

    const text = typeof result?.text === 'string' ? result.text.trim() : '';
    res.json({ refined: text || null });
  } catch (err: any) {
    console.error('[Intelligence] Transcript refinement failed:', err?.message);
    res.status(500).json({ error: 'Refinement failed' });
  }
});

// ── AI Trigger Auto-Discovery ──
router.post('/discover-triggers', async (req: Request, res: Response) => {
  try {
    const { recentTranscript, existingTriggers } = req.body;
    if (!recentTranscript || recentTranscript.length < 5) {
      return res.json({ suggestions: [] });
    }

    const ai = getAi();
    const existingWords = (existingTriggers || []).map((t: any) => t.word).join(', ');
    const transcriptText = recentTranscript.slice(-30).join(' ');

    const prompt = `You are SilentEar AI helping a deaf user stay aware of their environment.

Current trigger words: ${existingWords}

Recent audio transcript:
"${transcriptText}"

Suggest 1-3 NEW important words/sounds to add. Only suggest frequent or safety-relevant words not already in the list.

Respond ONLY with valid JSON array:
[{"word": "example", "reason": "heard frequently", "urgency": "low|medium|high"}]
If no suggestions: []`;

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
      }
    });

    const text = typeof result?.text === 'string' ? result.text : '[]';
    res.json({ suggestions: JSON.parse(text) });
  } catch (err: any) {
    console.error('[Intelligence] Trigger discovery failed:', err?.message);
    res.status(500).json({ error: 'Trigger discovery failed' });
  }
});

// ── Voice Deck: Smart Phrase Suggestions ──
router.post('/voice-suggest', async (req: Request, res: Response) => {
  try {
    const { currentText } = req.body;
    const ai = getAi();

    const prompt = `You are an AI assistant for a non-verbal person using a Text-to-Speech app.
Based on the current text: "${currentText}", suggest 3 relevant, concise, and helpful phrases they might want to say next.
Return ONLY a JSON array of 3 strings.`;

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY' as any,
          items: { type: 'STRING' as any }
        }
      }
    });

    const text = typeof result?.text === 'string' ? result.text : '[]';
    res.json(JSON.parse(text));
  } catch (err: any) {
    console.error('[Intelligence] Voice suggestion failed:', err?.message);
    res.json([]);
  }
});

// ── Voice Deck: Sentence Completion ──
router.post('/voice-complete', async (req: Request, res: Response) => {
  try {
    const { currentText } = req.body;
    if (!currentText?.trim()) return res.json({ completion: '' });

    const ai = getAi();
    const prompt = `Complete this sentence naturally and concisely: "${currentText}". 
Return ONLY the remaining part of the sentence.`;

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = typeof result?.text === 'string' ? result.text.trim() : '';
    res.json({ completion: text });
  } catch (err: any) {
    console.error('[Intelligence] Completion failed:', err?.message);
    res.json({ completion: '' });
  }
});

export { router as intelligenceRouter };

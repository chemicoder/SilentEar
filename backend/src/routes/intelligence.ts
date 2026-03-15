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
    const alertCount = (recentAlerts || []).length;
    const hasMultipleSpeakers = transcriptText.length > 100;

    const prompt = `You are SilentEar AI, an advanced environmental awareness assistant for a deaf user named "${userName || 'User'}".

You must infer what is physically happening around the user by combining audio alerts and speech transcript data. Think like a hearing person describing the scene to a deaf friend.

RECENT ALERTS (sound events detected by the system):
${alertSummary || '(No sound alerts detected recently)'}

RECENT SPEECH TRANSCRIPT (ambient audio converted to text):
${transcriptText || '(No speech detected recently)'}

ENVIRONMENTAL CLUES:
- Number of alerts in last minute: ${alertCount}
- Speech volume/activity: ${hasMultipleSpeakers ? 'Active conversation detected' : transcriptText ? 'Some speech detected' : 'Quiet environment'}

INSTRUCTIONS:
1. Describe what is happening around the user in a natural, clear sentence — as if you are their hearing friend explaining the scene.
2. Assess urgency based on safety and importance: "low" = ambient noise, "medium" = someone talking to/about them, "high" = something needing attention (doorbell, name called), "critical" = safety hazard (alarm, siren, glass breaking).
3. Give a short, practical suggestion ONLY if the user should take action.
4. Do NOT say "no sound detected" — if data is sparse, infer the most likely scenario (e.g., "It's quiet around you" or "Background noise from a TV or radio").

Respond with JSON:
{"summary": "...", "urgency": "low|medium|high|critical", "suggestion": "...or null if no action needed"}`;

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
    const prompt = `You are an expert speech-to-text post-processor for SilentEar, a real-time accessibility app for deaf users.

RAW FRAGMENTS (captured from ambient audio — may be noisy, overlapping, partial, or repeated):
${fragments.map((f: string, i: number) => `${i + 1}. "${f}"`).join('\n')}

INSTRUCTIONS:
1. Reconstruct these fragments into clean, natural English sentences.
2. Merge overlapping/repeated phrases into single coherent statements.
3. Fix grammar, spelling, and obvious misrecognitions (e.g., "fire alarm" not "fire a larm").
4. Separate different speakers or topics with line breaks.
5. Preserve names, numbers, and important details exactly.
6. If someone seems to be addressing the deaf user directly, mark it with → at the start.
7. Remove filler words (um, uh, like) unless they carry meaning.
8. Keep the output concise — the user reads this on a phone screen.

OUTPUT: Clean text only, no quotes or explanation. Use line breaks between distinct statements.`;

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
    const { recentTranscript, existingTriggers, recentAlerts } = req.body;
    if (!recentTranscript || recentTranscript.length < 5) {
      return res.json({ suggestions: [] });
    }

    const ai = getAi();
    const existingWords = (existingTriggers || []).map((t: any) => t.word).join(', ');
    const transcriptText = recentTranscript.slice(-30).join(' ');
    const alertLabels = (recentAlerts || []).slice(0, 5).map((a: any) => a.trigger?.label || '').filter(Boolean).join(', ');

    const prompt = `You are SilentEar AI helping a deaf user stay safe and aware of their environment.

The user currently monitors these trigger words: ${existingWords || '(none set)'}

Recent audio transcript from their environment:
"${transcriptText}"

Recent alert activity: ${alertLabels || 'None'}

INSTRUCTIONS:
1. Analyze the transcript for recurring words, names, sounds, or safety-relevant terms NOT already in the user's trigger list.
2. Prioritize: safety sounds (alarms, horns, sirens), names of people speaking, frequently repeated words, and contextually important terms.
3. Only suggest words that would genuinely help a deaf person stay aware. No generic words like "the", "and", etc.
4. For each suggestion, explain WHY it matters in the context of what was heard.
5. Set urgency: "high" = safety-critical sounds, "medium" = names/important recurring words, "low" = nice-to-have awareness.

Respond with JSON array (1-3 items max):
[{"word": "specific_word", "reason": "why this matters for the deaf user", "urgency": "low|medium|high"}]
Empty array [] if nothing useful to suggest.`;

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
    const { currentText, sceneContext, recentAlerts, recentTranscript } = req.body;
    const ai = getAi();

    const alertContext = (recentAlerts || []).slice(0, 5).map((a: any) =>
      `${a.trigger?.label}: "${a.detectedText || ''}"`
    ).join(', ');

    const transcriptSnippet = (recentTranscript || []).slice(-5).join(' ');

    const prompt = `You are the Voice Deck AI for SilentEar — a communication tool for a deaf/non-verbal person.

CURRENT SITUATION:
- Scene: ${sceneContext || 'Unknown environment'}
- Recent sounds detected: ${alertContext || 'None'}
- Recent speech around the user: ${transcriptSnippet || 'None'}
- User is typing: "${currentText || '(nothing yet)'}"

YOUR JOB: Suggest 4-5 short, practical phrases the user might want to SAY RIGHT NOW given the situation.

RULES:
1. Phrases must be things a deaf person would actually say out loud via text-to-speech.
2. Match the scenario — if someone is talking to them, suggest responses. If a doorbell rang, suggest door-related phrases. If it's quiet, suggest conversation starters.
3. Keep phrases under 8 words each. Natural and polite.
4. If the user is typing something, suggest completions or related phrases.
5. Include at least one safety/clarification phrase if the situation is unclear.
6. Do NOT suggest generic greetings if the context implies an active conversation.

EXAMPLES by scenario:
- Doorbell rang → ["I'm coming!", "Who is it?", "Please wait a moment", "Leave it at the door"]
- Someone calling name → ["Yes, I'm here", "I can see you", "One moment please", "What do you need?"]
- Active conversation → ["Can you repeat that?", "I agree", "Tell me more", "I understand"]
- Restaurant → ["Can I see the menu?", "Water please", "The check please", "Thank you"]

Return ONLY a JSON array of strings.`;

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
    const { currentText, sceneContext } = req.body;
    if (!currentText?.trim()) return res.json({ completion: '' });

    const ai = getAi();
    const prompt = `You are helping a deaf person complete a sentence they are typing to speak aloud via text-to-speech.

Scene context: ${sceneContext || 'Unknown'}
Partial sentence: "${currentText}"

Complete the sentence naturally and concisely. The completion should make sense for a deaf person communicating with hearing people.
Return ONLY the remaining words to complete the sentence (not the full sentence).`;

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

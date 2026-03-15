
import { getAiClient, handleAiError, AI_CONFIG, getResponseText } from '../shared/index';

/**
 * Service for Voice Deck AI enhancements
 */
export const voiceDeckService = {
    /**
     * Suggest 3 smart phrases based on the current context or text.
     */
    async suggestPhrases(currentText: string): Promise<string[]> {
        try {
            return await handleAiError(async () => {
                const ai = getAiClient();
                const prompt = `You are an AI assistant for a non-verbal person using a Text-to-Speech app called Voice Deck.
        Based on the current text: "${currentText}", suggest 3 relevant, concise, and helpful phrases they might want to say next.
        Return ONLY a JSON array of 3 strings.`;

                const result = await (ai as any).models.generateContent({
                    model: AI_CONFIG.GEMINI_MODEL,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "array",
                            items: { type: "string" }
                        }
                    }
                });

                const text = getResponseText(result);
                return JSON.parse(text || '[]');
            });
        } catch (e) {
            console.warn('AI phrase suggestion failed:', e);
            return [];
        }
    },

    /**
     * Predict the completion of a sentence.
     */
    async predictCompletion(currentText: string): Promise<string> {
        if (!currentText.trim()) return '';
        try {
            return await handleAiError(async () => {
                const ai = getAiClient();
                const prompt = `Complete this sentence naturally and concisely: "${currentText}". 
        Return ONLY the remaining part of the sentence.`;

                const result = await (ai as any).models.generateContent({
                    model: AI_CONFIG.GEMINI_MODEL,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                });

                return getResponseText(result).trim();
            });
        } catch (e) {
            return '';
        }
    }
};


import { getAiClient, handleAiError, AI_CONFIG, getResponseText } from '@shared/index';

/**
 * Live Interpreter Service using Gemini Multimodal
 * 
 * This service takes a sequence of video frames and uses Gemini to 
 * interpret the sign language being performed.
 */

export interface InterpretationResult {
    text: string;
    confidence: number;
    detectedSigns: string[];
}

export const interpretSignLanguage = async (
    frames: string[], // base64 image data URLs
    context: string = "Sign language interpretation"
): Promise<InterpretationResult> => {
    return await handleAiError(async () => {
        const ai = getAiClient();

        // Convert data URLs to Gemini inlineData parts
        const imageParts = frames.map(frame => {
            const base64Data = frame.split(',')[1];
            return {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg"
                }
            };
        });

        const prompt = `You are a professional sign language interpreter. 
    Look at this sequence of images from a video capturing sign language.
    Translate the signs into English text. 
    
    Return a JSON object with:
    - text: The translated sentence or phrase.
    - confidence: A number from 0 to 1 representing your confidence.
    - detectedSigns: A list of specific signs you recognized.
    
    If no signs are clearly visible or recognized, return "Waiting for signs..." for text.`;

        const result = await (ai as any).models.generateContent({
            model: AI_CONFIG.GEMINI_MODEL,
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    ...imageParts
                ]
            }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object" as any,
                    properties: {
                        text: { type: "string" },
                        confidence: { type: "number" },
                        detectedSigns: {
                            type: "array",
                            items: { type: "string" }
                        }
                    }
                }
            }
        });

        const text = getResponseText(result);
        try {
            const json = JSON.parse(text);
            return {
                text: json.text || "...",
                confidence: json.confidence || 0,
                detectedSigns: json.detectedSigns || []
            };
        } catch (e) {
            return {
                text: text || "Interpretation failed",
                confidence: 0,
                detectedSigns: []
            };
        }
    });
};

/**
 * Intelligent Extraction: Use Gemini to extract a deep description of the sign
 * instead of just raw landmarks. This "intelligent layer" can be used
 * alongside landmarks for better training.
 */
export const extractIntelligentSignData = async (
    videoUrl: string,
    signName: string
): Promise<string> => {
    return await handleAiError(async () => {
        const ai = getAiClient();

        const prompt = `Analyze this video of the sign for "${signName}".
    Describe the hand shapes, movements, and facial expressions in detail.
    Identify the key phases of the sign (start, peak, end).
    Provide a robust linguistic description that could be used to train an AI model.`;

        const result = await (ai as any).models.generateContent({
            model: AI_CONFIG.GEMINI_MODEL,
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { text: `Video URL: ${videoUrl}. Please analyze the visual content.` }
                ]
            }]
        });

        return getResponseText(result);
    });
};

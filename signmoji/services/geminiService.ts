
import { getAiClient, handleAiError, generateFreeIcon, aiKeyManager, callGroq, AI_CONFIG, getResponseText } from '@shared/index';
import { SignCategory, SignLanguage, getAllCategories } from '../types';

/**
 * Convert an external URL to a data URL (handles CORS via proxies).
 * Returns null if all methods fail.
 */
const urlToDataUrl = async (url: string): Promise<string | null> => {
  if (!url || url.startsWith('data:')) return url;

  const tryFetch = async (fetchUrl: string): Promise<string | null> => {
    try {
      const resp = await fetch(fetchUrl, { credentials: 'omit' });
      if (!resp.ok) return null;
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('text/html') || ct.includes('application/json')) return null;
      const blob = await resp.blob();
      if (blob.size < 200) return null;
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  // Try direct first
  let result = await tryFetch(url);
  if (result) return result;

  // No external proxies — only direct fetch or Supabase-hosted assets
  return null;
};

export const generateLiteralIcon = async (signName: string): Promise<string> => {
  // Strategy 1: Try Gemini 3 Nano Banana Pro image generation (highest quality)
  try {
    return await handleAiError(async () => {
      const ai = getAiClient();
      const prompt = `A simple, cute, high-contrast vector sticker illustration of "${signName}". 
      White thick outline, flat colors, transparent background style (but generate on white background). 
      Emoji style. Minimalist. Single object, centered. High quality 4K rendering.`;

      const result = await (ai as any).models.generateContent({
        model: AI_CONFIG.IMAGE_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseModalities: ['IMAGE', 'TEXT'] as any,
          mediaResolution: 'MEDIA_RESOLUTION_HIGH',
        }
      });

      const parts = result.candidates?.[0]?.content?.parts || (result as any).response?.candidates?.[0]?.content?.parts || [];

      for (const part of parts) {
        if (part.inlineData) {
          console.log('[Gemini3 Nano Banana Pro] Generated icon for:', signName);
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      throw new Error("No image generated");
    });
  } catch (error) {
    console.warn("Gemini 3 icon generation failed, trying free fallback:", error);
  }

  // Strategy 2: Use free Pollinations.ai (no key needed, always works)
  try {
    const freeUrl = generateFreeIcon(signName);
    const dataUrl = await urlToDataUrl(freeUrl);
    if (dataUrl) {
      console.log('Generated free icon for:', signName);
      return dataUrl;
    }
  } catch (e) {
    console.warn('Free icon generation failed:', e);
  }

  throw new Error(`Failed to generate icon for "${signName}". Please add a matching asset to your library.`);
};

export const searchWebForIcon = async (signName: string): Promise<string | null> => {
  const termSlug = signName.replace(/\s+/g, '-').toLowerCase();
  const termEncoded = encodeURIComponent(termSlug);

  // Try AI-powered Google Search for any matching image
  try {
    const ai = getAiClient();
    const prompt = `Find a direct public image URL for a clear, high-quality image representing "${signName}". 
    This can be any type of image: icon, photo, illustration, clipart, PNG, emoji, or sticker.
    Return ONLY a direct image URL that ends in .png, .jpg, .svg, or .webp. 
    The URL must be a direct link to an image file, not a webpage.
    Try open-license sources like wikimedia commons, pixabay, openclipart.org, svgrepo.com, or similar.`;

    const result = await (ai as any).models.generateContent({
      model: AI_CONFIG.GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }] as any
    });

    // Look in the model's text response for URLs
    const text = getResponseText(result);
    const urlMatches = text.match(/https?:\/\/[^\s)"<>]+\.(png|jpg|jpeg|svg|webp)(\?[^\s)"<>]*)?/gi) || [];
    for (const foundUrl of urlMatches) {
      if (foundUrl.length < 500) {
        const dataUrl = await urlToDataUrl(foundUrl);
        if (dataUrl) return dataUrl;
      }
    }

    // Look in grounding metadata
    const candidates = result.candidates || (result as any).response?.candidates || [];
    const chunks = candidates[0]?.groundingMetadata?.groundingChunks || [];
    for (const chunk of chunks) {
      const uri = chunk.web?.uri;
      if (uri && uri.match(/\.(png|jpg|jpeg|svg|webp)/i)) {
        const dataUrl = await urlToDataUrl(uri);
        if (dataUrl) return dataUrl;
      }
    }
  } catch (error) {
    console.warn("Web search for icon failed:", error);
  }

  // Final fallback: Pollinations.ai free generation (always works)
  try {
    const freeUrl = generateFreeIcon(signName);
    const dataUrl = await urlToDataUrl(freeUrl);
    if (dataUrl) return dataUrl;
  } catch { /* ignore */ }

  return null;
};

/**
 * Search for multiple icon candidates from the web.
 * Returns an array of icon options for the user to pick from.
 */
export interface IconSearchResult {
  url: string;       // Direct image URL (external)
  dataUrl?: string;  // Converted data URL (if successfully fetched)
  source: string;    // e.g. 'Icons8', 'Flaticon', 'AI Generated'
  name: string;      // Display name
}

export const searchWebIcons = async (query: string): Promise<IconSearchResult[]> => {
  const results: IconSearchResult[] = [];

  // 1. AI-powered Google Search for images
  try {
    const ai = getAiClient();
    const prompt = `Find 6 different direct image URLs representing "${query}". 
Include a MIX of: icons, real photos/images, clipart, illustrations, and PNG images with transparent backgrounds.
Return ONLY direct image URLs (ending in .png, .jpg, .svg, .webp), one per line.
Try diverse open-license sources: wikimedia commons, pixabay.com, svgrepo.com, openclipart.org`;

    const result = await (ai as any).models.generateContent({
      model: AI_CONFIG.GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }] as any
    });

    const text = getResponseText(result);
    const urlMatches = text.match(/https?:\/\/[^\s)"<>]+\.(png|jpg|jpeg|svg|webp)(\?[^\s)"<>]*)?/gi) || [];
    const seenUrls = new Set(results.map(r => r.url));

    const aiResults = await Promise.allSettled(
      (urlMatches as string[]).filter(u => u.length < 500 && !seenUrls.has(u)).slice(0, 6).map(async (foundUrl) => {
        const dataUrl = await urlToDataUrl(foundUrl);
        if (!dataUrl) throw new Error('not found');
        let source = 'Web';
        try { source = new URL(foundUrl).hostname.replace('www.', ''); } catch { }
        return { url: foundUrl, dataUrl, source, name: query };
      })
    );
    for (const r of aiResults) {
      if (r.status === 'fulfilled') results.push(r.value);
    }

    // Also check grounding metadata
    const candidates = result.candidates || (result as any).response?.candidates || [];
    const chunks = candidates[0]?.groundingMetadata?.groundingChunks || [];
    for (const chunk of chunks) {
      const uri = chunk.web?.uri;
      if (uri && uri.match(/\.(png|jpg|jpeg|svg|webp)/i) && !seenUrls.has(uri)) {
        const dataUrl = await urlToDataUrl(uri);
        if (dataUrl) {
          let source = 'Web';
          try { source = new URL(uri).hostname.replace('www.', ''); } catch { }
          results.push({ url: uri, dataUrl, source, name: query });
          seenUrls.add(uri);
        }
      }
    }
  } catch (error) {
    console.warn('AI icon search failed:', error);
  }

  // 3. Always add Pollinations.ai as an AI-generated option
  try {
    const freeUrl = generateFreeIcon(query);
    const dataUrl = await urlToDataUrl(freeUrl);
    if (dataUrl) {
      results.push({ url: freeUrl, dataUrl, source: 'AI Generated', name: query });
    }
  } catch { /* ignore */ }

  return results;
};

export const suggestCategory = async (signName: string): Promise<SignCategory> => {
  const categories = getAllCategories();
  const prompt = `Categorize the sign language word "${signName}" into one of these exact categories: ${categories.join(', ')}. Return ONLY the category name.`;
  const systemPrompt = "You are a sign language expert. Return only the category name from the list provided.";

  try {
    if (aiKeyManager.hasGroq()) {
      const category = await callGroq(prompt, systemPrompt);
      const clean = category.trim().replace(/[.]/g, '');
      if (categories.some(c => c.toLowerCase() === clean.toLowerCase())) return clean as SignCategory;
    }

    return await handleAiError(async () => {
      const ai = getAiClient();
      const result = await (ai as any).models.generateContent({
        model: AI_CONFIG.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object" as any,
            properties: {
              category: {
                type: "string",
                enum: categories
              }
            }
          }
        }
      });

      const text = getResponseText(result);
      const json = JSON.parse(text || '{}');
      return (json.category as SignCategory) || SignCategory.Other;
    });
  } catch (error) {
    console.warn("Category suggestion failed, defaulting to Other", error);
    return SignCategory.Other;
  }
};

export interface SearchResult {
  title: string;
  uri: string;
  isTemplate?: boolean;
}

const generateVideoTemplates = (term: string, language: SignLanguage): SearchResult[] => {
  // No hardcoded third-party video URLs — use only Google Search to find videos
  // Users can also record their own sign videos via the Recorder
  return [];
};

export const searchSignVideos = async (term: string, language: SignLanguage): Promise<SearchResult[]> => {
  const ai = getAiClient();

  const directLinks = generateVideoTemplates(term, language);

  let context = `sign language (${language})`;

  if (language === 'ASL') {
    context = "American Sign Language (ASL)";
  } else if (language === 'PSL') {
    context = "Pakistan Sign Language (PSL)";
  } else if (language === 'BSL') {
    context = "British Sign Language (BSL)";
  }

  const prompt = `Find 4 distinct video URLs or dictionary page URLs that demonstrate the ${context} sign for "${term}".
    Prioritize finding direct .mp4 or .webm video links from open sign language dictionaries.
    If direct video links are not available, provide the specific dictionary page URL where the sign video can be viewed.
    Avoid YouTube if possible, prefer short dictionary clips.
    Return valid, accessible URLs.`;

  try {
    return await handleAiError(async () => {
      const ai = getAiClient();
      const result = await (ai as any).models.generateContent({
        model: AI_CONFIG.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }] as any
      });

      const candidates = result.candidates || (result as any).response?.candidates || [];
      const chunks = candidates[0]?.groundingMetadata?.groundingChunks || [];

      let searchResults: SearchResult[] = [];
      const seen = new Set<string>();

      // Strategy 1: Look in grounding metadata
      if (chunks && chunks.length > 0) {
        for (const chunk of chunks) {
          if (chunk.web?.uri && !seen.has(chunk.web.uri)) {
            let title = chunk.web.title || "Sign Video";
            const uri = chunk.web.uri;

            if (title.toLowerCase().includes('.mp4') || uri.toLowerCase().endsWith('.mp4')) {
              title = term + " (Clip)";
            }

            searchResults.push({ title, uri });
            seen.add(uri);
          }
        }
      }

      // Strategy 2: Fallback to searching the text for URLs
      const text = getResponseText(result);
      if (text) {
        const urlMatches = text.match(/https?:\/\/[^\s)"<>\[\]]+/gi);
        if (urlMatches) {
          for (const url of urlMatches) {
            if (!seen.has(url)) {
              const isRelevant = url.includes('sign') || url.includes('video') || url.includes('mp4')
                || url.includes('asl') || url.includes('bsl') || url.includes('psl');
              if (isRelevant) {
                searchResults.push({ title: `${term} (Web Result)`, uri: url });
                seen.add(url);
              }
            }
          }
        }
      }

      return [...directLinks, ...searchResults];
    });
  } catch (error) {
    console.error("Search failed:", error);
    return directLinks;
  }
};


import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Library as LibraryIcon,
  Video,
  Upload,
  Link as LinkIcon,
  X,
  Sparkles,
  CheckCircle,
  Loader2,
  Search,
  Globe,
  ChevronDown,
  PlayCircle,
  ExternalLink,
  ArrowLeft,
  AlertCircle
} from 'lucide-react';
import { Recorder } from './components/Recorder';
import { Library } from './components/Library';
import { LiveInterpreter } from './components/LiveInterpreter';
import { SignEmoji, SignCategory, CreatorState, SignLanguage, Asset } from './types';
import { generateLiteralIcon, suggestCategory, searchSignVideos, SearchResult, searchWebForIcon } from './services/geminiService';
import { sharedStorage } from '@shared/storageService';
import { supabase } from '@shared/supabaseService';
import { initAiClient } from '@shared/index';
import { GoogleGenAI } from '@google/genai';

// Initialize the shared AI client with the GoogleGenAI constructor from @google/genai
initAiClient(GoogleGenAI);

const DEFAULT_ASSETS: Asset[] = [
  { id: '1', name: 'Cat', type: 'icon', url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&q=80' },
  { id: '2', name: 'Dog', type: 'icon', url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&q=80' },
  { id: '3', name: 'Food', type: 'icon', url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80' },
  { id: '4', name: 'Water', type: 'icon', url: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80' },
  { id: '5', name: 'Sleep', type: 'icon', url: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=400&q=80' },
  { id: '6', name: 'Home', type: 'icon', url: 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&q=80' },
  { id: '7', name: 'Car', type: 'icon', url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&q=80' },
  { id: '8', name: 'Baby', type: 'icon', url: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400&q=80' },
];

const ASSETS_STORAGE_KEY = 'vibear_assets';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'library' | 'creator' | 'interpreter'>('library');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [library, setLibrary] = useState<SignEmoji[]>([]);
  const [assets, setAssets] = useState<Asset[]>(() => {
    // Load assets from localStorage on initial mount
    try {
      const savedAssets = localStorage.getItem(ASSETS_STORAGE_KEY);
      if (savedAssets) {
        const parsed = JSON.parse(savedAssets);
        // Merge with defaults, avoiding duplicates
        const mergedIds = new Set(parsed.map((a: Asset) => a.id));
        const uniqueDefaults = DEFAULT_ASSETS.filter(d => !mergedIds.has(d.id));
        return [...parsed, ...uniqueDefaults];
      }
    } catch (e) {
      console.warn('Failed to load assets from storage');
    }
    return DEFAULT_ASSETS;
  });

  // Creator State
  const [creatorState, setCreatorState] = useState<CreatorState>({
    step: 'input-selection',
    videoBlob: null,
    videoUrl: null,
    signName: '',
    category: SignCategory.Other
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLanguage, setSearchLanguage] = useState<SignLanguage>('ASL');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [failedVideoLinks, setFailedVideoLinks] = useState<Set<string>>(new Set());
  const [expandedWebResult, setExpandedWebResult] = useState<SearchResult | null>(null);
  const [manualVideoUrl, setManualVideoUrl] = useState('');

  // Icon upload dialog state (shown when icon can't be found/generated)
  const [iconUploadDialog, setIconUploadDialog] = useState<{
    visible: boolean;
    signName: string;
    resolve: ((value: string | null) => void) | null;
  }>({ visible: false, signName: '', resolve: null });

  const isYouTube = (url: string) => url.includes('youtube.com') || url.includes('youtu.be');
  const getEmbedUrl = (url: string) => {
    if (url.includes('youtube.com/watch?v=')) return url.replace('watch?v=', 'embed/');
    if (url.includes('youtu.be/')) return url.replace('youtu.be/', 'youtube.com/embed/');
    return url;
  };
  const isVideoFile = (url: string) => {
    if (url.includes('cloudinary.com') && url.includes('/video/upload/')) return true;

    const clean = url.split('?')[0].toLowerCase();
    return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.m4v');
  };

  // Helper: convert SharedSignEmoji[] to SignEmoji[] (map iconUrl -> literalIconUrl)
  const mapSharedToLocal = useCallback((shared: any[]): SignEmoji[] => {
    return shared.map((e: any) => ({
      ...e,
      literalIconUrl: e.literalIconUrl || e.iconUrl || '',
      videoUrl: e.videoUrl || '',
    }));
  }, []);

  // Helper: convert external URL to data URL for persistence
  const convertToDataUrl = useCallback(async (url: string): Promise<string | null> => {
    if (!url || url.startsWith('data:')) return url;
    try {
      // Try direct fetch
      let response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error('Direct fetch failed');
      const blob = await response.blob();
      if (blob.type.includes('text/html')) throw new Error('Got HTML');
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      // No external proxies — only direct fetch or Supabase-hosted assets
      console.warn('Direct fetch failed for icon, no proxy fallback available.');
      return null;
    }
  }, []);

  // Load from storage on mount — Supabase is source of truth
  useEffect(() => {
    // Load sign emojis from Supabase (source of truth)
    const syncSignEmojisFromCloud = async () => {
      try {
        const cloudEmojis = await supabase.fetchSignEmojis();
        if (cloudEmojis && cloudEmojis.length > 0) {
          const emojis: SignEmoji[] = cloudEmojis.map(ce => ({
            id: ce.id,
            name: ce.name,
            videoUrl: ce.video_url || '',
            literalIconUrl: ce.url || '',
            category: (ce.category as SignCategory) || SignCategory.Other,
            language: (ce.language as SignLanguage) || 'ASL',
            videoTransform: ce.video_transform || undefined,
            createdAt: ce.created_at ? new Date(ce.created_at).getTime() : Date.now(),
          }));
          // Merge: cloud emojis + any local-only emojis
          const cloudIds = new Set(emojis.map(e => e.id));
          const localEmojis = sharedStorage.getSharedEmojis();
          const localOnly = mapSharedToLocal(localEmojis).filter(e => !cloudIds.has(e.id));
          const merged = [...emojis, ...localOnly];
          setLibrary(merged);
          // Update shared storage to match merged data
          for (const e of merged) {
            sharedStorage.saveSharedEmoji({
              id: e.id,
              name: e.name,
              videoUrl: e.videoUrl,
              iconUrl: e.literalIconUrl,
              category: e.category,
              language: e.language,
              createdAt: e.createdAt,
              sourceApp: 'signmoji',
              videoTransform: e.videoTransform,
            });
          }
        } else if (!cloudEmojis || cloudEmojis.length === 0) {
          // Cloud empty — keep local data
          const sharedEmojis = sharedStorage.getSharedEmojis();
          if (sharedEmojis.length > 0) {
            setLibrary(mapSharedToLocal(sharedEmojis));
          }
        }
      } catch (e) {
        // Fallback to localStorage if cloud fails
        const sharedEmojis = sharedStorage.getSharedEmojis();
        setLibrary(mapSharedToLocal(sharedEmojis));
      }
    };
    syncSignEmojisFromCloud();

    // Also sync assets from cloud — replace local with cloud data
    const syncAssetsFromCloud = async () => {
      try {
        const cloudAssets = await supabase.fetchAssets();
        if (cloudAssets) {
          // Use cloud assets + defaults (cloud is source of truth)
          const allAssets = cloudAssets.length > 0 ? cloudAssets as any[] : DEFAULT_ASSETS;
          setAssets(allAssets);
        }
      } catch (e) {
        console.warn('Failed to sync assets from cloud:', e);
      }
    };
    syncAssetsFromCloud();

    // Subscribe to sync updates
    const unsubscribe = sharedStorage.subscribe('all', () => {
      setLibrary(mapSharedToLocal(sharedStorage.getSharedEmojis()));
    });
    return () => unsubscribe();
  }, [mapSharedToLocal]);

  // Persist assets to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(ASSETS_STORAGE_KEY, JSON.stringify(assets));
    } catch (e) {
      console.warn('Failed to save assets to storage');
    }
  }, [assets]);

  // --- Assets Logic ---
  const handleAddAsset = (files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result) {
          // Use custom _assetName if set (from web icon search), otherwise use filename
          const assetName = (file as any)._assetName || file.name.split('.')[0];
          const newAsset: Asset = {
            id: crypto.randomUUID(),
            name: assetName,
            type: 'icon',
            url: e.target.result as string,
            createdAt: Date.now()
          };
          setAssets(prev => [newAsset, ...prev]);

          // Sync to cloud for cross-device sharing
          try {
            await supabase.upsertAsset(newAsset);
            console.log('Asset synced to cloud:', newAsset.name);
          } catch (e) {
            console.warn('Failed to sync asset to cloud:', e);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAsset = async (id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id));

    // Remove from cloud
    try {
      await supabase.deleteAsset(id);
    } catch (e) {
      console.warn('Failed to delete asset from cloud:', e);
    }
  };

  const handleRenameAsset = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    setAssets(prev => prev.map(a => a.id === id ? { ...a, name: newName.trim() } : a));

    // Sync rename to cloud
    const asset = assets.find(a => a.id === id);
    if (asset) {
      supabase.upsertAsset({ ...asset, name: newName.trim() }).catch(e => console.warn('Rename sync failed:', e));
    }
  };

  const handleUpdateEmoji = async (id: string, updates: Partial<SignEmoji>) => {
    const updatedLibrary = library.map(e => e.id === id ? { ...e, ...updates } : e);
    setLibrary(updatedLibrary);

    // Persist if it's an update to a saved item
    const emoji = updatedLibrary.find(e => e.id === id);
    if (emoji) {
      // Map to SharedSignEmoji format before saving
      const sharedEmoji = {
        id: emoji.id,
        name: emoji.name,
        videoUrl: emoji.videoUrl,
        iconUrl: emoji.literalIconUrl, // Map literalIconUrl -> iconUrl
        category: emoji.category,
        language: emoji.language,
        createdAt: emoji.createdAt,
        sourceApp: 'signmoji' as const,
        videoTransform: emoji.videoTransform,
      };
      await sharedStorage.saveSharedEmoji(sharedEmoji);
      // Also sync to cloud table
      supabase.upsertSignEmoji({
        id: emoji.id,
        name: emoji.name,
        iconUrl: emoji.literalIconUrl,
        videoUrl: emoji.videoUrl,
        category: emoji.category,
        language: emoji.language,
        videoTransform: emoji.videoTransform || null,
      }).catch(e => console.warn('Cloud update failed:', e));
    }
  };

  const handleRemoveEmoji = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this SignMoji?")) return;

    setLibrary(prev => prev.filter(e => e.id !== id));
    await sharedStorage.removeSharedEmoji(id);
    sharedStorage.removeSharedTriggerByEmojiId(id);
    // Remove from cloud table too
    supabase.deleteSignEmoji(id).catch(e => console.warn('Cloud delete failed:', e));
  };

  const handleDelinkEmoji = (id: string) => {
    sharedStorage.removeSharedTriggerByEmojiId(id);
  };

  // --- Creator Actions ---

  const handleInputSelect = (mode: 'upload' | 'camera' | 'screen' | 'link' | 'search') => {
    if (mode === 'camera' || mode === 'screen') {
      setCreatorState(prev => ({ ...prev, step: 'recording' }));
    } else if (mode === 'upload') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const extractedName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          const url = URL.createObjectURL(file);
          videoBlobRef.current = file; // Store in ref for immediate access

          setCreatorState(prev => ({
            ...prev,
            videoBlob: file,
            videoUrl: url,
            signName: extractedName,
          }));
          processCreation(extractedName, url);
        }
      };
      input.click();
    } else if (mode === 'link') {
      const url = window.prompt("Enter video URL (Direct MP4 or YouTube preferred):");
      if (url) {
        setCreatorState(prev => ({
          ...prev,
          videoUrl: url,
          step: 'preview'
        }));
      }
    } else if (mode === 'search') {
      setCreatorState(prev => ({ ...prev, step: 'search' }));
    }
  };

  // Store recording blob in a ref so processCreation can access it immediately
  // (React setState is async, so creatorState.videoBlob may be stale)
  const videoBlobRef = React.useRef<Blob | null>(null);

  const handleRecordingComplete = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    videoBlobRef.current = blob;
    setCreatorState(prev => ({
      ...prev,
      videoBlob: blob,
      videoUrl: url,
      step: 'preview'
    }));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setFailedVideoLinks(new Set());
    try {
      const results = await searchSignVideos(searchQuery, searchLanguage);

      // Probe template video URLs in parallel to filter out 404s
      const probed = await Promise.all(
        results.map(async (r) => {
          if (r.isTemplate && isVideoFile(r.uri)) {
            try {
              const resp = await fetch(r.uri, { method: 'HEAD', mode: 'no-cors' }).catch(() => null);
              // no-cors gives opaque response (status 0) — can't detect 404 reliably.
              // Instead try a range-request to get just first byte:
              const probe = await fetch(r.uri, { headers: { Range: 'bytes=0-0' } }).catch(() => null);
              if (probe && (probe.status === 200 || probe.status === 206)) return r; // exists
              if (probe && probe.status >= 400) return null; // confirmed missing
              return r; // CORS blocked probe — keep and let video element try
            } catch {
              return r; // network error — keep it, let video element handle
            }
          }
          return r;
        })
      );
      setSearchResults(probed.filter(Boolean) as SearchResult[]);
    } catch (error) {
      console.error(error);
      alert("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleVideoError = (uri: string) => {
    setFailedVideoLinks(prev => {
      const newSet = new Set(prev);
      newSet.add(uri);
      return newSet;
    });
  };

  const selectSearchResult = (result: SearchResult) => {
    videoBlobRef.current = null; // Search results have no local blob
    setCreatorState(prev => ({
      ...prev,
      videoUrl: result.uri,
      signName: searchQuery,
    }));
    processCreation(searchQuery, result.uri);
  };

  const processCreation = async (name: string, url: string) => {
    if (!name || !url) return;

    setIsProcessing(true);
    setProcessingStatus('Analyzing video...');
    setCreatorState(prev => ({ ...prev, step: 'processing', signName: name, videoUrl: url }));

    try {
      // 1. Category + Icon in parallel for speed
      setProcessingStatus('Analyzing & finding icon...');

      // Start category detection (non-blocking)
      const categoryPromise = suggestCategory(name).catch(() => SignCategory.Other);

      // 2. Icon Selection Priority
      let iconUrl: string | null = null;

      // Step A: Check local assets (whole-word matching to avoid false positives)
      // e.g. 'me' must NOT match 'watermelon', only exact 'me' or 'call me'
      const nameLower = name.toLowerCase().trim();

      // First try exact match (highest priority)
      let localMatch = assets.find(a => a.name.toLowerCase().trim() === nameLower);

      // If no exact, try whole-word boundary match (prevents 'me' matching 'watermelon')
      if (!localMatch) {
        const escaped = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameWordBoundary = new RegExp(`(^|[\\s_-])${escaped}([\\s_-]|$)`, 'i');
        localMatch = assets.find(a => {
          const assetName = a.name.toLowerCase().trim();
          // Only match if the sign name appears as a whole word in the asset name
          return nameWordBoundary.test(assetName);
        });
      }

      if (localMatch) {
        iconUrl = localMatch.url;
        setProcessingStatus('Found local asset!');
      }

      // Step B: Search web for icon
      if (!iconUrl) {
        setProcessingStatus('Searching web for icon...');
        iconUrl = await searchWebForIcon(name);
        if (iconUrl) {
          setProcessingStatus('Found icon!');
        }
      }

      // Step C: Generate with AI
      if (!iconUrl) {
        setProcessingStatus('Generating AI sticker...');
        try {
          iconUrl = await generateLiteralIcon(name);
          if (iconUrl) {
            setProcessingStatus('AI icon generated!');
          }
        } catch (e: any) {
          console.warn("AI Generation failed:", e);
        }
      }

      // FINAL CHECK: If no icon, show in-app dialog with upload/retry/skip
      if (!iconUrl || iconUrl.includes('placehold.co')) {
        setIsProcessing(false);
        setProcessingStatus('');

        // Show the icon upload dialog and wait for user choice
        const userChoice = await new Promise<string | null>((resolve) => {
          setIconUploadDialog({ visible: true, signName: name, resolve });
        });

        setIconUploadDialog({ visible: false, signName: '', resolve: null });

        if (userChoice === 'skip') {
          iconUrl = ''; // No icon, proceed without
        } else if (userChoice === 'retry') {
          // Retry icon search + generation
          setIsProcessing(true);
          setProcessingStatus('Retrying icon search...');
          setCreatorState(prev => ({ ...prev, step: 'processing' }));
          iconUrl = await searchWebForIcon(name);
          if (!iconUrl) {
            setProcessingStatus('Retrying AI generation...');
            try { iconUrl = await generateLiteralIcon(name); } catch { /* ignore */ }
          }
          if (!iconUrl) iconUrl = '';
        } else if (userChoice) {
          iconUrl = userChoice; // Data URL from uploaded file
        }

        setIsProcessing(true);
        setProcessingStatus('Continuing...');
        setCreatorState(prev => ({ ...prev, step: 'processing' }));
      }

      // Convert external icon URL to data URL for local display
      // AND upload to Supabase storage for cross-device persistence
      let iconDataUrl = iconUrl; // local display copy
      let iconStorageUrl = iconUrl; // Supabase storage copy
      if (iconUrl.startsWith('http')) {
        setProcessingStatus('Saving icon...');
        const dataUrl = await convertToDataUrl(iconUrl);
        if (dataUrl) {
          iconDataUrl = dataUrl;
        }
      }
      // Upload icon to Supabase storage for persistence
      if (iconUrl.startsWith('data:') || iconUrl.startsWith('blob:') || iconDataUrl.startsWith('data:')) {
        setProcessingStatus('Uploading icon to cloud...');
        try {
          const iconSrc = iconDataUrl.startsWith('data:') ? iconDataUrl : iconUrl;
          const mimeMatch = iconSrc.match(/data:([^;]+);/);
          const ext = mimeMatch ? (mimeMatch[1].split('/')[1] || 'png') : 'png';
          const iconFileName = `icon_${name.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
          const resp = await fetch(iconSrc);
          const blob = await resp.blob();
          if (blob.size > 0) {
            const pubUrl = await supabase.uploadMedia(blob, iconFileName);
            if (pubUrl) {
              iconStorageUrl = pubUrl;
              console.log('[processCreation] ✓ Icon uploaded to Supabase:', pubUrl);
            }
          }
        } catch (e) {
          console.warn('[processCreation] Icon upload failed, using data URL:', e);
          iconStorageUrl = iconDataUrl; // fallback
        }
      }

      // 3. UPLOAD VIDEO to Supabase storage — ALWAYS, regardless of source
      // Whether recorded, uploaded, or from search URL — always put it in Supabase icon bucket
      let finalVideoUrl = url || creatorState.videoUrl || '';
      if (finalVideoUrl) {
        setProcessingStatus('Uploading video...');
        try {
          const ext = finalVideoUrl.match(/\.(mp4|webm|mov|ogg)/i)?.[1] || 'webm';
          const fileName = `video_${name.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
          let uploadBlob: Blob | null = null;

          // Priority 1: Original blob/file from ref (avoids stale React state)
          if (videoBlobRef.current) {
            uploadBlob = videoBlobRef.current;
            console.log('[processCreation] Using blob from ref:', uploadBlob.size, 'bytes');
          }
          // Priority 2: Blob URL — fetch it
          else if (finalVideoUrl.startsWith('blob:')) {
            try {
              const resp = await fetch(finalVideoUrl);
              uploadBlob = await resp.blob();
              console.log('[processCreation] Fetched blob URL:', uploadBlob.size, 'bytes');
            } catch (e) {
              console.warn('[processCreation] Blob URL fetch failed:', e);
            }
          }
          // Priority 3: External URL (from search) — download it
          if (!uploadBlob && finalVideoUrl.startsWith('http')) {
            console.log('[processCreation] Downloading external video:', finalVideoUrl);
            try {
              const resp = await fetch(finalVideoUrl);
              if (resp.ok) {
                uploadBlob = await resp.blob();
                console.log('[processCreation] Downloaded:', uploadBlob.size, 'bytes');
              } else {
                console.warn('[processCreation] Download HTTP', resp.status);
              }
            } catch (e) {
              console.warn('[processCreation] Download failed (likely CORS):', e);
            }
          }

          if (uploadBlob && uploadBlob.size > 0) {
            const publicUrl = await supabase.uploadMedia(uploadBlob, fileName);
            if (publicUrl) {
              console.log('[processCreation] ✓ Video uploaded to Supabase:', publicUrl);
              finalVideoUrl = publicUrl;
            } else {
              console.warn('[processCreation] Upload returned null, keeping original URL');
            }
          } else {
            console.warn('[processCreation] No blob available to upload, keeping URL:', finalVideoUrl);
          }
        } catch (e) {
          console.warn('[processCreation] Failed to upload video, keeping original URL:', e);
        }
      }

      // Wait for category to finish
      const category = await categoryPromise;

      // Save icon as an asset/resource for future use
      const iconAsset: Asset = {
        id: crypto.randomUUID(),
        name: name,
        type: 'icon',
        url: iconStorageUrl, // Use Supabase URL for persistence
        createdAt: Date.now()
      };
      // Only add if not already in assets (avoid duplicates)
      const alreadyExists = assets.some(a => a.name.toLowerCase() === name.toLowerCase() && a.type === 'icon');
      if (!alreadyExists) {
        setAssets(prev => [iconAsset, ...prev]);
        // Sync to cloud
        supabase.upsertAsset(iconAsset).catch(e => console.warn('Asset cloud sync failed:', e));
      }

      const newEmoji: SignEmoji = {
        id: crypto.randomUUID(),
        name: name,
        videoUrl: finalVideoUrl,
        videoBlob: videoBlobRef.current || undefined, // Store original blob for export
        literalIconUrl: iconStorageUrl, // Supabase URL for persistence
        category: category,
        language: searchLanguage || 'ASL',
        createdAt: Date.now()
      };

      // Add to local state
      setLibrary(prev => [newEmoji, ...prev]);

      // Sync to shared storage (localStorage) for same-device cross-app sharing
      const sharedEmoji = {
        id: newEmoji.id,
        name: newEmoji.name,
        videoUrl: newEmoji.videoUrl,
        iconUrl: newEmoji.literalIconUrl, // Map literalIconUrl -> iconUrl for shared format
        category: newEmoji.category,
        language: newEmoji.language,
        createdAt: newEmoji.createdAt,
        sourceApp: 'signmoji' as const,
        videoTransform: newEmoji.videoTransform,
      };
      sharedStorage.saveSharedEmoji(sharedEmoji);

      // Persist full sign emoji to signmoji_assets table for cross-device sync
      setProcessingStatus('Saving to cloud...');
      await supabase.upsertSignEmoji({
        id: newEmoji.id,
        name: newEmoji.name,
        iconUrl: iconStorageUrl,
        videoUrl: finalVideoUrl,
        category: newEmoji.category,
        language: newEmoji.language,
        videoTransform: newEmoji.videoTransform || null,
      });

      console.log('[processCreation] ✓ Complete — video:', finalVideoUrl?.substring(0, 80), '| icon:', iconStorageUrl?.substring(0, 80));

      setCreatorState(prev => ({ ...prev, step: 'complete', category }));
    } catch (e) {
      console.error(e);
      alert("Failed to process sign. Please try again.");
      setCreatorState(prev => ({ ...prev, step: 'preview' }));
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const resetCreator = () => {
    videoBlobRef.current = null;
    setCreatorState({
      step: 'input-selection',
      videoBlob: null,
      videoUrl: null,
      signName: '',
      category: SignCategory.Other
    });
    setSearchQuery('');
    setSearchResults([]);
    setActiveTab('library');
  };

  const renderCreator = () => {
    return (
      <div className="flex flex-col h-full bg-white rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-slate-100">
        <div className="p-4 flex justify-between items-center bg-[#5B4AF4] text-white">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles size={16} /> New SignMoji
          </h2>
          <button onClick={resetCreator} className="hover:bg-white/20 p-1 rounded-full transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 p-3 sm:p-6 overflow-y-auto">
          <div className="h-full w-full border-2 border-dashed border-indigo-200 rounded-2xl p-3 sm:p-6 flex flex-col relative bg-slate-50/50">
            {creatorState.step === 'input-selection' && (
              <div className="flex flex-col items-center justify-center h-full gap-6">
                <div className="text-center mb-2">
                  <h3 className="text-xl font-bold text-slate-800">Create SignMoji</h3>
                  <p className="text-slate-500 text-sm">Select a source to begin</p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-sm">
                  <button onClick={() => handleInputSelect('camera')} className="flex flex-col items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-indigo-500 hover:shadow-md transition group">
                    <div className="p-2 sm:p-3 bg-indigo-50 text-indigo-600 rounded-full group-hover:scale-110 transition shrink-0"><Video size={20} className="sm:w-6 sm:h-6" /></div>
                    <span className="font-medium text-[10px] sm:text-xs text-slate-700">Webcam</span>
                  </button>
                  <button onClick={() => handleInputSelect('upload')} className="flex flex-col items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-indigo-500 hover:shadow-md transition group">
                    <div className="p-2 sm:p-3 bg-purple-50 text-purple-600 rounded-full group-hover:scale-110 transition shrink-0"><Upload size={20} className="sm:w-6 sm:h-6" /></div>
                    <span className="font-medium text-[10px] sm:text-xs text-slate-700">Upload</span>
                  </button>
                  <button onClick={() => handleInputSelect('search')} className="flex flex-col items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-indigo-500 hover:shadow-md transition group">
                    <div className="p-2 sm:p-3 bg-emerald-50 text-emerald-600 rounded-full group-hover:scale-110 transition shrink-0"><Globe size={20} className="sm:w-6 sm:h-6" /></div>
                    <span className="font-medium text-[10px] sm:text-xs text-slate-700">Search</span>
                  </button>
                  <button onClick={() => handleInputSelect('link')} className="flex flex-col items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-indigo-500 hover:shadow-md transition group">
                    <div className="p-2 sm:p-3 bg-orange-50 text-orange-600 rounded-full group-hover:scale-110 transition shrink-0"><LinkIcon size={20} className="sm:w-6 sm:h-6" /></div>
                    <span className="font-medium text-[10px] sm:text-xs text-slate-700">Link</span>
                  </button>
                </div>
              </div>
            )}

            {creatorState.step === 'search' && (
              <div className="flex flex-col h-full">
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <div className="flex gap-2">
                    <div className="relative w-24 flex-shrink-0 bg-white rounded-lg border border-slate-200 shadow-sm">
                      <select value={searchLanguage} onChange={(e) => setSearchLanguage(e.target.value as SignLanguage)} className="w-full pl-3 pr-6 py-2 rounded-lg bg-transparent font-bold text-xs text-slate-700 outline-none appearance-none">
                        <option value="ASL">ASL</option><option value="PSL">PSL</option><option value="BSL">BSL</option><option value="Other">Other</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <div className="relative flex-1 bg-white rounded-lg border border-slate-200 shadow-sm flex items-center min-w-[120px]">
                      <Search className="ml-2 text-slate-400" size={14} /><input type="text" placeholder="e.g. hello" className="w-full pl-1.5 pr-2 py-2 bg-transparent outline-none text-xs font-medium text-slate-900" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                    </div>
                  </div>
                  <button onClick={handleSearch} disabled={isSearching || !searchQuery} className="w-full sm:w-auto px-5 py-2 bg-[#5B4AF4] text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition text-xs shadow-sm">
                    {isSearching ? <Loader2 className="animate-spin mx-auto" size={14} /> : 'Search'}
                  </button>
                </div>



                <div className="flex-1 overflow-y-auto pr-1">
                  {isSearching ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400"><Loader2 size={32} className="animate-spin mb-3" /><p className="text-sm">Finding video clips...</p></div>
                  ) : searchResults.length > 0 ? (
                    <>
                    <div className="grid grid-cols-2 gap-3 pb-2">
                      {searchResults.map((result, idx) => (
                        <div key={idx} onClick={() => !failedVideoLinks.has(result.uri) && selectSearchResult(result)} className={`bg-slate-100 border border-slate-200 rounded-lg overflow-hidden cursor-pointer hover:border-indigo-400 transition group aspect-video relative flex flex-col ${failedVideoLinks.has(result.uri) ? 'opacity-50 pointer-events-none' : ''}`}>
                          {isYouTube(result.uri) ? (
                            <iframe src={getEmbedUrl(result.uri)} className="w-full h-full object-cover bg-black pointer-events-none" onError={() => handleVideoError(result.uri)} />
                          ) : isVideoFile(result.uri) ? (
                            <video
                              src={result.uri}
                              className="w-full h-full object-cover bg-black"
                              muted loop playsInline preload="metadata"
                              onMouseOver={e => e.currentTarget.play().catch(() => {})}
                              onMouseOut={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                              onError={() => handleVideoError(result.uri)}
                              onLoadStart={e => {
                                // Timeout: if video doesn't load metadata within 5s, mark as failed
                                const vid = e.currentTarget;
                                const timer = setTimeout(() => {
                                  if (vid.readyState === 0) handleVideoError(result.uri);
                                }, 5000);
                                vid.addEventListener('loadeddata', () => clearTimeout(timer), { once: true });
                              }}
                            />
                          ) : (
                            // Web page — show preview card, click to expand into interactive iframe viewer
                            <div
                              className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 text-white px-3 text-center gap-2"
                              onClick={e => { e.stopPropagation(); setExpandedWebResult(result); setManualVideoUrl(''); }}
                            >
                              <Globe size={24} className="text-indigo-300" />
                              <p className="text-[10px] font-medium leading-tight opacity-80 line-clamp-2">{result.title}</p>
                              <span className="text-[9px] bg-white/10 px-2 py-0.5 rounded-full">Tap to browse &amp; find video</span>
                            </div>
                          )}
                          {failedVideoLinks.has(result.uri) ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800/90 text-white px-3 text-center gap-1">
                              <AlertCircle size={20} className="text-amber-400" />
                              <p className="text-[9px] opacity-80">Video unavailable</p>
                              <a href={result.uri} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[9px] text-indigo-300 underline pointer-events-auto">Open link ↗</a>
                            </div>
                          ) : null}
                          <div className="absolute bottom-0 left-0 w-full p-2 bg-gradient-to-t from-black/60 to-transparent"><p className="text-[10px] text-white font-medium truncate">{result.title}</p></div>
                        </div>
                      ))}
                    </div>

                    {/* Expanded Web Page Viewer */}
                    {expandedWebResult && (
                      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setExpandedWebResult(null)}>
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                          {/* Header */}
                          <div className="flex items-center justify-between px-4 py-2 bg-slate-100 border-b border-slate-200">
                            <div className="flex items-center gap-2 min-w-0">
                              <Globe size={14} className="text-indigo-500 shrink-0" />
                              <p className="text-xs font-semibold text-slate-700 truncate">{expandedWebResult.title}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <a href={expandedWebResult.uri} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1"><ExternalLink size={11} /> Open in new tab</a>
                              <button onClick={() => setExpandedWebResult(null)} className="p-1 hover:bg-slate-200 rounded-full transition"><X size={16} /></button>
                            </div>
                          </div>

                          {/* Interactive iframe — user can scroll/browse */}
                          <div className="flex-1 bg-white relative">
                            <iframe
                              src={expandedWebResult.uri}
                              className="w-full h-full border-0"
                              title={expandedWebResult.title}
                              sandbox="allow-scripts allow-same-origin allow-popups"
                            />
                          </div>

                          {/* Footer: paste video URL or use page URL */}
                          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col gap-2">
                            <p className="text-[10px] text-slate-500">
                              {'Browse the page above to find a video. Right-click a video → "Copy video address", then paste below. Or use the page URL directly.'}
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Paste direct video URL (.mp4) here..."
                                value={manualVideoUrl}
                                onChange={e => setManualVideoUrl(e.target.value)}
                                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                              />
                              <button
                                onClick={() => {
                                  const url = manualVideoUrl.trim() || expandedWebResult.uri;
                                  setExpandedWebResult(null);
                                  selectSearchResult({ title: expandedWebResult.title, uri: url });
                                }}
                                className="px-4 py-2 bg-[#5B4AF4] text-white rounded-lg font-bold text-xs hover:bg-indigo-700 transition whitespace-nowrap"
                              >
                                {manualVideoUrl.trim() ? 'Use this URL' : 'Use page URL'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    </>
                  ) : (<div className="h-full flex flex-col items-center justify-center text-slate-400"><p className="text-xs">No videos found. Try common words.</p></div>)}
                </div>
              </div>
            )}

            {creatorState.step === 'recording' && (
              <div className="h-full rounded-xl overflow-hidden bg-slate-900"><Recorder mode="camera" onRecordingComplete={handleRecordingComplete} onCancel={() => setCreatorState(prev => ({ ...prev, step: 'input-selection' }))} /></div>
            )}

            {creatorState.step === 'preview' && (
              <div className="flex flex-col h-full gap-4">
                <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center relative shadow-inner">
                  {creatorState.videoUrl && (
                    isYouTube(creatorState.videoUrl) ? (
                      <iframe src={getEmbedUrl(creatorState.videoUrl)} className="w-full h-full object-contain" />
                    ) : isVideoFile(creatorState.videoUrl) ? (
                      <video src={creatorState.videoUrl} autoPlay loop muted className="max-h-full max-w-full object-contain" />
                    ) : (
                      <iframe src={creatorState.videoUrl} className="w-full h-full object-contain" />
                    )
                  )}
                </div>
                <div className="space-y-3">
                  <input type="text" placeholder="Name your sign..." className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-lg font-bold" value={creatorState.signName} onChange={(e) => setCreatorState(prev => ({ ...prev, signName: e.target.value }))} />
                  <div className="flex gap-2">
                    <button onClick={() => setCreatorState(prev => ({ ...prev, step: 'input-selection', videoUrl: null }))} className="px-4 py-3 border border-slate-300 rounded-lg font-medium text-slate-600 hover:bg-slate-50 transition">Back</button>
                    <button onClick={() => processCreation(creatorState.signName, creatorState.videoUrl!)} disabled={!creatorState.signName} className="flex-1 py-3 bg-[#5B4AF4] text-white rounded-lg font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2">Generate SignMoji <Sparkles size={16} /></button>
                  </div>
                </div>
              </div>
            )}

            {creatorState.step === 'processing' && (
              <div className="flex flex-col items-center justify-center h-full text-center"><Loader2 size={48} className="text-[#5B4AF4] animate-spin mb-4" /><h3 className="text-lg font-bold text-slate-800">Processing...</h3><p className="text-slate-500 text-sm mt-1">{processingStatus}</p></div>
            )}

            {creatorState.step === 'complete' && (
              <div className="flex flex-col items-center justify-center h-full text-center animate-in zoom-in-95 duration-500">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4"><CheckCircle size={32} /></div>
                <h3 className="text-xl font-bold text-slate-800">Done!</h3><p className="text-slate-500 text-sm mt-1 mb-6">Added to your library and synced to SilentEar.</p>
                <div className="flex gap-3 w-full">
                  <button onClick={() => { setCreatorState(prev => ({ ...prev, step: 'input-selection', videoUrl: null, signName: '' })); setSearchQuery(''); setSearchResults([]); }} className="flex-1 py-2.5 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 text-sm">Create New</button>
                  <button onClick={resetCreator} className="flex-1 py-2.5 bg-[#5B4AF4] text-white rounded-lg font-medium hover:bg-indigo-700 text-sm">View Library</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-full flex bg-[#1E1E2E] text-slate-100 overflow-hidden relative">
      {/* Sidebar - Mobile: Overlay, Desktop: Fixed */}
      <div className={`
        fixed inset-y-0 left-0 z-[100] w-64 bg-[#1E1E2E] flex flex-col flex-shrink-0 border-r border-white/5 transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#5B4AF4] rounded-lg flex items-center justify-center shadow-lg">
              <span className="font-bold text-lg text-white">S</span>
            </div>
            <h1 className="font-bold text-lg text-white">SignMoji</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-2">
          <button onClick={() => { if (activeTab === 'creator') resetCreator(); setActiveTab('library'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 p-3 rounded-lg transition text-sm ${activeTab === 'library' ? 'text-white font-medium bg-white/5' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <LibraryIcon size={18} /><span>Library</span>
          </button>
          <button onClick={() => { setActiveTab('interpreter'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 p-3 rounded-lg transition text-sm ${activeTab === 'interpreter' ? 'text-white font-medium bg-white/5' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Video size={18} /><span>Live Interpreter</span>
          </button>
          <button onClick={() => { setActiveTab('creator'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 p-3 rounded-lg transition text-sm mt-4 ${activeTab === 'creator' ? 'bg-[#5B4AF4] text-white shadow-lg' : 'text-slate-400 hover:text-white border border-dashed border-white/10'}`}>
            <Plus size={18} /><span className="font-medium">Create New</span>
          </button>
        </nav>
        <div className="p-4 mt-auto space-y-3">
          <button
            onClick={() => window.location.href = '../index.html'}
            className="w-full flex items-center gap-3 p-3 rounded-lg transition text-sm text-indigo-400 hover:text-white hover:bg-indigo-500/10 border border-indigo-500/20"
          >
            <ArrowLeft size={18} /><span>Back to SilentEar</span>
          </button>
          <div className="bg-[#27273A] rounded-xl p-4">
            <h4 className="text-[10px] font-bold uppercase text-slate-500 mb-2">SilentEar Sync</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">Cross-origin sync is now ACTIVE via Relay Server.</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-bold">Relay Connected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] md:hidden animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <main className="flex-1 relative bg-[#F3F4F6] overflow-hidden flex flex-col">
        {/* Mobile Header Bar */}
        <div className="md:hidden flex items-center justify-between px-3 py-2 bg-[#1E1E2E] text-white border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => window.location.href = '../index.html'}
              className="p-2 text-slate-400 hover:text-white"
              title="Back to SilentEar"
            >
              <ArrowLeft size={20} />
            </button>
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-slate-400 hover:text-white"
              title="Open menu"
            >
              <LibraryIcon size={18} />
            </button>
          </div>
          <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1">
            <button
              onClick={() => { if (activeTab === 'creator') resetCreator(); setActiveTab('library'); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${activeTab === 'library' ? 'bg-[#5B4AF4] text-white shadow' : 'text-slate-400'}`}
            >
              Library
            </button>
            <button
              onClick={() => setActiveTab('interpreter')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${activeTab === 'interpreter' ? 'bg-[#5B4AF4] text-white shadow' : 'text-slate-400'}`}
            >
              Live
            </button>
            <button
              onClick={() => setActiveTab('creator')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${activeTab === 'creator' ? 'bg-[#5B4AF4] text-white shadow' : 'text-slate-400'}`}
            >
              + New
            </button>
          </div>
          <div className="w-8" />
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === 'library' && (
            <div className="h-full w-full">
              <Library
                emojis={library}
                assets={assets}
                onSelect={(emoji) => console.log('Selected:', emoji)}
                onAddAsset={handleAddAsset}
                onRemoveAsset={handleRemoveAsset}
                onRenameAsset={handleRenameAsset}
                onUpdate={handleUpdateEmoji}
                onRemove={handleRemoveEmoji}
                onDelink={handleDelinkEmoji}
              />
            </div>
          )}
          {activeTab === 'interpreter' && (
            <div className="h-full w-full">
              <LiveInterpreter emojis={library} />
            </div>
          )}
        </div>
        {activeTab === 'creator' && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-8 bg-black/40 backdrop-blur-md">
            <div className="w-full md:max-w-4xl h-full md:max-h-[600px] shadow-2xl md:rounded-2xl overflow-hidden">{renderCreator()}</div>
          </div>
        )}
      </main>

      {/* Icon Upload Dialog — shown when icon can't be found/generated */}
      {iconUploadDialog.visible && (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => {}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="p-5 text-center">
              <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">No Icon Found</h3>
              <p className="text-sm text-slate-500 mb-5">
                Could not find or generate an icon for "<span className="font-semibold text-slate-700">{iconUploadDialog.signName}</span>".
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = () => {
                      if (input.files && input.files[0]) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          iconUploadDialog.resolve?.(reader.result as string);
                        };
                        reader.onerror = () => iconUploadDialog.resolve?.('skip');
                        reader.readAsDataURL(input.files[0]);
                      }
                    };
                    input.oncancel = () => {}; // Keep dialog open, don't dismiss
                    input.click();
                  }}
                  className="w-full py-3 bg-[#5B4AF4] text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                >
                  <Upload size={16} /> Upload Icon
                </button>
                <button
                  onClick={() => iconUploadDialog.resolve?.('retry')}
                  className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition flex items-center justify-center gap-2"
                >
                  <Search size={16} /> Retry Search
                </button>
                <button
                  onClick={() => iconUploadDialog.resolve?.('skip')}
                  className="w-full py-2.5 text-slate-400 rounded-xl font-medium text-xs hover:text-slate-600 transition"
                >
                  Skip — Continue without icon
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

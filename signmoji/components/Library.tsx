
import React, { useState, useEffect, useRef } from 'react';
import { SignEmoji, SignCategory, Asset, SignLanguage, getAllCategories, addCustomCategory } from '../types';
import { Search, Download, Video as VideoIcon, Loader2, Image as ImageIcon, FileImage, FileCode, CircleDot, MoreVertical, ExternalLink, Trash2, Plus, Grid, Move, Ear, Send, CheckCircle2, AlertTriangle, Maximize, ArrowsUpFromLine, ArrowLeftRight, RotateCcw, ZoomIn, ZoomOut, Globe, Edit3, Check, X } from 'lucide-react';
import { ExportPanel } from './ExportPanel';
import { sharedStorage } from '@shared/storageService';
import { isVideoFile, isYouTube, getYouTubeEmbedUrl } from '@shared/videoUtils';
import { searchWebIcons, type IconSearchResult } from '../services/geminiService';

// Error boundary to prevent a single broken card from crashing the whole library
class CardErrorBoundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: any) { console.warn('SignCard error:', err); }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="bg-white rounded-3xl shadow-sm border border-red-100 p-6 flex flex-col items-center justify-center text-center">
          <AlertTriangle className="text-amber-400 mb-2" size={24} />
          <p className="text-xs text-slate-500">Failed to render card</p>
        </div>
      );
    }
    return this.props.children;
  }
}

interface LibraryProps {
  emojis: SignEmoji[];
  assets: Asset[];
  onSelect: (emoji: SignEmoji) => void;
  onAddAsset: (files: FileList | File[]) => void;
  onRemoveAsset: (id: string) => void;
  onRenameAsset?: (id: string, newName: string) => void;
  onUpdate: (id: string, updates: Partial<SignEmoji>) => void;
  onRemove: (id: string) => void;
  onDelink: (id: string) => void;
}

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise(async (resolve, reject) => {
    // If data URL, load directly
    if (url.startsWith('data:')) {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error(`Failed to load image: ${url.substring(0, 50)}`));
      img.src = url;
      return;
    }

    // For external URLs, try direct first, then proxy to handle CORS
    const tryLoadDirect = () => {
      return new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('Direct load failed'));
        img.src = url;
      });
    };

    const tryLoadViaProxy = async () => {
      throw new Error('External proxy loading removed — use locally uploaded or Supabase-hosted assets');
    };

    try {
      const img = await tryLoadDirect();
      resolve(img);
    } catch {
      try {
        const img = await tryLoadViaProxy();
        resolve(img);
      } catch (err) {
        reject(new Error(`Failed to load image after proxy attempts: ${url.substring(0, 50)}`));
      }
    }
  });
};

const SignCard: React.FC<{
  emoji: SignEmoji;
  onSelect: (e: SignEmoji) => void;
  onUpdate: (id: string, updates: Partial<SignEmoji>) => void;
  recordEmoji: (e: SignEmoji, containerWidth?: number) => void;
  recordingId: string | null;
  recordingStatus: string;
  activeMenuId: string | null;
  setActiveMenuId: (id: string | null) => void;
  handleAction: (e: React.MouseEvent, emoji: SignEmoji, type: string) => void;
  isYouTube: (url: string) => boolean;
  isVideoFile: (url: string) => boolean;
  getEmbedUrl: (url: string) => string;
  onExportToSilentEar: (emoji: SignEmoji) => void;
  isExported: boolean;
  onRemove: (id: string) => void;
  onDelink: (id: string) => void;
}> = ({ emoji, onSelect, onUpdate, recordEmoji, recordingId, recordingStatus, activeMenuId, setActiveMenuId, handleAction, isYouTube, isVideoFile, getEmbedUrl, onExportToSilentEar, isExported, onRemove, onDelink }) => {
  const [videoError, setVideoError] = useState(false);

  // Reset error when URL changes
  useEffect(() => {
    setVideoError(false);
  }, [emoji.videoUrl]);

  // Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  // Default scale 1.0 to show full video initially (object-contain)
  const [transform, setTransform] = useState(emoji.videoTransform || { x: 0, y: 0, scale: 1.0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showAdjust, setShowAdjust] = useState(false);

  useEffect(() => {
    if (!isDragging && emoji.videoTransform) {
      setTransform(emoji.videoTransform);
    }
  }, [emoji.videoTransform, isDragging]);

  // Quick adjust presets
  const applyPreset = (preset: 'fit-height' | 'fit-width' | 'fill' | 'reset' | 'zoom-in' | 'zoom-out') => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    const cw = container.offsetWidth;
    const ch = container.offsetHeight;
    // Get intrinsic video dimensions
    const vw = video?.videoWidth || cw;
    const vh = video?.videoHeight || ch;
    const vRatio = vw / vh;
    const cRatio = cw / ch;

    let newTransform = { x: 0, y: 0, scale: 1.0 };

    switch (preset) {
      case 'fit-height': {
        // Scale so video height fills container height
        const fitScale = cRatio > vRatio ? (ch / (cw / vRatio)) : 1.0;
        // For wide videos, scale up so height fills
        const scale = vRatio > cRatio ? (1 / (vRatio / cRatio)) * (ch / (ch * (1 / (vRatio / cRatio)))) : 1.0;
        // Simpler: just compute the needed scale
        // object-contain fits the largest dimension. If video is wider than container, height will have gaps.
        // To fill height: scale = containerAspect / videoAspect when video is wider
        const s = vRatio > cRatio ? vRatio / cRatio : 1.0;
        newTransform = { x: 0, y: 0, scale: s };
        break;
      }
      case 'fit-width': {
        // Scale so video width fills container width
        const s = vRatio < cRatio ? cRatio / vRatio : 1.0;
        newTransform = { x: 0, y: 0, scale: s };
        break;
      }
      case 'fill': {
        // Scale to cover entire container (no gaps)
        const s = Math.max(cRatio / vRatio, vRatio / cRatio);
        newTransform = { x: 0, y: 0, scale: Math.max(s, 1.0) };
        break;
      }
      case 'zoom-in': {
        const s = Math.min(5, transform.scale + 0.3);
        newTransform = { ...transform, scale: s };
        break;
      }
      case 'zoom-out': {
        const s = Math.max(0.5, transform.scale - 0.3);
        newTransform = { ...transform, scale: s };
        break;
      }
      case 'reset':
      default:
        newTransform = { x: 0, y: 0, scale: 1.0 };
        break;
    }

    setTransform(newTransform);
    onUpdate(emoji.id, { videoTransform: newTransform });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow drag on left click and if not clicking a button
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    setTransform(prev => ({ ...prev, x: newX, y: newY }));
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      onUpdate(emoji.id, { videoTransform: transform });
    }
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
      onUpdate(emoji.id, { videoTransform: transform });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const scaleAmount = -e.deltaY * 0.001;
    const newScale = Math.max(0.5, Math.min(5, transform.scale + scaleAmount));

    setTransform(prev => ({
      ...prev,
      scale: newScale
    }));

    onUpdate(emoji.id, { videoTransform: { ...transform, scale: newScale } });
  };

  return (
    <div
      className="group relative bg-white rounded-3xl shadow-sm border border-slate-100 hover:shadow-2xl transition-all duration-300 flex flex-col overflow-visible"
      onClick={() => onSelect(emoji)}
      style={{ zIndex: activeMenuId === emoji.id ? 100 : 10 }}
    >
      {/* Media Part */}
      <div
        ref={containerRef}
        className="aspect-[4/5] relative bg-black rounded-t-3xl overflow-hidden flex-shrink-0 cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      >
        <div
          className="w-full h-full pointer-events-none"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          {videoError ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 px-6 text-center">
              <AlertTriangle className="text-amber-500 mb-2" size={32} />
              <p className="text-white/80 text-[10px] font-medium leading-tight">Could not load video source</p>
              <a href={emoji.videoUrl} target="_blank" rel="noopener noreferrer" className="mt-3 pointer-events-auto px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full text-[10px] text-white transition-colors">
                View Original
              </a>
            </div>
          ) : isYouTube(emoji.videoUrl) ? (
            <iframe
              src={getYouTubeEmbedUrl(emoji.videoUrl)}
              className="w-full h-full object-contain bg-black pointer-events-none"
              title={emoji.name}
              onError={() => setVideoError(true)}
            />
          ) : isVideoFile(emoji.videoUrl) ? (
            <video
              ref={videoRef}
              id={`video-${emoji.id}`}
              src={emoji.videoUrl}
              className="w-full h-full object-contain bg-black pointer-events-none"
              autoPlay loop muted playsInline
              onError={() => setVideoError(true)}
            />
          ) : (
            <iframe
              src={emoji.videoUrl}
              className="w-full h-full object-contain bg-black pointer-events-none scale-[1.0] origin-top-left"
              title={emoji.name}
              onError={() => setVideoError(true)}
            />
          )}
        </div>

        {/* Overlay Icon */}
        <div className="absolute bottom-4 right-4 w-[35%] aspect-square drop-shadow-2xl pointer-events-none z-10 transition-transform group-hover:scale-110">
          <img src={emoji.literalIconUrl} className="w-full h-full object-contain filter drop-shadow-lg" alt={emoji.name} onError={(e) => e.currentTarget.style.display = 'none'} />
        </div>

        {/* Hint for Dragging */}
        <div className="absolute top-2 right-2 p-1.5 bg-black/30 rounded-full text-white/50 opacity-0 group-hover:opacity-100 transition pointer-events-none backdrop-blur-sm">
          <Move size={12} />
        </div>

        {/* Quick Adjust Toolbar */}
        <div className="absolute bottom-2 left-2 z-20 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto">
          <div className="flex items-center gap-1 bg-black/70 backdrop-blur-md rounded-xl p-1 shadow-2xl border border-white/10">
            <button
              onClick={e => { e.stopPropagation(); applyPreset('fit-height'); }}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              title="Fit Height — fill vertical space"
            >
              <ArrowsUpFromLine size={13} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); applyPreset('fit-width'); }}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              title="Fit Width — fill horizontal space"
            >
              <ArrowLeftRight size={13} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); applyPreset('fill'); }}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              title="Fill — cover entire area"
            >
              <Maximize size={13} />
            </button>
            <div className="w-px h-4 bg-white/20 mx-0.5"></div>
            <button
              onClick={e => { e.stopPropagation(); applyPreset('zoom-in'); }}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              title="Zoom In"
            >
              <ZoomIn size={13} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); applyPreset('zoom-out'); }}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              title="Zoom Out"
            >
              <ZoomOut size={13} />
            </button>
            <div className="w-px h-4 bg-white/20 mx-0.5"></div>
            <button
              onClick={e => { e.stopPropagation(); applyPreset('reset'); }}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              title="Reset to default"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        {/* Recording Overlay */}
        {recordingId === emoji.id && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-20 backdrop-blur-sm pointer-events-auto cursor-default">
            <div className="bg-white/10 p-4 rounded-full mb-3 animate-pulse">
              <Loader2 size={32} className="text-white animate-spin" />
            </div>
            <span className="font-bold text-white tracking-wide text-sm">{recordingStatus || 'Processing...'}</span>
            <p className="text-white/60 text-xs mt-2 font-medium">Please wait</p>
          </div>
        )}
      </div>

      {/* Actions Overlay - Hidden on mobile unless active menu, or shown on desktop hover */}
      <div className={`
        absolute top-2 right-2 z-20 pointer-events-none transition-opacity duration-300 flex items-center gap-2
        ${activeMenuId === emoji.id ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}
      `}>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            onClick={e => { e.stopPropagation(); onExportToSilentEar(emoji); }}
            className={`p-2 rounded-xl shadow-lg border transition-all hover:scale-110 ${isExported
              ? 'bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-600'
              : 'bg-white/90 backdrop-blur text-indigo-600 border-white/50 hover:bg-indigo-50'
              }`}
            title="Export to SilentEar as alert trigger"
          >
            {isExported ? <CheckCircle2 size={15} /> : <Ear size={15} />}
          </button>

          <button
            onClick={e => { e.stopPropagation(); recordEmoji(emoji, containerRef.current?.offsetWidth); }}
            disabled={!!recordingId}
            className={`p-2 bg-white/90 backdrop-blur rounded-xl shadow-lg border border-white/50 hover:scale-110 hover:bg-indigo-50 hover:text-indigo-600 transition-all disabled:opacity-50 ${!isVideoFile(emoji.videoUrl) ? 'opacity-50 grayscale' : ''}`}
            title="Record"
          >
            <CircleDot size={15} className="text-red-500" />
          </button>

          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setActiveMenuId(activeMenuId === emoji.id ? null : emoji.id); }}
              className="p-2 bg-white/90 backdrop-blur rounded-xl shadow-lg border border-white/50 hover:bg-slate-50 transition-all"
            >
              <MoreVertical size={15} className="text-slate-600" />
            </button>

            {activeMenuId === emoji.id && (
              <div className="absolute top-full mt-2 right-0 w-48 sm:w-52 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-[200] animate-in fade-in slide-in-from-top-4 duration-300">
                <button onClick={e => { e.stopPropagation(); onExportToSilentEar(emoji); setActiveMenuId(null); }} className="w-full px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs hover:bg-indigo-50 flex items-center gap-3 text-indigo-600 border-b border-slate-100 font-semibold">
                  <Ear size={14} />
                  {isExported ? 'Edit SilentEar Link' : 'Export to SilentEar'}
                </button>
                {isExported && (
                  <button onClick={e => { e.stopPropagation(); onDelink(emoji.id); setActiveMenuId(null); }} className="w-full px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs hover:bg-orange-50 flex items-center gap-3 text-orange-600 border-b border-slate-100 font-semibold">
                    <ExternalLink size={14} /> Delink from SilentEar
                  </button>
                )}
                <button onClick={e => handleAction(e, emoji, 'video')} className="w-full px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs hover:bg-slate-50 flex items-center gap-3 text-slate-700 border-b border-slate-50">
                  {isVideoFile(emoji.videoUrl) ? <VideoIcon size={14} /> : <ExternalLink size={14} />}
                  {isVideoFile(emoji.videoUrl) ? 'Original Video' : 'Open Source'}
                </button>
                <button onClick={e => handleAction(e, emoji, 'png')} className="w-full px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs hover:bg-slate-50 flex items-center gap-3 text-slate-700 border-b border-slate-50">
                  <FileImage size={14} /> PNG Sticker
                </button>
                <button onClick={e => { e.stopPropagation(); onRemove(emoji.id); setActiveMenuId(null); }} className="w-full px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs hover:bg-red-50 flex items-center gap-3 text-red-600 font-semibold">
                  <Trash2 size={14} /> Delete SignMoji
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 bg-white rounded-b-3xl flex-1 flex flex-col justify-between">
        {/* Editable Name */}
        <input
          type="text"
          value={emoji.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onUpdate(emoji.id, { name: e.target.value })}
          className="w-full font-bold text-slate-900 text-lg tracking-tight bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 outline-none transition-colors mb-2 pb-1 truncate"
        />

        <div className="flex items-center gap-3 mt-1">
          {/* Category Badge - Editable */}
          <div className="relative group/cat" onClick={e => e.stopPropagation()}>
            <select
              value={emoji.category || 'Other'}
              onChange={(e) => onUpdate(emoji.id, { category: e.target.value as SignCategory })}
              className="text-[10px] pl-2.5 pr-1 py-1 bg-slate-100 text-slate-500 font-black uppercase tracking-widest rounded-lg appearance-none cursor-pointer hover:bg-slate-200 hover:text-slate-700 outline-none transition-colors border border-transparent"
            >
              {getAllCategories().map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 h-[1px] bg-slate-100"></div>

          {/* Editable Language Badge */}
          <div className="relative group/lang" onClick={e => e.stopPropagation()}>
            <select
              value={emoji.language || 'ASL'}
              onChange={(e) => onUpdate(emoji.id, { language: e.target.value as SignLanguage })}
              className="text-[10px] pl-2.5 pr-1 py-1 bg-slate-50 text-slate-400 font-bold uppercase tracking-widest rounded-lg appearance-none cursor-pointer hover:bg-slate-100 hover:text-indigo-600 outline-none transition-colors border border-transparent hover:border-slate-200"
            >
              <option value="ASL">ASL</option>
              <option value="PSL">PSL</option>
              <option value="BSL">BSL</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
        </div>
      </div>
    </div>
  );
};

export const Library: React.FC<LibraryProps> = ({ emojis, assets, onSelect, onAddAsset, onRemoveAsset, onRenameAsset, onUpdate, onRemove, onDelink }) => {
  const [tab, setTab] = useState<'signs' | 'assets'>('signs');
  const [filter, setFilter] = useState<SignCategory | 'All'>('All');
  const [search, setSearch] = useState('');
  const [allCategories, setAllCategories] = useState<string[]>(getAllCategories());
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const newCatInputRef = useRef<HTMLInputElement>(null);
  const [perPage, setPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      const updated = addCustomCategory(newCategoryName.trim());
      setAllCategories(updated);
      setNewCategoryName('');
      setIsAddingCategory(false);
    }
  };
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string>('');

  // SilentEar Integration State
  const [exportPanelEmoji, setExportPanelEmoji] = useState<SignEmoji | null>(null);
  const [exportedIds, setExportedIds] = useState<Set<string>>(new Set());

  // Web Icon Search State
  const [iconSearchQuery, setIconSearchQuery] = useState('');
  const [iconSearchResults, setIconSearchResults] = useState<IconSearchResult[]>([]);
  const [isSearchingIcons, setIsSearchingIcons] = useState(false);
  const [editingIconName, setEditingIconName] = useState<string | null>(null); // URL of icon being renamed
  const [editIconNameValue, setEditIconNameValue] = useState('');

  // Load exported IDs on mount
  useEffect(() => {
    const triggers = sharedStorage.getSharedTriggers();
    const ids = new Set(triggers.filter(t => t.linkedSignEmoji).map(t => t.linkedSignEmoji!));
    setExportedIds(ids);

    // Subscribe to updates
    const unsubscribe = sharedStorage.subscribe('all', () => {
      const updatedTriggers = sharedStorage.getSharedTriggers();
      const updatedIds = new Set(updatedTriggers.filter(t => t.linkedSignEmoji).map(t => t.linkedSignEmoji!));
      setExportedIds(updatedIds);
    });

    return () => unsubscribe();
  }, []);

  const handleExportToSilentEar = (emoji: SignEmoji) => {
    setExportPanelEmoji(emoji);
    setActiveMenuId(null);
  };

  const handleExportPanelClose = () => {
    setExportPanelEmoji(null);
    // Refresh exported IDs
    const triggers = sharedStorage.getSharedTriggers();
    const ids = new Set(triggers.filter(t => t.linkedSignEmoji).map(t => t.linkedSignEmoji!));
    setExportedIds(ids);
  };

  // Web Icon Search handlers
  const handleIconSearch = async () => {
    if (!iconSearchQuery.trim()) return;
    setIsSearchingIcons(true);
    setIconSearchResults([]);
    try {
      const results = await searchWebIcons(iconSearchQuery.trim());
      setIconSearchResults(results);
    } catch (error) {
      console.error('Icon search failed:', error);
    } finally {
      setIsSearchingIcons(false);
    }
  };

  const handleAddIconToResources = (icon: IconSearchResult, customName?: string) => {
    const name = customName || icon.name;
    const url = icon.dataUrl || icon.url;
    // Create a File-like object from the data URL for the onAddAsset callback
    // But since onAddAsset expects FileList, we'll add the asset directly
    const newAsset: Asset = {
      id: crypto.randomUUID(),
      name: name,
      type: 'icon' as const,
      url: url,
      createdAt: Date.now()
    };
    // We need to add via parent — convert to a synthetic file and use onAddAsset
    // Actually, we can call onAddAsset with a synthetic File array
    if (icon.dataUrl) {
      // Convert data URL to File
      const arr = icon.dataUrl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const file = new File([u8arr], `${name.replace(/\s+/g, '_')}.png`, { type: mime });
      // Attach name override to file object
      Object.defineProperty(file, '_assetName', { value: name, writable: true });
      onAddAsset([file]);
    }
    setEditingIconName(null);
  };

  const filteredEmojis = emojis.filter(e => {
    const matchesCategory = filter === 'All' || e.category === filter;
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredEmojis.length / perPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedEmojis = filteredEmojis.slice((safeCurrentPage - 1) * perPage, safeCurrentPage * perPage);


  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 250);
  };

  const handleExportJson = () => {
    if (emojis.length === 0) {
      alert("Your library is empty. Create some SignMojis first!");
      return;
    }
    const jsonString = JSON.stringify(emojis, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    triggerDownload(blob, `signmoji_library_${new Date().toISOString().split('T')[0]}.json`);
  };

  const recordEmoji = async (emoji: SignEmoji, containerWidth: number = 300) => {
    if (!isVideoFile(emoji.videoUrl)) {
      alert("High-quality recording is only available for direct video files.");
      return;
    }

    setRecordingId(emoji.id);
    setActiveMenuId(null);
    setRecordingStatus('Preparing...');

    let objectUrl: string | null = null;
    let video: HTMLVideoElement | null = null;

    try {
      // 1. Prepare Video Source (Handle CORS)
      let videoSrc = emoji.videoUrl;

      // If remote URL, fetch as blob to avoid tainted canvas. Use proxy fallback if direct fetch fails.
      if (!emoji.videoUrl.startsWith('blob:') && !emoji.videoUrl.startsWith('data:')) {
        try {
          // Attempt 1: Direct Fetch (works if server supports CORS)
          const response = await fetch(emoji.videoUrl, { method: 'GET', mode: 'cors' });
          if (!response.ok) throw new Error("Direct fetch failed");
          const blob = await response.blob();
          if (blob.type.includes('text/html')) throw new Error("Received HTML instead of video");

          objectUrl = URL.createObjectURL(blob);
          videoSrc = objectUrl;
        } catch (e) {
          // Direct fetch failed and no proxy fallback available
          throw new Error(`Cannot record this video. The source website (${new URL(emoji.videoUrl).hostname}) prevents access. Try uploading a video file instead.`);
        }
      }

      // 2. Setup Detached Video Element
      video = document.createElement('video');
      video.src = videoSrc;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous'; // Important for canvas

      await new Promise((resolve, reject) => {
        if (!video) return reject("No video");
        video.onloadedmetadata = resolve;
        video.onerror = () => reject("Failed to load video media");
      });

      // 3. Setup Canvas for Recording (WYSIWYG)
      const width = 480;
      const videoHeight = 600; // 4:5 Aspect Ratio
      const footerHeight = 140; // Space for text
      const height = videoHeight + footerHeight;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error("Canvas context failed");

      // Calculate scale factor between UI coordinate space and Canvas coordinate space
      const scaleFactor = width / (containerWidth || 320);

      // 4. Load Icon Overlay
      let icon: HTMLImageElement | null = null;
      try {
        icon = await loadImage(emoji.literalIconUrl);
      } catch (e) { console.warn("Could not load icon for recording"); }

      // 5. Setup Recorder
      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'video/webm' });
          triggerDownload(blob, `${emoji.name}_animated.webm`);
        } else {
          alert("Recording failed: Output was empty.");
        }
        setRecordingId(null);
        setRecordingStatus('');
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };

      // 6. Draw Loop
      const drawFrame = () => {
        if (!ctx || !video || video.paused || video.ended) return;

        // Fill Full Background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Fill Video Area Background (Black)
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, videoHeight);

        // Calculate 'Object Contain' placement for untransformed video
        const vRatio = video.videoWidth / video.videoHeight;
        const cRatio = width / videoHeight;
        let dw, dh, dx, dy;

        if (vRatio > cRatio) {
          dw = width;
          dh = width / vRatio;
          dx = 0;
          dy = (videoHeight - dh) / 2;
        } else {
          dh = videoHeight;
          dw = dh * vRatio;
          dx = (width - dw) / 2;
          dy = 0;
        }

        // Apply Transformations and Clip
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, videoHeight);
        ctx.clip();

        const t = emoji.videoTransform || { x: 0, y: 0, scale: 1.0 };
        const cx = width / 2;
        const cy = videoHeight / 2;

        ctx.translate(cx, cy);
        ctx.translate(t.x * scaleFactor, t.y * scaleFactor);
        ctx.scale(t.scale, t.scale);
        ctx.translate(-cx, -cy);

        ctx.drawImage(video, dx, dy, dw, dh);
        ctx.restore();

        // Icon Overlay
        if (icon) {
          const iconSize = 150;
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.2)";
          ctx.shadowBlur = 20;
          ctx.drawImage(icon, width - iconSize - 20, videoHeight - (iconSize / 2), iconSize, iconSize);
          ctx.restore();
        }

        // Text Overlay (Footer)
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 52px sans-serif';
        ctx.fillText(emoji.name, 24, videoHeight + 60);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(emoji.category.toUpperCase(), 24, videoHeight + 105);

        // Language Badge in Footer
        if (emoji.language) {
          const langText = emoji.language.toUpperCase();
          ctx.font = 'bold 22px sans-serif';
          const textMetrics = ctx.measureText(langText);
          const textWidth = textMetrics.width;
          const badgePadding = 14;
          const badgeX = width - textWidth - 24 - (badgePadding * 2);
          const badgeY = videoHeight + 75;
          const badgeWidth = textWidth + (badgePadding * 2);
          const badgeHeight = 38;

          // Draw badge background
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 10);
          ctx.fillStyle = '#f1f5f9';
          ctx.fill();

          // Draw language text
          ctx.fillStyle = '#64748b';
          ctx.fillText(langText, badgeX + badgePadding, badgeY + 27);
        }

        requestAnimationFrame(drawFrame);
      };

      // 7. Start
      setRecordingStatus('Recording...');
      video.onended = () => {
        recorder.stop();
      };

      recorder.start();
      await video.play();
      drawFrame();

    } catch (e: any) {
      console.error(e);
      alert(e.message || "Recording failed.");
      setRecordingId(null);
      setRecordingStatus('');
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  const generatePngCard = async (emoji: SignEmoji) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 1000;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Icon
      try {
        const icon = await loadImage(emoji.literalIconUrl);
        const iconSize = 500;
        const x = (canvas.width - iconSize) / 2;
        const y = 100;

        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.1)";
        ctx.shadowBlur = 30;
        ctx.drawImage(icon, x, y, iconSize, iconSize);
        ctx.restore();
      } catch (e) {
        console.warn("Could not load icon for card");
      }

      // Text
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 90px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(emoji.name, canvas.width / 2, 700);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText(emoji.category.toUpperCase(), canvas.width / 2, 780);

      // Branding
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(200, 850, 400, 2);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '30px sans-serif';
      ctx.fillText("SignMoji", canvas.width / 2, 920);

      canvas.toBlob((blob) => {
        if (blob) {
          triggerDownload(blob, `${emoji.name}_card.png`);
        }
      });
    } catch (e) {
      console.error(e);
      alert("Could not generate card.");
    }
  };

  const handleAction = (e: React.MouseEvent, emoji: SignEmoji, type: string) => {
    e.stopPropagation();
    if (type === 'video') {
      if (isVideoFile(emoji.videoUrl)) {
        const link = document.createElement('a');
        link.href = emoji.videoUrl;
        link.download = `${emoji.name}_raw.webm`;
        link.click();
      } else {
        window.open(emoji.videoUrl, '_blank');
      }
    } else if (type === 'png') generatePngCard(emoji);

    setActiveMenuId(null);
  };

  return (
    <div className="h-full flex flex-col relative bg-slate-50">
      {activeMenuId && <div className="fixed inset-0 z-40" onClick={() => setActiveMenuId(null)}></div>}

      {/* Header */}
      <div className="bg-white p-4 border-b border-slate-200 sticky top-0 z-30">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4 px-2">
          <div className="flex gap-4 border-b sm:border-0 border-slate-100 pb-2 sm:pb-0">
            <button
              onClick={() => setTab('signs')}
              className={`text-lg sm:text-xl font-bold flex items-center gap-2 transition ${tab === 'signs' ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Library
              {tab === 'signs' && <span className="text-[10px] sm:text-sm font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{filteredEmojis.length}</span>}
            </button>
            <button
              onClick={() => setTab('assets')}
              className={`text-lg sm:text-xl font-bold flex items-center gap-2 transition ${tab === 'assets' ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Resources
              {tab === 'assets' && <span className="text-[10px] sm:text-sm font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{assets.length}</span>}
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {/* SilentEar Integration Status */}
            {exportedIds.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg shrink-0">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] sm:text-xs font-bold text-emerald-700">{exportedIds.size} linked</span>
              </div>
            )}

            <button
              onClick={handleExportJson}
              className="text-xs sm:text-sm font-bold text-indigo-600 bg-indigo-50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-100 transition whitespace-nowrap"
            >
              <Download size={14} className="sm:w-4 sm:h-4" /> Export JSON
            </button>
          </div>
        </div>

        {tab === 'signs' && (
          <div className="flex flex-col md:flex-row gap-3 px-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search signs..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition text-slate-950 placeholder:text-slate-400"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 items-center">
              {['All', ...allCategories].map(c => (
                <button key={c} onClick={() => { setFilter(c as any); setCurrentPage(1); }} className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${filter === c ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                  {c}
                </button>
              ))}
              {isAddingCategory ? (
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    ref={newCatInputRef}
                    type="text"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setIsAddingCategory(false); setNewCategoryName(''); } }}
                    placeholder="Category name..."
                    autoFocus
                    className="w-28 px-3 py-1.5 text-xs border border-indigo-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                  <button onClick={handleAddCategory} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"><Check size={14} /></button>
                  <button onClick={() => { setIsAddingCategory(false); setNewCategoryName(''); }} className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition"><X size={14} /></button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingCategory(true)}
                  className="p-2 rounded-xl border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition shrink-0"
                  title="Add category"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'assets' && (
          <div className="px-2 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-2 w-fit px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer transition font-medium text-sm">
                <Plus size={16} /> Upload
                <input type="file" className="hidden" accept="image/*" multiple onChange={(e) => {
                  if (e.target.files?.length) onAddAsset(e.target.files);
                }} />
              </label>
            </div>

            {/* Web Icon Search */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search web for images (e.g. 'cat', 'fire', 'house')..."
                  value={iconSearchQuery}
                  onChange={(e) => setIconSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleIconSearch(); }}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-500 outline-none transition text-slate-950 placeholder:text-slate-400"
                />
              </div>
              <button
                onClick={handleIconSearch}
                disabled={isSearchingIcons || !iconSearchQuery.trim()}
                className="px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSearchingIcons ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                Search
              </button>
            </div>

            {/* Icon Search Results */}
            {(isSearchingIcons || iconSearchResults.length > 0) && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
                <p className="text-xs font-bold text-violet-700 mb-2">
                  {isSearchingIcons ? 'Searching web for images...' : `Found ${iconSearchResults.length} images — click to add`}
                </p>
                {isSearchingIcons && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 size={24} className="animate-spin text-violet-500" />
                  </div>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {iconSearchResults.map((icon, idx) => (
                    <div key={idx} className="relative group bg-white border border-violet-100 rounded-lg p-2 flex flex-col items-center hover:shadow-md hover:border-violet-400 transition cursor-pointer">
                      <img
                        src={icon.dataUrl || icon.url}
                        alt={icon.name}
                        className="w-16 h-16 object-contain mb-1"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <span className="text-[9px] text-slate-400 truncate w-full text-center">{icon.source}</span>

                      {/* Inline name edit or quick add */}
                      {editingIconName === icon.url ? (
                        <div className="flex items-center gap-1 mt-1 w-full" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editIconNameValue}
                            onChange={(e) => setEditIconNameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { handleAddIconToResources(icon, editIconNameValue); } }}
                            className="w-full px-1.5 py-0.5 text-[10px] border border-violet-300 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                            autoFocus
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAddIconToResources(icon, editIconNameValue); }}
                            className="p-0.5 bg-emerald-500 text-white rounded hover:bg-emerald-600"
                          >
                            <Check size={10} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingIconName(null); }}
                            className="p-0.5 bg-slate-400 text-white rounded hover:bg-slate-500"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAddIconToResources(icon); }}
                            className="px-2 py-0.5 bg-emerald-500 text-white rounded text-[9px] font-bold hover:bg-emerald-600 flex items-center gap-0.5"
                            title="Add with current name"
                          >
                            <Plus size={8} /> Add
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingIconName(icon.url); setEditIconNameValue(icon.name); }}
                            className="px-2 py-0.5 bg-slate-500 text-white rounded text-[9px] font-bold hover:bg-slate-600 flex items-center gap-0.5"
                            title="Rename before adding"
                          >
                            <Edit3 size={8} /> Name
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400">Icons here auto-match when creating new signs (exact name match).</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 overflow-x-hidden">

        {/* SIGNS GRID */}
        {tab === 'signs' && (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
            {paginatedEmojis.map(emoji => (
              <CardErrorBoundary key={emoji.id}>
                <SignCard
                  emoji={emoji}
                  onSelect={onSelect}
                  onUpdate={onUpdate}
                  recordEmoji={recordEmoji}
                  recordingId={recordingId}
                  recordingStatus={recordingStatus}
                  activeMenuId={activeMenuId}
                  setActiveMenuId={setActiveMenuId}
                  handleAction={handleAction}
                  isYouTube={isYouTube}
                  isVideoFile={isVideoFile}
                  getEmbedUrl={getYouTubeEmbedUrl}
                  onExportToSilentEar={handleExportToSilentEar}
                  isExported={exportedIds.has(emoji.id)}
                  onRemove={onRemove}
                  onDelink={onDelink}
                />
              </CardErrorBoundary>
            ))}
            {filteredEmojis.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <Grid size={32} />
                </div>
                <p>No signs found. Create one!</p>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {filteredEmojis.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 px-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Show</span>
                {[10, 25, 50].map(n => (
                  <button
                    key={n}
                    onClick={() => { setPerPage(n); setCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-lg font-bold transition ${perPage === n ? 'bg-indigo-600 text-white shadow' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    {n}
                  </button>
                ))}
                <span>per page</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Prev
                </button>
                <span className="text-xs font-medium text-slate-600">
                  Page {safeCurrentPage} of {totalPages}
                  <span className="text-slate-400 ml-1">({filteredEmojis.length} signs)</span>
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </>
        )}

        {/* ASSETS GRID */}
        {tab === 'assets' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-6">
            {assets.map(asset => {
              const isRenaming = editingIconName === `asset-${asset.id}`;
              return (
                <div key={asset.id} className="relative group bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center aspect-square shadow-sm hover:shadow-md transition">
                  <img src={asset.url} alt={asset.name} className="w-full h-full object-contain mb-2" />
                  {isRenaming ? (
                    <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editIconNameValue}
                        onChange={(e) => setEditIconNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && onRenameAsset) {
                            onRenameAsset(asset.id, editIconNameValue);
                            setEditingIconName(null);
                          }
                        }}
                        className="w-full px-1.5 py-0.5 text-[10px] border border-blue-300 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); onRenameAsset?.(asset.id, editIconNameValue); setEditingIconName(null); }}
                        className="p-0.5 bg-emerald-500 text-white rounded hover:bg-emerald-600"
                      >
                        <Check size={10} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingIconName(null); }}
                        className="p-0.5 bg-slate-400 text-white rounded hover:bg-slate-500"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <span
                      className="text-xs text-slate-500 font-medium truncate w-full text-center cursor-pointer hover:text-blue-600"
                      onClick={(e) => { e.stopPropagation(); setEditingIconName(`asset-${asset.id}`); setEditIconNameValue(asset.name); }}
                      title="Click to rename"
                    >
                      {asset.name}
                    </span>
                  )}
                  <button
                    onClick={() => onRemoveAsset(asset.id)}
                    className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-red-200"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
            {assets.length === 0 && (
              <div className="col-span-full text-center py-12 text-slate-400">
                <ImageIcon size={48} className="mx-auto mb-4 opacity-50" />
                <p>No assets yet. Upload images or search icons above.</p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Export Panel Modal */}
      {exportPanelEmoji && (
        <ExportPanel emoji={exportPanelEmoji} onClose={handleExportPanelClose} />
      )}
    </div>
  );
};

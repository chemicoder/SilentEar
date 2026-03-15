
import React, { useState, useRef, useMemo } from 'react';
import { TriggerWord } from '../types';
import { AVAILABLE_ICONS, IconRenderer, isMediaIcon } from '../constants';
import {
  ArrowLeft, Plus, Search, Trash2, Upload, ChevronDown, ChevronUp,
  Palette, Type, Hash, Volume2, Image, RefreshCw, X, Check, Pencil
} from 'lucide-react';
import { VibrationEditor } from './VibrationEditor';
import { libraryService } from '../services/supabaseClient';

interface TriggerLibraryProps {
  triggers: TriggerWord[];
  onAdd: (word: string) => void;
  onRemove: (id: string) => void;
  onUpdateTrigger: (updated: TriggerWord) => void;
  onBack: () => void;
}

const TRIGGER_CATEGORIES: Record<string, { label: string; emoji: string; ids: string[] }> = {
  safety: { label: 'Safety & Emergency', emoji: '🚨', ids: ['fire', 'danger', 'stop'] },
  people: { label: 'People & Voices', emoji: '👤', ids: ['name', 'baby'] },
  home: { label: 'Home & Environment', emoji: '🏠', ids: ['door', 'water', 'dog'] },
  custom: { label: 'Custom Triggers', emoji: '⚡', ids: [] }, // catch-all for user-added
};

const COLOR_OPTIONS = [
  'bg-red-600', 'bg-rose-600', 'bg-pink-500', 'bg-orange-500',
  'bg-amber-500', 'bg-yellow-500', 'bg-emerald-500', 'bg-cyan-500',
  'bg-blue-500', 'bg-indigo-500', 'bg-purple-600', 'bg-violet-500',
  'bg-slate-600', 'bg-teal-500',
];

export const TriggerLibrary: React.FC<TriggerLibraryProps> = ({
  triggers, onAdd, onRemove, onUpdateTrigger, onBack
}) => {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<'icon' | 'vibration' | 'details'>('icon');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('bg-indigo-500');
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingSynonyms, setEditingSynonyms] = useState<string | null>(null);
  const [synonymInput, setSynonymInput] = useState('');
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Categorize triggers
  const categorized = useMemo(() => {
    const knownIds = Object.values(TRIGGER_CATEGORIES).flatMap(c => c.ids);
    const categories = Object.entries(TRIGGER_CATEGORIES).map(([key, cat]) => {
      const items = key === 'custom'
        ? triggers.filter(t => !knownIds.includes(t.id))
        : triggers.filter(t => cat.ids.includes(t.id));
      return { key, ...cat, items };
    });
    return categories.filter(c => c.items.length > 0);
  }, [triggers]);

  // Search filter
  const filteredTriggers = useMemo(() => {
    if (!search.trim()) return null; // null means show categories
    const q = search.toLowerCase();
    return triggers.filter(t =>
      t.word.toLowerCase().includes(q) ||
      t.label.toLowerCase().includes(q) ||
      (t.synonyms || []).some(s => s.toLowerCase().includes(q))
    );
  }, [search, triggers]);

  const handleIconSelect = (id: string, icon: string) => {
    const trigger = triggers.find(t => t.id === id);
    if (trigger) onUpdateTrigger({ ...trigger, icon });
  };

  const handleColorSelect = (id: string, color: string) => {
    const trigger = triggers.find(t => t.id === id);
    if (trigger) onUpdateTrigger({ ...trigger, color });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const currentId = expandedId;
    if (file && currentId) {
      setIsUploading(true);
      try {
        const publicUrl = await libraryService.uploadMedia(file);
        if (publicUrl) handleIconSelect(currentId, publicUrl);
      } catch {
        const reader = new FileReader();
        reader.onload = () => handleIconSelect(currentId, reader.result as string);
        reader.readAsDataURL(file);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const globalWords = await libraryService.fetchGlobalLibrary();
      if (globalWords && globalWords.length > 0) {
        // Merge global triggers into local, adding any new ones from SignMoji exports
        globalWords.forEach(g => {
          const exists = triggers.find(t => t.word.toLowerCase() === g.word.toLowerCase() || t.id === g.id);
          if (!exists) {
            onAdd(g.word); // creates the trigger locally
            // Then update with full data from global library
            setTimeout(() => {
              const added = triggers.find(t => t.word === g.word);
              if (added) {
                onUpdateTrigger({
                  ...added,
                  id: g.id,
                  label: g.label,
                  icon: g.icon,
                  synonyms: g.synonyms,
                  vibrationPattern: g.vibration_pattern,
                  color: g.color,
                });
              }
            }, 50);
          }
        });
      }
    } catch (e) {
      console.warn('Sync failed:', e);
    }
    setIsSyncing(false);
  };

  const handleAddTrigger = () => {
    if (newWord.trim()) {
      onAdd(newWord.trim().toLowerCase());
      // Find the newly added trigger and update its label/color if customized
      setTimeout(() => {
        const added = triggers.find(t => t.word === newWord.trim().toLowerCase());
        if (added && (newLabel.trim() || newColor !== 'bg-indigo-500')) {
          onUpdateTrigger({
            ...added,
            label: newLabel.trim() || added.label,
            color: newColor
          });
        }
      }, 50);
      setNewWord('');
      setNewLabel('');
      setNewColor('bg-indigo-500');
      setShowAddForm(false);
    }
  };

  const handleSaveSynonyms = (id: string) => {
    const trigger = triggers.find(t => t.id === id);
    if (trigger) {
      const newSynonyms = synonymInput.split(',').map(s => s.trim()).filter(Boolean);
      onUpdateTrigger({ ...trigger, synonyms: newSynonyms });
    }
    setEditingSynonyms(null);
  };

  const handleSaveLabel = (id: string) => {
    const trigger = triggers.find(t => t.id === id);
    if (trigger && labelInput.trim()) {
      onUpdateTrigger({ ...trigger, label: labelInput.trim() });
    }
    setEditingLabel(null);
  };

  const renderTriggerCard = (t: TriggerWord) => {
    const isExpanded = expandedId === t.id;
    const mediaIcon = isMediaIcon(t.icon);

    return (
      <div key={t.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden transition-all duration-300">
        {/* Compact Header */}
        <button
          className="w-full flex items-center justify-between p-4 text-left active:bg-slate-800/50 transition-colors"
          onClick={() => setExpandedId(isExpanded ? null : t.id)}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-lg overflow-hidden ${mediaIcon ? 'bg-black' : t.color}`}>
              <IconRenderer icon={t.icon} size={mediaIcon ? undefined : 22} className={mediaIcon ? 'w-full h-full object-cover' : 'text-white'} />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-100 text-sm truncate">{t.label}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{t.word}</span>
                {(t.synonyms?.length || 0) > 0 && (
                  <span className="text-[9px] text-slate-600">+{t.synonyms!.length} synonyms</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={`w-3 h-3 rounded-full ${t.color}`} />
            {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
          </div>
        </button>

        {/* Expanded Editor Panel */}
        {isExpanded && (
          <div className="border-t border-slate-800">
            {/* Tab Bar */}
            <div className="flex border-b border-slate-800">
              {([
                { id: 'icon' as const, label: 'Visual', icon: <Image size={14} /> },
                { id: 'details' as const, label: 'Details', icon: <Type size={14} /> },
                { id: 'vibration' as const, label: 'Haptic', icon: <Volume2 size={14} /> },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setEditTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition-all
                    ${editTab === tab.id ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* Icon / Visual Tab */}
              {editTab === 'icon' && (
                <div className="space-y-4">
                  {/* Current preview */}
                  <div className="flex items-center gap-4">
                    <div className={`w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden shadow-xl border border-white/10 ${mediaIcon ? 'bg-black' : t.color}`}>
                      <IconRenderer icon={t.icon} size={mediaIcon ? undefined : 40} className={mediaIcon ? 'w-full h-full object-cover' : 'text-white'} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-300 mb-1">Current Icon</p>
                      <p className="text-[10px] text-slate-500">{mediaIcon ? 'Custom media' : t.icon}</p>
                    </div>
                  </div>

                  {/* Icon Grid */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Choose Icon</p>
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_ICONS.map(iconName => (
                        <button
                          key={iconName}
                          onClick={() => handleIconSelect(t.id, iconName)}
                          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all
                            ${t.icon === iconName ? 'bg-blue-500 text-white scale-110 shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 active:scale-90'}`}
                        >
                          <IconRenderer icon={iconName} size={16} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Upload */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed transition-all
                      ${isUploading ? 'border-slate-700 text-slate-600' : 'border-slate-700 text-slate-400 hover:border-blue-500 hover:text-blue-400 active:scale-[0.98]'}`}
                  >
                    {isUploading
                      ? <><div className="w-4 h-4 border-2 border-white/30 border-t-blue-400 rounded-full animate-spin" /> Uploading...</>
                      : <><Upload size={16} /> Upload Image or Video</>
                    }
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/mp4,video/webm" onChange={handleFileUpload} />

                  {/* Color Picker */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                      <Palette size={10} /> Color
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map(color => (
                        <button
                          key={color}
                          onClick={() => handleColorSelect(t.id, color)}
                          className={`w-8 h-8 rounded-full transition-all border-2
                            ${t.color === color ? 'border-white scale-125 shadow-lg' : 'border-transparent hover:scale-110'} ${color}`}
                        >
                          {t.color === color && <Check size={14} className="text-white mx-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Details Tab */}
              {editTab === 'details' && (
                <div className="space-y-5">
                  {/* Label */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Display Label</p>
                    {editingLabel === t.id ? (
                      <div className="flex gap-2">
                        <input
                          value={labelInput}
                          onChange={e => setLabelInput(e.target.value)}
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500"
                          autoFocus
                          onKeyDown={e => e.key === 'Enter' && handleSaveLabel(t.id)}
                        />
                        <button onClick={() => handleSaveLabel(t.id)} className="p-2.5 bg-blue-500 rounded-xl text-white">
                          <Check size={16} />
                        </button>
                        <button onClick={() => setEditingLabel(null)} className="p-2.5 bg-slate-800 rounded-xl text-slate-400">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingLabel(t.id); setLabelInput(t.label); }}
                        className="w-full flex items-center justify-between bg-slate-800/50 border border-slate-800 rounded-xl px-4 py-3 text-left hover:bg-slate-800 transition-colors"
                      >
                        <span className="text-sm text-slate-200 font-semibold">{t.label}</span>
                        <Pencil size={14} className="text-slate-500" />
                      </button>
                    )}
                  </div>

                  {/* Keyword */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Trigger Keyword</p>
                    <div className="bg-slate-800/50 border border-slate-800 rounded-xl px-4 py-3">
                      <span className="text-sm font-mono text-blue-400">{t.word}</span>
                    </div>
                  </div>

                  {/* Synonyms */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                      <Hash size={10} /> Synonyms
                    </p>
                    {editingSynonyms === t.id ? (
                      <div className="space-y-2">
                        <input
                          value={synonymInput}
                          onChange={e => setSynonymInput(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500"
                          placeholder="comma, separated, words"
                          autoFocus
                          onKeyDown={e => e.key === 'Enter' && handleSaveSynonyms(t.id)}
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveSynonyms(t.id)} className="flex-1 py-2 bg-blue-500 text-white text-xs font-bold rounded-lg">Save</button>
                          <button onClick={() => setEditingSynonyms(null)} className="flex-1 py-2 bg-slate-800 text-slate-400 text-xs font-bold rounded-lg">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingSynonyms(t.id); setSynonymInput((t.synonyms || []).join(', ')); }}
                        className="w-full text-left bg-slate-800/50 border border-slate-800 rounded-xl px-4 py-3 hover:bg-slate-800 transition-colors"
                      >
                        {(t.synonyms || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {t.synonyms!.map((s, i) => (
                              <span key={i} className="text-[11px] bg-slate-700 text-slate-300 px-2 py-1 rounded-lg">{s}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">No synonyms — tap to add</span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Delete */}
                  {t.id !== 'name' && (
                    <button
                      onClick={() => { onRemove(t.id); setExpandedId(null); }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 size={16} /> Remove Trigger
                    </button>
                  )}
                </div>
              )}

              {/* Vibration / Haptic Tab */}
              {editTab === 'vibration' && (
                <VibrationEditor
                  initialPattern={t.vibrationPattern}
                  onSave={(newPattern) => onUpdateTrigger({ ...t, vibrationPattern: newPattern })}
                  color={t.color.replace('bg-', 'text-')}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950">
      {/* Header */}
      <header className="flex-none flex items-center gap-3 p-4 sticky top-0 bg-slate-950/95 backdrop-blur-md z-10 border-b border-slate-800">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors shrink-0">
          <ArrowLeft size={22} className="text-slate-300" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-black text-white tracking-tight">Trigger Library</h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{triggers.length} triggers active</p>
        </div>
        <button
          onClick={() => window.location.href = './signmoji/index.html'}
          className="px-3 py-2 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400 text-[10px] font-black uppercase tracking-wider hover:bg-indigo-600/30 transition-all flex items-center gap-1.5"
        >
          <RefreshCw size={12} /> SignMoji
        </button>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 hover:bg-blue-500/20 transition-all border border-blue-500/20"
        >
          <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* Search */}
      <div className="flex-none px-4 pt-4 pb-2">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-11 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Search triggers, synonyms..."
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 pb-28">
        {filteredTriggers ? (
          /* Search Results */
          <div className="space-y-2 pt-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1 mb-3">
              {filteredTriggers.length} result{filteredTriggers.length !== 1 ? 's' : ''}
            </p>
            {filteredTriggers.length === 0 ? (
              <div className="text-center py-12">
                <Search size={40} className="mx-auto text-slate-700 mb-3" />
                <p className="text-sm text-slate-500">No triggers found for "{search}"</p>
                <button
                  onClick={() => { setNewWord(search); setSearch(''); setShowAddForm(true); }}
                  className="mt-3 text-xs text-blue-400 font-bold hover:underline"
                >
                  + Add "{search}" as new trigger
                </button>
              </div>
            ) : (
              filteredTriggers.map(renderTriggerCard)
            )}
          </div>
        ) : (
          /* Categorized View */
          <div className="space-y-6 pt-2">
            {categorized.map(cat => (
              <section key={cat.key}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="text-base">{cat.emoji}</span>
                  <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{cat.label}</h2>
                  <span className="text-[10px] text-slate-600 font-bold bg-slate-800 px-2 py-0.5 rounded-full">{cat.items.length}</span>
                </div>
                <div className="space-y-2">
                  {cat.items.map(renderTriggerCard)}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Add New Trigger FAB / Form */}
      {showAddForm ? (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-slate-900 border-t border-slate-800 p-4 pb-8 rounded-t-3xl shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-white">New Trigger</h3>
            <button onClick={() => setShowAddForm(false)} className="p-1 text-slate-500 hover:text-white">
              <X size={20} />
            </button>
          </div>
          <div className="space-y-3">
            <input
              value={newWord}
              onChange={e => setNewWord(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
              placeholder="Trigger word (e.g. siren)"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAddTrigger()}
            />
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
              placeholder="Display label (e.g. Siren / Alarm)"
            />
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-slate-500 font-bold uppercase shrink-0">Color:</span>
              <div className="flex gap-1.5 flex-wrap">
                {COLOR_OPTIONS.slice(0, 8).map(color => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={`w-7 h-7 rounded-full transition-all border-2 ${newColor === color ? 'border-white scale-110' : 'border-transparent'} ${color}`}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={handleAddTrigger}
              disabled={!newWord.trim()}
              className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${newWord.trim() ? 'bg-blue-500 text-white active:scale-[0.98]' : 'bg-slate-800 text-slate-600'}`}
            >
              Add Trigger
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-8 right-6 z-30">
          <button
            onClick={() => setShowAddForm(true)}
            className="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center shadow-[0_8px_30px_rgba(59,130,246,0.4)] active:scale-90 transition-all hover:bg-blue-400"
          >
            <Plus size={28} className="text-white" />
          </button>
        </div>
      )}
    </div>
  );
};

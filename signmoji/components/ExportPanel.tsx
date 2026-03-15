import React, { useState, useEffect } from 'react';
import { SignEmoji } from '../types';
import { sharedStorage, convertSignEmojiToTrigger } from '@shared/storageService';
import { SharedSignEmoji, SharedTrigger } from '@shared/types';
import { 
  Send, 
  Check, 
  ChevronRight, 
  Zap, 
  Volume2, 
  Vibrate, 
  Link2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Ear,
  Settings2
} from 'lucide-react';

interface ExportPanelProps {
  emoji: SignEmoji;
  onClose: () => void;
}

const VIBRATION_PRESETS = [
  { name: 'Gentle', pattern: [100, 50, 100], description: 'Soft notification' },
  { name: 'Standard', pattern: [200, 100, 200], description: 'Default pattern' },
  { name: 'Urgent', pattern: [300, 100, 300, 100, 300], description: 'Important alert' },
  { name: 'Pulse', pattern: [50, 50, 50, 50, 200], description: 'Quick pulses' },
  { name: 'Long', pattern: [500, 200, 500], description: 'Extended vibration' }
];

const COLOR_PRESETS = [
  { name: 'Indigo', value: 'bg-indigo-500', preview: '#6366f1' },
  { name: 'Blue', value: 'bg-blue-500', preview: '#3b82f6' },
  { name: 'Emerald', value: 'bg-emerald-500', preview: '#10b981' },
  { name: 'Amber', value: 'bg-amber-500', preview: '#f59e0b' },
  { name: 'Rose', value: 'bg-rose-500', preview: '#f43f5e' },
  { name: 'Purple', value: 'bg-purple-500', preview: '#a855f7' },
  { name: 'Cyan', value: 'bg-cyan-500', preview: '#06b6d4' },
  { name: 'Pink', value: 'bg-pink-500', preview: '#ec4899' }
];

export const ExportPanel: React.FC<ExportPanelProps> = ({ emoji, onClose }) => {
  const [step, setStep] = useState<'configure' | 'exporting' | 'success' | 'error'>('configure');
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [newSynonym, setNewSynonym] = useState('');
  const [selectedPattern, setSelectedPattern] = useState(1);
  const [selectedColor, setSelectedColor] = useState(0);
  const [existingTrigger, setExistingTrigger] = useState<SharedTrigger | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Check if already exported
    const triggers = sharedStorage.getSharedTriggers();
    const existing = triggers.find(t => t.linkedSignEmoji === emoji.id);
    if (existing) {
      setExistingTrigger(existing);
      setSynonyms(existing.synonyms || []);
      const patternIdx = VIBRATION_PRESETS.findIndex(p => 
        JSON.stringify(p.pattern) === JSON.stringify(existing.vibrationPattern)
      );
      if (patternIdx >= 0) setSelectedPattern(patternIdx);
      const colorIdx = COLOR_PRESETS.findIndex(c => c.value === existing.color);
      if (colorIdx >= 0) setSelectedColor(colorIdx);
    }
  }, [emoji.id]);

  const addSynonym = () => {
    if (newSynonym.trim() && !synonyms.includes(newSynonym.trim().toLowerCase())) {
      setSynonyms([...synonyms, newSynonym.trim().toLowerCase()]);
      setNewSynonym('');
    }
  };

  const removeSynonym = (s: string) => {
    setSynonyms(synonyms.filter(syn => syn !== s));
  };

  const handleExport = async () => {
    setStep('exporting');
    
    try {
      await new Promise(r => setTimeout(r, 800));

      // Video should already be on Supabase after creation.
      // Use it directly as the icon for SilentEar.
      const videoUrl = emoji.videoUrl;
      const iconUrl = emoji.literalIconUrl;

      console.log('Export URLs — video:', videoUrl?.substring(0, 80), '| icon:', iconUrl?.substring(0, 80));

      // Convert to shared emoji format with persisted URLs
      const sharedEmoji: SharedSignEmoji = {
        id: emoji.id,
        name: emoji.name,
        videoUrl: videoUrl,
        iconUrl: iconUrl,
        category: emoji.category,
        language: emoji.language,
        createdAt: emoji.createdAt,
        sourceApp: 'signmoji',
        videoTransform: emoji.videoTransform
      };

      // Save the shared emoji
      await sharedStorage.saveSharedEmoji(sharedEmoji);

      // Convert to trigger — VIDEO URL goes into icon column for SilentEar display
      const trigger = convertSignEmojiToTrigger(sharedEmoji, {
        synonyms,
        vibrationPattern: VIBRATION_PRESETS[selectedPattern].pattern,
        color: COLOR_PRESETS[selectedColor].value
      });

      // Save to Supabase global_library — WAIT for completion
      await sharedStorage.saveSharedTrigger(trigger);
      console.log('✓ Trigger saved to global_library with icon =', trigger.icon?.substring(0, 80));

      setStep('success');
    } catch (error) {
      console.error('Export failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to export. Please try again.');
      setStep('error');
    }
  };

  const testVibration = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(VIBRATION_PRESETS[selectedPattern].pattern);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Ear className="text-white" size={20} />
            </div>
            <div>
              <h2 className="font-bold text-white">Export to SilentEar</h2>
              <p className="text-white/70 text-xs">Create alert trigger from sign</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition">
            <X className="text-white" size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'configure' && (
            <div className="space-y-6">
              {/* Preview Card */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-black flex-shrink-0">
                  <img src={emoji.literalIconUrl} alt={emoji.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 truncate">{emoji.name}</h3>
                  <p className="text-xs text-slate-500">{emoji.category} • {emoji.language || 'ASL'}</p>
                  {existingTrigger && (
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">
                      <Link2 size={10} /> Already linked
                    </span>
                  )}
                </div>
              </div>

              {/* Synonyms Section */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block flex items-center gap-2">
                  <Volume2 size={14} /> Trigger Words
                </label>
                <p className="text-[11px] text-slate-400 mb-3">Add words that should trigger this sign alert</p>
                
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newSynonym}
                    onChange={(e) => setNewSynonym(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSynonym()}
                    placeholder="Add synonym..."
                    className="flex-1 px-4 py-2.5 bg-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-transparent focus:border-indigo-500 transition"
                  />
                  <button 
                    onClick={addSynonym}
                    className="px-4 py-2.5 bg-indigo-100 text-indigo-600 rounded-xl font-medium hover:bg-indigo-200 transition"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1.5 bg-indigo-500 text-white text-xs font-bold rounded-full">
                    {emoji.name.toLowerCase()}
                  </span>
                  {synonyms.map(s => (
                    <span key={s} className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-medium rounded-full flex items-center gap-1.5 group">
                      {s}
                      <button onClick={() => removeSynonym(s)} className="opacity-50 hover:opacity-100 transition">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Vibration Pattern */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block flex items-center gap-2">
                  <Vibrate size={14} /> Vibration Pattern
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {VIBRATION_PRESETS.map((preset, idx) => (
                    <button
                      key={preset.name}
                      onClick={() => setSelectedPattern(idx)}
                      className={`p-3 rounded-xl border-2 transition-all text-left ${
                        selectedPattern === idx 
                          ? 'border-indigo-500 bg-indigo-50' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-800 block">{preset.name}</span>
                      <span className="text-[10px] text-slate-400">{preset.description}</span>
                    </button>
                  ))}
                </div>
                <button 
                  onClick={testVibration}
                  className="mt-3 w-full py-2 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500 hover:bg-slate-50 transition flex items-center justify-center gap-2"
                >
                  <Vibrate size={14} /> Test Vibration
                </button>
              </div>

              {/* Color Selection */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block flex items-center gap-2">
                  <Settings2 size={14} /> Alert Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PRESETS.map((color, idx) => (
                    <button
                      key={color.name}
                      onClick={() => setSelectedColor(idx)}
                      className={`w-10 h-10 rounded-xl transition-all ${
                        selectedColor === idx 
                          ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' 
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.preview }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Export Button */}
              <button
                onClick={handleExport}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-bold hover:shadow-lg hover:shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
              >
                <Send size={18} />
                {existingTrigger ? 'Update in SilentEar' : 'Export to SilentEar'}
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {step === 'exporting' && (
            <div className="py-12 flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
                <Loader2 className="text-indigo-600 animate-spin" size={32} />
              </div>
              <h3 className="font-bold text-slate-800 text-lg">Exporting...</h3>
              <p className="text-slate-500 text-sm mt-1">Syncing with SilentEar</p>
            </div>
          )}

          {step === 'success' && (
            <div className="py-12 flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="text-emerald-600" size={32} />
              </div>
              <h3 className="font-bold text-slate-800 text-lg">Successfully Exported!</h3>
              <p className="text-slate-500 text-sm mt-1 text-center">
                "{emoji.name}" is now available as a trigger in SilentEar
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-8 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition"
              >
                Done
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="py-12 flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="text-red-600" size={32} />
              </div>
              <h3 className="font-bold text-slate-800 text-lg">Export Failed</h3>
              <p className="text-slate-500 text-sm mt-1">{errorMessage}</p>
              <button
                onClick={() => setStep('configure')}
                className="mt-6 px-8 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportPanel;

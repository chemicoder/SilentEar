
import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Volume2,
  RotateCcw,
  MessageSquare,
  Keyboard,
  Eraser,
  Sparkles,
  Settings,
  History,
  Volume1,
  Zap,
  ChevronDown,
  Mic2,
  Trash2
} from 'lucide-react';
import { backendIntelligence } from '../services/backendClient';

interface VoiceDeckProps {
  onBack: () => void;
  context?: string;
  recentAlerts?: any[];
  recentTranscript?: string[];
}

const QUICK_PHRASES = [
  "Hello", "Yes", "No", "Thank you",
  "I am deaf", "Please repeat",
  "Can you write it down?", "I need help",
  "One moment please", "Excuse me",
  "Where's the exit?", "I understand"
];

export const VoiceDeck: React.FC<VoiceDeckProps> = ({ onBack, context, recentAlerts, recentTranscript }) => {
  const [text, setText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [smartSuggestions, setSmartSuggestions] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    if (!synth) return;
    try {
      const updateVoices = () => {
        const availableVoices = synth.getVoices();
        setVoices(availableVoices);
        if (availableVoices.length > 0 && !selectedVoice) {
          const preferred = availableVoices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Premium')));
          setSelectedVoice(preferred?.name || availableVoices[0].name);
        }
      };
      updateVoices();
      synth.onvoiceschanged = updateVoices;
    } catch (e) {
      console.warn('Speech synthesis init failed:', e);
    }

    // Load recents
    try {
      const saved = localStorage.getItem('silentear_voice_recents');
      if (saved) setRecents(JSON.parse(saved));
    } catch {}

    return () => {
      try { if (synth) synth.onvoiceschanged = null; } catch {}
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [selectedVoice]);

  // Handle smart suggestions when typing pauses or context changes
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Even if text is empty, we might want suggestions based on context
    if (!text.trim() && !context) {
      setSmartSuggestions([]);
      return;
    }

    timeoutRef.current = setTimeout(async () => {
      try {
        setIsGenerating(true);
        const suggestions = await backendIntelligence.suggestPhrases(
          text || '',
          context,
          recentAlerts,
          recentTranscript
        );
        if (Array.isArray(suggestions) && suggestions.length > 0) {
          setSmartSuggestions(suggestions);
        }
      } catch (e) {
        console.warn('Smart suggestions failed:', e);
      } finally {
        setIsGenerating(false);
      }
    }, 1200);

    return () => clearTimeout(timeoutRef.current);
  }, [text, context, recentAlerts, recentTranscript]);

  const speak = (phrase: string) => {
    if (!synth) return;
    try { if (synth.speaking) synth.cancel(); } catch {}
    if (!phrase.trim()) return;

    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.volume = 1.0; // loudly speak
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    const voice = voices.find(v => v.name === selectedVoice);
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    utterance.pitch = pitch;

    try { synth.speak(utterance); } catch (e) { console.warn('TTS speak failed:', e); }

    // Save to recents
    const newRecents = [phrase, ...recents.filter(p => p !== phrase)].slice(0, 10);
    setRecents(newRecents);
    localStorage.setItem('silentear_voice_recents', JSON.stringify(newRecents));
  };

  const handleSmartComplete = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    try {
      const completion = await backendIntelligence.predictCompletion(text, context);
      if (completion) {
        setText(prev => prev.trim() + ' ' + completion);
      }
    } catch (e) {
      console.warn('Smart completion failed:', e);
    }
    setIsGenerating(false);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    speak(text);
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 overflow-hidden relative">
      <header className="flex items-center justify-between p-4 sticky top-0 bg-slate-950/90 backdrop-blur-md z-30 border-b border-white/5">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-2xl transition-colors text-slate-300">
          <ArrowLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-[10px] font-black tracking-[0.2em] text-blue-500 uppercase">Voice Deck</h1>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[9px] text-slate-500 font-bold uppercase">Intelligence Core Active</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2.5 rounded-2xl transition-all ${showSettings ? 'bg-slate-700 text-white' : 'bg-slate-800/50 text-slate-400'}`}
          >
            <Settings size={20} />
          </button>
          <button
            onClick={() => {
              if ('vibrate' in navigator) navigator.vibrate(20);
              setIsFlipped(!isFlipped);
            }}
            className={`p-2.5 rounded-2xl transition-all ${isFlipped ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800/50 text-slate-400'}`}
          >
            <RotateCcw size={20} className={isFlipped ? 'rotate-180' : ''} />
          </button>
        </div>
      </header>

      {/* Settings Overlay */}
      {showSettings && (
        <div className="absolute top-16 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-b border-white/10 p-6 animate-in slide-in-from-top duration-300">
          <div className="max-w-md mx-auto space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Mic2 size={12} /> Voice Profile
              </label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                {voices.map(v => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                  Speed <span>{rate.toFixed(1)}x</span>
                </label>
                <input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} className="w-full accent-blue-500" />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                  Pitch <span>{pitch.toFixed(1)}</span>
                </label>
                <input type="range" min="0.5" max="2" step="0.1" value={pitch} onChange={(e) => setPitch(parseFloat(e.target.value))} className="w-full accent-blue-500" />
              </div>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-blue-900/20"
            >
              Save Profile
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col p-5 overflow-y-auto no-scrollbar gap-6 pb-24">

        {/* Table Display (Flipped for others to read) */}
        <div className={`transition-all duration-700 ease-in-out flex-none ${isFlipped ? 'opacity-100' : 'opacity-20 scale-95 h-0 overflow-hidden pointer-events-none'}`}>
          <div className="bg-slate-900 border-2 border-blue-500/30 rounded-[40px] p-8 rotate-180 min-h-[180px] flex items-center justify-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative overflow-hidden group">
            <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className={`font-black text-slate-100 tracking-tight leading-tight z-10 ${text.length > 40 ? 'text-2xl' : 'text-4xl'}`}>
              {text || "I am communicating using this device."}
            </p>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-end space-y-8">
          {/* Dynamic Visualizer */}
          <div className={`h-16 flex items-center justify-center gap-2 transition-all duration-500 ${isSpeaking ? 'opacity-100 scale-110' : 'opacity-0 scale-90'}`}>
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="w-3 bg-gradient-to-t from-blue-600 to-cyan-400 rounded-full animate-bounce"
                style={{
                  height: `${30 + Math.random() * 40}px`,
                  animationDelay: `${i * 0.08}s`,
                  animationDuration: '0.5s'
                }}
              />
            ))}
          </div>

          {/* Smart Suggestions */}
          <div className={`space-y-3 transition-all duration-300 ${smartSuggestions.length > 0 || isGenerating ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-blue-400 animate-pulse" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Smart Suggestions</span>
              {isGenerating && <div className="w-1 h-1 bg-blue-500 rounded-full animate-ping" />}
            </div>
            <div className="flex overflow-x-auto no-scrollbar gap-2 pb-2">
              {smartSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setText(suggestion);
                    speak(suggestion);
                  }}
                  className="bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 text-[11px] font-bold px-4 py-2.5 rounded-full whitespace-nowrap transition-all active:scale-95"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="relative group">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type what you want to say..."
              className="w-full bg-slate-900/40 border border-white/5 rounded-[32px] p-8 text-2xl text-white placeholder-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 min-h-[220px] resize-none shadow-2xl transition-all"
            />

            <div className="absolute top-6 right-6">
              <button
                type="button"
                onClick={handleSmartComplete}
                disabled={!text || isGenerating}
                className={`p-3 rounded-full transition-all ${isGenerating ? 'animate-spin' : ''} text-blue-400 hover:bg-blue-500/10 active:scale-90`}
                title="AI Complete"
              >
                <Zap size={22} fill={text ? "currentColor" : "none"} />
              </button>
            </div>

            <div className="absolute bottom-6 right-6 flex gap-3">
              {text && (
                <button
                  type="button"
                  onClick={() => setText('')}
                  className="bg-slate-800 text-slate-400 p-4 rounded-2xl hover:bg-red-900/20 hover:text-red-400 active:scale-95 transition-all animate-in zoom-in"
                >
                  <Trash2 size={24} />
                </button>
              )}
              <button
                type="submit"
                disabled={!text}
                className="bg-blue-600 text-white p-5 rounded-3xl hover:bg-blue-500 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all shadow-2xl shadow-blue-600/20"
              >
                <Volume2 size={32} />
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Recent Phrases */}
            {recents.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4 px-1">
                  <div className="flex items-center gap-2">
                    <History size={14} className="text-slate-500" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Recents</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {recents.map((phrase, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if ('vibrate' in navigator) navigator.vibrate(10);
                        setText(phrase);
                        speak(phrase);
                      }}
                      className="bg-slate-900/80 hover:bg-slate-800/80 text-slate-300 text-[11px] font-bold px-4 py-3 rounded-xl border border-white/5 transition-all active:scale-95"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Phrases */}
            <div>
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-slate-500" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Quick Phrases</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {QUICK_PHRASES.map(phrase => (
                  <button
                    key={phrase}
                    onClick={() => {
                      if ('vibrate' in navigator) navigator.vibrate(10);
                      setText(phrase);
                      speak(phrase);
                    }}
                    className="bg-slate-800/40 hover:bg-slate-700 text-slate-200 text-[11px] font-black px-4 py-3 rounded-xl border border-white/5 transition-all active:scale-95 uppercase tracking-wide"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

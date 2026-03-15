
import React, { useState, useRef, useEffect } from 'react';
import { Play, RotateCcw, Mic, Save, Zap } from 'lucide-react';
import { VIBRATION_PRESETS } from '../constants';

interface VibrationEditorProps {
  initialPattern: number[];
  onSave: (pattern: number[]) => void;
  color: string;
}

export const VibrationEditor: React.FC<VibrationEditorProps> = ({ initialPattern, onSave, color }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [pattern, setPattern] = useState<number[]>(initialPattern);
  const [tempPattern, setTempPattern] = useState<number[]>([]);
  const lastTimeRef = useRef<number>(0);
  const isDownRef = useRef<boolean>(false);

  const startRecording = () => {
    setTempPattern([]);
    setIsRecording(true);
    lastTimeRef.current = Date.now();
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (tempPattern.length > 0) {
      setPattern(tempPattern);
      onSave(tempPattern);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isRecording) return;
    const now = Date.now();
    isDownRef.current = true;
    
    if (tempPattern.length > 0) {
      // Record the gap since the last release
      const gap = now - lastTimeRef.current;
      setTempPattern(prev => [...prev, gap]);
    }
    lastTimeRef.current = now;
    
    // Immediate haptic feedback for the tap
    if ('vibrate' in navigator) navigator.vibrate(10);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isRecording || !isDownRef.current) return;
    const now = Date.now();
    isDownRef.current = false;
    
    // Record the duration of the hold
    const duration = now - lastTimeRef.current;
    setTempPattern(prev => [...prev, duration]);
    lastTimeRef.current = now;
  };

  const testVibration = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  };

  const reset = () => {
    setPattern([200]);
    setTempPattern([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tactile Signature</label>
        <div className="flex gap-2">
           {pattern.length > 0 && (
             <button onClick={testVibration} className="text-blue-400 text-[10px] font-bold flex items-center gap-1 hover:text-blue-300">
               <Play size={10} /> TEST
             </button>
           )}
           <button onClick={reset} className="text-slate-500 text-[10px] font-bold flex items-center gap-1 hover:text-slate-400">
             <RotateCcw size={10} /> RESET
           </button>
        </div>
      </div>

      <div className="relative h-20 bg-slate-950 rounded-xl border border-slate-800 flex items-end p-2 gap-0.5 overflow-hidden">
        {(isRecording ? tempPattern : pattern).map((val, i) => (
          <div 
            key={i} 
            style={{ 
              width: `${Math.min(val / 10, 40)}px`,
              minWidth: '2px'
            }}
            className={`h-full rounded-t-sm transition-all duration-200 ${i % 2 === 0 ? (color || 'bg-blue-500') : 'bg-transparent opacity-20 border-x border-slate-800'}`}
          />
        ))}
        {isRecording && isDownRef.current && (
            <div className={`h-full w-2 animate-pulse ${color || 'bg-blue-500'} rounded-t-sm`} />
        )}
        {!isRecording && pattern.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-600 font-medium italic">
            No pattern recorded
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onPointerDown={isRecording ? handlePointerDown : undefined}
          onPointerUp={isRecording ? handlePointerUp : undefined}
          onClick={!isRecording ? startRecording : undefined}
          className={`flex-1 h-14 rounded-2xl flex items-center justify-center font-bold text-sm transition-all active:scale-95 touch-none select-none
            ${isRecording 
              ? 'bg-slate-800 text-white border-2 border-dashed border-slate-600' 
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg'}`}
        >
          {isRecording ? (
            <div className="flex flex-col items-center">
              <span className="text-rose-500 animate-pulse text-[10px] mb-1">RECORDING...</span>
              <span>HOLD TO VIBRATE</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Mic size={18} /> RECORD NEW PATTERN
            </div>
          )}
        </button>

        {isRecording && (
          <button 
            onClick={stopRecording}
            className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg"
          >
            <Save size={24} />
          </button>
        )}
      </div>
      
      <p className="text-[10px] text-slate-500 text-center italic">
        {isRecording ? "Tap and hold the large button to record rhythms." : "Tap 'Record' to create a custom haptic alert."}
      </p>

      {/* Feature 9: Vibration Presets */}
      <div>
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors w-full justify-center py-2"
        >
          <Zap size={10} /> {showPresets ? 'HIDE PRESETS' : 'SHOW PRESETS'}
        </button>
        {showPresets && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {VIBRATION_PRESETS.map(preset => (
              <button
                key={preset.name}
                onClick={() => {
                  setPattern(preset.pattern);
                  onSave(preset.pattern);
                  if ('vibrate' in navigator) navigator.vibrate(preset.pattern);
                }}
                className="bg-slate-800/50 hover:bg-slate-700 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-slate-300 transition-all active:scale-95 uppercase tracking-wide"
              >
                {preset.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

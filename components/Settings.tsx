
import React, { useState } from 'react';
import { ProcessingMode, QuietHours, EmergencyContact, AppLanguage, SignLanguagePreference } from '../types';
import { LANGUAGE_OPTIONS } from '../constants';
import { ArrowLeft, Cloud, WifiOff, Moon, Phone, Globe, Flashlight, AudioLines, Hand } from 'lucide-react';

const SIGN_LANGUAGE_OPTIONS: { code: SignLanguagePreference; label: string; flag: string }[] = [
  { code: 'All', label: 'All Signs', flag: '🌐' },
  { code: 'ASL', label: 'ASL', flag: '🇺🇸' },
  { code: 'BSL', label: 'BSL', flag: '🇬🇧' },
  { code: 'PSL', label: 'PSL', flag: '🇵🇰' },
];

interface SettingsProps {
  onBack: () => void;
  userName: string;
  setUserName: (name: string) => void;
  vibrationIntensity: number;
  onIntensityChange: (val: number) => void;
  processingMode: ProcessingMode;
  onProcessingModeChange: (mode: ProcessingMode) => void;
  // New feature props
  quietHours: QuietHours;
  onQuietHoursChange: (qh: QuietHours) => void;
  emergencyContact: EmergencyContact;
  onEmergencyContactChange: (ec: EmergencyContact) => void;
  language: AppLanguage;
  onLanguageChange: (lang: AppLanguage) => void;
  flashEnabled: boolean;
  onFlashEnabledChange: (enabled: boolean) => void;
  soundClassifierEnabled: boolean;
  onSoundClassifierChange: (enabled: boolean) => void;
  signLanguagePreference: SignLanguagePreference;
  onSignLanguagePreferenceChange: (pref: SignLanguagePreference) => void;
}

export const Settings: React.FC<SettingsProps> = ({ 
  onBack,
  userName,
  setUserName,
  vibrationIntensity,
  onIntensityChange,
  processingMode,
  onProcessingModeChange,
  quietHours,
  onQuietHoursChange,
  emergencyContact,
  onEmergencyContactChange,
  language,
  onLanguageChange,
  flashEnabled,
  onFlashEnabledChange,
  soundClassifierEnabled,
  onSoundClassifierChange,
  signLanguagePreference,
  onSignLanguagePreferenceChange
}) => {
  return (
    <div className="flex flex-col h-full w-full bg-slate-950 overflow-y-auto pb-20">
      <header className="flex items-center p-4 sticky top-0 bg-slate-950/90 backdrop-blur-md z-10 border-b border-slate-800">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="ml-4 text-xl font-bold">Alert Settings</h1>
      </header>

      <div className="p-4 space-y-8">
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Engine & API</h2>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
             <div className="flex flex-col gap-3">
                <button 
                  onClick={() => onProcessingModeChange('cloud')}
                  className={`flex items-center p-4 rounded-xl border-2 transition-all ${processingMode === 'cloud' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-800/50'}`}
                >
                  <div className={`p-3 rounded-full mr-4 ${processingMode === 'cloud' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <Cloud size={24} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold text-slate-100">Cloud AI (Recommended)</div>
                    <div className="text-xs text-slate-400">Powered by Gemini. High accuracy, context aware. Requires internet.</div>
                  </div>
                  {processingMode === 'cloud' && <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />}
                </button>

                <button 
                  onClick={() => onProcessingModeChange('offline')}
                  className={`flex items-center p-4 rounded-xl border-2 transition-all ${processingMode === 'offline' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-800/50'}`}
                >
                  <div className={`p-3 rounded-full mr-4 ${processingMode === 'offline' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <WifiOff size={24} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold text-slate-100">Offline Mode</div>
                    <div className="text-xs text-slate-400">Uses On-Device Speech API. Basic keyword matching. 100% Uptime.</div>
                  </div>
                  {processingMode === 'offline' && <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />}
                </button>
             </div>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Haptic Intensity</h2>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
             <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-slate-300">Vibration Strength</span>
                <span className="text-sm font-bold text-blue-400">{Math.round(vibrationIntensity * 100)}%</span>
             </div>
             <input 
                type="range" 
                min="0.2" 
                max="2.0" 
                step="0.1" 
                value={vibrationIntensity}
                onChange={(e) => onIntensityChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
             />
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Personal Identification</h2>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <label className="block text-sm font-medium text-slate-300 mb-2">Your Name</label>
            <input 
              type="text" 
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Alex"
            />
          </div>
        </section>

        {/* Feature 6: Multi-Language Support */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Globe size={12} /> Language
          </h2>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGE_OPTIONS.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => onLanguageChange(lang.code)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm ${
                    language === lang.code 
                      ? 'border-blue-500 bg-blue-500/10 text-white' 
                      : 'border-slate-800 bg-slate-800/30 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span className="font-bold truncate">{lang.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Sign Language Preference */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Hand size={12} /> Sign Language Preference
          </h2>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <p className="text-[10px] text-slate-500 mb-3">Prefer signs from a specific sign language in alerts</p>
            <div className="grid grid-cols-2 gap-2">
              {SIGN_LANGUAGE_OPTIONS.map(sl => (
                <button
                  key={sl.code}
                  onClick={() => onSignLanguagePreferenceChange(sl.code)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm ${
                    signLanguagePreference === sl.code
                      ? 'border-violet-500 bg-violet-500/10 text-white'
                      : 'border-slate-800 bg-slate-800/30 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-lg">{sl.flag}</span>
                  <span className="font-bold truncate">{sl.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Feature 1: Flash/Screen Alert Toggle */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Flashlight size={12} /> Screen Flash Alert
          </h2>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-200">Flash on Alert</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Bright screen flash to catch attention visually</p>
            </div>
            <button
              onClick={() => onFlashEnabledChange(!flashEnabled)}
              className={`w-14 h-7 rounded-full transition-all relative ${flashEnabled ? 'bg-blue-500' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${flashEnabled ? 'translate-x-7' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </section>

        {/* Feature 5: Sound Classifier Toggle */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <AudioLines size={12} /> Sound Classifier
          </h2>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-200">Environmental Sound Detection</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Detects alarms, glass breaking, knocking via audio analysis</p>
            </div>
            <button
              onClick={() => onSoundClassifierChange(!soundClassifierEnabled)}
              className={`w-14 h-7 rounded-full transition-all relative ${soundClassifierEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${soundClassifierEnabled ? 'translate-x-7' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </section>

        {/* Feature 3: Scheduled Quiet Hours */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Moon size={12} /> Quiet Hours
          </h2>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-200">Enable Quiet Hours</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Mute non-critical alerts during set times</p>
              </div>
              <button
                onClick={() => onQuietHoursChange({ ...quietHours, enabled: !quietHours.enabled })}
                className={`w-14 h-7 rounded-full transition-all relative ${quietHours.enabled ? 'bg-purple-500' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${quietHours.enabled ? 'translate-x-7' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {quietHours.enabled && (
              <>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Start</label>
                    <input
                      type="time"
                      value={quietHours.start}
                      onChange={(e) => onQuietHoursChange({ ...quietHours, start: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">End</label>
                    <input
                      type="time"
                      value={quietHours.end}
                      onChange={(e) => onQuietHoursChange({ ...quietHours, end: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">Always alert for Fire/Danger</p>
                  <button
                    onClick={() => onQuietHoursChange({ ...quietHours, bypassDanger: !quietHours.bypassDanger })}
                    className={`w-10 h-5 rounded-full transition-all relative ${quietHours.bypassDanger ? 'bg-red-500' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${quietHours.bypassDanger ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Feature 4: Emergency Contact */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Phone size={12} /> Emergency Contact
          </h2>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Contact Name</label>
              <input
                type="text"
                value={emergencyContact.name}
                onChange={(e) => onEmergencyContactChange({ ...emergencyContact, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm placeholder-slate-500"
                placeholder="e.g. Mom"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Phone Number</label>
              <input
                type="tel"
                value={emergencyContact.phone}
                onChange={(e) => onEmergencyContactChange({ ...emergencyContact, phone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm placeholder-slate-500"
                placeholder="+1 234 567 8900"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-300 font-bold">Auto-Call on Danger</p>
                <p className="text-[10px] text-slate-500">Automatically offer call on Fire/Help alerts</p>
              </div>
              <button
                onClick={() => onEmergencyContactChange({ ...emergencyContact, autoCall: !emergencyContact.autoCall })}
                className={`w-14 h-7 rounded-full transition-all relative ${emergencyContact.autoCall ? 'bg-red-500' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${emergencyContact.autoCall ? 'translate-x-7' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

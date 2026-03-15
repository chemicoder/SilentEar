
import React, { useEffect, useState } from 'react';
import { TriggerWord, DeviceMode, EmergencyContact } from '../types';
import { IconRenderer, isMediaIcon } from '../constants';
import { Phone } from 'lucide-react';

interface AlertOverlayProps {
  trigger: TriggerWord;
  mode: DeviceMode;
  onDismiss: () => void;
  intensity: number;
  flashEnabled?: boolean;
  emergencyContact?: EmergencyContact;
}

export const AlertOverlay: React.FC<AlertOverlayProps> = ({ trigger, mode, onDismiss, intensity, flashEnabled = true, emergencyContact }) => {
  const [showFlash, setShowFlash] = useState(flashEnabled);
  const isDanger = trigger.id === 'fire' || trigger.id === 'danger';

  useEffect(() => {
    if ('vibrate' in navigator) {
      const adjustedPattern = trigger.vibrationPattern.map((val, idx) => 
        idx % 2 === 0 ? Math.round(val * intensity) : val
      );
      navigator.vibrate(adjustedPattern);
      
      const interval = isDanger
        ? setInterval(() => navigator.vibrate(adjustedPattern), 2000)
        : undefined;
        
      return () => {
        if (interval) clearInterval(interval);
        navigator.vibrate(0);
      };
    }
  }, [trigger, intensity, isDanger]);

  // Feature 1: Screen flash effect
  useEffect(() => {
    if (!flashEnabled) { setShowFlash(false); return; }
    setShowFlash(true);
    const flashes = isDanger ? 6 : 3;
    let count = 0;
    const interval = setInterval(() => {
      count++;
      setShowFlash(prev => !prev);
      if (count >= flashes * 2) {
        clearInterval(interval);
        setShowFlash(false); // Ensure flash is OFF after sequence
      }
    }, isDanger ? 150 : 250);
    return () => { clearInterval(interval); setShowFlash(false); };
  }, [flashEnabled, isDanger]);

  // Feature 2: Push notification for smartwatch / mobile
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        // Try service worker notification first (required on mobile)
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(`SilentEar: ${trigger.label}`, {
              body: `"${trigger.word}" detected`,
              icon: '/pwa-192x192.png',
              tag: 'silentear-alert',
              requireInteraction: isDanger,
            });
          }).catch(() => {});
        } else {
          // Desktop fallback
          new Notification(`SilentEar: ${trigger.label}`, {
            body: `"${trigger.word}" detected`,
            icon: '/pwa-192x192.png',
            tag: 'silentear-alert',
            requireInteraction: isDanger,
          });
        }
      } catch {
        // Notification constructor not supported (mobile), silently ignore
      }
    }
  }, [trigger, isDanger]);

  // Feature 4: Auto-call emergency contact on danger
  const handleEmergencyCall = () => {
    if (emergencyContact?.phone) {
      window.open(`tel:${emergencyContact.phone}`, '_self');
    }
  };

  const handleEmergencySMS = () => {
    if (emergencyContact?.phone) {
      const msg = encodeURIComponent(`ALERT from SilentEar: ${trigger.label} detected! "${trigger.word}" heard. Please check on me.`);
      window.open(`sms:${emergencyContact.phone}?body=${msg}`, '_self');
    }
  };

  const isWatch = mode === 'watch';
  const isMedia = isMediaIcon(trigger.icon);
  const hasVideo = !!(trigger.videoUrl && trigger.videoUrl.startsWith('http'));
  const hasIcon = !!(trigger.iconUrl && trigger.iconUrl.startsWith('http'));

  return (
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in zoom-in duration-300 ${trigger.color}`}
      onClick={onDismiss}
    >
      {/* Feature 1: Screen Flash Overlay */}
      {showFlash && flashEnabled && (
        <div className="fixed inset-0 z-[200] bg-white pointer-events-none transition-opacity duration-100" 
             style={{ opacity: showFlash ? 0.95 : 0 }} />
      )}

      {/* Background Ripple Animation */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
        <div className="w-[150%] h-[150%] border-[20px] border-white/20 rounded-full vibration-ripple" />
        <div className="w-[150%] h-[150%] border-[20px] border-white/15 rounded-full vibration-ripple [animation-delay:0.2s]" />
        <div className="w-[150%] h-[150%] border-[20px] border-white/10 rounded-full vibration-ripple [animation-delay:0.4s]" />
      </div>

      <div className={`flex flex-col items-center text-center p-6 relative z-10 w-full ${isWatch ? 'max-w-[240px]' : 'max-w-xl'}`}>
        
        {/* Sign Video — looping, shows the actual sign language gesture */}
        {hasVideo && (
          <div className={`w-full mb-4 flex justify-center items-center ${isWatch ? 'h-28' : 'h-48 sm:h-64'}`}>
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black/40 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10">
              <video 
                src={trigger.videoUrl} 
                className="w-full h-full object-contain"
                muted autoPlay loop playsInline preload="metadata"
              />
            </div>
          </div>
        )}

        {/* Icon/Image — shows the sticker icon of the sign word */}
        <div className={`w-full mb-4 flex justify-center items-center transition-all duration-500 ${
          hasVideo 
            ? (isWatch ? 'h-16' : 'h-24 sm:h-32') 
            : (isWatch ? 'h-32' : 'h-64 sm:h-[400px]')
        }`}>
          <div className={`relative ${hasVideo ? 'w-24 h-24 sm:w-32 sm:h-32' : 'w-full h-full'} flex items-center justify-center overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-white/10
            ${(hasIcon || isMedia) ? 'bg-black/40 rounded-[40px]' : 'bg-transparent'}`}>
            {hasIcon ? (
              <img 
                src={trigger.iconUrl} 
                alt={trigger.label}
                className="w-full h-full object-contain"
              />
            ) : (
              <IconRenderer 
                icon={trigger.icon} 
                size={(hasIcon || isMedia) ? undefined : (isWatch ? 80 : 160)} 
                className={`transition-all duration-300 ${(hasIcon || isMedia) ? 'w-full h-full object-contain' : 'text-white drop-shadow-2xl'}`} 
              />
            )}
          </div>
        </div>
        
        <h1 className={`font-black text-white uppercase leading-none tracking-tighter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] mb-4 ${isWatch ? 'text-3xl' : 'text-7xl'}`}>
          {trigger.label}
        </h1>

        {!isWatch && (
            <div className="bg-black/30 backdrop-blur-xl px-8 py-4 rounded-3xl border border-white/20 shadow-xl">
              <p className="text-white text-2xl font-black italic tracking-tight">
                  "{trigger.word}" detected
              </p>
              {trigger.language && (
                <p className="text-white/60 text-xs mt-1 font-medium">{trigger.language} Sign</p>
              )}
            </div>
        )}

        {/* Feature 4: Emergency Contact Buttons */}
        {isDanger && emergencyContact?.phone && !isWatch && (
          <div className="flex gap-3 mt-6" onClick={e => e.stopPropagation()}>
            <button
              onClick={handleEmergencyCall}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-black rounded-full shadow-2xl active:scale-90 transition-transform"
            >
              <Phone size={18} /> CALL {emergencyContact.name || 'Emergency'}
            </button>
            <button
              onClick={handleEmergencySMS}
              className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white font-black rounded-full shadow-2xl active:scale-90 transition-transform text-sm"
            >
              SMS
            </button>
          </div>
        )}

        <button 
          className={`mt-6 px-12 py-5 bg-white text-black font-black rounded-full shadow-2xl active:scale-90 transition-transform tracking-widest uppercase
            ${isWatch ? 'text-sm py-3 px-6' : 'text-2xl'}`}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          {isWatch ? 'OK' : 'DISMISS ALERT'}
        </button>
      </div>
      
      {isDanger && (
        <div className="absolute inset-0 bg-red-600 animate-pulse mix-blend-overlay pointer-events-none" />
      )}
    </div>
  );
};

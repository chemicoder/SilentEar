
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { BackendLiveSession, isBackendAvailable, backendFirestore } from './services/backendClient';
import {
  Mic,
  MicOff,
  Settings as SettingsIcon,
  Smartphone,
  Watch,
  Waves,
  History,
  ChevronRight,
  MessageSquare,
  BellRing,
  LayoutGrid,
  Wifi,
  WifiOff,
  Keyboard,
  Info,
  Users,
  LibraryBig,
  Video,
  Sparkles,
  Shield,
  Activity,
  Clock,
  Ear,
  Power
} from 'lucide-react';
import { TriggerWord, DeviceMode, AlertState, AppRoute, MonitoringMode, ProcessingMode, QuietHours, EmergencyContact, AppLanguage, SignLanguagePreference } from './types';
import { DEFAULT_TRIGGERS, IconRenderer, isMediaIcon } from './constants';
import { createBlob } from './services/audioUtils';
import { libraryService } from './services/supabaseClient';
import { SoundClassifier } from './services/soundClassifier';
import { analyzeScene, refineTranscript, queueTranscriptFragment, discoverNewTriggers, resetGemini3State } from './services/gemini3Intelligence';
import { AlertOverlay } from './components/AlertOverlay';
import { Settings } from './components/Settings';
import { HistoryScreen } from './components/HistoryScreen';
import { VoiceDeck } from './components/VoiceDeck';
import { CaregiverDashboard } from './components/CaregiverDashboard';
import { TriggerLibrary } from './components/TriggerLibrary';
import { initAiClient } from './shared/index';

// Initialize the shared AI client so VoiceDeck service can use it
initAiClient(GoogleGenAI);

// Error boundary to prevent VoiceDeck crashes from killing the whole app
class VoiceDeckErrorBoundary extends React.Component<
  { children: React.ReactNode; onBack: () => void },
  { hasError: boolean; error?: string }
> {
  declare props: { children: React.ReactNode; onBack: () => void };
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: String(error?.message || error) };
  }
  componentDidCatch(err: any) { console.error('VoiceDeck crashed:', err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-slate-950 text-white p-8 gap-4">
          <p className="text-xl font-bold">Voice Deck encountered an error</p>
          <p className="text-sm text-slate-400">{this.state.error}</p>
          <button onClick={this.props.onBack} className="px-6 py-3 bg-blue-600 rounded-xl font-bold">Go Back</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Force Roman Alphabet Output ---
// Strips non-Latin script characters and keeps only Roman letters, digits, punctuation
const toRoman = (text: string): string => {
  if (!text) return '';
  // Replace common non-Latin transcriptions of English words
  // Then strip any remaining non-Latin-script characters
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[\u0900-\u097F]/g, '')  // Devanagari
    .replace(/[\u0600-\u06FF]/g, '')  // Arabic
    .replace(/[\u0980-\u09FF]/g, '')  // Bengali
    .replace(/[\u0A00-\u0A7F]/g, '')  // Gurmukhi
    .replace(/[\u4E00-\u9FFF]/g, '')  // CJK
    .replace(/[\u3040-\u30FF]/g, '')  // Japanese
    .replace(/[\uAC00-\uD7AF]/g, '')  // Korean
    .replace(/\s{2,}/g, ' ')           // collapse whitespace
    .trim();
};

// --- Fuzzy Matching Utility ---
const levenshtein = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
    }
  }
  return matrix[b.length][a.length];
};

// --- Fast Trigger Matching (shared between cloud + offline) ---
const TRIGGER_DEBOUNCE_MS = 2500; // Don't re-fire same trigger within this window
const lastTriggerTimes: Record<string, number> = {};

const matchTriggersInstant = (
  text: string,
  triggers: TriggerWord[],
  userName: string,
  onMatch: (trigger: TriggerWord, text: string) => void
) => {
  if (!text || text.length < 2) return;
  const lower = text.toLowerCase().trim();
  const inputWords = lower.split(/\s+/);
  const now = Date.now();

  for (const t of triggers) {
    // Debounce: skip if same trigger fired recently
    if (lastTriggerTimes[t.id] && now - lastTriggerTimes[t.id] < TRIGGER_DEBOUNCE_MS) continue;

    let triggered = false;
    const wordsToCheck = [t.word, ...(t.synonyms || [])];

    for (const targetWord of wordsToCheck) {
      if (triggered) break;
      const lowerTarget = targetWord.toLowerCase();
      // Fast exact substring check first
      if (lower.includes(lowerTarget)) { triggered = true; break; }
      // Fuzzy match only for longer words
      if (lowerTarget.length > 3) {
        for (const w of inputWords) {
          if (Math.abs(w.length - lowerTarget.length) > 2) continue;
          const dist = levenshtein(w, lowerTarget);
          const threshold = lowerTarget.length <= 5 ? 1 : 2;
          if (dist <= threshold) { triggered = true; break; }
        }
      }
    }

    // Name detection
    if (t.id === 'name' && !triggered) {
      const targetName = userName.toLowerCase();
      if (lower.includes(targetName)) {
        triggered = true;
      } else {
        const nameParts = targetName.split(' ');
        if (nameParts.some(part => part.length > 2 && lower.includes(part))) {
          triggered = true;
        }
      }
    }

    if (triggered) {
      lastTriggerTimes[t.id] = now;
      onMatch(t, text);
    }
  }
};

const AudioWaveformVisualizer: React.FC<{ analyser: AnalyserNode | null, isActive: boolean }> = ({ analyser, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive || !analyser || !canvasRef.current) return;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.05)');
      gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.9)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0.05)');
      ctx.lineWidth = 3;
      ctx.strokeStyle = gradient;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [isActive, analyser]);

  return <canvas ref={canvasRef} width={400} height={60} className="w-full h-10 opacity-100" />;
};

const App: React.FC = () => {
  const [mode, setMode] = useState<DeviceMode>('mobile');
  const [monitoringMode, setMonitoringMode] = useState<MonitoringMode>('alert');
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('cloud');
  const [route, setRoute] = useState<AppRoute>(AppRoute.HOME);
  const [isListening, setIsListening] = useState(false);
  const [userName, setUserName] = useState('user');
  const [triggers, setTriggers] = useState<TriggerWord[]>(DEFAULT_TRIGGERS);
  const [vibrationIntensity, setVibrationIntensity] = useState(1.0);
  const [alert, setAlert] = useState<AlertState>({ active: false });

  // New feature states (persisted to localStorage)
  const [quietHours, setQuietHours] = useState<QuietHours>(() => {
    const saved = localStorage.getItem('silentear_quiet_hours');
    return saved ? JSON.parse(saved) : { enabled: false, start: '23:00', end: '07:00', bypassDanger: true };
  });
  const [emergencyContact, setEmergencyContact] = useState<EmergencyContact>(() => {
    const saved = localStorage.getItem('silentear_emergency_contact');
    return saved ? JSON.parse(saved) : { name: '', phone: '', autoCall: false };
  });
  const [language, setLanguage] = useState<AppLanguage>(() => {
    return (localStorage.getItem('silentear_language') as AppLanguage) || 'en-US';
  });
  const [flashEnabled, setFlashEnabled] = useState<boolean>(() => {
    return localStorage.getItem('silentear_flash') !== 'false';
  });
  const [soundClassifierEnabled, setSoundClassifierEnabled] = useState<boolean>(() => {
    return localStorage.getItem('silentear_sound_classifier') === 'true';
  });
  const [signLanguagePreference, setSignLanguagePreference] = useState<SignLanguagePreference>(() => {
    return (localStorage.getItem('silentear_sign_language') as SignLanguagePreference) || 'All';
  });

  // Persist new states to localStorage
  useEffect(() => { localStorage.setItem('silentear_quiet_hours', JSON.stringify(quietHours)); }, [quietHours]);
  useEffect(() => { localStorage.setItem('silentear_emergency_contact', JSON.stringify(emergencyContact)); }, [emergencyContact]);
  useEffect(() => { localStorage.setItem('silentear_language', language); }, [language]);
  useEffect(() => { localStorage.setItem('silentear_flash', String(flashEnabled)); }, [flashEnabled]);
  useEffect(() => { localStorage.setItem('silentear_sound_classifier', String(soundClassifierEnabled)); }, [soundClassifierEnabled]);
  useEffect(() => { localStorage.setItem('silentear_sign_language', signLanguagePreference); }, [signLanguagePreference]);

  // Load triggers and sync with global library
  useEffect(() => {
    const loadTriggers = async () => {
      // 1. Load from LocalStorage first for instant responsiveness
      const saved = localStorage.getItem('silentear_triggers');
      if (saved) {
        setTriggers(JSON.parse(saved));
      }

      // 2. Fetch from Centralized Library (Supabase) — merge with local
      try {
        const globalWords = await libraryService.fetchGlobalLibrary();
        if (globalWords && globalWords.length > 0) {
          const formattedGlobal: TriggerWord[] = globalWords.map(g => ({
            id: g.id,
            word: g.word,
            synonyms: g.synonyms,
            label: g.label,
            icon: g.icon,
            videoUrl: g.video_url || undefined,
            iconUrl: g.icon_url || undefined,
            language: g.language || undefined,
            vibrationPattern: g.vibration_pattern,
            color: g.color
          }));

          // Merge: cloud triggers + any local-only triggers the user added
          const cloudIds = new Set(formattedGlobal.map(t => t.id));
          const currentLocal = saved ? JSON.parse(saved) as TriggerWord[] : [];
          const localOnly = currentLocal.filter((t: TriggerWord) => !cloudIds.has(t.id));
          const merged = [...formattedGlobal, ...localOnly];
          localStorage.setItem('silentear_triggers', JSON.stringify(merged));
          setTriggers(merged);
        }
        // If cloud is empty, keep whatever is in localStorage (don't overwrite with defaults)
      } catch (e) {
        console.warn('Cloud trigger sync failed, keeping local:', e);
      }
    };
    loadTriggers();
  }, []);

  // Persist trigger changes (icon uploads, edits, additions, removals)
  useEffect(() => {
    localStorage.setItem('silentear_triggers', JSON.stringify(triggers));
  }, [triggers]);

  const [history, setHistory] = useState<AlertState[]>([]);
  const [status, setStatus] = useState<string>('Ready');
  const [transcript, setTranscript] = useState<string>('');
  const [fullTranscriptLog, setFullTranscriptLog] = useState<string[]>([]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [streamFlash, setStreamFlash] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  // Session timer
  useEffect(() => {
    if (isListening) {
      setSessionStartTime(Date.now());
    } else {
      setSessionStartTime(null);
      setSessionElapsed(0);
    }
  }, [isListening]);

  useEffect(() => {
    if (!sessionStartTime) return;
    const interval = setInterval(() => {
      setSessionElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  // ── Gemini 3 Intelligence Layer state ──
  const [sceneAnalysis, setSceneAnalysis] = useState<{ summary: string; urgency: string; suggestion?: string } | null>(null);
  const [refinedTranscript, setRefinedTranscript] = useState<string>('');
  const [triggerSuggestions, setTriggerSuggestions] = useState<{ word: string; reason: string; urgency: string }[]>([]);

  const triggersRef = useRef(triggers);
  const monitoringModeRef = useRef(monitoringMode);
  const vibrationIntensityRef = useRef(vibrationIntensity);
  const userNameRef = useRef(userName);
  const quietHoursRef = useRef(quietHours);
  const soundClassifierRef = useRef<SoundClassifier | null>(null);

  useEffect(() => { triggersRef.current = triggers; }, [triggers]);
  useEffect(() => { monitoringModeRef.current = monitoringMode; }, [monitoringMode]);
  useEffect(() => { vibrationIntensityRef.current = vibrationIntensity; }, [vibrationIntensity]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);
  useEffect(() => { quietHoursRef.current = quietHours; }, [quietHours]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  const hapticFeedback = useCallback((duration = 50) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(Math.round(duration * vibrationIntensityRef.current));
    }
  }, []);

  const triggerAlert = useCallback((trigger: TriggerWord, text: string, source: ProcessingMode) => {
    // Quiet Hours check
    const qh = quietHoursRef.current;
    if (qh.enabled) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = qh.start.split(':').map(Number);
      const [endH, endM] = qh.end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      let inQuietPeriod = false;
      if (startMinutes <= endMinutes) {
        inQuietPeriod = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      } else {
        // crosses midnight
        inQuietPeriod = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      }

      if (inQuietPeriod) {
        const isDanger = ['fire', 'danger', 'help'].includes(trigger.id);
        if (!qh.bypassDanger || !isDanger) {
          // Suppressed by quiet hours
          return;
        }
      }
    }

    const newAlert = { active: true, trigger, timestamp: Date.now(), detectedText: text, source };

    if (monitoringModeRef.current === 'alert') {
      setAlert(newAlert);
      hapticFeedback(200);
    } else {
      setStreamFlash(trigger.color);
      setTimeout(() => setStreamFlash(null), 800);

      if ('vibrate' in navigator) {
        const pattern = trigger.vibrationPattern.map((v, i) => i % 2 === 0 ? Math.round(v * vibrationIntensityRef.current) : v);
        navigator.vibrate(pattern);
      }
    }

    setHistory(prev => [newAlert, ...prev].slice(0, 50));

    // Broadcast to caregiver dashboard (Supabase)
    libraryService.broadcastAlert(newAlert, userNameRef.current).catch(() => { });
    // Also persist to Firestore (Google Cloud)
    backendFirestore.storeAlert({
      alertId: trigger.id,
      context: text,
      deviceId: libraryService.getDeviceId(),
      userName: userNameRef.current,
      timestamp: Date.now(),
    }).catch(() => { });
  }, [hapticFeedback]);

  // Handle incoming commands (pokes)
  useEffect(() => {
    const deviceId = libraryService.getDeviceId();
    const commandChannel = libraryService.subscribeToCommands(deviceId, (cmd) => {
      if (cmd.command === 'poke') {
        hapticFeedback(500);
        setAlert({
          active: true,
          trigger: {
            id: 'poke',
            word: 'Caregiver Poke',
            label: `Nudge from ${cmd.sender_name || 'Caregiver'}`,
            icon: 'hand',
            vibrationPattern: [500, 200, 500],
            color: 'bg-fuchsia-600'
          },
          timestamp: Date.now(),
          detectedText: 'Direct nudge from caregiver',
          source: 'cloud'
        });
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`SilentEar: ${cmd.sender_name || 'Caregiver'} is checking in`, {
            body: "A haptic nudge was sent to your device.",
            icon: '/pwa-192x192.png'
          });
        }
      }
    });

    return () => {
      libraryService.unsubscribeCaregiver(commandChannel);
    };
  }, [hapticFeedback]);

  // Periodic Status Updates (Heartbeat)
  useEffect(() => {
    let interval: any;

    const update = async () => {
      const status: any = {
        is_listening: isListening,
        user_name: userName,
        battery_level: (navigator as any).getBattery ? await (navigator as any).getBattery().then((b: any) => b.level) : null,
      };

      // Get location if permitted
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((pos) => {
          status.latitude = pos.coords.latitude;
          status.longitude = pos.coords.longitude;
          libraryService.updateDeviceStatus(status);
        }, () => {
          libraryService.updateDeviceStatus(status);
        });
      } else {
        libraryService.updateDeviceStatus(status);
      }
    };

    update();
    interval = setInterval(update, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [isListening, userName]);

  const stopListening = useCallback(() => {
    hapticFeedback(70);
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (soundClassifierRef.current) {
      soundClassifierRef.current.stop();
      soundClassifierRef.current = null;
    }
    // Close backend live session or direct session
    if (sessionRef.current) {
      if (typeof sessionRef.current.close === 'function') {
        sessionRef.current.close();
      }
      sessionRef.current = null;
    }
    setIsListening(false);
    setStatus('Stopped');
    setTranscript('');
    setFullTranscriptLog([]);
    setAnalyser(null);
    // Reset Gemini 3 intelligence state
    setSceneAnalysis(null);
    setRefinedTranscript('');
    setTriggerSuggestions([]);
    resetGemini3State();
    streamRef.current = null;
    audioContextRef.current = null;
  }, [hapticFeedback]);

  // ── Gemini 3 Intelligence Layer — periodic analysis ──
  useEffect(() => {
    if (!isListening) return;

    const runGemini3Analysis = async () => {
      try {
        // 1. Scene Intelligence
        const scene = await analyzeScene(history.slice(0, 10), fullTranscriptLog, userName);
        if (scene) setSceneAnalysis(scene);

        // 2. Smart Transcript Refinement
        const refined = await refineTranscript();
        if (refined) setRefinedTranscript(refined);

        // 3. Trigger Auto-Discovery
        const suggestions = await discoverNewTriggers(fullTranscriptLog, triggers);
        if (suggestions.length > 0) setTriggerSuggestions(suggestions);
      } catch (e) {
        console.warn('[Gemini3] Periodic analysis error:', e);
      }
    };

    // Run first analysis after 10s, then every 12s
    const timeout = setTimeout(runGemini3Analysis, 10000);
    const interval = setInterval(runGemini3Analysis, 12000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [isListening, history, fullTranscriptLog, userName, triggers]);

  const startOfflineListening = useCallback(async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus('Speech API Not Supported');
      return;
    }
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 1024;
      setAnalyser(analyserNode);
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyserNode);

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US'; // Always use English for Roman alphabet output

      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }

      recognition.onstart = () => { setIsListening(true); setStatus('Offline Monitoring'); };
      recognition.onresult = (event: any) => {
        const current = event.resultIndex;
        const transcriptText = toRoman(event.results[current][0].transcript.toLowerCase().trim());
        if (!transcriptText) return;
        setTranscript(transcriptText);
        if (event.results[current].isFinal) {
          setFullTranscriptLog(prev => [...prev, transcriptText].slice(-100));
          queueTranscriptFragment(transcriptText); // Feed Gemini 3 refiner
        }
        // Instant trigger matching on both interim and final results
        matchTriggersInstant(transcriptText, triggersRef.current, userNameRef.current, (t, txt) => {
          triggerAlert(t, txt, 'offline');
        });
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          stopListening();
          setStatus('Mic Permission Denied');
        }
      };

      recognition.onend = () => {
        if (isListening && processingMode === 'offline') {
          try { recognition.start(); } catch (e) { }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();

      // Start sound classifier if enabled
      if (soundClassifierEnabled) {
        const classifier = new SoundClassifier((event) => {
          const soundTrigger: TriggerWord = {
            id: event.type,
            word: event.label,
            synonyms: [],
            label: `🔊 ${event.label}`,
            icon: event.type === 'alarm_siren' ? 'bell' : event.type === 'glass_break' ? 'alert-triangle' : event.type === 'knocking' ? 'door-open' : 'volume-2',
            vibrationPattern: [300, 100, 300],
            color: event.type === 'alarm_siren' ? 'bg-red-500' : event.type === 'glass_break' ? 'bg-orange-500' : 'bg-yellow-500'
          };
          // Check if there's a matching trigger in user's list
          const userTrigger = triggersRef.current.find(t =>
            t.word.toLowerCase().includes(event.type.replace('_', ' ')) ||
            event.label.toLowerCase().includes(t.word.toLowerCase())
          );
          triggerAlert(userTrigger || soundTrigger, `Sound detected: ${event.label} (${Math.round(event.confidence * 100)}% confidence)`, 'offline');
        });
        classifier.start(stream);
        soundClassifierRef.current = classifier;
      }
    } catch (e) {
      setStatus('Mic Access Error');
    }
  }, [triggerAlert, isListening, processingMode, stopListening, language, soundClassifierEnabled]);

  const startCloudListening = async () => {
    hapticFeedback(50);
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    try {
      setStatus('Connecting AI...');
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 1024;
      setAnalyser(analyserNode);

      // HYBRID SPEED BOOST: Start local background recognition in parallel
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const localRec = new SpeechRecognition();
        localRec.continuous = true;
        localRec.interimResults = true;
        localRec.lang = 'en-US'; // Force English for transcript clarity
        localRec.onresult = (event: any) => {
          const current = event.resultIndex;
          const text = event.results[current][0].transcript.toLowerCase().trim();
          matchTriggersInstant(text, triggersRef.current, userNameRef.current, (t, txt) => {
            triggerAlert(t, txt, 'offline'); // 'offline' source indicates local hit
          });
        };
        localRec.start();
        recognitionRef.current = localRec;
      }

      // Check if backend (Cloud Run) is available — use server-side proxy if so
      const useBackend = await isBackendAvailable();

      if (useBackend) {
        // ── Server-side Gemini Live API via Cloud Run backend ──
        const deviceId = libraryService.getDeviceId();
        const liveSession = new BackendLiveSession({
          onReady: () => {
            setIsListening(true);
            setStatus('AI Monitoring (Cloud)');
            const source = audioCtx.createMediaStreamSource(stream);
            const scriptProcessor = audioCtx.createScriptProcessor(2048, 1, 1);
            source.connect(analyserNode);

            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              liveSession.sendAudio(pcmBlob.data, pcmBlob.mimeType);
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioCtx.destination);
          },
          onTranscription: (rawText: string) => {
            const text = toRoman(rawText);
            if (!text) return;
            setTranscript(text);
            if (text.trim()) {
              setFullTranscriptLog(prev => [...prev, text.trim()].slice(-100));
              queueTranscriptFragment(text.trim());
            }
            matchTriggersInstant(text, triggersRef.current, userNameRef.current, (t, txt) => {
              triggerAlert(t, txt, 'cloud');
            });
          },
          onToolCall: (alertId: string, context: string) => {
            const foundTrigger = triggersRef.current.find(t => t.id === alertId);
            if (foundTrigger) triggerAlert(foundTrigger, context, 'cloud');
          },
          onError: (msg: string) => { stopListening(); setStatus('AI Connection Lost'); },
          onClose: () => stopListening(),
        });

        liveSession.connect({
          userName: userNameRef.current,
          deviceId,
          triggers: triggersRef.current.map(t => ({
            id: t.id, word: t.word, synonyms: t.synonyms, label: t.label
          })),
        });
        sessionRef.current = liveSession;
      } else {
        // ── Direct client-side Gemini Live API (fallback) ──
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const triggerTool: FunctionDeclaration = {
          name: 'trigger_alert',
          description: 'Call this tool when a specific environmental sound, intent, or keyword is heard that matches the given categories.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              alert_id: { type: Type.STRING, description: 'The ID of the alert to trigger based on what was heard.' },
              context: { type: Type.STRING, description: 'Short summary of what was heard.' }
            },
            required: ['alert_id']
          }
        };

        const systemPrompt = `You are "SilentEar", an ultra-fast audio monitor for a deaf person.
RULES:
- Call trigger_alert IMMEDIATELY when you hear a match. Speed is critical — lives depend on it.
- Transcribe ALL speech continuously in English, even in noisy environments. Use noise-robust interpretation.
- For non-speech sounds (knocking, alarms, glass, crying), trigger INSTANTLY without waiting for confirmation.
- If unsure, trigger anyway — false positives are acceptable, missed alerts are not.

Alert IDs:
${triggersRef.current.map(t => {
          if (t.id === 'name') return `"${t.id}": Someone says "${userNameRef.current}" or addresses them`;
          return `"${t.id}": ${t.label} — keywords: ${t.word}${t.synonyms?.length ? ', ' + t.synonyms.join(', ') : ''}`;
        }).join('\n')}

Respond ONLY with tool calls. No spoken responses. Transcribe everything.`;

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-latest',
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            tools: [{ functionDeclarations: [triggerTool] }],
            systemInstruction: systemPrompt,
          },
          callbacks: {
            onopen: () => {
              setIsListening(true);
              setStatus('AI Monitoring');
              const source = audioCtx.createMediaStreamSource(stream);
              const scriptProcessor = audioCtx.createScriptProcessor(2048, 1, 1);
              source.connect(analyserNode);

              let activeSession: any = null;
              sessionPromise.then(s => activeSession = s);

              scriptProcessor.onaudioprocess = (e) => {
                if (!activeSession) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                activeSession.sendRealtimeInput({ media: pcmBlob });
              };
              source.connect(scriptProcessor);
              scriptProcessor.connect(audioCtx.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              if (message.serverContent?.inputTranscription) {
                const rawText = message.serverContent.inputTranscription.text;
                const text = toRoman(rawText);
                if (!text) return;
                setTranscript(text);
                if (text.trim()) {
                  setFullTranscriptLog(prev => [...prev, text.trim()].slice(-100));
                  queueTranscriptFragment(text.trim());
                }
                matchTriggersInstant(text, triggersRef.current, userNameRef.current, (t, txt) => {
                  triggerAlert(t, txt, 'cloud');
                });
              }
              if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                  if (fc.name === 'trigger_alert') {
                    const alertId = (fc.args as any).alert_id;
                    const context = (fc.args as any).context || "AI Detection";
                    const foundTrigger = triggersRef.current.find(t => t.id === alertId);
                    if (foundTrigger) triggerAlert(foundTrigger, context, 'cloud');
                    sessionPromise.then(session => session.sendToolResponse({
                      functionResponses: { id: fc.id, name: fc.name, response: { result: "Confirmed" } }
                    }));
                  }
                }
              }
            },
            onerror: (e) => { stopListening(); setStatus('AI Connection Lost'); },
            onclose: () => stopListening()
          }
        });
        sessionRef.current = await sessionPromise;
      }
    } catch (err) {
      setStatus('AI Offline');
      console.error(err);
    }
  };

  const handleStart = () => processingMode === 'cloud' ? startCloudListening() : startOfflineListening();

  const isWatch = mode === 'watch';

  const renderContent = () => {
    if (route === AppRoute.SETTINGS) {
      return (
        <Settings
          onBack={() => { hapticFeedback(30); setRoute(AppRoute.HOME); }}
          userName={userName}
          setUserName={setUserName}
          vibrationIntensity={vibrationIntensity}
          onIntensityChange={setVibrationIntensity}
          processingMode={processingMode}
          onProcessingModeChange={setProcessingMode}
          quietHours={quietHours}
          onQuietHoursChange={setQuietHours}
          emergencyContact={emergencyContact}
          onEmergencyContactChange={setEmergencyContact}
          language={language}
          onLanguageChange={setLanguage}
          flashEnabled={flashEnabled}
          onFlashEnabledChange={setFlashEnabled}
          soundClassifierEnabled={soundClassifierEnabled}
          onSoundClassifierChange={setSoundClassifierEnabled}
          signLanguagePreference={signLanguagePreference}
          onSignLanguagePreferenceChange={setSignLanguagePreference}
        />
      );
    }

    if (route === AppRoute.HISTORY) {
      return <HistoryScreen history={history} onBack={() => { hapticFeedback(30); setRoute(AppRoute.HOME); }} onClear={() => { hapticFeedback(100); setHistory([]); }} />;
    }

    if (route === AppRoute.SPEAK) {
      return (
        <VoiceDeckErrorBoundary onBack={() => { hapticFeedback(30); setRoute(AppRoute.HOME); }}>
          <VoiceDeck
            onBack={() => { hapticFeedback(30); setRoute(AppRoute.HOME); }}
            context={sceneAnalysis?.summary || refinedTranscript || transcript}
          />
        </VoiceDeckErrorBoundary>
      );
    }

    if (route === AppRoute.CAREGIVER) {
      return <CaregiverDashboard onBack={() => { hapticFeedback(30); setRoute(AppRoute.HOME); }} />;
    }

    if (route === AppRoute.LIBRARY) {
      return (
        <TriggerLibrary
          triggers={triggers}
          onAdd={triggerOrWord => {
            const trigger = typeof triggerOrWord === 'string'
              ? {
                id: Date.now().toString(),
                word: triggerOrWord,
                synonyms: [],
                label: triggerOrWord,
                icon: 'zap',
                vibrationPattern: [200],
                color: 'bg-indigo-500',
                sourceApp: 'silentear' as const,
              }
              : triggerOrWord;
            setTriggers(current => [...current, trigger]);
          }}
          onRemove={id => setTriggers(current => current.filter(t => t.id !== id))}
          onUpdateTrigger={u => {
            setTriggers(current => current.map(t => t.id === u.id ? u : t));
            libraryService.syncUserTrigger({
              id: u.id,
              word: u.word,
              synonyms: u.synonyms || [],
              label: u.label,
              icon: u.icon,
              video_url: u.videoUrl,
              icon_url: u.iconUrl,
              language: u.language,
              vibration_pattern: u.vibrationPattern,
              color: u.color,
              source_app: u.sourceApp || 'silentear',
              linked_emoji_id: u.linkedSignEmoji,
            });
          }}
          onBack={() => { hapticFeedback(30); setRoute(AppRoute.HOME); }}
        />
      );
    }

    // HOME ROUTE
    return (
      <div className="flex flex-col h-full relative z-10">
        <header className={`flex-none flex items-center justify-between px-6 z-20 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-900/0 ${isWatch ? 'pt-8 pb-2' : 'pt-12 pb-6'}`}>
          <div className="flex flex-col">
            <span className={`text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1 ${processingMode === 'cloud' ? 'text-blue-500' : 'text-emerald-500'}`}>
              SilentEar {processingMode === 'cloud' ? <Wifi size={10} /> : <WifiOff size={10} />}
            </span>
            <span className={`text-[10px] font-bold ${isListening ? 'text-green-400' : 'text-slate-500'}`}>
              {status.toUpperCase()}
            </span>
          </div>
          {!isWatch && (
            <div className="flex gap-2">
              <button
                onClick={() => { hapticFeedback(50); window.location.href = './signmoji/index.html'; }}
                className="p-2.5 bg-indigo-600 rounded-2xl hover:bg-indigo-500 transition-all text-white shadow-lg shadow-indigo-500/20 flex items-center gap-2 group"
                title="Open SignMoji"
              >
                <Sparkles size={18} className="animate-pulse" />
                <span className="text-xs font-bold pr-1 hidden sm:inline">SignMoji</span>
              </button>
              <button onClick={() => { hapticFeedback(30); setRoute(AppRoute.LIBRARY); }} className="p-2.5 bg-slate-800 rounded-2xl hover:bg-slate-700 transition-all text-slate-300">
                <LibraryBig size={20} />
              </button>
              <button onClick={() => { hapticFeedback(30); setRoute(AppRoute.CAREGIVER); }} className="p-2.5 bg-slate-800 rounded-2xl hover:bg-slate-700 transition-all text-slate-300">
                <Users size={20} />
              </button>
              <button onClick={() => { hapticFeedback(30); setRoute(AppRoute.HISTORY); }} className="p-2.5 bg-slate-800 rounded-2xl hover:bg-slate-700 transition-all text-slate-300">
                <History size={20} />
              </button>
              <button onClick={() => { hapticFeedback(30); setRoute(AppRoute.SETTINGS); }} className="p-2.5 bg-slate-800 rounded-2xl hover:bg-slate-700 transition-all text-slate-300">
                <SettingsIcon size={20} />
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
          <div className={`flex flex-col items-center justify-start space-y-4 px-4 pb-4 ${isWatch ? 'pt-0' : 'pt-2'}`}>
            {!isWatch && (
              <div className="w-full bg-slate-800/40 p-1.5 rounded-3xl flex border border-slate-700/50 flex-none gap-1">
                <button onClick={() => { hapticFeedback(30); setMonitoringMode('alert'); }}
                  className={`flex-1 flex flex-col items-center justify-center py-3.5 rounded-2xl transition-all ${monitoringMode === 'alert' ? 'bg-blue-600 text-white shadow-xl scale-100' : 'text-slate-500 hover:text-slate-300'}`}>
                  <BellRing size={18} className="mb-1" /> <span className="text-[10px] font-bold uppercase tracking-wider">Alert</span>
                </button>
                <button onClick={() => { hapticFeedback(30); setMonitoringMode('conversation'); }}
                  className={`flex-1 flex flex-col items-center justify-center py-3.5 rounded-2xl transition-all ${monitoringMode === 'conversation' ? 'bg-blue-600 text-white shadow-xl scale-100' : 'text-slate-500 hover:text-slate-300'}`}>
                  <MessageSquare size={18} className="mb-1" /> <span className="text-[10px] font-bold uppercase tracking-wider">Stream</span>
                </button>
                <button onClick={() => { hapticFeedback(30); setRoute(AppRoute.SPEAK); }}
                  className="flex-1 flex flex-col items-center justify-center py-3.5 rounded-2xl transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-700/50">
                  <Keyboard size={18} className="mb-1" /> <span className="text-[10px] font-bold uppercase tracking-wider">Speak</span>
                </button>
              </div>
            )}

            {/* ── Compact Listening Control ── */}
            <div className={`w-full flex-none ${isWatch ? 'scale-90' : ''}`}>
              <div className="relative bg-slate-800/40 rounded-[24px] border border-slate-700/40 p-3 flex items-center gap-3 overflow-hidden">
                <div className={`absolute inset-0 rounded-[24px] blur-2xl transition-all duration-700 pointer-events-none ${isListening ? 'opacity-100' : 'opacity-0'} ${streamFlash || (processingMode === 'cloud' ? 'bg-blue-500/10' : 'bg-emerald-500/10')}`} />
                <button
                  onClick={() => isListening ? stopListening() : handleStart()}
                  className={`relative z-10 w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-lg active:scale-95
                    ${isListening ? 'bg-rose-600' : (processingMode === 'cloud' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500')}`}
                >
                  {isListening ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
                </button>
                <div className="flex-1 min-w-0 relative z-10">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                      <span className={`text-[10px] font-black uppercase tracking-wider ${isListening ? 'text-green-400' : 'text-slate-500'}`}>
                        {isListening ? 'LISTENING' : 'READY'}
                      </span>
                    </div>
                    {isListening && (
                      <span className="text-[10px] font-mono text-slate-400 tabular-nums">{formatTime(sessionElapsed)}</span>
                    )}
                  </div>
                  <div className="h-6 flex items-center">
                    {isListening ? (
                      <AudioWaveformVisualizer isActive={isListening} analyser={analyser} />
                    ) : (
                      <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
                    )}
                  </div>
                  <p className={`text-[11px] leading-tight mt-0.5 truncate transition-all ${transcript ? 'text-slate-300' : 'text-slate-600 italic'}`}>
                    {isWatch ? (transcript || 'Monitoring...') : (transcript || (processingMode === 'cloud' ? 'AI ambient monitoring ready' : 'Offline keyword monitor ready'))}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Quick Actions ── */}
            {!isWatch && (
              <div className="w-full grid grid-cols-3 gap-2 flex-none">
                <button
                  onClick={() => {
                    hapticFeedback(100);
                    if (emergencyContact.phone) {
                      window.location.href = `tel:${emergencyContact.phone}`;
                    } else {
                      setRoute(AppRoute.SETTINGS);
                    }
                  }}
                  className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 flex flex-col items-center gap-1 hover:bg-red-500/20 transition-all active:scale-95"
                >
                  <Shield size={18} className="text-red-400" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-red-300">SOS</span>
                </button>
                <button
                  onClick={() => { hapticFeedback(30); setRoute(AppRoute.SPEAK); }}
                  className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 flex flex-col items-center gap-1 hover:bg-blue-500/20 transition-all active:scale-95"
                >
                  <Keyboard size={18} className="text-blue-400" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-blue-300">Speak</span>
                </button>
                <button
                  onClick={() => { hapticFeedback(30); setRoute(AppRoute.CAREGIVER); }}
                  className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-3 flex flex-col items-center gap-1 hover:bg-purple-500/20 transition-all active:scale-95"
                >
                  <Users size={18} className="text-purple-400" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-purple-300">Care</span>
                </button>
              </div>
            )}

            {/* ── Active Monitors ── */}
            {!isWatch && (
              <div className="w-full flex-none">
                <div className="flex items-center justify-between mb-2 px-0.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 flex items-center gap-1.5">
                    <Activity size={11} /> Monitoring {triggers.length} Triggers
                  </span>
                  <button onClick={() => { hapticFeedback(30); setRoute(AppRoute.LIBRARY); }} className="text-[10px] font-bold text-blue-500 hover:text-blue-400 flex items-center">
                    Edit <ChevronRight size={10} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {triggers.slice(0, 10).map(t => (
                    <div key={t.id} className={`px-2.5 py-1 rounded-xl text-[9px] font-bold border flex items-center gap-1 transition-all ${isListening ? 'border-white/10 bg-slate-800/60 text-slate-300' : 'border-white/5 bg-slate-800/30 text-slate-500'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isListening ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                      {t.label}
                    </div>
                  ))}
                  {triggers.length > 10 && (
                    <div className="px-2.5 py-1 rounded-xl text-[9px] font-bold text-slate-600 border border-transparent">
                      +{triggers.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Session Stats ── */}
            {!isWatch && isListening && (
              <div className="w-full grid grid-cols-3 gap-2 flex-none">
                <div className="bg-slate-800/30 rounded-2xl p-2.5 text-center border border-white/5">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Clock size={10} className="text-slate-400" />
                    <span className="text-sm font-black text-slate-200 tabular-nums">{formatTime(sessionElapsed)}</span>
                  </div>
                  <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Uptime</span>
                </div>
                <div className="bg-slate-800/30 rounded-2xl p-2.5 text-center border border-white/5">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Waves size={10} className="text-slate-400" />
                    <span className="text-sm font-black text-slate-200">{history.length}</span>
                  </div>
                  <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Detected</span>
                </div>
                <div className="bg-slate-800/30 rounded-2xl p-2.5 text-center border border-white/5">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    {processingMode === 'cloud' ? <Wifi size={10} className="text-blue-400" /> : <WifiOff size={10} className="text-emerald-400" />}
                    <span className="text-sm font-black text-slate-200">{processingMode === 'cloud' ? 'AI' : 'Local'}</span>
                  </div>
                  <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Engine</span>
                </div>
              </div>
            )}

            {monitoringMode === 'conversation' && (fullTranscriptLog.length > 0 || history.length > 0 || sceneAnalysis || triggerSuggestions.length > 0) && (
              <div className="w-full pt-2 animate-in fade-in slide-in-from-bottom-6 flex-none">
                {/* ── Gemini 3 Scene Intelligence Banner ── */}
                {sceneAnalysis && (
                  <div className={`w-full mb-4 rounded-2xl border p-3 backdrop-blur-sm transition-all duration-500 ${sceneAnalysis.urgency === 'critical' ? 'bg-red-900/40 border-red-500/50' :
                    sceneAnalysis.urgency === 'high' ? 'bg-orange-900/30 border-orange-500/40' :
                      sceneAnalysis.urgency === 'medium' ? 'bg-yellow-900/20 border-yellow-500/30' :
                        'bg-blue-900/20 border-blue-500/20'
                    }`}>
                    <div className="flex items-start gap-2">
                      <div className="shrink-0 mt-0.5">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${sceneAnalysis.urgency === 'critical' ? 'bg-red-400' :
                          sceneAnalysis.urgency === 'high' ? 'bg-orange-400' :
                            sceneAnalysis.urgency === 'medium' ? 'bg-yellow-400' :
                              'bg-blue-400'
                          }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-1 flex items-center gap-1">
                          ✦ Gemini 3 Scene Intelligence
                        </div>
                        <p className="text-xs font-medium text-slate-200 leading-relaxed">{sceneAnalysis.summary}</p>
                        {sceneAnalysis.suggestion && (
                          <p className="text-[10px] text-slate-400 mt-1 italic">💡 {sceneAnalysis.suggestion}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Gemini 3 Refined Transcript ── */}
                {refinedTranscript && (
                  <div className="w-full mb-4 bg-slate-800/30 rounded-2xl border border-emerald-500/20 p-3">
                    <div className="text-[9px] font-black uppercase tracking-[0.15em] text-emerald-400/60 mb-1">✦ Gemini 3 Refined Transcript</div>
                    <p className="text-xs text-slate-200 leading-relaxed">{refinedTranscript}</p>
                  </div>
                )}

                {/* Full running transcript ticker */}
                {fullTranscriptLog.length > 0 && (
                  <div className="w-full overflow-hidden mb-4 bg-slate-800/40 rounded-2xl border border-slate-700/50 py-2.5 px-1 relative">
                    <div className="flex items-center gap-1 animate-marquee whitespace-nowrap">
                      <span className="text-xs font-medium text-slate-300">
                        {fullTranscriptLog.map((text, i) => {
                          // Highlight words that match any trigger
                          const words = text.split(/\s+/);
                          return (
                            <span key={i}>
                              {words.map((word, wi) => {
                                const isTriggered = triggersRef.current.some(t => {
                                  const targets = [t.word, ...(t.synonyms || [])].map(w => w.toLowerCase());
                                  return targets.some(tw => word.toLowerCase().includes(tw) || tw.includes(word.toLowerCase()));
                                });
                                return (
                                  <span key={wi} className={isTriggered ? 'text-yellow-400 font-bold' : 'text-white/70'}>
                                    {word}{' '}
                                  </span>
                                );
                              })}
                              <span className="text-slate-600 mx-1">·</span>
                            </span>
                          );
                        })}
                      </span>
                      {/* Duplicate for seamless loop */}
                      <span className="text-xs font-medium text-slate-300">
                        {fullTranscriptLog.map((text, i) => {
                          const words = text.split(/\s+/);
                          return (
                            <span key={`dup-${i}`}>
                              {words.map((word, wi) => {
                                const isTriggered = triggersRef.current.some(t => {
                                  const targets = [t.word, ...(t.synonyms || [])].map(w => w.toLowerCase());
                                  return targets.some(tw => word.toLowerCase().includes(tw) || tw.includes(word.toLowerCase()));
                                });
                                return (
                                  <span key={wi} className={isTriggered ? 'text-yellow-400 font-bold' : 'text-white/70'}>
                                    {word}{' '}
                                  </span>
                                );
                              })}
                              <span className="text-slate-600 mx-1">·</span>
                            </span>
                          );
                        })}
                      </span>
                    </div>
                  </div>
                )}
                {history.length > 0 && (
                  <>
                    <div className="text-[10px] font-black text-slate-500 uppercase mb-4 tracking-widest px-1 flex items-center gap-2">
                      <Waves size={12} /> Detected Sounds
                    </div>
                    <div className="flex space-x-6 overflow-x-auto pb-6 no-scrollbar px-1 snap-x">
                      {history.map((h, i) => {
                        const isMedia = h.trigger?.icon ? isMediaIcon(h.trigger.icon) : false;
                        const hasIconUrl = !!(h.trigger?.iconUrl && h.trigger.iconUrl.startsWith('http'));
                        return (
                          <div key={i} className={`flex flex-col items-center flex-shrink-0 space-y-3 animate-in zoom-in-75 duration-500 snap-start ${i === 0 ? 'scale-105 opacity-100' : 'opacity-60'}`}>
                            <div className={`w-36 h-56 rounded-[32px] flex items-center justify-center shadow-[0_20px_40px_rgba(0,0,0,0.6)] border border-white/10 overflow-hidden relative group ${h.trigger?.color} ${isMedia ? 'bg-black' : ''}`}>
                              <IconRenderer
                                icon={h.trigger?.icon || 'zap'}
                                className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${!isMedia ? 'p-10 text-white' : ''}`}
                              />
                              {/* Small icon overlay when trigger has a separate iconUrl */}
                              {hasIconUrl && (
                                <div className="absolute top-2 right-2 w-10 h-10 rounded-xl overflow-hidden border border-white/20 shadow-lg bg-black/40 z-10">
                                  <img
                                    src={h.trigger!.iconUrl}
                                    alt={h.trigger?.label || 'icon'}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4 flex flex-col items-center text-center">
                                <span className="text-[10px] font-black text-white uppercase tracking-[0.15em] drop-shadow-md">
                                  {h.trigger?.label}
                                </span>
                                <span className="text-[8px] font-bold text-white/60 uppercase mt-0.5">
                                  {new Date(h.timestamp || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* ── Gemini 3 Trigger Auto-Discovery ── */}
                {triggerSuggestions.length > 0 && (
                  <div className="w-full mt-2 bg-slate-800/30 rounded-2xl border border-purple-500/20 p-3">
                    <div className="text-[9px] font-black uppercase tracking-[0.15em] text-purple-400/60 mb-2">✦ Gemini 3 Suggested Triggers</div>
                    <div className="flex flex-wrap gap-2">
                      {triggerSuggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            hapticFeedback(30);
                            const newTrigger: TriggerWord = {
                              id: `ai-${Date.now()}-${i}`,
                              word: s.word,
                              synonyms: [],
                              label: s.word,
                              icon: 'zap',
                              vibrationPattern: s.urgency === 'high' ? [300, 100, 300] : [200],
                              color: s.urgency === 'high' ? 'bg-red-500' : s.urgency === 'medium' ? 'bg-yellow-500' : 'bg-indigo-500'
                            };
                            setTriggers(prev => [...prev, newTrigger]);
                            setTriggerSuggestions(prev => prev.filter((_, j) => j !== i));
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all active:scale-95 ${s.urgency === 'high' ? 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20' :
                            s.urgency === 'medium' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/20' :
                              'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20'
                            }`}
                          title={s.reason}
                        >
                          + {s.word}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-500 mt-1.5">Tap to add • Based on detected conversation patterns</p>
                  </div>
                )}
              </div>
            )}

            {monitoringMode === 'alert' && sceneAnalysis && isListening && (
              <div className={`w-full mb-2 rounded-2xl border p-3 backdrop-blur-sm transition-all duration-500 ${sceneAnalysis.urgency === 'critical' ? 'bg-red-900/40 border-red-500/50' :
                sceneAnalysis.urgency === 'high' ? 'bg-orange-900/30 border-orange-500/40' :
                  sceneAnalysis.urgency === 'medium' ? 'bg-yellow-900/20 border-yellow-500/30' :
                    'bg-blue-900/20 border-blue-500/20'
                }`}>
                <div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-1">✦ Gemini 3 Scene Intelligence</div>
                <p className="text-xs font-medium text-slate-200 leading-relaxed">{sceneAnalysis.summary}</p>
                {sceneAnalysis.suggestion && (
                  <p className="text-[10px] text-slate-400 mt-1 italic">💡 {sceneAnalysis.suggestion}</p>
                )}
              </div>
            )}

            {monitoringMode === 'alert' && history.length > 0 && (
              <div className="w-full flex flex-col pt-2 flex-none">
                <div className="flex items-center justify-between text-slate-500 mb-4 px-1">
                  <div className="flex items-center space-x-2">
                    <History size={14} /> <span className="text-[10px] uppercase font-black tracking-[0.15em]">Last Alerts</span>
                  </div>
                  <button onClick={() => { hapticFeedback(30); setRoute(AppRoute.HISTORY); }} className="text-[10px] font-black text-blue-500 hover:text-blue-400 flex items-center">
                    VIEW LOG <ChevronRight size={12} />
                  </button>
                </div>
                <div className="space-y-3">
                  {history.slice(0, isWatch ? 1 : 3).map((h, i) => (
                    <div key={i} className={`flex items-center justify-between bg-slate-800/40 p-4 rounded-3xl border border-white/5 backdrop-blur-sm ${isWatch ? 'scale-90' : ''}`}>
                      <div className="flex items-center overflow-hidden">
                        <div className={`p-2.5 rounded-2xl mr-4 shrink-0 shadow-lg ${h.trigger?.color}`}>
                          <IconRenderer icon={h.trigger?.icon || 'zap'} size={18} />
                        </div>
                        <div className="flex flex-col truncate">
                          <span className="text-sm font-black text-slate-100 tracking-tight">{h.trigger?.label}</span>
                          <span className="text-[10px] text-slate-500 truncate font-medium">{new Date(h.timestamp || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        </div>
                      </div>
                      {!isWatch && <span className="px-2 py-1 rounded-lg bg-slate-900/50 text-[9px] text-slate-400 font-bold uppercase tracking-widest">{h.source}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isWatch && !isListening && history.length === 0 && (
              <div className="w-full grid grid-cols-2 gap-3 flex-none">
                <button onClick={() => { hapticFeedback(30); setRoute(AppRoute.LIBRARY); }} className="bg-slate-800/20 p-4 rounded-[24px] flex flex-col items-center border border-white/5 hover:bg-slate-800/40 transition-all active:scale-95">
                  <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center mb-2">
                    <LayoutGrid className="text-blue-400" size={18} />
                  </div>
                  <span className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Triggers</span>
                  <span className="text-base font-black text-slate-200">{triggers.length}</span>
                </button>
                <div className="bg-slate-800/20 p-4 rounded-[24px] flex flex-col items-center border border-white/5">
                  <div className="w-9 h-9 bg-purple-500/10 rounded-xl flex items-center justify-center mb-2">
                    <Wifi className="text-purple-400" size={18} />
                  </div>
                  <span className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Engine</span>
                  <span className="text-base font-black text-slate-200">{processingMode === 'cloud' ? 'AI' : 'Local'}</span>
                </div>
                <div className="bg-slate-800/20 p-4 rounded-[24px] flex flex-col items-center border border-white/5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${quietHours.enabled ? 'bg-yellow-500/10' : 'bg-slate-500/10'}`}>
                    <Clock className={quietHours.enabled ? 'text-yellow-400' : 'text-slate-500'} size={18} />
                  </div>
                  <span className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Quiet Hrs</span>
                  <span className="text-base font-black text-slate-200">{quietHours.enabled ? 'On' : 'Off'}</span>
                </div>
                <div className="bg-slate-800/20 p-4 rounded-[24px] flex flex-col items-center border border-white/5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${soundClassifierEnabled ? 'bg-emerald-500/10' : 'bg-slate-500/10'}`}>
                    <Ear className={soundClassifierEnabled ? 'text-emerald-400' : 'text-slate-500'} size={18} />
                  </div>
                  <span className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Sound AI</span>
                  <span className="text-base font-black text-slate-200">{soundClassifierEnabled ? 'On' : 'Off'}</span>
                </div>
              </div>
            )}
          </div>
        </main>

        <nav className="flex-none z-30 bg-slate-900/95 backdrop-blur-xl border-t border-white/5">
          <div className="flex items-end justify-around px-2 pt-1 pb-2">
            <button onClick={() => { hapticFeedback(20); setRoute(AppRoute.HOME); }} className="flex flex-col items-center py-1.5 px-2 transition-all text-blue-400">
              <Smartphone size={18} />
              <span className="text-[8px] font-bold mt-0.5">Home</span>
            </button>
            <button onClick={() => { hapticFeedback(20); setRoute(AppRoute.LIBRARY); }} className="flex flex-col items-center py-1.5 px-2 transition-all text-slate-500 hover:text-slate-300">
              <LibraryBig size={18} />
              <span className="text-[8px] font-bold mt-0.5">Library</span>
            </button>
            <button
              onClick={() => isListening ? stopListening() : handleStart()}
              className={`flex items-center justify-center w-12 h-12 -mt-3 rounded-2xl transition-all shadow-lg active:scale-95
                ${isListening ? 'bg-rose-600 shadow-rose-500/30' : 'bg-blue-600 shadow-blue-500/30'}`}
            >
              {isListening ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
            </button>
            <button onClick={() => { hapticFeedback(20); setRoute(AppRoute.HISTORY); }} className="flex flex-col items-center py-1.5 px-2 transition-all text-slate-500 hover:text-slate-300">
              <History size={18} />
              <span className="text-[8px] font-bold mt-0.5">History</span>
            </button>
            <button onClick={() => { hapticFeedback(20); setRoute(AppRoute.SETTINGS); }} className="flex flex-col items-center py-1.5 px-2 transition-all text-slate-500 hover:text-slate-300">
              <SettingsIcon size={18} />
              <span className="text-[8px] font-bold mt-0.5">Settings</span>
            </button>
          </div>
        </nav>
      </div>
    );
  };

  return (
    <div className="flex items-center justify-center h-screen bg-[#050505] overflow-hidden">
      <div className={`relative bg-slate-900 shadow-[0_0_100px_rgba(0,0,0,1)] transition-all duration-700 flex flex-col overflow-hidden
        ${isWatch ? 'w-[280px] h-[280px] rounded-[70px] border-[12px] border-slate-800 scale-110' : 'w-full h-full max-w-[430px] max-h-[900px] sm:rounded-[60px] border-slate-800 border-[14px]'}`}>

        {/* OLED Glow Effect */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-blue-500/5 via-transparent to-purple-500/5 z-0" />

        {/* Stream Flash Effect */}
        {streamFlash && (
          <div className={`absolute inset-0 z-10 opacity-30 transition-opacity duration-300 pointer-events-none ${streamFlash} animate-pulse`} />
        )}

        {renderContent()}

        {alert.active && alert.trigger && (
          <AlertOverlay
            trigger={alert.trigger}
            mode={mode}
            intensity={vibrationIntensity}
            onDismiss={() => { hapticFeedback(30); setAlert({ ...alert, active: false }); }}
            flashEnabled={flashEnabled}
            emergencyContact={emergencyContact}
          />
        )}
      </div>
    </div>
  );
};

export default App;

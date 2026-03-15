
import React from 'react';
import { 
  Bell, 
  Droplets, 
  AlertTriangle, 
  User, 
  DoorOpen, 
  Phone, 
  Zap,
  Flame,
  Volume2,
  Heart,
  Star,
  Wind,
  Coffee,
  Car,
  Home,
  CloudRain,
  Baby,
  PawPrint,
  Utensils,
  Hand,
  Siren
} from 'lucide-react';
import { TriggerWord, AppLanguage } from './types';

export const ICON_MAP: Record<string, (props: any) => React.ReactNode> = {
  user: (props) => <User {...props} />,
  droplets: (props) => <Droplets {...props} />,
  'alert-triangle': (props) => <AlertTriangle {...props} />,
  'door-open': (props) => <DoorOpen {...props} />,
  bell: (props) => <Bell {...props} />,
  phone: (props) => <Phone {...props} />,
  zap: (props) => <Zap {...props} />,
  flame: (props) => <Flame {...props} />,
  volume: (props) => <Volume2 {...props} />,
  heart: (props) => <Heart {...props} />,
  star: (props) => <Star {...props} />,
  wind: (props) => <Wind {...props} />,
  coffee: (props) => <Coffee {...props} />,
  car: (props) => <Car {...props} />,
  home: (props) => <Home {...props} />,
  rain: (props) => <CloudRain {...props} />,
  baby: (props) => <Baby {...props} />,
  paw: (props) => <PawPrint {...props} />,
  utensils: (props) => <Utensils {...props} />,
  hand: (props) => <Hand {...props} />,
  siren: (props) => <Siren {...props} />
};

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

export const DEFAULT_TRIGGERS: TriggerWord[] = [
  {
    id: 'name',
    word: 'hey', 
    synonyms: ['hello', 'excuse me', 'listen'],
    label: 'Call / Name',
    icon: 'user',
    vibrationPattern: [200, 100, 200, 100, 400],
    color: 'bg-blue-500'
  },
  {
    id: 'water',
    word: 'water',
    synonyms: ['drink', 'thirsty', 'liquid', 'aqua'],
    label: 'Water / Drink',
    icon: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80',
    vibrationPattern: [100, 300, 100],
    color: 'bg-cyan-500'
  },
  {
    id: 'door',
    word: 'door',
    synonyms: ['knock', 'bell', 'entrance', 'delivery', 'outside'],
    label: 'Door / Visitor',
    icon: 'door-open',
    vibrationPattern: [100, 50, 100, 50, 100],
    color: 'bg-amber-500'
  },
  {
    id: 'fire',
    word: 'fire',
    synonyms: ['smoke', 'burn', 'burning', 'hot', 'smell'],
    label: 'Fire / Danger',
    icon: 'flame',
    vibrationPattern: [1000, 200, 1000],
    color: 'bg-red-600'
  },
  {
    id: 'danger',
    word: 'help',
    synonyms: ['emergency', 'danger', 'hurt', 'pain', 'ambulance'],
    label: 'Help / Emergency',
    icon: 'alert-triangle',
    vibrationPattern: [500, 100, 500, 100, 500],
    color: 'bg-rose-600'
  },
  {
    id: 'baby',
    word: 'baby',
    synonyms: ['crying', 'cry', 'infant', 'child'],
    label: 'Baby Crying',
    icon: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400&q=80',
    vibrationPattern: [50, 50, 50, 50, 200],
    color: 'bg-pink-500'
  },
  {
    id: 'dog',
    word: 'dog',
    synonyms: ['bark', 'barking', 'puppy', 'wolf'],
    label: 'Dog Barking',
    icon: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&q=80',
    vibrationPattern: [100, 100, 400],
    color: 'bg-orange-500'
  },
  {
    id: 'stop',
    word: 'stop',
    synonyms: ['halt', 'wait', 'freeze', 'no'],
    label: 'Stop / Halt',
    icon: 'hand',
    vibrationPattern: [500],
    color: 'bg-purple-600'
  },
  {
    id: 'cat',
    word: 'cat',
    synonyms: ['meow', 'kitten', 'feline', 'pet'],
    label: 'Cat Meowing',
    icon: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&q=80',
    vibrationPattern: [100, 100, 300],
    color: 'bg-yellow-500'
  },
  {
    id: 'food',
    word: 'food',
    synonyms: ['eat', 'meal', 'hungry', 'dinner', 'lunch'],
    label: 'Food / Eat',
    icon: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80',
    vibrationPattern: [200, 100, 200],
    color: 'bg-green-500'
  },
  {
    id: 'music',
    word: 'music',
    synonyms: ['song', 'melody', 'play', 'tune'],
    label: 'Music / Song',
    icon: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80',
    vibrationPattern: [100, 200, 100, 200],
    color: 'bg-indigo-500'
  },
  {
    id: 'car',
    word: 'car',
    synonyms: ['vehicle', 'drive', 'auto', 'horn'],
    label: 'Car / Vehicle',
    icon: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&q=80',
    vibrationPattern: [300, 100, 300],
    color: 'bg-slate-500'
  },
  {
    id: 'home',
    word: 'home',
    synonyms: ['house', 'apartment', 'residence'],
    label: 'Home',
    icon: 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&q=80',
    vibrationPattern: [150, 150, 150],
    color: 'bg-teal-500'
  },
  {
    id: 'sleep',
    word: 'sleep',
    synonyms: ['tired', 'bed', 'rest', 'nap'],
    label: 'Sleep',
    icon: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=400&q=80',
    vibrationPattern: [400, 400],
    color: 'bg-indigo-400'
  },
  {
    id: 'light',
    word: 'light',
    synonyms: ['lamp', 'bulb', 'bright', 'shine'],
    label: 'Light / Lamp',
    icon: 'https://images.unsplash.com/photo-1542382257-80dedb725088?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1542382257-80dedb725088?w=400&q=80',
    vibrationPattern: [50, 50, 200],
    color: 'bg-yellow-400'
  },
  {
    id: 'phone',
    word: 'phone',
    synonyms: ['call', 'ring', 'mobile', 'cell'],
    label: 'Phone / Call',
    icon: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80',
    vibrationPattern: [100, 100, 100, 100],
    color: 'bg-blue-400'
  },
  {
    id: 'heart',
    word: 'love',
    synonyms: ['heart', 'affection', 'like', 'care'],
    label: 'Love / Heart',
    icon: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=400&q=80',
    iconUrl: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=400&q=80',
    vibrationPattern: [100, 100, 100, 100, 300],
    color: 'bg-pink-400'
  }
];

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);
const hasExtension = (value: string, exts: string) => new RegExp(`\\.(?:${exts})(?:\\?|#|$)`, 'i').test(value);

// --- Vibration Presets (Feature 9) ---
export const VIBRATION_PRESETS: { name: string; pattern: number[] }[] = [
  { name: 'SOS',        pattern: [100, 30, 100, 30, 100, 200, 300, 30, 300, 30, 300, 200, 100, 30, 100, 30, 100] },
  { name: 'Heartbeat',  pattern: [100, 200, 100, 600] },
  { name: 'Pulse',      pattern: [50, 50, 50, 50, 50, 50] },
  { name: 'Alarm',      pattern: [500, 200, 500, 200, 500] },
  { name: 'Gentle',     pattern: [30, 100, 30, 100, 30] },
  { name: 'Urgent',     pattern: [1000, 100, 1000, 100, 1000] },
  { name: 'Double Tap', pattern: [100, 100, 100] },
  { name: 'Wave',       pattern: [100, 50, 200, 50, 300, 50, 200, 50, 100] },
  { name: 'Staccato',   pattern: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30] },
];

// --- Language Options (Feature 6) ---
export const LANGUAGE_OPTIONS: { code: AppLanguage; label: string; flag: string }[] = [
  { code: 'en-US', label: 'English',    flag: '🇺🇸' },
  { code: 'es-ES', label: 'Espa\u00f1ol',    flag: '🇪🇸' },
  { code: 'fr-FR', label: 'Fran\u00e7ais',   flag: '🇫🇷' },
  { code: 'de-DE', label: 'Deutsch',    flag: '🇩🇪' },
  { code: 'ar-SA', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629',      flag: '🇸🇦' },
  { code: 'hi-IN', label: '\u0939\u093f\u0928\u094d\u0926\u0940',       flag: '🇮🇳' },
  { code: 'ur-PK', label: '\u0627\u0631\u062f\u0648',       flag: '🇵🇰' },
  { code: 'zh-CN', label: '\u4e2d\u6587',       flag: '🇨🇳' },
  { code: 'ja-JP', label: '\u65e5\u672c\u8a9e',      flag: '🇯🇵' },
  { code: 'pt-BR', label: 'Portugu\u00eas',  flag: '🇧🇷' },
];

export const isVideoIcon = (icon: string) => {
  if (icon.startsWith('data:video')) return true;
  if (!isHttpUrl(icon)) return false;
  // Detect video by file extension in URL, or Supabase storage buckets (icon/, trigger-media/)
  return hasExtension(icon, 'mp4|webm|ogg|mov') || /video|movie|mpeg|trigger-media|\/icon\//i.test(icon);
};

export const isImageIcon = (icon: string) => {
  if (icon.startsWith('data:image')) return true;
  if (!isHttpUrl(icon)) return false;
  return hasExtension(icon, 'png|jpe?g|gif|webp|bmp|svg') || /image|img/i.test(icon);
};

export const isMediaIcon = (icon: string) => {
  if (!icon) return false;
  return icon.startsWith('data:') || isHttpUrl(icon);
};

export const IconRenderer: React.FC<{ icon: string, size?: number, className?: string }> = ({ icon, size, className }) => {
  const sizeStyle = size ? { width: size, height: size } : {};
  const isUrl = isHttpUrl(icon);
  const isVideo = isVideoIcon(icon);
  const isImage = isImageIcon(icon);

  // Check video FIRST — a Supabase storage URL with .webm must render as <video>, not <img>
  if (isVideo) {
    return (
      <video 
        src={icon} 
        style={{ ...sizeStyle }} 
        className={className || "object-cover"}
        muted
        autoPlay
        loop
        preload="metadata"
        playsInline
      />
    );
  }
  if (isImage || (isUrl && !isVideo)) {
    return (
      <img 
        src={icon} 
        alt="custom media" 
        style={{ ...sizeStyle }} 
        className={className || "object-cover"} 
      />
    );
  }
  const IconComp = ICON_MAP[icon];
  if (IconComp) {
    return IconComp({ size: size || 24, className });
  }
  return <Zap size={size || 24} className={className} />;
};

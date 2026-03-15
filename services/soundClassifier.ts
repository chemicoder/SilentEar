// Sound Classifier using Web Audio API (Feature 5)
// Detects: loud sudden sounds, high-pitch alarms/sirens, repetitive knocking patterns

export interface SoundEvent {
  type: 'loud_sound' | 'alarm_siren' | 'knocking' | 'glass_break';
  confidence: number; // 0-1
  label: string;
  timestamp: number;
}

type SoundCallback = (event: SoundEvent) => void;

export class SoundClassifier {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private animFrame: number = 0;
  private callback: SoundCallback;
  private active = false;

  // Detection state
  private prevRMS = 0;
  private spikeHistory: number[] = [];
  private highFreqHistory: number[] = [];
  private lastAlertTime: Record<string, number> = {};
  private readonly COOLDOWN = 3000; // ms between same-type alerts

  constructor(callback: SoundCallback) {
    this.callback = callback;
  }

  async start(existingStream?: MediaStream, existingAnalyser?: AnalyserNode) {
    if (this.active) return;
    this.active = true;

    if (existingAnalyser && existingStream) {
      this.analyser = existingAnalyser;
      this.stream = existingStream;
    } else {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);
    }

    this.loop();
  }

  stop() {
    this.active = false;
    cancelAnimationFrame(this.animFrame);
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.analyser = null;
  }

  private emit(type: SoundEvent['type'], confidence: number, label: string) {
    const now = Date.now();
    if (now - (this.lastAlertTime[type] || 0) < this.COOLDOWN) return;
    this.lastAlertTime[type] = now;
    this.callback({ type, confidence, label, timestamp: now });
  }

  private loop = () => {
    if (!this.active || !this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    this.analyser.getByteTimeDomainData(timeData);
    this.analyser.getByteFrequencyData(freqData);

    // --- 1. RMS Volume (Sudden Loud Sound Detection) ---
    let sumSq = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = (timeData[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / bufferLength);

    // Spike detection: sudden jump in volume
    const spike = rms - this.prevRMS;
    this.spikeHistory.push(spike);
    if (this.spikeHistory.length > 10) this.spikeHistory.shift();
    this.prevRMS = rms;

    if (spike > 0.35 && rms > 0.4) {
      // Check if it's high-frequency dominant (glass break)
      const highBins = freqData.slice(Math.floor(bufferLength * 0.6));
      const highEnergy = highBins.reduce((a, b) => a + b, 0) / highBins.length;
      if (highEnergy > 100) {
        this.emit('glass_break', Math.min(highEnergy / 150, 1), 'Glass Breaking');
      } else {
        this.emit('loud_sound', Math.min(rms, 1), 'Loud Sound');
      }
    }

    // --- 2. High-Frequency Sustained (Alarm/Siren) ---
    const sampleRate = this.analyser.context.sampleRate;
    const binWidth = sampleRate / (this.analyser.fftSize);
    // Alarm/siren range: ~1kHz - 4kHz
    const lowBin = Math.floor(1000 / binWidth);
    const highBin = Math.min(Math.floor(4000 / binWidth), bufferLength - 1);
    let alarmEnergy = 0;
    for (let i = lowBin; i <= highBin; i++) {
      alarmEnergy += freqData[i];
    }
    alarmEnergy /= (highBin - lowBin + 1);

    this.highFreqHistory.push(alarmEnergy);
    if (this.highFreqHistory.length > 30) this.highFreqHistory.shift();

    // Sustained high-pitch sound over ~0.5 seconds
    if (this.highFreqHistory.length >= 15) {
      const avg = this.highFreqHistory.slice(-15).reduce((a, b) => a + b, 0) / 15;
      if (avg > 120) {
        this.emit('alarm_siren', Math.min(avg / 180, 1), 'Alarm / Siren');
      }
    }

    // --- 3. Repetitive Pattern (Knocking) ---
    const recentSpikes = this.spikeHistory.filter(s => s > 0.15);
    if (recentSpikes.length >= 3 && rms < 0.3) {
      this.emit('knocking', 0.7, 'Knocking Pattern');
    }

    this.animFrame = requestAnimationFrame(this.loop);
  };
}

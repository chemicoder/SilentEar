import React, { useRef, useState, useEffect } from 'react';
import { Camera, Monitor, Square, Disc, RefreshCcw, AlertTriangle } from 'lucide-react';

interface RecorderProps {
  mode: 'camera' | 'screen';
  onRecordingComplete: (blob: Blob) => void;
  onCancel: () => void;
}

export const Recorder: React.FC<RecorderProps> = ({ mode, onRecordingComplete, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    startStream();
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const startStream = async () => {
    setError(null);
    try {
      let mediaStream: MediaStream;
      if (mode === 'camera') {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } else {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      }
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error("Error accessing media devices.", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDismissedError') {
        setError("Camera permission was denied or dismissed. Please enable permissions in your browser settings to continue.");
      } else if (err.name === 'NotFoundError') {
        setError("No camera device found.");
      } else {
        setError("Could not access camera/screen. " + (err.message || "Unknown error"));
      }
    }
  };

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const startRecording = () => {
    if (!stream) return;
    
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        clearInterval(interval);
        setCountdown(null);
        beginCapture();
      }
    }, 1000);
  };

  const beginCapture = () => {
    if (!stream) return;
    chunksRef.current = [];
    
    // Use a lower bitrate to keep data URLs portable and storage-friendly
    const options = { 
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: 800000 // 800kbps - clear enough for signs, light enough for storage
    };
    
    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      console.warn('MediaRecorder with options failed, falling back to default', e);
      mediaRecorder = new MediaRecorder(stream);
    }
    
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      onRecordingComplete(blob);
    };

    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopStream();
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-slate-100 rounded-2xl p-6 text-center">
        <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle size={32} />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">Access Error</h3>
        <p className="text-slate-500 mb-6 max-w-sm">{error}</p>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition"
          >
            Cancel
          </button>
          <button 
            onClick={() => startStream()}
            className="px-4 py-2 bg-indigo-600 text-white font-medium hover:bg-indigo-700 rounded-lg transition shadow-md"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-slate-900 rounded-2xl overflow-hidden relative group">
      {/* Video Preview */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`w-full h-full object-cover ${mode === 'camera' ? 'scale-x-[-1]' : ''}`}
      />

      {/* Overlays */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        {countdown !== null && (
          <div className="text-9xl font-bold text-white opacity-80 animate-ping">
            {countdown > 0 ? countdown : 'GO!'}
          </div>
        )}
        
        {/* Safe Zone Frame for Sign Language */}
        {!isRecording && !countdown && (
          <div className="border-2 border-white/30 border-dashed rounded-lg w-64 h-64 md:w-96 md:h-96 flex items-center justify-center">
            <p className="text-white/50 text-sm font-medium">Keep sign in frame</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 flex items-center gap-6 z-10">
        {!isRecording ? (
          <>
            <button 
              onClick={onCancel}
              className="p-3 bg-white/10 backdrop-blur rounded-full text-white hover:bg-white/20 transition"
            >
              <RefreshCcw size={24} />
            </button>
            <button
              onClick={startRecording}
              disabled={countdown !== null}
              className="w-16 h-16 bg-red-500 rounded-full border-4 border-white/50 hover:bg-red-600 hover:scale-105 transition flex items-center justify-center shadow-lg"
            >
              <Disc size={32} className="text-white fill-current" />
            </button>
          </>
        ) : (
          <button
            onClick={stopRecording}
            className="w-16 h-16 bg-white rounded-full flex items-center justify-center hover:bg-gray-200 transition shadow-lg"
          >
            <Square size={24} className="text-red-600 fill-current" />
          </button>
        )}
      </div>

      <div className="absolute top-4 left-4 bg-black/50 backdrop-blur px-3 py-1 rounded-full text-white text-xs flex items-center gap-2">
        {mode === 'camera' ? <Camera size={12} /> : <Monitor size={12} />}
        {mode === 'camera' ? 'Camera Mode' : 'Screen Capture'}
      </div>
    </div>
  );
};

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SignEmoji } from '../types';
import {
  extractLandmarksFromVideo,
  ExtractionResult,
  ExtractionProgress,
  downloadAsNpyJson,
  downloadBatchAsNpyJson,
  getPythonConversionScript,
} from '../services/landmarkService';
import { isVideoFile, isYouTube } from '@shared/videoUtils';
import {
  Play,
  Download,
  FileCode,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Database,
  Video,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Copy,
  PackageOpen,
  Cpu,
  Sparkles,
  Zap,
  Search,
} from 'lucide-react';

interface LiveInterpreterProps {
  emojis: SignEmoji[];
}

interface ExtractedSign {
  emoji: SignEmoji;
  result: ExtractionResult;
  status: 'done' | 'error';
  error?: string;
}

import { interpretSignLanguage, InterpretationResult } from '../services/interpreterService';

export const LiveInterpreter: React.FC<LiveInterpreterProps> = ({ emojis }) => {
  const [activeMode, setActiveMode] = useState<'extract' | 'live'>('extract');
  const [extractedSigns, setExtractedSigns] = useState<ExtractedSign[]>([]);
  const [currentProgress, setCurrentProgress] = useState<ExtractionProgress | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showPythonScript, setShowPythonScript] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [targetFps, setTargetFps] = useState(15);
  const abortRef = useRef(false);

  // Live Mode States
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<any>(null);
  const framesBuffer = useRef<string[]>([]);

  // Filter emojis that have videos
  // Filter emojis that have video sources
  const videoEmojis = emojis.filter(e => e.videoUrl && e.videoUrl.length > 5);

  const handleExtract = useCallback(async (emoji: SignEmoji) => {
    if (processingId) return;
    abortRef.current = false;
    setProcessingId(emoji.id);
    setCurrentProgress({ phase: 'loading', progress: 0, message: 'Starting...' });

    try {
      const result = await extractLandmarksFromVideo(
        emoji.videoUrl,
        emoji.name,
        emoji.language || 'ASL',
        (progress) => {
          if (abortRef.current) throw new Error('Aborted');
          setCurrentProgress(progress);
        },
        targetFps
      );

      setExtractedSigns(prev => {
        const filtered = prev.filter(e => e.emoji.id !== emoji.id);
        return [...filtered, { emoji, result, status: 'done' }];
      });
    } catch (err: any) {
      if (err.message !== 'Aborted') {
        setExtractedSigns(prev => [
          ...prev.filter(e => e.emoji.id !== emoji.id),
          { emoji, result: null as any, status: 'error', error: err.message },
        ]);
      }
    } finally {
      setProcessingId(null);
      setCurrentProgress(null);
    }
  }, [processingId, targetFps]);

  const handleBatchExtract = useCallback(async () => {
    if (processingId) return;
    const ids = batchMode ? [...selectedIds] : videoEmojis.map(e => e.id);

    for (const id of ids) {
      if (abortRef.current) break;
      const emoji = videoEmojis.find(e => e.id === id);
      if (!emoji || !isVideoFile(emoji.videoUrl)) continue;
      // Skip already extracted
      if (extractedSigns.find(e => e.emoji.id === id && e.status === 'done')) continue;
      await handleExtract(emoji);
    }
  }, [processingId, batchMode, selectedIds, videoEmojis, extractedSigns, handleExtract]);

  const startLiveMode = async () => {
    setActiveMode('live');
    try {
      let currentStream = stream;
      if (!currentStream) {
        currentStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        setStream(currentStream);
      }

      setIsLiveActive(true);

      // If ref is already available, attach immediately and play
      if (videoRef.current) {
        videoRef.current.srcObject = currentStream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        try { await videoRef.current.play(); } catch (_) { /* autoplay may already be active */ }
      }

      // Start capture loop
      if (!intervalRef.current) {
        framesBuffer.current = [];
        intervalRef.current = setInterval(captureFrame, 1000); // Capture frame every 1s
      }
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Could not access camera. Please ensure you have granted camera permissions and are using HTTPS.");
    }
  };

  // Effect to attach stream when video element becomes available
  useEffect(() => {
    if (activeMode === 'live' && isLiveActive && stream && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute('playsinline', 'true');
      videoRef.current.setAttribute('webkit-playsinline', 'true');
      videoRef.current.play().catch(() => {});
    }
  }, [activeMode, isLiveActive, stream]);

  const stopLiveMode = () => {
    setIsLiveActive(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsInterpreting(false);
  };

  const captureFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) return; // Not ready yet

    // Dynamically size canvas to match actual video feed dimensions
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

    framesBuffer.current.push(dataUrl);

    // Every 3 frames (3 seconds), run interpretation
    if (framesBuffer.current.length >= 3) {
      const batch = [...framesBuffer.current];
      framesBuffer.current = [];
      runInterpretation(batch);
    }
  };

  const runInterpretation = async (frames: string[]) => {
    if (isInterpreting) return;
    setIsInterpreting(true);
    try {
      const result = await interpretSignLanguage(frames);
      setInterpretation(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsInterpreting(false);
    }
  };

  useEffect(() => {
    return () => stopLiveMode();
  }, []);

  const handleDownloadAll = () => {
    const successful = extractedSigns.filter(e => e.status === 'done');
    if (successful.length === 0) return;
    downloadBatchAsNpyJson(successful.map(e => e.result));
  };

  const handleCopyPython = () => {
    navigator.clipboard.writeText(getPythonConversionScript());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const successCount = extractedSigns.filter(e => e.status === 'done').length;
  const totalFeatures = extractedSigns.filter(e => e.status === 'done')
    .reduce((sum, e) => sum + e.result.frameCount, 0);

  return (
    <div className="h-full flex flex-col bg-[#F3F4F6]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Cpu size={20} className="text-[#5B4AF4]" />
              Intelligence
            </h2>
            <p className="text-[10px] sm:text-sm text-slate-500 mt-0.5">
              Training & Real-time Translation
            </p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => { setActiveMode('extract'); stopLiveMode(); }}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${activeMode === 'extract' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              Training Data
            </button>
            <button
              onClick={startLiveMode}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${activeMode === 'live' ? 'bg-[#5B4AF4] text-white shadow-lg' : 'text-slate-500'}`}
            >
              Live Interpreter
            </button>
          </div>
        </div>
      </div>

      {activeMode === 'extract' ? (
        <React.Fragment>
          {/* Toolbar */}
          <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">FPS:</label>
              <select
                value={targetFps}
                onChange={e => setTargetFps(Number(e.target.value))}
                className="text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700"
                disabled={!!processingId}
              >
                <option value={10}>10 fps</option>
                <option value={15}>15 fps (recommended)</option>
                <option value={24}>24 fps</option>
                <option value={30}>30 fps (high)</option>
              </select>
            </div>

            <div className="h-5 w-px bg-slate-200" />

            <button
              onClick={() => setBatchMode(!batchMode)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${batchMode ? 'bg-[#5B4AF4] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {batchMode ? 'Selection Mode' : 'Select Multiple'}
            </button>

            {batchMode && selectedIds.size > 0 && (
              <button
                onClick={handleBatchExtract}
                disabled={!!processingId}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-[#5B4AF4] text-white hover:bg-[#4A3AE0] disabled:opacity-50 flex items-center gap-1"
              >
                <Play size={12} /> Extract {selectedIds.size} Selected
              </button>
            )}

            {!batchMode && videoEmojis.length > 0 && (
              <button
                onClick={handleBatchExtract}
                disabled={!!processingId}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-[#5B4AF4] text-white hover:bg-[#4A3AE0] disabled:opacity-50 flex items-center gap-1"
              >
                <Play size={12} /> Extract All ({videoEmojis.length})
              </button>
            )}

            <div className="flex-1" />

            {successCount > 0 && (
              <>
                <button
                  onClick={handleDownloadAll}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1"
                >
                  <PackageOpen size={12} /> Download Batch (.json)
                </button>
                <button
                  onClick={() => setShowPythonScript(!showPythonScript)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium bg-slate-700 text-white hover:bg-slate-800 flex items-center gap-1"
                >
                  <FileCode size={12} /> Python Script
                </button>
              </>
            )}

            {processingId && (
              <button
                onClick={() => { abortRef.current = true; }}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-100 text-red-600 hover:bg-red-200"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Python Script Panel */}
          {showPythonScript && (
            <div className="bg-slate-900 text-green-400 p-4 mx-6 mt-4 rounded-xl text-xs font-mono overflow-auto max-h-60 relative">
              <button onClick={handleCopyPython} className="absolute top-2 right-2 bg-slate-700 text-white px-2 py-1 rounded text-[10px] hover:bg-slate-600 flex items-center gap-1">
                <Copy size={10} /> Copy
              </button>
              <pre className="whitespace-pre">{getPythonConversionScript()}</pre>
            </div>
          )}

          {/* Progress Bar */}
          {currentProgress && (
            <div className="mx-6 mt-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-[#5B4AF4]" />
                  {currentProgress.message}
                </span>
                <span className="text-xs text-slate-500">{currentProgress.progress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-[#5B4AF4] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${currentProgress.progress}%` }}
                />
              </div>
              {currentProgress.currentFrame && currentProgress.totalFrames && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Frame {currentProgress.currentFrame} / {currentProgress.totalFrames}
                </p>
              )}
            </div>
          )}

          {/* Video Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {videoEmojis.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Video size={48} className="mb-4 opacity-40" />
                <p className="text-sm font-medium">No videos in library</p>
                <p className="text-xs mt-1">Create signs with video recordings to extract training data</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {videoEmojis.map(emoji => {
                  const extracted = extractedSigns.find(e => e.emoji.id === emoji.id);
                  const isProcessing = processingId === emoji.id;
                  const isExpanded = expandedId === emoji.id;
                  const isSelected = selectedIds.has(emoji.id);

                  return (
                    <div
                      key={emoji.id}
                      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isProcessing ? 'border-[#5B4AF4] ring-2 ring-[#5B4AF4]/20' :
                        extracted?.status === 'done' ? 'border-emerald-300' :
                          extracted?.status === 'error' ? 'border-red-300' :
                            isSelected ? 'border-[#5B4AF4] border-2' :
                              'border-slate-200 hover:border-slate-300'
                        }`}
                    >
                      {/* Card Header */}
                      <div className="flex items-center gap-3 p-3 border-b border-slate-100">
                        {batchMode && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(emoji.id)}
                            className="w-4 h-4 rounded text-[#5B4AF4]"
                          />
                        )}
                        {emoji.literalIconUrl && (
                          <img
                            src={emoji.literalIconUrl}
                            alt={emoji.name}
                            className="w-8 h-8 rounded-lg object-cover bg-slate-100"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-slate-800 truncate">{emoji.name}</h4>
                          <p className="text-[10px] text-slate-400">{emoji.language || 'ASL'} · {emoji.category}</p>
                        </div>
                        {extracted?.status === 'done' && (
                          <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                        )}
                        {extracted?.status === 'error' && (
                          <AlertTriangle size={18} className="text-red-400 shrink-0" />
                        )}
                      </div>

                      {/* Video Preview */}
                      <div className="relative aspect-video bg-black overflow-hidden">
                        <video
                          src={emoji.videoUrl}
                          className="w-full h-full object-contain"
                          muted
                          loop
                          playsInline
                          onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                          onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                        />
                        {isProcessing && currentProgress && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <div className="text-center">
                              <Loader2 size={28} className="animate-spin text-white mx-auto mb-2" />
                              <p className="text-xs text-white/80">{currentProgress.message}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="p-3 flex items-center gap-2">
                        {!extracted || extracted.status === 'error' ? (
                          <button
                            onClick={() => handleExtract(emoji)}
                            disabled={!!processingId || !isVideoFile(emoji.videoUrl)}
                            className={`flex-1 text-xs px-3 py-2 rounded-lg font-medium flex items-center justify-center gap-1 transition ${!isVideoFile(emoji.videoUrl) ? 'bg-slate-100 text-slate-400' : 'bg-[#5B4AF4] text-white hover:bg-[#4A3AE0]'}`}
                            title={!isVideoFile(emoji.videoUrl) ? "Landmark extraction only available for direct video files (MP4/WebM), not YouTube." : ""}
                          >
                            <Play size={12} /> {isYouTube(emoji.videoUrl) ? 'YouTube (No Extract)' : 'Extract Landmarks'}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => downloadAsNpyJson(extracted.result)}
                              className="flex-1 text-xs px-3 py-2 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center gap-1"
                            >
                              <Download size={12} /> Download
                            </button>
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : emoji.id)}
                              className="text-xs px-2 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <BarChart3 size={14} />}
                            </button>
                            <button
                              onClick={() => setExtractedSigns(prev => prev.filter(e => e.emoji.id !== emoji.id))}
                              className="text-xs px-2 py-2 rounded-lg bg-slate-100 text-red-500 hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        {extracted?.status === 'error' && (
                          <span className="text-[10px] text-red-500 truncate">{extracted.error}</span>
                        )}
                      </div>

                      {/* Expanded Stats */}
                      {isExpanded && extracted?.status === 'done' && (
                        <div className="border-t border-slate-100 p-3 bg-slate-50 text-xs text-slate-600 space-y-1">
                          <div className="grid grid-cols-2 gap-2">
                            <div><span className="font-medium">Frames:</span> {extracted.result.frameCount}</div>
                            <div><span className="font-medium">FPS:</span> {extracted.result.fps}</div>
                            <div><span className="font-medium">Shape:</span> [{extracted.result.shape.join(' × ')}]</div>
                            <div><span className="font-medium">Features:</span> {extracted.result.shape[1]}</div>
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <p className="text-[10px] text-slate-400">
                              Pose: 33×4 | Hands: 21×3×2 | Face: 68×3 = {extracted.result.shape[1]} per frame
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </React.Fragment>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
            <div className="aspect-video bg-slate-900 relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                webkit-playsinline="true"
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <canvas ref={canvasRef} width={640} height={480} className="hidden" />

              {isInterpreting && (
                <div className="absolute top-4 right-4 bg-[#5B4AF4] text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse flex items-center gap-2">
                  <Sparkles size={12} /> Gemini Interpreting...
                </div>
              )}

              {!isLiveActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
                  <button
                    onClick={startLiveMode}
                    className="bg-[#5B4AF4] hover:bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold transition-all transform hover:scale-105 active:scale-95"
                  >
                    Enable Camera Preview
                  </button>
                </div>
              )}
            </div>

            <div className="p-8 bg-gradient-to-br from-white to-slate-50">
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-3 h-3 rounded-full ${isLiveActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">
                  {isLiveActive ? 'Live Translation Active' : 'Waiting for Device'}
                </h3>
              </div>

              <div className="min-h-[120px] bg-slate-100/50 border border-slate-200 rounded-2xl p-6 flex items-center justify-center relative group">
                <p className={`text-2xl font-black text-center leading-tight transition-all duration-500 ${interpretation?.text ? 'text-slate-900' : 'text-slate-400 opacity-50'}`}>
                  {interpretation?.text || 'Perform signs in front of the camera to see instant translation...'}
                </p>
                {interpretation?.confidence && (
                  <div className="absolute bottom-3 right-4 text-[9px] font-bold text-slate-400 uppercase">
                    Confidence: {Math.round(interpretation.confidence * 100)}%
                  </div>
                )}
              </div>

              {interpretation?.detectedSigns && interpretation.detectedSigns.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {interpretation.detectedSigns.map((s, idx) => (
                    <span key={idx} className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-indigo-100">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4"><Zap size={20} /></div>
              <h4 className="font-bold text-slate-900 mb-2">Multimodal AI</h4>
              <p className="text-xs text-slate-500 leading-relaxed">Powered by Gemini 1.5 Flash for high-speed visual reasoning and sign interpretation.</p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4"><Search size={20} /></div>
              <h4 className="font-bold text-slate-900 mb-2">3s Buffer</h4>
              <p className="text-xs text-slate-500 leading-relaxed">System analyzes 3-second movement blocks to provide reliable semantic translation.</p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4"><CheckCircle2 size={20} /></div>
              <h4 className="font-bold text-slate-900 mb-2">Cross-Reference</h4>
              <p className="text-xs text-slate-500 leading-relaxed">Gemini matches your movements against its vast knowledge of sign languages globally.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

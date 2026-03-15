/**
 * Landmark Extraction Service for Sign Language Training Data
 * 
 * Extracts hand/pose/face landmarks from sign language videos using
 * MediaPipe Holistic (via CDN) and exports as .npy/.npz compatible JSON
 * that can be converted to numpy arrays for model training.
 * 
 * Pipeline: Video → Canvas frames → MediaPipe Holistic → Landmarks → NPY-compatible data
 */

// MediaPipe types
interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface HolisticResults {
  poseLandmarks?: Landmark[];
  leftHandLandmarks?: Landmark[];
  rightHandLandmarks?: Landmark[];
  faceLandmarks?: Landmark[];
}

export interface FrameLandmarks {
  frameIndex: number;
  timestamp: number; // ms
  pose: number[];     // 33 landmarks × 4 values (x,y,z,visibility) = 132
  leftHand: number[]; // 21 landmarks × 3 values (x,y,z) = 63
  rightHand: number[];// 21 landmarks × 3 values (x,y,z) = 63
  face: number[];     // 468 landmarks × 3 values (x,y,z) = 1404 (optional, can be truncated)
}

export interface ExtractionResult {
  signName: string;
  language: string;
  frameCount: number;
  fps: number;
  landmarks: FrameLandmarks[];
  shape: [number, number]; // [frames, features_per_frame]
  featureNames: string[];
  exportedAt: string;
}

export interface ExtractionProgress {
  phase: 'loading' | 'extracting' | 'processing' | 'done' | 'error';
  progress: number; // 0-100
  message: string;
  currentFrame?: number;
  totalFrames?: number;
}

// Constants
const POSE_LANDMARKS = 33;
const HAND_LANDMARKS = 21;
const FACE_LANDMARKS_SUBSET = 68; // Use 68 key face points instead of full 468
const FEATURES_PER_FRAME = (POSE_LANDMARKS * 4) + (HAND_LANDMARKS * 3 * 2) + (FACE_LANDMARKS_SUBSET * 3);

// Key face landmark indices (eyebrows, eyes, nose, mouth, jaw outline)
const FACE_KEY_INDICES = [
  // Jaw outline (17 points)
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400,
  // Right eyebrow (5)
  46, 53, 52, 65, 55,
  // Left eyebrow (5)
  276, 283, 282, 295, 285,
  // Right eye (6)
  33, 160, 158, 133, 153, 144,
  // Left eye (6)
  362, 385, 387, 263, 373, 380,
  // Nose (9)
  1, 2, 98, 327, 168, 6, 197, 195, 5,
  // Outer mouth (12)
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308,
  // Inner mouth (8)
  78, 95, 88, 178, 87, 14, 317, 402,
];

/**
 * Flatten a MediaPipe landmark array into a flat number array.
 */
const flattenLandmarks = (
  landmarks: Landmark[] | undefined,
  count: number,
  includeVisibility: boolean
): number[] => {
  const valuesPerLandmark = includeVisibility ? 4 : 3;
  const result = new Array(count * valuesPerLandmark).fill(0);
  if (!landmarks) return result;
  for (let i = 0; i < Math.min(landmarks.length, count); i++) {
    const base = i * valuesPerLandmark;
    result[base] = landmarks[i].x;
    result[base + 1] = landmarks[i].y;
    result[base + 2] = landmarks[i].z;
    if (includeVisibility) {
      result[base + 3] = landmarks[i].visibility ?? 0;
    }
  }
  return result;
};

/**
 * Extract key face landmarks (68 points from the full 468).
 */
const extractKeyFaceLandmarks = (faceLandmarks: Landmark[] | undefined): number[] => {
  const result = new Array(FACE_LANDMARKS_SUBSET * 3).fill(0);
  if (!faceLandmarks) return result;
  for (let i = 0; i < FACE_KEY_INDICES.length && i < FACE_LANDMARKS_SUBSET; i++) {
    const idx = FACE_KEY_INDICES[i];
    if (idx < faceLandmarks.length) {
      result[i * 3] = faceLandmarks[idx].x;
      result[i * 3 + 1] = faceLandmarks[idx].y;
      result[i * 3 + 2] = faceLandmarks[idx].z;
    }
  }
  return result;
};

/**
 * Load MediaPipe Holistic from CDN if not already loaded.
 */
const loadMediaPipe = async (onProgress: (msg: string) => void): Promise<any> => {
  // Check if already loaded
  if ((window as any).__mediapipeHolistic) {
    return (window as any).__mediapipeHolistic;
  }

  onProgress('Loading MediaPipe Holistic model...');

  // Load scripts dynamically
  const loadScript = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(script);
    });
  };

  await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/holistic.js');
  await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js');

  const Holistic = (window as any).Holistic;
  if (!Holistic) throw new Error('MediaPipe Holistic failed to load');

  const holistic = new Holistic({
    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`
  });

  holistic.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    refineFaceLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  await holistic.initialize();
  onProgress('MediaPipe model loaded.');
  (window as any).__mediapipeHolistic = holistic;
  return holistic;
};

/**
 * Extract landmarks from a video element frame by frame.
 */
export const extractLandmarksFromVideo = async (
  videoSrc: string,
  signName: string,
  language: string,
  onProgress: (progress: ExtractionProgress) => void,
  targetFps: number = 15
): Promise<ExtractionResult> => {
  const landmarks: FrameLandmarks[] = [];

  onProgress({ phase: 'loading', progress: 0, message: 'Loading MediaPipe model...' });

  const holistic = await loadMediaPipe((msg) => {
    onProgress({ phase: 'loading', progress: 10, message: msg });
  });

  onProgress({ phase: 'loading', progress: 20, message: 'Loading video...' });

  // Create offscreen video element
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;

  // Robust video loading with CORS handling and proxies
  let objectUrl: string | null = null;
  let finalVideoSrc = videoSrc;

  // Handle YouTube specifically (it cannot be loaded into a <video> element for canvas extraction)
  if (videoSrc.includes('youtube.com') || videoSrc.includes('youtu.be')) {
    throw new Error('Landmark extraction is not supported for YouTube videos due to security restrictions. Please use a direct video file (MP4/WebM).');
  }

  // If remote URL, attempt to fetch as blob to resolve CORS/tainted canvas issues
  if (!videoSrc.startsWith('blob:') && !videoSrc.startsWith('data:')) {
    onProgress({ phase: 'loading', progress: 22, message: 'Resolving video CORS...' });
    try {
      // Attempt 1: Direct Fetch
      const response = await fetch(videoSrc, { method: 'GET', mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        if (!blob.type.includes('text/html')) {
          objectUrl = URL.createObjectURL(blob);
          finalVideoSrc = objectUrl;
        }
      }
    } catch (e) {
      console.warn('[LandmarkService] Direct fetch failed, trying proxies...', e);
    }

    // If direct fetch failed, warn the user
    if (finalVideoSrc === videoSrc) {
      console.warn('[LandmarkService] Could not fetch video directly. Please use a locally uploaded video or Supabase-hosted file.');
    }
  }

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = (e) => {
      console.error('[LandmarkService] Video error:', e);
      reject(new Error('Failed to load video: ' + videoSrc));
    };
    video.src = finalVideoSrc;
  });


  const duration = video.duration;
  const frameInterval = 1 / targetFps;
  const totalFrames = Math.floor(duration * targetFps);

  onProgress({ phase: 'extracting', progress: 25, message: `Extracting ${totalFrames} frames at ${targetFps} FPS...`, totalFrames });

  // Create canvas for frame capture
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;

  // Process each frame
  let resultResolve: ((r: HolisticResults) => void) | null = null;
  holistic.onResults((results: HolisticResults) => {
    if (resultResolve) resultResolve(results);
  });

  for (let i = 0; i < totalFrames; i++) {
    const time = i * frameInterval;
    if (time > duration) break;

    // Seek to frame
    video.currentTime = time;

    try {
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
          resolve();
        };
        const onError = (e: any) => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
          reject(new Error('Video seek error at ' + time));
        };
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);
        // Timeout for seek
        setTimeout(() => {
          video.removeEventListener('seeked', onSeeked);
          resolve(); // Resolve anyway to try drawing current state
        }, 1000);
      });

      // Draw frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Send to MediaPipe with a local promise for synchronization
      let frameResults: HolisticResults | null = null;
      const framePromise = new Promise<HolisticResults>((resolve, reject) => {
        const timeout = setTimeout(() => {
          resultResolve = null;
          reject(new Error('MediaPipe timeout at frame ' + i));
        }, 3000);

        resultResolve = (res: HolisticResults) => {
          clearTimeout(timeout);
          resolve(res);
        };
      });

      await holistic.send({ image: canvas });
      const results = await framePromise;
      resultResolve = null;

      // Flatten landmarks
      const frameLandmark: FrameLandmarks = {
        frameIndex: i,
        timestamp: Math.round(time * 1000),
        pose: flattenLandmarks(results.poseLandmarks, POSE_LANDMARKS, true),
        leftHand: flattenLandmarks(results.leftHandLandmarks, HAND_LANDMARKS, false),
        rightHand: flattenLandmarks(results.rightHandLandmarks, HAND_LANDMARKS, false),
        face: extractKeyFaceLandmarks(results.faceLandmarks),
      };
      landmarks.push(frameLandmark);
    } catch (err: any) {
      console.warn(`[LandmarkService] Skipping frame ${i}:`, err.message);
      // Push empty landmarks to maintain sequence if one frame fails
      landmarks.push({
        frameIndex: i,
        timestamp: Math.round(time * 1000),
        pose: new Array(POSE_LANDMARKS * 4).fill(0),
        leftHand: new Array(HAND_LANDMARKS * 3).fill(0),
        rightHand: new Array(HAND_LANDMARKS * 3).fill(0),
        face: new Array(FACE_LANDMARKS_SUBSET * 3).fill(0),
      });
    }

    const progress = 25 + Math.round((i / totalFrames) * 65);
    onProgress({
      phase: 'extracting',
      progress,
      message: `Frame ${i + 1}/${totalFrames}`,
      currentFrame: i + 1,
      totalFrames,
    });
  }

  // Cleanup
  video.pause();
  video.removeAttribute('src');
  video.load();
  if (objectUrl) URL.revokeObjectURL(objectUrl);

  onProgress({ phase: 'processing', progress: 92, message: 'Packaging data...' });

  // Generate feature names for documentation
  const featureNames: string[] = [];
  for (let i = 0; i < POSE_LANDMARKS; i++) {
    featureNames.push(`pose_${i}_x`, `pose_${i}_y`, `pose_${i}_z`, `pose_${i}_vis`);
  }
  for (const hand of ['left_hand', 'right_hand']) {
    for (let i = 0; i < HAND_LANDMARKS; i++) {
      featureNames.push(`${hand}_${i}_x`, `${hand}_${i}_y`, `${hand}_${i}_z`);
    }
  }
  for (let i = 0; i < FACE_LANDMARKS_SUBSET; i++) {
    featureNames.push(`face_${i}_x`, `face_${i}_y`, `face_${i}_z`);
  }

  const result: ExtractionResult = {
    signName,
    language,
    frameCount: landmarks.length,
    fps: targetFps,
    landmarks,
    shape: [landmarks.length, FEATURES_PER_FRAME],
    featureNames,
    exportedAt: new Date().toISOString(),
  };

  onProgress({ phase: 'done', progress: 100, message: `Extracted ${landmarks.length} frames (${FEATURES_PER_FRAME} features each)` });

  return result;
};

/**
 * Convert ExtractionResult to a flat 2D array suitable for numpy conversion.
 * Shape: [frames, features]
 */
export const toNumpyCompatibleArray = (result: ExtractionResult): number[][] => {
  return result.landmarks.map(frame => [
    ...frame.pose,
    ...frame.leftHand,
    ...frame.rightHand,
    ...frame.face,
  ]);
};

/**
 * Export extraction result as a downloadable JSON file
 * (can be loaded in Python with json → numpy conversion).
 */
export const downloadAsNpyJson = (result: ExtractionResult, filename?: string) => {
  const data = {
    sign_name: result.signName,
    language: result.language,
    shape: result.shape,
    fps: result.fps,
    frame_count: result.frameCount,
    feature_names: result.featureNames,
    exported_at: result.exportedAt,
    // Flat 2D array: [frames × features]
    data: toNumpyCompatibleArray(result),
  };

  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${result.signName.replace(/\s+/g, '_')}_landmarks.json`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Export all extraction results as a single batch file for training.
 */
export const downloadBatchAsNpyJson = (results: ExtractionResult[], filename?: string) => {
  const batchData = {
    total_signs: results.length,
    signs: results.map(r => r.signName),
    languages: [...new Set(results.map(r => r.language))],
    features_per_frame: FEATURES_PER_FRAME,
    feature_names: results[0]?.featureNames || [],
    exported_at: new Date().toISOString(),
    samples: results.map(r => ({
      sign_name: r.signName,
      language: r.language,
      shape: r.shape,
      fps: r.fps,
      data: toNumpyCompatibleArray(r),
    })),
  };

  const json = JSON.stringify(batchData);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `sign_language_training_batch_${results.length}signs.json`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Generate a Python script snippet to convert the JSON to numpy arrays.
 */
export const getPythonConversionScript = (): string => {
  return `"""
Convert SilentEar/SignMoji landmark JSON to numpy .npy/.npz files.
Run: python convert_landmarks.py <input.json> [output.npz]
"""
import json, sys, numpy as np

def convert_single(path):
    with open(path) as f:
        data = json.load(f)
    
    if 'samples' in data:
        # Batch file
        arrays = {}
        labels = []
        for i, sample in enumerate(data['samples']):
            arr = np.array(sample['data'], dtype=np.float32)
            arrays[f'sample_{i}'] = arr
            labels.append(sample['sign_name'])
        arrays['labels'] = np.array(labels)
        arrays['feature_names'] = np.array(data['feature_names'])
        out = path.replace('.json', '.npz')
        np.savez_compressed(out, **arrays)
        print(f"Saved {len(labels)} signs to {out}")
        print(f"Features per frame: {data['features_per_frame']}")
    else:
        # Single file
        arr = np.array(data['data'], dtype=np.float32)
        out = path.replace('.json', '.npy')
        np.save(out, arr)
        print(f"Saved {data['sign_name']}: shape {arr.shape} to {out}")

if __name__ == '__main__':
    convert_single(sys.argv[1])
`;
};

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# SilentEar — AI-Powered Accessibility Agent for Deaf & Hard of Hearing

**Gemini Live Agent Challenge** | Category: **Live Agent**

*A real-time audio monitoring agent that converts ambient sounds, speech, and environmental cues into haptic vibrations, visual alerts, and sign language videos — powered by Gemini Live API on Google Cloud.*

</div>

---

## The Problem

380 million people worldwide are deaf or hard of hearing. They miss critical environmental sounds — doorbells, alarms, someone calling their name, fire alarms — that hearing people take for granted. Existing solutions are limited to basic amplification or simple text transcription.

## Our Solution

**SilentEar** is an AI agent that acts as a **real-time environmental audio interpreter**. Using the **Gemini Live API** for bidirectional audio streaming, it:

- **Listens continuously** to the user's environment via their device microphone
- **Detects and classifies** sounds in real-time using function calling (tool use)
- **Alerts instantly** via customizable haptic vibration patterns, screen flashes, and sign language videos
- **Understands context** using Gemini 3 Flash scene intelligence ("Someone is at your door calling your name")
- **Enables communication** via an AI-powered Voice Deck (text-to-speech with smart phrase prediction)
- **Supports caregivers** with a remote monitoring dashboard for connected deaf users

## Google Cloud Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system diagram.

| Google Cloud Service | Purpose |
|---|---|
| **Cloud Run** | Hosts backend (WebSocket proxy + REST API) |
| **Cloud Firestore** | Stores alerts, device status, trigger library |
| **Gemini Live API** | Real-time bidirectional audio streaming with function calling |
| **Gemini 3 Flash** | Scene intelligence, transcript refinement, trigger auto-discovery |
| **Google GenAI SDK** | `@google/genai` — used for all Gemini interactions |

## Key Features

| # | Feature | Technology |
|---|---------|-----------|
| 1 | Real-time audio streaming & transcription | Gemini Live API (WebSocket) |
| 2 | Instant sound detection via function calling | `trigger_alert` tool |
| 3 | Customizable haptic vibration patterns | Web Vibration API |
| 4 | Visual alerts (screen flash, color-coded) | Web Animations |
| 5 | Sign language video alerts (ASL/BSL/PSL) | Supabase Storage |
| 6 | AI scene intelligence ("what's happening?") | Gemini 3 Flash |
| 7 | Smart transcript refinement | Gemini 3 Flash |
| 8 | AI trigger auto-discovery | Gemini 3 Flash |
| 9 | Voice Deck with AI phrase prediction | Gemini 3 Flash |
| 10 | Sound classification (alarms, knocking, glass) | Web Audio API FFT |
| 11 | Caregiver remote monitoring dashboard | Supabase Realtime + Firestore |
| 12 | Quiet hours with emergency bypass | Local logic |
| 13 | Emergency contact one-touch calling | `tel:` protocol |
| 14 | Multi-language support (10 languages) | Web Speech API |
| 15 | Offline mode (browser Speech API fallback) | SpeechRecognition API |

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + ws (WebSocket)
- **AI**: Google GenAI SDK (`@google/genai`) — Gemini Live API + Gemini 3 Flash
- **Database**: Cloud Firestore (GCP) + Supabase (real-time subscriptions)
- **Mobile**: Capacitor (Android/iOS) + PWA
- **Deployment**: Docker + Cloud Build → Cloud Run

---

## Run Locally

**Prerequisites:** Node.js 20+, a Gemini API key

### 1. Frontend Only (direct client-side Gemini)

```bash
npm install
echo "GEMINI_API_KEY=your-key-here" > .env.local
npm run dev
```

### 2. Full Stack with Backend (Cloud Run compatible)

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Set environment variables
echo "GEMINI_API_KEY=your-key-here" > .env.local
echo "GEMINI_API_KEY=your-key-here" > backend/.env
echo "GCP_PROJECT_ID=your-project-id" >> backend/.env

# Run backend (port 8080)
cd backend && npm run dev &

# Run frontend (port 3000) — set backend URL
VITE_BACKEND_URL=http://localhost:8080 npm run dev
```

## Deploy to Google Cloud

### Automated Deployment

```bash
export GCP_PROJECT_ID=your-gcp-project-id
export GEMINI_API_KEY=your-gemini-api-key
bash deploy.sh
```

This script will:
1. Enable Cloud Run, Firestore, and Cloud Build APIs
2. Create a Firestore database
3. Build the Docker container via Cloud Build
4. Deploy to Cloud Run with all environment variables

### Manual Deployment

```bash
# Build the Docker image
docker build -t silentear .

# Push to GCR
docker tag silentear gcr.io/YOUR_PROJECT/silentear-backend
docker push gcr.io/YOUR_PROJECT/silentear-backend

# Deploy to Cloud Run
gcloud run deploy silentear-backend \
  --image=gcr.io/YOUR_PROJECT/silentear-backend \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-env-vars="GEMINI_API_KEY=xxx,GCP_PROJECT_ID=YOUR_PROJECT"
```

## Reproducible Testing Guidelines for Judges

To test SilentEar and verify its features:

### 1. Test Sound Detection & Alerts
1. Open the SilentEar app.
2. Grant Microphone permissions when prompted.
3. Keep the app open and simulate one of the default triggers: **say "Hey" loudly**, play a **dog barking** sound from another device, or simulate a **knock on a door**.
4. The app should trigger a full-screen alert, haptic vibration, and display the associated SignMoji.

### 2. Test Custom SignMoji Creation
1. Navigate to the **SignMoji** library tab within the app.
2. Click the **Create/New** button.
3. Test the creator flow: type a word (e.g., "Cat"), and supply a video (either by uploading a short clip, recording from your webcam, or searching the built-in library).
4. Save the SignMoji. You should see it appear in your trigger list, demonstrating the Supabase data sync.

### 3. Test the Voice Deck (Two-Way Communication)
1. Navigate to the **Voice Deck** tab.
2. Start typing a phrase. Wait a moment to see the AI (Gemini 3 Flash) suggest context-aware auto-completions magically appear.
3. Click the **Speak** (Volume) button to hear the app read the phrase aloud loudly.

### 4. Test Caregiver Dashboard
1. Open the **Caregiver Dashboard** in a separate tab or browser window.
2. Trigger an alert in the main app (e.g., say "Help").
3. Verify that the Dashboard updates in real-time, showing the alert, the location, and the battery status.

---

## Third-Party Integrations

| Integration | License | Purpose |
|---|---|---|
| React 19 | MIT | UI framework |
| Supabase | Apache 2.0 | Real-time database & storage |
| Capacitor | MIT | Mobile deployment |
| Lucide React | ISC | Icon library |
| Tailwind CSS | MIT | Styling |

## Project Structure

```
├── App.tsx                  # Main application (React)
├── backend/                 # Cloud Run backend
│   ├── src/
│   │   ├── index.ts         # Express + WebSocket server
│   │   ├── geminiLiveProxy.ts # Gemini Live API WebSocket proxy
│   │   ├── routes/
│   │   │   ├── intelligence.ts  # AI endpoints (scene, refine, discover)
│   │   │   └── firestoreApi.ts  # Firestore CRUD endpoints
│   │   └── services/
│   │       └── firestore.ts     # Firestore client
│   ├── Dockerfile
│   └── package.json
├── services/
│   ├── backendClient.ts     # Frontend → Backend client (WS + REST)
│   ├── gemini3Intelligence.ts # Client-side AI intelligence
│   ├── soundClassifier.ts   # Web Audio FFT sound detection
│   └── voiceDeckService.ts  # Voice Deck AI service
├── components/              # React UI components
├── shared/                  # Shared AI utilities
├── deploy.sh                # Automated GCP deployment
├── cloudbuild.yaml          # Cloud Build config
├── Dockerfile               # Multi-stage Docker build
└── ARCHITECTURE.md          # System architecture diagram
```

---

*Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) — #GeminiLiveAgentChallenge*

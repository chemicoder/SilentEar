# SilentEar — System Architecture

## Architecture Overview

SilentEar is a real-time accessibility agent for deaf and hard-of-hearing users.
It uses the **Gemini Live API** for bidirectional audio streaming and **Gemini 3 Flash**
for scene intelligence — all hosted on **Google Cloud**.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER DEVICE (PWA / Mobile)                   │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  Microphone   │  │  Sound       │  │  Visual & Haptic Alerts   │ │
│  │  (Web Audio)  │  │  Classifier  │  │  • Screen Flash           │ │
│  │  16kHz PCM    │  │  (local FFT) │  │  • Vibration Patterns     │ │
│  └──────┬───────┘  └──────────────┘  │  • Sign Language Videos    │ │
│         │                             │  • Push Notifications      │ │
│         ▼                             └───────────────────────────┘ │
│  ┌──────────────────────────┐                      ▲               │
│  │  Audio Capture &         │                      │               │
│  │  PCM Encoding (base64)   │──── Trigger Match ───┘               │
│  └──────────┬───────────────┘                                      │
│             │ WebSocket                                             │
└─────────────┼───────────────────────────────────────────────────────┘
              │
              │  wss://silentear-backend-xxxxx.run.app/ws/live
              │
┌─────────────┼───────────────────────────────────────────────────────┐
│  GOOGLE CLOUD RUN                                                   │
│             │                                                       │
│  ┌──────────▼───────────────┐                                      │
│  │  WebSocket Proxy Server  │                                      │
│  │  (Express + ws)          │                                      │
│  │                          │                                      │
│  │  • Receives PCM audio    │      ┌────────────────────────────┐  │
│  │  • Manages Live sessions │─────▶│  GEMINI LIVE API           │  │
│  │  • Forwards responses    │◀─────│  (gemini-2.5-flash-native) │  │
│  │  • Processes tool calls  │      │                            │  │
│  └──────────┬───────────────┘      │  • Real-time audio stream  │  │
│             │                      │  • Input transcription     │  │
│             │                      │  • Function calling        │  │
│  ┌──────────▼───────────────┐      │    (trigger_alert tool)    │  │
│  │  REST API Endpoints      │      └────────────────────────────┘  │
│  │                          │                                      │
│  │  /api/intelligence/*     │      ┌────────────────────────────┐  │
│  │  • Scene Analysis        │─────▶│  GEMINI 3 FLASH            │  │
│  │  • Transcript Refinement │◀─────│  (gemini-3-flash-preview)  │  │
│  │  • Trigger Discovery     │      │                            │  │
│  │  • Voice Deck AI         │      │  • Scene intelligence      │  │
│  └──────────┬───────────────┘      │  • NLP post-processing     │  │
│             │                      │  • Trigger auto-discovery  │  │
│             │                      └────────────────────────────┘  │
│  ┌──────────▼───────────────┐                                      │
│  │  CLOUD FIRESTORE         │                                      │
│  │                          │                                      │
│  │  Collections:            │                                      │
│  │  • alerts     (history)  │                                      │
│  │  • devices    (status)   │                                      │
│  │  • triggers   (library)  │                                      │
│  └──────────────────────────┘                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

              │
              │  (Supplementary — real-time caregiver subscriptions)
              ▼
┌─────────────────────────────┐
│  SUPABASE (PostgreSQL)      │
│  • Real-time channels       │
│  • Caregiver alert feed     │
│  • Device commands (poke)   │
│  • Media storage (videos)   │
└─────────────────────────────┘
```

## Component Details

### Google Cloud Services Used

| Service | Purpose |
|---------|---------|
| **Cloud Run** | Hosts the backend server (Express + WebSocket proxy) |
| **Firestore** | Stores alerts, device status, and trigger library |
| **Gemini Live API** | Real-time bidirectional audio streaming with tool calling |
| **Gemini 3 Flash** | Scene intelligence, transcript refinement, trigger discovery |

### Data Flow

1. **Audio Capture**: Browser captures microphone audio at 16kHz via Web Audio API
2. **PCM Streaming**: Audio is encoded as base64 PCM and sent via WebSocket to Cloud Run
3. **Live API Processing**: Cloud Run backend proxies audio to Gemini Live API session
4. **Transcription**: Gemini transcribes audio in real-time and returns text
5. **Tool Calling**: When sounds match alert categories, Gemini calls `trigger_alert`
6. **Alert Delivery**: Alerts are sent to client (haptic + visual) and stored in Firestore
7. **Scene Intelligence**: Periodic Gemini 3 Flash analysis provides contextual awareness

### Agent Architecture

The SilentEar agent uses **function calling** (tool use) as its core interaction pattern:

- **Tool**: `trigger_alert(alert_id, context)` — fires when environmental sounds match user-defined categories
- **System Prompt**: Configures the agent with the user's trigger words, name, and monitoring rules
- **Real-time Loop**: Continuous audio → transcription → trigger matching → haptic/visual alerts
- **Intelligence Layer**: Periodic scene analysis adds contextual reasoning on top of raw detections

### Key Technologies

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + ws (WebSocket)
- **AI**: Google GenAI SDK (`@google/genai`)
- **Database**: Cloud Firestore + Supabase (real-time)
- **Mobile**: Capacitor (Android/iOS) + PWA
- **Deployment**: Docker + Cloud Build + Cloud Run

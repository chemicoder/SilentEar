# How I Built SilentEar — A Real-Time AI Accessibility Agent for Deaf Users with Gemini Live API

*This blog post was created for the purposes of entering the [Gemini Live Agent Challenge](https://googleai.devpost.com/) hackathon.*

**#GeminiLiveAgentChallenge**

---

## The Inspiration — Why This Is Personal

This project is deeply personal to me. My son is profoundly deaf by birth, and as he began learning Pakistan Sign Language (PSL) at school, I joined basic training to learn alongside him. During this ongoing journey, I observed firsthand how challenging daily life can be for the Deaf community and their families. Often, deaf individuals feel irrelevant or isolated in gatherings, struggle to communicate smoothly with hearing people, or face physical danger because they cannot hear critical environmental alerts.

While we've seen incredible advancements in AI, accessibility tools have largely stagnated around simple speech-to-text transcription. I realized that transcription misses the most crucial part of environmental awareness: **the context**. A fire alarm, a knock on the door, or a baby crying are critical sounds that text on a screen does not adequately convey in time-sensitive situations. Inspired by my son's experiences and the powerful capabilities of the Gemini Live API, I set out to build an agent that doesn't just transcribe words, but actively listens and interprets the world — providing life-saving cues in the formats Deaf users actually need, including haptic feedback, screen flashes, and visual sign language.

## What Is SilentEar?

SilentEar is a real-time environmental audio interpreter that goes far beyond simple transcription. It continuously monitors ambient sounds, speech, and conversational flow, helping users understand their surroundings and actively participate in conversations. It's powered by two core Google AI services:

- **Gemini Live API** — for continuous bidirectional audio streaming with function calling
- **Gemini 3 Flash** — for scene intelligence, smart transcript refinement, and trigger auto-discovery

When critical sounds are detected — a dog barking, a doorbell, a siren, or someone calling a name — SilentEar immediately alerts through customized vibration patterns, visual alerts, and on-screen cues. The system supports advanced triggers, keywords, and a full conversational vocabulary range that users can expand themselves.

Crucially, it includes **SignMoji**, an integrated sign language library that displays relevant sign language videos corresponding to alerts. Users can create custom SignMojis by recording a video, providing a URL, or searching the web. The system automatically generates an icon and syncs everything across devices.

For two-way communication, SilentEar provides an AI-powered **Voice Deck**, enabling text-to-speech with smart, context-aware phrase prediction powered by Gemini 3 Flash — allowing fast, natural communication without typing every word. It also includes a caregiver monitoring dashboard where trusted contacts can view live alerts and device status remotely.

## How I Built It

I architected a full-stack solution bridging mobile web and backend cloud infrastructure:

- **Frontend**: A responsive React 19 + TypeScript PWA styled with Tailwind CSS, integrating the Web Audio API for local FFT sound classification to reduce latency for high-frequency alarms.
- **Backend**: A Node.js + Express backend deployed on Google Cloud Run. I implemented a WebSocket proxy to manage bidirectional streaming audio required by the Gemini Live API.
- **AI Integration**: Using the `@google/genai` SDK, I stream live audio into Gemini with defined tools (function calling) such as `trigger_alert`. When Gemini detects critical sounds or phrases, it triggers events pushed through WebSocket directly to the frontend. Gemini 3 Flash via REST handles transcript refinement, environmental context interpretation, trigger grouping, and Voice Deck predictions.
- **Data & Media**: Supabase (PostgreSQL + Realtime + Storage) manages user profiles, custom SignMoji libraries, triggers, and caregiver dashboard synchronization. Cloud Firestore stores alert history, device status, and trigger configurations.

### How Gemini Live API Powers Real-Time Detection

The heart of SilentEar is a WebSocket connection between the user's device and a Cloud Run backend that proxies audio to the Gemini Live API.

Here's the flow:

```
Device Microphone → PCM Audio (16kHz) → WebSocket → Cloud Run → Gemini Live API
                                                                       ↓
                              Haptic + Visual Alerts ← Function Call (trigger_alert)
```

The key insight: instead of traditional keyword matching, I use Gemini's **function calling** capability. The AI model receives a `trigger_alert` tool and a system prompt describing the user's custom trigger categories. When it hears a matching sound or word, it calls the tool — triggering an instant alert on the user's device.

```typescript
const triggerTool: FunctionDeclaration = {
  name: 'trigger_alert',
  description: 'Call this when an environmental sound or keyword matches alert categories.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      alert_id: { type: Type.STRING, description: 'The ID of the alert to trigger.' },
      context: { type: Type.STRING, description: 'Short summary of what was heard.' }
    },
    required: ['alert_id']
  }
};
```

This approach is fundamentally different from traditional sound classifiers. Gemini understands *context* — it knows the difference between a dog barking on TV and a real dog barking at the door.

## Scene Intelligence with Gemini 3 Flash

Beyond real-time audio detection, SilentEar uses Gemini 3 Flash for deeper intelligence:

- **Scene Analysis**: Periodically summarizes what's happening around the user ("Two people are having a conversation nearby. Someone mentioned your name.")
- **Transcript Refinement**: Takes noisy, choppy speech fragments and reconstructs them into clean, readable sentences
- **Trigger Auto-Discovery**: Analyzes ambient audio patterns and suggests new alert categories the user might want

All of these run as server-side REST endpoints on Cloud Run, keeping the mobile client lightweight.

## The Google Cloud Stack

Everything runs on Google Cloud:

| Service | Role |
|---------|------|
| **Cloud Run** | Hosts the Express + WebSocket backend |
| **Cloud Firestore** | Stores alerthistory, device status, trigger configurations |
| **Gemini Live API** | Real-time bidirectional audio streaming with tool calling |
| **Gemini 3 Flash** | Scene intelligence, NLP post-processing |
| **Cloud Build** | Automated CI/CD pipeline (Docker build → deploy) |

Deployment is fully automated via a single `cloudbuild.yaml`:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/silentear-backend', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/silentear-backend']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args: ['run', 'deploy', 'silentear-backend', '--image=gcr.io/$PROJECT_ID/silentear-backend', ...]
```

One `gcloud builds submit` command builds the Docker image and deploys to Cloud Run — zero manual steps.

## Features That Make It Real

SilentEar isn't a demo — it's a usable app with features designed for real deaf users:

1. **Customizable Triggers** — Users define their own alert words (doorbell, fire, baby, their name) with unique vibration patterns and colors
2. **Sign Language Videos** — Alerts can include ASL, BSL, or PSL sign language video demonstrations
3. **SignMoji** — A companion sign language library where users can record, search, or link sign videos with AI-generated icons, synced across devices
4. **Voice Deck** — A text-to-speech tool with AI-powered phrase suggestions, letting deaf users "speak" through their device
5. **Caregiver Dashboard** — Family members can monitor alerts in real time via Supabase real-time subscriptions
6. **Offline Mode** — Falls back to browser Speech Recognition API when cloud isn't available
7. **Multi-Language** — Supports 10 languages for transcript processing

## Accomplishments I'm Proud Of

I'm especially proud of how seamless the SignMoji integration feels. Allowing users to instantly search the web, record their own sign language videos, and sync them securely into their trigger system makes the platform deeply personal and culturally meaningful. Achieving ultra-low latency alerts through Gemini Live function calling also feels transformative in real-world testing.

## What I Learned

I gained deep experience working with the Web Audio API and real-time streaming constraints in modern browsers. More importantly, building accessibility-first technology taught me about the nuance of Deaf culture — especially why transcription alone is insufficient, and why combining environmental intelligence, visual signals, haptics, and sign language is essential for true inclusion.

## Technical Challenges & Lessons Learned

**Challenge 1: WebSocket session management on Cloud Run.**
Cloud Run has a default timeout and can recycle instances. I configured session affinity and extended timeouts to keep Gemini Live sessions stable.

**Challenge 2: Audio format compatibility.**
The browser captures audio as Float32 PCM, but Gemini expects specific formats. I built a real-time PCM encoder that converts and chunks audio for optimal streaming.

**Challenge 3: Balancing speed vs. intelligence.**
Real-time alerts need to be *instant* (under 500ms). Scene analysis needs to be *thoughtful*. I split these into two pipelines — Gemini Live API for speed, Gemini 3 Flash for depth — running in parallel.

## What's Next

- Package SilentEar natively using Capacitor for iOS and Android for continuous background listening
- Integrate with smartwatches for faster and more discreet haptic alerts
- Build a live interpreter pipeline capable of translating sign into audio/video output and converting spoken audio into signing avatars
- Expand SignMoji into a global, community-driven repository where users can share localized sign language triggers (PSL, BSL, ASL, and others) worldwide
- Video-based sign language recognition using Gemini's multimodal capabilities

## Try It Yourself

SilentEar is open source:
- **GitHub**: [github.com/chemicoder/SilentEar](https://github.com/chemicoder/SilentEar)
- **Live Demo**: Deployed on Google Cloud Run

Built with React 19, TypeScript, Node.js, and the Google GenAI SDK (`@google/genai`).

---

*This project was built for the Gemini Live Agent Challenge hackathon to demonstrate how the Gemini Live API can power real-time accessibility tools. #GeminiLiveAgentChallenge*

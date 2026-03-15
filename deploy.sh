#!/bin/bash
# ─────────────────────────────────────────────────────────────
# SilentEar — Automated Google Cloud Deployment Script
# Deploys to Cloud Run with Firestore + Gemini Live API
# ─────────────────────────────────────────────────────────────
set -e

# ── Configuration ──
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID environment variable}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="silentear-backend"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
GEMINI_API_KEY="${GEMINI_API_KEY:?Set GEMINI_API_KEY environment variable}"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║          SilentEar — Cloud Deployment                   ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Project:  ${PROJECT_ID}"
echo "║  Region:   ${REGION}"
echo "║  Service:  ${SERVICE_NAME}"
echo "╚══════════════════════════════════════════════════════════╝"

# ── Step 1: Enable required Google Cloud APIs ──
echo ""
echo "→ Enabling Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="${PROJECT_ID}"

# ── Step 2: Create Firestore database (if not exists) ──
echo ""
echo "→ Creating Firestore database (if needed)..."
gcloud firestore databases create \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --type=firestore-native 2>/dev/null || echo "  (Firestore already exists)"

# ── Step 3: Build container image ──
echo ""
echo "→ Building container with Cloud Build..."
gcloud builds submit \
  --project="${PROJECT_ID}" \
  --tag="${IMAGE_NAME}" \
  --timeout=600 \
  .

# ── Step 4: Deploy to Cloud Run ──
echo ""
echo "→ Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --image="${IMAGE_NAME}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --set-env-vars="GEMINI_API_KEY=${GEMINI_API_KEY},GCP_PROJECT_ID=${PROJECT_ID}" \
  --session-affinity

# ── Step 5: Get service URL ──
echo ""
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Deployment Complete!                                ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  URL: ${SERVICE_URL}"
echo "║                                                         ║"
echo "║  Services used:                                         ║"
echo "║    • Cloud Run (backend hosting)                        ║"
echo "║    • Firestore (alert & device data)                    ║"
echo "║    • Gemini Live API (real-time audio AI)               ║"
echo "║    • Gemini 3 Flash (scene intelligence)                ║"
echo "╚══════════════════════════════════════════════════════════╝"

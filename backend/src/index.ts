/**
 * SilentEar Backend — Cloud Run Server
 *
 * Provides:
 * 1. WebSocket proxy for Gemini Live API (real-time audio streaming)
 * 2. REST endpoints for AI intelligence (scene analysis, transcript refinement)
 * 3. Firestore persistence for alerts, device status, and trigger library
 * 4. Static file serving for the frontend PWA
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { handleLiveSession } from './geminiLiveProxy.js';
import { intelligenceRouter } from './routes/intelligence.js';
import { firestoreRouter } from './routes/firestoreApi.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health check (Cloud Run requires this)
app.get('/healthz', (_req: any, res: any) => res.json({ status: 'ok' }));
app.get('/api/health', (_req: any, res: any) => res.json({ status: 'ok', version: '2.0' }));

// API routes
app.use('/api/intelligence', intelligenceRouter);
app.use('/api/firestore', firestoreRouter);

// Serve frontend static files (built by Vite)
const staticDir = path.resolve(__dirname, '..', '..', 'dist');
app.use(express.static(staticDir));

// SPA fallback — serve index.html for any non-API routes
app.get('*', (req: any, res: any) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Create HTTP + WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/live' });

wss.on('connection', (ws) => {
  console.log('[WS] New client connected');
  handleLiveSession(ws);
});

const PORT = parseInt(process.env.PORT || '8080', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SilentEar] Backend running on port ${PORT}`);
  console.log(`[SilentEar] Static files: ${staticDir}`);
});

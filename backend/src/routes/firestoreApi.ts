/**
 * Firestore REST API Routes
 *
 * Exposes Firestore operations for alerts, device status, and triggers.
 */

import { Router, type Request, type Response } from 'express';
import { firestoreService } from '../services/firestore.js';

const router = Router();

// ── Alerts ──
router.post('/alerts', async (req: Request, res: Response) => {
  try {
    await firestoreService.storeAlert(req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get('/alerts/:deviceId', async (req: Request, res: Response) => {
  try {
    const alerts = await firestoreService.getAlerts(req.params.deviceId as string);
    res.json(alerts);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Device Status ──
router.post('/devices/status', async (req: Request, res: Response) => {
  try {
    await firestoreService.updateDeviceStatus(req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get('/devices/:deviceId', async (req: Request, res: Response) => {
  try {
    const status = await firestoreService.getDeviceStatus(req.params.deviceId as string);
    res.json(status || {});
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Triggers ──
router.get('/triggers', async (_req: Request, res: Response) => {
  try {
    const triggers = await firestoreService.getTriggers();
    res.json(triggers);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post('/triggers', async (req: Request, res: Response) => {
  try {
    await firestoreService.syncTrigger(req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export { router as firestoreRouter };

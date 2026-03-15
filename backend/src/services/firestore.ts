/**
 * Firestore Service
 *
 * Provides persistence for alerts, device status, and triggers using Google Cloud Firestore.
 * On Cloud Run, authentication happens automatically via the service account.
 * Locally, set GOOGLE_APPLICATION_CREDENTIALS or use `gcloud auth application-default login`.
 */

// @ts-ignore — Firestore types are bundled in the package
import { Firestore } from '@google-cloud/firestore';

let db: Firestore | null = null;

function getDb(): Firestore {
  if (!db) {
    db = new Firestore({
      projectId: process.env.GCP_PROJECT_ID,
    });
  }
  return db;
}

export interface AlertRecord {
  alertId: string;
  context: string;
  deviceId: string;
  userName: string;
  timestamp: number;
}

export interface DeviceStatusRecord {
  deviceId: string;
  userName: string;
  isListening: boolean;
  batteryLevel?: number;
  latitude?: number;
  longitude?: number;
  lastActive: string;
}

export const firestoreService = {
  /** Store an alert event */
  async storeAlert(alert: AlertRecord): Promise<void> {
    try {
      await getDb().collection('alerts').add({
        ...alert,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Firestore] Error storing alert:', err);
    }
  },

  /** Get recent alerts for a device */
  async getAlerts(deviceId: string, limit = 50): Promise<AlertRecord[]> {
    try {
      const snapshot = await getDb()
        .collection('alerts')
        .where('deviceId', '==', deviceId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
      return snapshot.docs.map((doc: any) => doc.data() as AlertRecord);
    } catch (err) {
      console.error('[Firestore] Error fetching alerts:', err);
      return [];
    }
  },

  /** Update device status (heartbeat) */
  async updateDeviceStatus(status: DeviceStatusRecord): Promise<void> {
    try {
      await getDb()
        .collection('devices')
        .doc(status.deviceId)
        .set(status, { merge: true });
    } catch (err) {
      console.error('[Firestore] Error updating device status:', err);
    }
  },

  /** Get device status */
  async getDeviceStatus(deviceId: string): Promise<DeviceStatusRecord | null> {
    try {
      const doc = await getDb().collection('devices').doc(deviceId).get();
      return doc.exists ? (doc.data() as DeviceStatusRecord) : null;
    } catch (err) {
      console.error('[Firestore] Error fetching device status:', err);
      return null;
    }
  },

  /** Store or update a trigger in the global library */
  async syncTrigger(trigger: any): Promise<void> {
    try {
      await getDb()
        .collection('triggers')
        .doc(trigger.id)
        .set(trigger, { merge: true });
    } catch (err) {
      console.error('[Firestore] Error syncing trigger:', err);
    }
  },

  /** Get all active triggers from global library */
  async getTriggers(): Promise<any[]> {
    try {
      const snapshot = await getDb()
        .collection('triggers')
        .where('isActive', '==', true)
        .get();
      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error('[Firestore] Error fetching triggers:', err);
      return [];
    }
  },
};

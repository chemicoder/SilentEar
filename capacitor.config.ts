import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.silentear.app',
  appName: 'SilentEar',
  webDir: 'dist',
  android: {
    // Allow WebView to prompt for camera/microphone permissions
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https'
  }
};

export default config;

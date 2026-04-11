import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.linkauto.app',
  appName: 'Cridl',
  webDir: 'out',

  // ─── Live-server mode ─────────────────────────────────────────────────
  // The APK loads your Vercel deployment directly.
  // This means zero code duplication — one deploy updates both web and app.
  server: {
    url: 'https://linkedin-automation-chi.vercel.app',
    cleartext: false,   // HTTPS only
    androidScheme: 'https',
  },

  android: {
    backgroundColor: '#0f172a',   // Match app bg so splash is seamless
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 2500,
      backgroundColor: '#0f172a',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nexus.chat',
  appName: 'NEXUS',
  webDir: 'dist',
  // https://localhost penting supaya WebCrypto (crypto.subtle) aktif di Android.
  // WKWebView iOS sudah pakai scheme secure otomatis.
  androidScheme: 'https',
  ios: {
    contentInset: 'automatic',
    // Izinkan kamera/mikro untuk video call, tapi tetap batasi navigasi ke app sendiri.
    allowNavigation: [],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0b0f19',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#0b0f19',
    },
  },
};

export default config;

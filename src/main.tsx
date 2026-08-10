import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { bindInstallPrompt } from './lib/install';

// Daftarkan SW sejak awal supaya sebelum event `beforeinstallprompt` muncul
// (Android Chrome), service worker sudah mengontrol halaman — salah satu syarat
// kriteria install PWA yang menampilkan tombol install resmi.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

bindInstallPrompt();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

# NEXUS // Chat E2E — Cyber Edition

Landing page + chat app full fitur dengan Supabase Realtime. Semua pesan DM & grup dienkripsi
end-to-end (ECDH P-256 + AES-256-GCM) di browser. Server cuma lihat ciphertext.

## Fitur
- Landing page cyber (canvas neural network, parallax 3D, glitch text)
- Chat 1-on-1 & grup — bubble, avatar, jam, online status, unread badge
- Realtime: pesan, typing indicator, presence, reaction, edit, hapus
- Kirim foto / video / GIF autoplay + paste gambar Ctrl+V
- Kirim media BESAR (hingga 1 GB) — lewat host Railway sendiri, menembus batas 50 MB
  plan Free Supabase (video tetap dienkripsi E2E di browser sebelum dikirim)
- Reply pesan + reaction emoji (nama reaktor selalu tampil)
- Story / Status (ilang otomatis 24 jam)
- Reels (upload video sendiri autoplay + embed TikTok)
- Video call WebRTC (1-on-1)
- Nobar / Watch Party — **Netflix legal** (tiap peserta login akun sendiri + hitung mundur bareng) atau YouTube sync
- Status pesan: ⏱ mengirim → ✓✓ terkirim → ✓✓ hijau dibaca (kalau gagal, muncul tombol "GAGAL" untuk kirim ulang)
- Kirim pesan anti-gagal: auto-retry 3x + id `p_id` di RPC (retry idempoten — tidak ganda)
- Multi-device (kayak WA): menu Ghost Mode → "Ekspor Kunci"; di device lain → layar login → "Impor Kunci E2E"
- Deteksi kunci salah (🔒 semua): saat login, app mengecek kecocokan kunci device vs public key akun di server.
  Kalau beda (mis. dua akun didaftarkan di browser yang sama → kunci ketimpa), muncul tombol
  "REGENERASI & PERBAIKI KUNCI" yang bikin kunci baru + update di server (butuh `update_public_key` di migration).
  Kunci privat sekarang disimpan per-username, jadi beberapa akun di satu browser tidak saling menimpa.
- Ghost mode tetap ada, tapi nama asli selalu tampil di dalam aplikasi
- Sesi tahan refresh 24 jam — otomatis logout kalau idle lebih dari 7 jam
- Voice note (tahan tombol mic) + audio/video punya suara saat diputar
- Pesan chat di-cache lokal (5 menit) biar buka chat & refresh lebih cepat
- Notifikasi in-app + Web Push (perlu setup VAPID, opsional)
- Panel master tersembunyi — hanya bisa dibuka via URL `/kaukontrol`
- Kirim pesan kompatibel ke belakang: kalau DB masih pakai fungsi lama (belum migrate ulang),
  app otomatis fallback ke signature RPC lama — kirim tetap jalan, tidak ada error "function not found".

## Portal Master (tersembunyi)
- Tidak ada tombol/UI admin di mana pun. Akun master tidak terlihat oleh user lain (tidak muncul di daftar user, reels, story, grup).
- Master login seperti user biasa, lalu buka: `https://<domain>/kaukontrol`
- Di sana baru muncul login portal master → ACC user, tab **USERS** (daftar semua user + **HAPUS** permanen
  untuk privasi/keamanan), peta lokasi live, access log.

## Setup (wajib 1x)
1. Buka Supabase Dashboard project kamu (`nwwdnvbfeslglzsgdvdj.supabase.co`).
2. **SQL Editor** → tempel & jalankan isi `supabase/migration.sql`.
   Ini bikin semua tabel + RPC baru, kompatibel dengan chat lama. **Aman dijalankan ulang** kalau ada update fitur.
   **Penting — REALTIME:** bagian ini juga mendaftarkan tabel `messages`, `group_messages`, `reactions`,
   `group_reactions`, `stories`, `user_locations` ke publikasi `supabase_realtime` + set `replica identity full`.
   Kalau langkah ini terlewat, pesan **tidak muncul tanpa refresh** (verifikasi: realtime channel tidak menerima
   event INSERT). Selalu jalankan ulang seluruh file setelah update fitur.
3. Storage bucket `chat-media` dijamin ada + public (sudah otomatis di SQL).
4. Selesai. Akun master bawaan: **username `master`, password `nexus2024`** → ganti.

## Jalankan
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # produksi
node server.mjs    # serve dist/ + API media besar (upload/download/delete) + auth x-nexus-token
```

## Media besar (>50 MB) — host Railway
Supabase plan Free membatasi ukuran file 50 MB (batas global, tak bisa ditembus
walaupun bucket di-set lebih besar). NEXUS mengatasi ini lewat media server sendiri:

- `server.mjs` = Express yang serve `dist/` + endpoint media besar:
  - `POST /api/upload` — auth via header `x-nexus-token`, simpan ke `DATA_DIR/big/<uid>/`, return `{ path }`
  - `GET /media/<path>` — stream file (public, isinya ciphertext E2E)
  - `DELETE /api/media?path=...` dan `DELETE /api/media/all` — hapus file milik user sendiri
- Frontend: file >50 MB otomatis dienkripsi lalu di-upload ke host media, `media_path`
  disimpan sebagai `big/...` (lolos validasi DB). Download/decrypt tetap satu alur dengan media biasa.
- Setup Railway:
  1. `railway.json` sudah pakai `node server.mjs`.
  2. **Volume** (opsional tapi disarankan): mount `/data` (Hobby plan) supaya media tidak
     hilang saat redeploy/restart. Tanpa volume, media besar tersimpan di disk ephemeral.
  3. Env opsional: `DATA_DIR` (default `./data`), `MAX_BIG_BYTES` (default 1 GB),
     `MAX_UPLOADS_PER_MIN` (default 10), `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Catatan: host media production dikunci di `src/lib/api.ts` (`MEDIA_BASE`). Untuk dev lokal,
  media besar tetap dikirim ke host production.

## App iOS & Android (Capacitor — satu codebase, enkripsi sama persis)
Web ini dibungkus jadi app native dengan **Capacitor**. Karena UI, logika chat, dan
kripto E2E-nya file yang SAMA dengan web, maka iOS / Android / web saling sinkron
terhadap satu database tanpa risiko kunci saling menimpa (multi-key E2E).

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm run build        # bikin dist/
npx cap sync         # salin dist ke android/ dan ios/
```

- **Android**: buka di Android Studio → `npx cap open android`
  (atau `npm run cap:open:android`). Build APK/AAB → Run.
- **iOS (butuh Mac + Xcode)**: `npm run cap:open:ios`
  (`npx cap open ios`). Set Team di Signing & Capabilities, lalu Run ke device.
- Setiap ubah kode web: `npm run build && npx cap sync` lalu build ulang native.
- Kode native yang di-commit hanya skeleton; web assets (`android/.../public`,
  `ios/.../public`) di-gitignore dan selalu disalin ulang oleh `cap sync`.
- Konfigurasi app native ada di `capacitor.config.ts` (appId `com.nexus.chat`,
  scheme `https://localhost` biar WebCrypto jalan di Android; iOS otomatis secure).

Catatan push: di app native, Web Push (VAPID) tidak berlaku seperti di browser —
notifikasi native butuh plugin `@capacitor/push-notifications` + FCM (Android) /
APNs (iOS). Chat tetap live via Supabase Realtime di semua platform.

## Alur pendaftaran
- User daftar → status `pending` → Master ACC di Panel Admin → baru bisa login.
- Kunci privat disimpan di IndexedDB perangkat. Login harus dari device yang sama pas daftar.

## Catatan jujur
- **Netflix**: nggak ada API resmi. Nobar legal = tiap peserta pakai akun Netflix sendiri, ruang nobar kasih
  hitung mundur "MULAI BERSAMA" (3-2-1) biar semua pencet play barengan. Ada panduan per perangkat di dalamnya.
- **TikTok**: pakai embed player, bukan API (API publik nggak ada).
- **Web Push beneran** butuh VAPID keys + deploy edge function `send-push`
  (lihat `supabase/functions/send-push`). Tanpa itu, notifikasi tetap jalan selama halaman terbuka.
- **Video call** butuh TURN server kalau dua-duanya di balik NAT ketat (STUN Google gratis sudah dipasang).
- **Routing `/kaukontrol`**: di host statis perlu rewrite `/* → /index.html` (sudah ada `public/_redirects`
  untuk Netlify/Vercel). Di Vite dev otomatis bisa.

## Keamanan
- E2E: kunci privat tidak pernah ke server. DM pakai ECDH per pasangan; grup pakai group-key yang
  dibungkus ke public key tiap member.
- Lokasi: transparan — user menyetujui saat daftar/login (checkbox, default aktif), di-update tiap 1 menit,
  dan tetap dilaporkan selama halaman terbuka (termasuk saat user logout) supaya polisi tetap bisa menemukan
  posisi via link Google Maps. Admin lihat di peta.
- `migration.sql` menyimpan password polos untuk kompatibilitas backend lama —
  **sangat disarankan** ganti ke hash (pgcrypto `crypt`) setelah migrasi.

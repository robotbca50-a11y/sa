# NEXUS Realtime — Analisis SSE vs WebSocket & Rencana Pengeratan Privasi

> Dokumen internal engineering. Ditulis: NEXUS build o8.2 (2026).

## 1. Masalah yang harus diselesaikan

1. Pengiriman pesan realtime (DM + grup) harus tetap mulus di HP maupun web.
2. Pesan **E2E encrypted** — server hanya boleh melihat ciphertext, tapi tetap harus bisa
   "mengantar" pesan ke penerima. Jadi realtime TIDAK bisa dinaikkan jadi plaintext.
3. Saat ini channel realtime (`nexus:dm:<peerId>`, `nexus:group:<gid>`) disubscribe pakai
   **anon key**, dan tabel `messages` punya policy RLS `realtime_read` yang mengizinkan
   anon membaca row (ciphertext). Ini celah: siapa pun yang punya anon key bisa subscribe
   channel orang lain dan membaca ciphertext (untuk menyerang butuh kunci, tapi metadata
   seperti pengirim/waktu jadi bocor, dan bisa spam-baca semua pesan).
4. Target "mirip WA": pesan terkirim cepat, status online, typing indicator, notif push.

## 2. SSE (Server-Sent Events)

- Arah: **satu arah** (server → client). Tidak ada mekanisme kirim dari client.
- Transport: HTTP long-poll / streaming `text/event-stream`.
- Supabase realtime v1 memakai ini: client subscribe via channel, server push event.
- Kelebihan:
  - Pakai HTTP biasa (compatible firewall, tanpa upgrade handshake).
  - Auto-reconnect native di browser (`EventSource`).
- Kekurangan:
  - Satu arah — untuk "typing" atau "kirim pesan" tetap butuh POST terpisah.
  - Header custom (mis. `x-nexus-token`) **tidak bisa** dikirim dari `EventSource`
    browser (hanya cookie). Padahal auth NEXUS memakai header custom — ini blokir utama.
  - Reconnect loss: pesan yang terlewat saat mati/nyala koneksi butuh `last_event_id` +
    query catch-up manual.
  - Tidak cocok untuk data sangat realtime (lokasi, blackout, kill-switch, panggilan).

## 3. WebSocket

- Arah: **dua arah** (full-duplex).
- Kelebihan:
  - Header custom didukung saat handshake → bisa kirim `x-nexus-token` (atau pakai
    JWT user session langsung).
  - Latency rendah untuk typing indicator, presence, lokasi realtime, sinyal WebRTC.
  - Supabase realtime v2 (Channels) memakai WebSocket dan mengotentikasi user via
    **user JWT** (`access_token`), bukan anon — ini kunci buat menutup celah
    `realtime_read`.
- Kekurangan:
  - Perlu maintain reconnect & heartbeat manual (client-side).
  - Upgrade handshake kadang diblokir proxy korporat (jarang di mobile).

## 4. Keputusan arsitektur

**Pakai WebSocket realtime Supabase dengan JWT user** (bukan anon). Ini perombakan
subscribe di `src/lib/realtime.ts`:

1. Client login → dapat `access_token` JWT user dari tabel `sessions` (auth NEXUS custom).
   Simpan token itu; Supabase realtime menerimanya sebagai ganti anon key.
2. Semua channel disubscribe dengan JWT tsb → RLS realtime otomatis memakai identitas
   user asli (bukan `anon`).
3. Policy `realtime_read` diubah jadi: user hanya bisa baca row channel yang dia
   terlibat, contoh:
   - `messages`: `auth.uid() = sender_id OR auth.uid() = recipient_id`
     (untuk DM) dan `exists(group_members where user_id=auth.uid())` (untuk grup).
   - Karena server tetap hanya lihat ciphertext, kebocoran yang tersisa hanyalah
     metadata minimal (pengirim/penerima/waktu) — itu pun hanya untuk pihak yang
     terlibat. Ini analog WA.
4. Kill-switch & blackout dikirim lewat channel per-user (`nexus:self:<userId>`)
   yang hanya bisa di-subscribe pemiliknya (RLS: `auth.uid() = user_id`).

**Catatan transisi**: selama JWT belum dipasang, tombol realtime pakai anon masih
berfungsi. Jangan cabut policy `realtime_read` SEBELUM migrasi JWT selesai — itu akan
memutus pengiriman pesan ke semua client lama.

## 5. Peta jalan

| Langkah | Isi | Effort |
| --- | --- | --- |
| 1 | Client: simpan `access_token` JWT di session; realtime subscribe pakai JWT | M |
| 2 | Migration: buat/ganti `realtime_read` jadi per-user (RLS) | S |
| 3 | Hapus fallback anon di `src/lib/realtime.ts` | S |
| 4 | Test: kirim pesan antar 2 HP + 1 web, pastikan push & realtime hidup | M |
| 5 | (Opsional) ganti ke Supabase Realtime v2 channels jika belum | M |

## 6. SSE vs WebSocket — tabel ringkas

| Aspek | SSE | WebSocket |
| --- | --- | --- |
| Arah data | 1 arah (server→client) | 2 arah |
| Header custom (x-nexus-token) | Tidak (browser) | Ya |
| Latency | Menengah (reconnect) | Rendah |
| Pesan terlewat | Perlu `last_event_id` | Perlu buffer/handshake |
| Cocok NEXUS? | Parsial (notif saja) | Ya (full) |
| RLS identitas user | Sulit (anon) | Mudah (JWT) |

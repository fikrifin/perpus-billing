# Setup Development & MVP Demo LAN

## Requirement Saat Ini

- Node.js 22+
- npm 11+
- Semua target deployment final: Windows dalam satu LAN/WiFi lokal.

## Jalankan Backend Lokal

```bash
npm install
npm run dev:server
```

Default server:

- HTTP: `http://localhost:3478`
- Health check: `GET /health`
- WebSocket: `ws://localhost:3478/ws`
- Bind host backend default: `0.0.0.0`, jadi bisa diakses dari client satu jaringan.

Untuk demo LAN, jalankan backend di PC operator/server lalu catat IP lokal Windows, contoh:

```text
http://192.168.1.10:3478
```

Pastikan Windows Firewall mengizinkan port `3478` untuk jaringan lokal/private network.

## Jalankan Admin Dashboard Prototype

```bash
npm run dev:admin
```

Admin default connect ke backend `http://localhost:3478`.

Kalau admin dibuka dari device lain atau nanti dibungkus desktop app, arahkan API dengan env Vite:

```bash
VITE_API_BASE=http://192.168.1.10:3478 npm run dev:admin
```

Login operator development:

- Username: `admin`
- Password: `admin`

Catatan auth:

- Endpoint operator/admin sekarang dilindungi Bearer token.
- Login `POST /api/auth/login` mengembalikan token session 12 jam.
- Dashboard menyimpan token di `localStorage` dan mengirim `Authorization: Bearer <token>` untuk API admin.
- Endpoint client yang tetap publik untuk MVP LAN:
  - `GET /health`
  - `GET /api/settings`
  - `POST /api/users/validate-login`
  - `POST /api/sessions/start` untuk login user dari client.
  - `POST /api/computers/:code/heartbeat`
  - `POST /api/client-commands/:id/ack`

## Backup Database

Dashboard tab **Pengaturan** punya tombol **Buat Backup Sekarang**.

Default output backup:

```text
apps/backend-server/data/backups/perpus-billing-<timestamp>.db
```

Bisa override dengan env:

```bash
PERPUS_BACKUP_DIR=D:\PerpusBilling\backups npm run dev:server
```

Rekomendasi operasional MVP:

- Backup sebelum update aplikasi.
- Backup setelah operasional harian.
- Simpan salinan backup ke flashdisk/drive lain secara berkala.

## Jalankan Client Agent Prototype

```bash
npm run dev:client
```

Client prototype akan:

- membaca `GET /api/settings` untuk nama instansi, heartbeat interval, warning shutdown, dan default expire action.
- heartbeat ke `POST /api/computers/:code/heartbeat`.
- menerima remote command dari WebSocket atau response heartbeat.
- start session via `POST /api/sessions/start` memakai username/password user.

Setting yang berpengaruh ke client:

- `business_name` → teks brand/lock screen.
- `heartbeat_interval_seconds` → interval heartbeat client.
- `shutdown_warning_seconds` → countdown simulasi shutdown/restart.
- `default_expire_action` → aksi saat waktu habis: `shutdown`, `restart`, atau `lock`.

## Checklist MVP Demo LAN

Topologi minimum:

- 1 PC operator/server Windows.
- 1–2 PC client Windows.
- Semua device satu WiFi/LAN lokal.

Langkah demo:

1. Jalankan backend di PC operator/server.
2. Buka admin dashboard dan login operator.
3. Buat/cek data komputer: `PC-01`, `PC-02`, dst.
4. Di tiap client, set server URL ke IP operator/server dan computer code sesuai data komputer.
5. Cek heartbeat: komputer muncul online/idle di dashboard.
6. Buat user member atau one-time.
7. Login dari client memakai username/password user.
8. Cek dashboard: session aktif, countdown berjalan.
9. Test top-up/extend dari dashboard.
10. Test stop session dari dashboard.
11. Test expired session: client harus menjalankan aksi akhir sesuai setting, default `shutdown`.
12. Buat backup database dan export laporan harian CSV.

## Catatan Windows Client Agent

Client agent final ditargetkan native Windows. Setelah backend/admin MVP ini, next phase paling masuk akal adalah membuat Windows client agent native, rekomendasi stack:

- .NET 8 Worker Service untuk auto-start/background heartbeat.
- WPF/WinUI untuk lock/login/countdown screen.
- Windows APIs/commands untuk lock, restart, shutdown.

Environment macOS ini belum punya .NET SDK Windows UI, jadi implementasi final client kemungkinan perlu dikerjakan dengan struktur project .NET yang bisa dibuild/test di Windows.

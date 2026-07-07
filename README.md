# Perpus Billing

Aplikasi manajemen akses komputer perpustakaan berbasis desktop/LAN lokal.

## Status

Tahap prototype core sudah siap menuju **MVP Demo LAN**. Fokus berikutnya: Windows client agent native.

Yang sudah disiapkan:

- Blueprint project
- Struktur monorepo
- Backend lokal awal berbasis Node.js + Fastify + SQLite
- API dasar untuk operator, komputer, paket durasi, user/member, session, heartbeat, laporan
- WebSocket endpoint dasar untuk realtime event
- Prototype dashboard operator berbasis React/Vite
- Prototype client agent/lock screen berbasis React/Vite untuk validasi flow
- Top-up/isi ulang waktu user dari dashboard operator
- Riwayat aktivitas penggunaan dan top-up di dashboard
- Password hashing PBKDF2 untuk password baru/reset
- Operator login token untuk proteksi API admin/operator
- Backup database SQLite dari dashboard
- Export laporan harian CSV

## Struktur

```text
perpus-billing/
├── BLUEPRINT.md
├── README.md
├── apps/
│   ├── admin-desktop/
│   ├── backend-server/
│   └── client-agent/
├── packages/
│   └── shared/
├── docs/
│   └── setup.md
└── scripts/
```

## Development

Install dependency:

```bash
npm install --cache ./.npm-cache
```

Jalankan backend:

```bash
npm run dev:server
```

Jalankan dashboard operator:

```bash
npm run dev:admin
```

Jalankan client agent prototype:

```bash
npm run dev:client
```

Default:

- Backend HTTP: `http://localhost:3478`
- Backend Health: `GET /health`
- Backend WebSocket: `ws://localhost:3478/ws`
- Admin Dashboard: `http://localhost:5173`
- Client Agent Prototype: `http://localhost:5174`

## Data Seed Development

Akun operator:

- Username: `admin`
- Password: `admin`

Komputer demo:

- `PC-01`
- `PC-02`
- `PC-03`
- `PC-04`
- `PC-05`

User demo:

- Username: `user001`, password: `123456`, saldo awal 60 menit
- Username: `user002`, password: `123456`, saldo awal 90 menit
- Username: `user003`, password: `123456`, saldo awal 120 menit
- Username: `guest001`, password: `123456`, saldo awal 30 menit
- Username: `guest002`, password: `123456`, saldo awal 60 menit

Catatan: credential seed ini hanya untuk development/demo dan wajib diganti sebelum pilot serius. Password baru/reset sudah memakai hashing PBKDF2. Smoke test memakai database SQLite sementara melalui `PERPUS_DB_PATH`, sehingga tidak mengotori database demo utama.

## MVP Demo LAN

Dokumentasi setup LAN/offline lokal ada di [`docs/setup.md`](docs/setup.md).

Ringkasnya:

1. Jalankan backend di PC operator/server.
2. Buka port `3478` di Windows Firewall private network.
3. Arahkan admin/client ke IP server, contoh `http://192.168.1.10:3478`.
4. Daftarkan kode komputer (`PC-01`, `PC-02`, dst).
5. Pastikan heartbeat client muncul online/idle.
6. Test login user, session countdown, extend/top-up, stop, expired shutdown, backup DB, dan export CSV.

## Next Phase

Backend/admin sudah cukup untuk lanjut ke **Windows client agent native**:

- .NET Worker Service untuk auto-start dan heartbeat.
- WPF/WinUI lock/login/countdown screen.
- Command Windows nyata untuk lock/restart/shutdown.
- Pairing sederhana: server URL + computer code.

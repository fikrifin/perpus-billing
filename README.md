# Perpus Billing

Aplikasi manajemen akses komputer perpustakaan berbasis desktop/LAN lokal.

## Status

Tahap awal development MVP.

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

Catatan: password ini masih placeholder development dan harus diganti/hash sebelum production. Smoke test memakai database SQLite sementara melalui `PERPUS_DB_PATH`, sehingga tidak mengotori database demo utama.

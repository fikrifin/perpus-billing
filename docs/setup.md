# Setup Development

## Requirement Saat Ini

- Node.js 22+
- npm 11+

## Jalankan Backend Lokal

```bash
npm install
npm run dev:server
```

Default server:

- HTTP: `http://localhost:3478`
- Health check: `GET /health`
- WebSocket: `ws://localhost:3478/ws`

## Jalankan Admin Dashboard Prototype

```bash
npm run dev:admin
```

Admin akan connect ke backend default `http://localhost:3478`.

## Jalankan Client Agent Prototype

```bash
npm run dev:client
```

Client prototype akan:

- membaca `GET /api/settings` untuk nama instansi, heartbeat interval, warning shutdown, dan default expire action.
- heartbeat ke `POST /api/computers/:code/heartbeat`.
- menerima remote command dari WebSocket atau response heartbeat.

Setting yang berpengaruh ke client:

- `business_name` → teks brand/lock screen.
- `heartbeat_interval_seconds` → interval heartbeat client.
- `shutdown_warning_seconds` → countdown simulasi shutdown/restart.
- `default_expire_action` → aksi saat waktu habis: `shutdown`, `restart`, atau `lock`.

## Catatan Windows Client Agent

Client agent final ditargetkan untuk Windows. Environment macOS ini belum punya .NET SDK, jadi tahap awal dimulai dari backend lokal dan API contract dulu.

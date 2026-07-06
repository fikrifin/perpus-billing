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

## Catatan Windows Client Agent

Client agent final ditargetkan untuk Windows. Environment macOS ini belum punya .NET SDK, jadi tahap awal dimulai dari backend lokal dan API contract dulu.

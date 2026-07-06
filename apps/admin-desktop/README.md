# Admin Desktop / Operator Dashboard

Prototype awal dashboard operator.

Saat ini masih Vite React web app agar cepat divalidasi. Setelah flow UI stabil, app ini bisa dibungkus menjadi desktop app dengan Tauri.

## Jalankan

Dari root project:

```bash
npm run dev:server
npm run dev:admin
```

Default:

- Admin UI: `http://localhost:5173`
- Backend API: `http://localhost:3478`

Jika backend memakai host/port lain:

```bash
VITE_API_BASE=http://192.168.1.10:3478 npm run dev:admin
```

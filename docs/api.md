# API Draft — Backend Server

Base URL default: `http://localhost:3478`

Semua request body memakai JSON. Auth/token belum final; login operator saat ini masih prototype development.

## Health

### `GET /health`

Response:

```json
{
  "ok": true,
  "service": "perpus-billing-backend",
  "at": "2026-07-06T00:00:00.000Z"
}
```

## Settings

### `GET /api/settings`

Mengambil setting runtime backend/client.

Response contoh:

```json
{
  "business_name": "Perpustakaan Daerah",
  "server_port": "3478",
  "default_expire_action": "shutdown",
  "shutdown_warning_seconds": "60",
  "heartbeat_interval_seconds": "5",
  "client_offline_threshold_seconds": "30"
}
```

### `PATCH /api/settings`

Field yang bisa diubah:

- `business_name`
- `default_expire_action`: `shutdown`, `lock`, atau `restart`
- `shutdown_warning_seconds`
- `heartbeat_interval_seconds`
- `client_offline_threshold_seconds`

Body contoh:

```json
{
  "business_name": "Perpustakaan Kota",
  "default_expire_action": "shutdown",
  "shutdown_warning_seconds": 60,
  "heartbeat_interval_seconds": 5,
  "client_offline_threshold_seconds": 30
}
```

Response: object settings terbaru.

WebSocket event: `settings.updated`.

## Auth Operator

### `POST /api/auth/login`

Body:

```json
{
  "username": "admin",
  "password": "admin"
}
```

Response:

```json
{
  "operator": {
    "id": 1,
    "name": "Administrator",
    "username": "admin",
    "role": "admin",
    "is_active": 1
  }
}
```

Catatan: password operator/user baru sudah disimpan sebagai hash SHA-256. Verifikasi masih backward-compatible dengan data plaintext lama.

## Computers

### `GET /api/computers`

List komputer terdaftar.

### `POST /api/computers`

Body:

```json
{
  "code": "PC-01",
  "name": "Komputer Client 01",
  "ip_address": "192.168.1.11",
  "mac_address": "optional"
}
```

### `PATCH /api/computers/:idOrCode`

Update data/status komputer.

Body contoh:

```json
{
  "name": "Komputer Client 01",
  "ip_address": "192.168.1.11",
  "mac_address": "AA:BB:CC",
  "status": "offline"
}
```

### `DELETE /api/computers/:idOrCode`

Menghapus komputer jika belum punya session/log historis dan tidak punya session aktif. Jika sudah punya riwayat penggunaan, gunakan status `offline` agar laporan historis tetap aman.

### `POST /api/computers/:idOrCode/heartbeat`

Dipanggil client agent berkala. Backend mengembalikan active session dan pending command untuk komputer tersebut.

Body:

```json
{
  "clientVersion": "web-prototype-0.3.0"
}
```

Response:

```json
{
  "computer": { "id": 1, "code": "PC-01", "status": "idle" },
  "activeSession": null,
  "commands": []
}
```

Backend juga menjalankan offline detector berdasarkan `client_offline_threshold_seconds`.

### `POST /api/computers/:idOrCode/command`

Membuat remote command untuk client agent.

Body:

```json
{
  "command": "shutdown",
  "operator_id": 1,
  "note": "Shutdown dari dashboard"
}
```

Command valid:

- `lock`
- `shutdown`
- `restart`

Response: row command dengan `computer_code`.

WebSocket event: `client.command`.

### `POST /api/client-commands/:id/ack`

Client mengirim acknowledgement setelah command diterima/dijalankan.

Body:

```json
{
  "status": "acknowledged",
  "note": "Handled by client"
}
```

`status` valid saat ini: `acknowledged` atau `failed`.

WebSocket event: `client.command_ack`.

## Access Duration Packages

### `GET /api/access-duration-packages`

List paket durasi.

### `POST /api/access-duration-packages`

Body:

```json
{
  "name": "1 Jam",
  "duration_minutes": 60,
  "is_active": true
}
```

### `PATCH /api/access-duration-packages/:id`

Body:

```json
{
  "name": "2 Jam",
  "duration_minutes": 120,
  "is_active": true
}
```

### `DELETE /api/access-duration-packages/:id`

Menghapus paket durasi.

## Users / Member / One-time Account

### `GET /api/users`

List user tanpa `password_hash`.

### `POST /api/users`

Body:

```json
{
  "username": "user001",
  "password": "123456",
  "user_type": "member",
  "full_name": "Nama User",
  "member_number": "A001",
  "identity_number_optional": "optional",
  "default_duration_minutes": 60,
  "created_by_operator_id": 1
}
```

`user_type`: `member` atau `one_time`.

### `POST /api/users/validate-login`

Body:

```json
{
  "username": "user001",
  "password": "123456"
}
```

### `POST /api/users/:idOrUsername/topup`

Isi ulang saldo waktu user. Jika user sedang punya session aktif, top-up langsung menjadi extend session.

Body:

```json
{
  "minutes": 60,
  "operator_id": 1,
  "note": "Isi ulang dari dashboard"
}
```

Catatan one-time: akun one-time yang sudah `used`, `expired`, atau `cancelled` tidak bisa di-top-up lagi. Buat akun one-time baru untuk pengunjung baru.

### `POST /api/users/:idOrUsername/disable`

Menonaktifkan user jika tidak punya session aktif.

Body:

```json
{
  "operator_id": 1,
  "note": "Dinonaktifkan operator"
}
```

### `POST /api/users/:idOrUsername/reset-password`

Reset password user.

Body:

```json
{
  "password": "password-baru",
  "operator_id": 1
}
```

## Sessions

### `GET /api/sessions`

List semua session.

### `GET /api/sessions/active`

List session aktif.

### `POST /api/sessions/start`

Dipakai oleh client login atau operator start session.

Body client login:

```json
{
  "username": "user001",
  "password": "123456",
  "computer_code": "PC-01",
  "duration_minutes": 60
}
```

Body operator start:

```json
{
  "username": "user001",
  "computer_code": "PC-01",
  "duration_minutes": 60,
  "operator_id": 1
}
```

Jika `operator_id` ada, password user tidak dicek karena session dibuat oleh operator.

### `POST /api/sessions/:id/extend`

Body:

```json
{
  "minutes": 30,
  "operator_id": 1,
  "note": "Tambah waktu"
}
```

### `POST /api/sessions/:id/stop`

Stop session manual. Untuk member, sisa waktu bisa refund kecuali `consume_remaining: true`. Untuk one-time, sisa waktu tidak refund.

Body:

```json
{
  "operator_id": 1,
  "note": "Stopped from dashboard",
  "consume_remaining": false
}
```

### `POST /api/sessions/:id/expire`

Memaksa session aktif menjadi expired dan broadcast event expired.

Body:

```json
{
  "operator_id": 1,
  "note": "Manual expire"
}
```

WebSocket events session:

- `session.started`
- `session.extended`
- `session.stopped`
- `session.expired`

## Reports

### `GET /api/reports/daily`

Default tanggal hari ini.

### `GET /api/reports/daily?date=2026-07-02`

Laporan penggunaan harian per tanggal.

### `GET /api/reports/usage-logs`

Mengembalikan maksimal 500 log terakhir dengan join ringan:

- `username`
- `computer_code`
- `operator_username`

## WebSocket

Endpoint:

```text
ws://localhost:3478/ws
```

Event saat ini:

- `connected`
- `settings.updated`
- `computer.created`
- `computer.updated`
- `computer.deleted`
- `computer.heartbeat`
- `computer.offline`
- `client.command`
- `client.command_ack`
- `session.started`
- `session.extended`
- `session.stopped`
- `session.expired`
- `user.topped_up`

# API Draft — Backend Server

Base URL default: `http://localhost:3478`

## Health

- `GET /health`

## Auth Operator

- `POST /api/auth/login`

Body:

```json
{
  "username": "admin",
  "password": "admin"
}
```

## Computers

- `GET /api/computers`
- `POST /api/computers`
- `PATCH /api/computers/:id`
- `POST /api/computers/:id/heartbeat`

Create body:

```json
{
  "code": "PC-01",
  "name": "Komputer 01",
  "ip_address": "192.168.1.11",
  "mac_address": "optional"
}
```

Heartbeat dan patch komputer bisa memakai `id` atau `code` di path. Client menyimpan alamat server serta kode komputer secara lokal, lalu memvalidasi konfigurasi melalui heartbeat.

## Access Duration Packages

- `GET /api/access-duration-packages`
- `POST /api/access-duration-packages`

Create body:

```json
{
  "name": "1 Jam",
  "duration_minutes": 60
}
```

## Users / Member / One-time Account

- `GET /api/users`
- `POST /api/users`
- `POST /api/users/validate-login`
- `POST /api/users/:username/topup`

Create member body:

```json
{
  "username": "member001",
  "password": "123456",
  "user_type": "member",
  "full_name": "Nama Anggota",
  "member_number": "A001",
  "default_duration_minutes": 60
}
```

Catatan: `default_duration_minutes` saat ini dipakai sebagai saldo waktu. Saat session dimulai, saldo dikurangi sebesar durasi session yang dipilih. Jika session logout/stop sebelum waktu habis, sisa menit session dikembalikan ke saldo dan user kembali `active` jika saldo masih ada. Jika waktu session expired, tidak ada refund, tetapi saldo lain yang tidak dipakai untuk session tetap tersimpan. User hanya menjadi `expired`/`used` jika saldo akhirnya `0`.

Create one-time account body:

```json
{
  "username": "guest001",
  "password": "123456",
  "user_type": "one_time",
  "default_duration_minutes": 30
}
```

Top-up body:

```json
{
  "minutes": 60,
  "operator_id": 1
}
```

Behavior:

- Jika user punya session aktif, session langsung diperpanjang.
- Jika tidak ada session aktif, akun diaktifkan kembali dan saldo waktu akses berikutnya diisi sesuai `minutes`.
- Bisa dipakai untuk mengaktifkan kembali akun berstatus `used`, `expired`, atau `cancelled`.

## Sessions

- `GET /api/sessions`
- `GET /api/sessions/active`
- `POST /api/sessions/start`
- `POST /api/sessions/:id/extend`
- `POST /api/sessions/:id/stop`
- `POST /api/sessions/:id/expire`

Start dari client (self login):

```json
{
  "username": "member001",
  "password": "123456",
  "computer_code": "PC-01",
  "duration_minutes": 60
}
```

Start dari dashboard operator tidak membutuhkan password user:

```json
{
  "username": "member001",
  "computer_code": "PC-01",
  "duration_minutes": 60,
  "operator_id": 1
}
```

Durasi tidak boleh melebihi saldo waktu user.

Extend body:

```json
{
  "minutes": 30
}
```

Stop/logout sebelum expired otomatis mengembalikan sisa waktu ke saldo user:

```json
{
  "operator_id": 1,
  "note": "Stopped from dashboard"
}
```

Response stop menyertakan `refunded_minutes`. Jika benar-benar ingin menghabiskan sisa waktu saat stop manual, kirim `consume_remaining: true`.

## Reports

- `GET /api/reports/daily`
- `GET /api/reports/daily?date=2026-07-02`
- `GET /api/reports/usage-logs`

`usage-logs` mengembalikan log terakhir beserta join ringan `username`, `computer_code`, dan `operator_username` untuk tampilan dashboard.

## WebSocket

- `ws://localhost:3478/ws`

Event awal:

- `computer.created`
- `computer.updated`
- `computer.heartbeat`
- `session.started`
- `session.extended`
- `session.stopped`
- `session.expired`
- `user.topped_up`

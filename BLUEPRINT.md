# Blueprint — Aplikasi Manajemen Akses Komputer Perpustakaan

_Last updated: 2026-07-02_

## Update Requirement dari Client

- Target OS: **Windows semua**.
- Mode jaringan: **offline LAN lokal / WiFi satu jaringan**.
- Aksi saat waktu habis: **shutdown komputer client**.
- Login user: **username/password**.
- Tipe user: **member** dan **akun one-time use** untuk pengunjung.
- Tidak perlu sistem harga/pembayaran karena digunakan untuk **perpustakaan daerah**.

## 1. Ringkasan Project

Aplikasi ini adalah sistem manajemen akses komputer untuk lingkungan perpustakaan daerah. Operator membuat akun member atau akun sekali pakai untuk masyarakat, menentukan durasi akses, lalu komputer client hanya bisa digunakan selama waktu yang diberikan. Jika durasi habis, komputer client akan otomatis **shutdown** sesuai kebutuhan client.

Target utama: **Windows semua** dengan jaringan lokal/offline melalui LAN atau WiFi selama masih dalam satu jaringan yang sama.

---

## 2. Tujuan Utama

- Operator dapat mengelola komputer client perpustakaan dari satu aplikasi pusat.
- User/masyarakat hanya bisa memakai komputer jika memiliki akun member atau akun sekali pakai yang aktif.
- Operator dapat menentukan durasi penggunaan per akun/session.
- Durasi penggunaan dihitung otomatis.
- Ketika waktu habis, komputer client otomatis shutdown.
- Sistem menyimpan riwayat penggunaan komputer.
- Sistem berjalan secara offline di jaringan lokal tanpa internet, baik via LAN maupun WiFi satu jaringan.

---

## 3. Target Platform

### Operator / Server

- Windows PC milik operator.
- Menjalankan aplikasi admin/operator.
- Menjalankan local backend server.
- Menyimpan database lokal.

### Client

- Windows PC yang dipakai customer/user.
- Menjalankan client agent.
- Client agent berjalan otomatis saat startup.
- Client agent menampilkan login/lock screen sebelum user mendapat akses.

---

## 4. Gambaran Arsitektur

```text
[Operator PC Perpustakaan]
Admin Desktop App
Local Backend Server
Local Database
        |
        | LAN / WiFi Local Network
        |
[Client PC 01]  [Client PC 02]  [Client PC 03]
Client Agent    Client Agent    Client Agent
Lock Screen     Lock Screen     Lock Screen
```

### Komponen Utama

1. **Admin / Operator App**
   - UI untuk operator perpustakaan.
   - Mengelola client, member/akun sekali pakai, session, dan laporan penggunaan.

2. **Backend Server Lokal**
   - API lokal untuk komunikasi admin dan client.
   - Menyimpan data session dan log penggunaan.
   - Mengatur validasi login dan durasi.

3. **Database Lokal**
   - Menyimpan data operator, komputer, member, akun sekali pakai, session, log penggunaan, dan konfigurasi.

4. **Client Agent**
   - Terpasang di setiap komputer client.
   - Menampilkan login/lock screen.
   - Mengirim status komputer ke server.
   - Menjalankan aksi saat waktu habis.

---

## 5. Rekomendasi Stack Teknologi

### Opsi Rekomendasi MVP

#### Backend Lokal

- **Node.js + Fastify/NestJS** atau **.NET Minimal API**
- Database: **SQLite**
- Komunikasi realtime: **WebSocket**

#### Admin Desktop App

- **Tauri + React/Vue**
- Alternatif: **Electron + React/Vue**

#### Client Agent Windows

- **.NET Worker Service + WPF/WinUI Lock Screen**
- Alasan: lebih native untuk Windows, mudah akses fungsi OS seperti startup, lock, logout, restart, dan process control.

### Catatan Stack

Untuk MVP, pendekatan hybrid paling masuk akal:

- Admin app boleh pakai teknologi web desktop agar cepat dibuat.
- Client agent sebaiknya native Windows agar kontrol sistem lebih kuat.

---

## 6. Role Pengguna

### 6.1 Admin

Hak akses penuh:

- Kelola operator.
- Kelola komputer client.
- Kelola durasi/paket akses.
- Lihat semua laporan penggunaan.
- Ubah konfigurasi sistem.

### 6.2 Operator

Hak akses operasional:

- Login ke aplikasi operator.
- Buat akun member atau akun sekali pakai.
- Menentukan durasi akses.
- Mulai, tambah, pause, stop session.
- Monitor status komputer.
- Lihat laporan penggunaan harian.

### 6.3 User / Customer

Hak akses terbatas:

- Login di komputer client menggunakan username/password.
- Melihat sisa waktu.
- Logout/selesai lebih awal jika diizinkan.

---

## 7. Modul Fitur

## 7.1 Authentication Operator

Fitur:

- Login admin/operator.
- Logout.
- Role admin/operator.
- Ganti password.

Data minimal:

- Nama
- Username
- Password hash
- Role
- Status aktif/nonaktif

---

## 7.2 Manajemen Komputer Client

Fitur:

- Tambah/edit/hapus data komputer.
- Set kode komputer, nama komputer, IP address, MAC address.
- Status realtime:
  - Online
  - Offline
  - Idle / tersedia
  - Dipakai
  - Waktu hampir habis
  - Expired
  - Error
- Remote action:
  - Lock
  - Logout session
  - Restart
  - Shutdown (opsional)

Data minimal:

- ID komputer
- Kode komputer, contoh: PC-01
- Nama komputer
- IP address
- MAC address
- Status
- Last heartbeat
- Versi client agent

---

## 7.3 Manajemen Durasi Akses

Fitur:

- Buat paket durasi akses tanpa biaya.
- Contoh:
  - 30 menit
  - 1 jam
  - 2 jam
- Durasi custom manual saat membuat akun/session.

Data minimal:

- Nama paket
- Durasi menit
- Status aktif/nonaktif

---

## 7.4 Member / Akun User

Sistem mendukung dua jenis akun sesuai kebutuhan perpustakaan.

### Opsi A — Akun Sekali Pakai

Operator membuat akun sementara/sekali pakai, contoh:

- Username: `guest001`
- Password: otomatis/manual
- Durasi: 60 menit
- Bisa dipakai satu kali

Kelebihan:

- Praktis untuk pengunjung umum.
- Tidak perlu proses pendaftaran member panjang.
- Setelah selesai atau waktu habis, akun tidak bisa dipakai lagi.

### Opsi B — Akun Member Username & Password

Operator membuat akun member:

- Username: `member001`
- Password: `123456`
- Identitas opsional: nama, nomor anggota/NIK/kartu perpustakaan
- Durasi bisa diberikan per sesi oleh operator

Kelebihan:

- Cocok untuk anggota perpustakaan.
- Riwayat penggunaan bisa dilacak per member.

### Rekomendasi MVP

Gunakan **username/password** sebagai model utama. Sediakan tipe akun:

- **Member**: bisa digunakan berulang, durasi diberikan per sesi.
- **One-time account**: akun sekali pakai untuk pengunjung umum.

Data minimal:

- Username
- Password hash
- Tipe akun: member / one_time
- Nama user/member opsional
- Nomor identitas/nomor anggota opsional
- Durasi default menit opsional
- Status: active, disabled, used, expired, cancelled
- Created by operator
- Last used at komputer mana
- Created at
- Expired at

---

## 7.5 Session Billing

Fitur:

- Start session saat user login di client.
- Hitung waktu mulai, durasi, waktu selesai.
- Countdown realtime.
- Extend durasi oleh operator.
- Stop session manual.
- Auto expire saat waktu habis.
- Simpan riwayat session.

Status session:

- Pending
- Active
- Paused
- Completed
- Expired
- Cancelled

Data minimal:

- ID session
- User ID
- Computer ID
- Start time
- End time
- Duration minutes
- Remaining seconds
- Total usage note
- Status
- Operator ID

---

## 7.6 Client Lock Screen

Fitur:

- Muncul otomatis ketika komputer client menyala.
- Menutupi layar agar user tidak bisa akses desktop sebelum login.
- Form login username/password.
- Menampilkan pesan error jika akun tidak valid, akun sudah dipakai, atau durasi tidak tersedia.
- Menampilkan countdown saat session aktif.
- Saat waktu habis, menampilkan warning lalu menjalankan shutdown.

Tampilan minimal:

- Nama perpustakaan/instansi.
- Kode komputer, contoh: PC-01.
- Input username.
- Input password.
- Tombol login.
- Status koneksi server.
- Sisa waktu saat aktif.

Catatan penting:

- Lock screen custom bukan pengganti keamanan Windows sepenuhnya.
- Untuk MVP, lock screen dibuat sebagai aplikasi full-screen always-on-top.
- Untuk versi lebih kuat, perlu integrasi Windows service, kiosk mode, local policy, atau shell replacement.

---

## 7.7 Aksi Saat Waktu Habis

Kebutuhan client saat ini: **komputer client harus shutdown ketika durasi habis**.

Flow aksi:

1. Client menerima event expired dari server atau countdown lokal mencapai 0.
2. Client menampilkan peringatan singkat, misalnya 30-60 detik sebelum shutdown.
3. Client menjalankan perintah shutdown Windows.
4. Server menandai session sebagai completed/expired.

Catatan teknis:

- Client agent perlu permission yang cukup untuk menjalankan shutdown.
- Untuk keamanan data user, disarankan ada warning sebelum shutdown.
- Aksi alternatif seperti lock/logout/restart tetap bisa disimpan sebagai opsi setting, tapi default project ini adalah **shutdown**.

---

## 7.8 Dashboard Operator

Fitur:

- Grid/list komputer client.
- Warna status:
  - Hijau: tersedia
  - Biru: sedang digunakan
  - Kuning: waktu hampir habis
  - Merah: expired/error
  - Abu-abu: offline
- Detail session per komputer.
- Tombol aksi cepat:
  - Buat akun/session
  - Extend waktu
  - Stop session
  - Lock/restart client

---

## 7.9 Laporan

Fitur MVP:

- Laporan penggunaan harian.
- Jumlah session selesai.
- Durasi total penggunaan.
- Jumlah pengguna/member aktif.
- Export CSV/PDF (bisa tahap berikutnya).

Data laporan:

- Tanggal
- Username/member/session
- Komputer
- Durasi
- Operator
- Status

---

## 8. Flow Utama Sistem

## 8.1 Flow Buat Akun / Session

```text
Operator login
  ↓
Operator pilih member atau buat akun sekali pakai
  ↓
Operator pilih durasi / input durasi custom
  ↓
Sistem membuat session atau akun akses
  ↓
User menerima username/password
  ↓
Status akun/session siap digunakan
```

## 8.2 Flow Login User di Client

```text
Client PC menyala
  ↓
Client Agent tampil full-screen lock screen
  ↓
User input username/password
  ↓
Client kirim request validasi ke server
  ↓
Server cek akun dan durasi/session
  ↓
Jika valid:
  - session dibuat/diaktifkan
  - akun one-time ditandai active/used
  - client unlock
  - countdown dimulai
Jika tidak valid:
  - tampilkan error
```

## 8.3 Flow Waktu Habis

```text
Session active
  ↓
Countdown berjalan
  ↓
Remaining time = 0
  ↓
Server tandai session expired/completed
  ↓
Client menerima event expired
  ↓
Client menjalankan aksi:
  - warning singkat
  - shutdown komputer Windows
```

## 8.4 Flow Extend Waktu

```text
Operator buka dashboard
  ↓
Pilih komputer/session aktif
  ↓
Klik extend waktu
  ↓
Input tambahan durasi
  ↓
Server update end time/durasi session
  ↓
Client menerima update countdown
```

---

## 9. Komunikasi Server dan Client

### API HTTP

Dipakai untuk request biasa:

- Login operator
- CRUD data komputer
- CRUD paket durasi akses
- Kelola member/akun one-time
- Validasi username/password
- Ambil laporan

### WebSocket

Dipakai untuk realtime:

- Heartbeat client.
- Update status komputer.
- Countdown/session event.
- Remote command dari operator ke client.

### Heartbeat Client

Client mengirim heartbeat berkala, misalnya setiap 5 detik:

```json
{
  "computerCode": "PC-01",
  "status": "online",
  "activeSessionId": "session_123",
  "remainingSeconds": 2700,
  "clientVersion": "1.0.0"
}
```

Jika heartbeat tidak diterima dalam waktu tertentu, server menandai client sebagai offline.

---

## 10. Rancangan Database Awal

## Tabel `operators`

- id
- name
- username
- password_hash
- role
- is_active
- created_at
- updated_at

## Tabel `computers`

- id
- code
- name
- ip_address
- mac_address
- status
- last_heartbeat_at
- client_version
- created_at
- updated_at

## Tabel `access_duration_packages`

- id
- name
- duration_minutes
- is_active
- created_at
- updated_at

## Tabel `users`

- id
- username
- password_hash
- user_type: member / one_time
- full_name
- member_number
- identity_number_optional
- default_duration_minutes
- status: active / disabled / used / expired / cancelled
- created_by_operator_id
- last_used_computer_id
- created_at
- activated_at
- expired_at
- cancelled_at

## Tabel `sessions`

- id
- user_id
- computer_id
- operator_id
- start_time
- end_time
- duration_minutes
- extended_minutes
- usage_note
- status
- created_at
- updated_at

## Tabel `usage_logs`

- id
- session_id
- user_id
- computer_id
- operator_id
- action
- note
- created_at

## Tabel `settings`

- key
- value
- updated_at

Contoh setting:

- `business_name`
- `server_port`
- `default_expire_action` = shutdown
- `heartbeat_interval_seconds`
- `client_offline_threshold_seconds`

---

## 11. API Endpoint Draft

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Computers

- `GET /api/computers`
- `POST /api/computers`
- `GET /api/computers/:id`
- `PATCH /api/computers/:id`
- `DELETE /api/computers/:id`
- `POST /api/computers/:id/command`

### Access Duration Packages

- `GET /api/access-duration-packages`
- `POST /api/access-duration-packages`
- `PATCH /api/access-duration-packages/:id`
- `DELETE /api/access-duration-packages/:id`

### Users / Member / One-time Account

- `GET /api/users`
- `POST /api/users`
- `POST /api/users/validate-login`
- `POST /api/users/:id/disable`
- `POST /api/users/:id/reset-password`

### Sessions

- `GET /api/sessions`
- `GET /api/sessions/active`
- `POST /api/sessions/start`
- `POST /api/sessions/:id/extend`
- `POST /api/sessions/:id/stop`

### Reports

- `GET /api/reports/daily`
- `GET /api/reports/usage-logs`
- `GET /api/reports/computer-usage`

---

## 12. MVP Scope

Versi MVP sebaiknya fokus ke fitur yang paling penting dulu.

### MVP Wajib

- Admin/operator login.
- Dashboard status komputer.
- Register komputer client.
- Kelola paket durasi akses.
- Buat akun member.
- Buat akun one-time use untuk pengunjung umum.
- Client lock screen full-screen.
- Client login pakai username/password.
- Session countdown.
- Auto shutdown saat waktu habis.
- Extend waktu dari operator.
- Stop session dari operator.
- Laporan penggunaan harian sederhana.

### Tidak Wajib di MVP

- Pembayaran online.
- Sistem harga/kasir.
- Multi-cabang.
- Cloud sync.
- Print kartu/struk akun otomatis.
- Remote file/process control.
- Anti-bypass level tinggi.
- Shell replacement Windows.

---

## 13. Tahapan Pengerjaan

## Phase 1 — Discovery & Prototype

Tujuan:

- Validasi flow operator-client.
- Tentukan stack final.
- Buat prototype komunikasi server-client.

Output:

- Backend lokal sederhana.
- Client dummy bisa connect ke server.
- WebSocket heartbeat jalan.
- Draft UI dashboard.

## Phase 2 — Backend Core

Output:

- Auth operator.
- Database schema.
- CRUD komputer.
- CRUD paket durasi akses.
- Buat akun member/one-time.
- Validasi username/password.
- Session start/stop/expire.

## Phase 3 — Admin Desktop App

Output:

- Login operator.
- Dashboard komputer.
- Form akun member/one-time dan session.
- Session detail.
- Extend/stop session.
- Laporan harian.

## Phase 4 — Client Agent MVP

Output:

- Installer/config client.
- Auto start saat Windows login.
- Lock screen full-screen.
- Login username/password.
- Countdown.
- Auto shutdown saat expired.
- Heartbeat ke server.

## Phase 5 — Hardening

Output:

- Handling offline server/client.
- Reconnect otomatis.
- Local config aman.
- Logging error.
- Role permission.
- Backup database.

## Phase 6 — Packaging & Deployment

Output:

- Installer admin/server.
- Installer client agent.
- Dokumentasi setup LAN.
- Dokumentasi cara tambah komputer client.
- Backup/restore database.

---

## 14. Risiko Teknis

### 14.1 Client Lock Bisa Di-bypass

Full-screen app bisa ditutup lewat Task Manager atau shortcut tertentu jika tidak diperkuat.

Mitigasi bertahap:

- MVP: full-screen always-on-top + disable close biasa.
- Tahap lanjut:
  - Windows service watchdog.
  - Auto restart client jika ditutup.
  - Kiosk mode / assigned access.
  - Policy untuk block Task Manager.
  - Shell replacement untuk environment khusus.

### 14.2 Koneksi LAN Putus

Jika client tidak bisa akses server, perlu aturan jelas.

Pilihan:

- Tetap izinkan session aktif sampai waktu lokal habis.
- Langsung lock jika server tidak terhubung.
- Grace period beberapa menit.

Rekomendasi:

- Gunakan grace period, misalnya 60-120 detik.

### 14.3 Perbedaan Jam Client dan Server

Countdown sebaiknya berdasarkan waktu server, bukan jam client.

Mitigasi:

- Server menentukan `start_time` dan `end_time`.
- Client hanya menampilkan remaining time dari server/event.
- Client tidak boleh menjadi sumber kebenaran durasi akses.

### 14.4 Permission Shutdown

Aksi shutdown butuh permission OS dan handling khusus.

Mitigasi:

- Client agent berjalan dengan permission yang cukup.
- Tambahkan warning 30-60 detik sebelum shutdown.
- Pastikan shutdown command diuji di Windows client target.
- Sediakan setting fallback ke lock screen jika shutdown gagal.

---

## 15. Pertanyaan untuk Client / Owner

Sebelum development penuh, perlu dijawab:

1. Jumlah komputer client kira-kira berapa?
2. Sistem dipakai hanya di satu lokasi LAN atau multi-cabang?
3. Format data member yang dibutuhkan apa saja? Nama, nomor anggota, NIK, atau nomor kartu perpustakaan?
4. Berapa durasi default per pengguna?
5. Perlu print kartu/akun sementara?
6. Perlu laporan bulanan/tahunan?
7. Perlu role admin dan kasir/operator terpisah?
8. Client PC akan pakai Windows versi apa?
9. Apakah user boleh akses Task Manager / Settings / Control Panel?
10. Perlu mode offline jika server mati?
11. Perlu batas pemakaian per hari untuk member yang sama?
12. Perlu approval operator setiap kali member login, atau member boleh langsung login jika durasi tersedia?

---

## 16. Rekomendasi Keputusan Awal

Untuk mulai cepat dan aman, rekomendasi awal:

- **Model login user:** Username/password.
- **Tipe akun:** Member dan one-time account.
- **Mode jaringan:** LAN/WiFi lokal offline dalam satu jaringan.
- **Database:** SQLite dulu.
- **Expire action MVP:** Shutdown komputer client.
- **Admin UI:** Tauri + React/Vue.
- **Backend:** Node.js atau .NET lokal.
- **Client Agent:** .NET Windows app/service.
- **Realtime:** WebSocket.

---

## 17. Struktur Repository yang Disarankan

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
│   ├── installation.md
│   ├── user-flow.md
│   └── api.md
└── scripts/
```

---

## 18. Next Step Setelah Blueprint Disetujui

1. Finalkan stack teknologi.
2. Tentukan MVP scope final.
3. Buat wireframe UI dashboard operator dan client lock screen.
4. Setup repository awal.
5. Implement backend core.
6. Implement admin dashboard prototype.
7. Implement client agent prototype.

---

## 19. Catatan Fin

Project ini memungkinkan, tapi harus diperlakukan sebagai **sistem kontrol client-server**, bukan hanya aplikasi desktop biasa. Kunci suksesnya ada di:

- desain flow akun/session yang jelas,
- client agent Windows yang stabil,
- handling jaringan LAN/WiFi lokal,
- dan proses shutdown saat waktu habis.

Untuk MVP, jangan langsung mengejar anti-bypass ekstrem. Mulai dari flow akses member/session yang solid dulu, baru hardening client agent setelah alur utama terbukti jalan.

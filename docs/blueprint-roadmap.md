# Blueprint & Roadmap — Membangun Aplikasi Billing Akses Komputer LAN/Offline

Dokumen ini merangkum **step-step yang sudah dikerjakan dari awal sampai sekarang** pada project Perpus Billing, dalam bentuk struktur yang bisa dipakai lagi kalau nanti bikin aplikasi sejenis.

Tujuannya bukan cuma jadi histori project ini, tapi juga jadi **blueprint kerja + roadmap implementasi** untuk sistem yang mirip:

- billing / access management komputer publik
- operator dashboard + client lock screen
- mode offline / LAN lokal
- target Windows client
- backend lokal tanpa ketergantungan cloud

---

## 1. Tujuan Produk

### Problem yang diselesaikan

Membuat sistem untuk mengelola pemakaian komputer publik di perpustakaan dengan karakteristik:

- semua device berada dalam **satu LAN/WiFi lokal**
- bisa jalan **tanpa internet**
- ada **operator/admin**
- ada **komputer client** yang dipakai user
- user login pakai **username/password**
- ada dua tipe user:
  - **member**
  - **one-time use / guest**
- ketika waktu habis, komputer client harus menjalankan aksi akhir, default: **shutdown**

### Target teknis

- backend lokal ringan
- database embedded/lokal
- dashboard operator simpel
- client agent Windows native
- mudah diuji di 1 server + beberapa client

---

## 2. Arsitektur Dasar yang Dipilih

Dari awal, struktur dipisah menjadi beberapa app supaya jelas per tanggung jawab.

## Monorepo Structure

```text
perpus-billing/
├── apps/
│   ├── backend-server/
│   ├── admin-desktop/
│   ├── client-agent/
│   └── windows-client/
├── packages/
│   └── shared/
└── docs/
```

### Komponen

#### A. Backend Server
Tugas:

- menyimpan data operator, user, komputer, session, log, settings
- autentikasi operator
- memulai / menghentikan / extend session
- menerima heartbeat client
- mengirim command ke client
- membuat laporan dan backup

Teknologi yang dipakai:

- Node.js
- Fastify
- SQLite
- better-sqlite3

#### B. Admin Dashboard
Tugas:

- operator login
- kelola user
- kelola komputer
- kelola paket durasi
- memulai / stop / extend session
- top-up waktu user
- melihat laporan
- backup database

Teknologi:

- React
- Vite

#### C. Client Prototype (Web)
Tugas:

- jadi proof-of-concept flow client
- simulasi login, heartbeat, session timer, remote command
- validasi API contract sebelum bikin native Windows client

Teknologi:

- React
- Vite

#### D. Windows Client Native
Tugas:

- versi produksi/arah final untuk komputer Windows
- heartbeat ke backend
- login user
- timer berjalan
- lock/restart/shutdown sungguhan
- nanti ditingkatkan jadi kiosk/lockdown mode

Teknologi sekarang:

- .NET 8
- WPF

---

## 3. Tahap Kerja dari Awal Sampai Sekarang

## Phase 0 — Discovery & Requirement Lock

Tahap pertama adalah mengunci kebutuhan inti supaya implementasi tidak melebar.

### Requirement yang dikunci

- target OS akhir: **Windows semua**
- mode jaringan: **offline LAN lokal**
- aksi saat waktu habis: **shutdown komputer client**
- login user: **username/password**
- tipe user: **member** dan **one-time use**
- tidak perlu pricing/payment online
- fokus awal: **MVP operasional**, bukan fitur tambahan yang kosmetik

### Pelajaran reusable

Sebelum ngoding, selalu kunci:

1. siapa operator
2. siapa user akhir
3. device mana yang jadi server
4. device mana yang jadi client
5. koneksi internet wajib atau tidak
6. aksi saat waktu habis apa
7. data minimum apa yang wajib dicatat

---

## Phase 1 — Prototype Core Backend

Setelah requirement jelas, dibuat dulu backend yang cukup untuk seluruh flow utama.

### Yang dibangun

#### Database schema inti
- `operators`
- `users`
- `computers`
- `sessions`
- `usage_logs`
- `client_commands`
- `settings`
- lalu ditambah `operator_sessions`

#### Endpoint inti
- health check
- auth operator
- CRUD komputer
- CRUD user
- CRUD paket durasi
- start session
- stop session
- extend session
- top-up user
- expire session
- heartbeat client
- command client
- ack command
- report harian
- usage logs
- settings
- backup database

#### Logic bisnis inti
- user active/in_use/expired/used/disabled
- member bisa refund sisa waktu saat stop
- one-time tidak bisa di-topup ulang setelah selesai
- session expiration otomatis
- computer offline detection dari heartbeat

### Kenapa backend dikerjakan dulu

Karena backend adalah kontrak semua client.
Kalau kontrak API belum jelas, dashboard dan client akan bolak-balik dirombak.

### Pelajaran reusable

Urutan yang bagus:

1. schema data
2. flow bisnis inti
3. API minimal
4. baru UI/client

Jangan mulai dari UI kalau state machine bisnis belum jelas.

---

## Phase 2 — Admin Dashboard Prototype

Setelah backend cukup stabil, dibuat dashboard operator untuk mengendalikan sistem.

### Modul dashboard yang dibuat

- login operator
- statistik ringkas
- tab session
- tab users
- tab computers
- tab settings
- tab reports

### Kemampuan yang dibuat

- tambah user
- disable user
- reset password user
- tambah komputer
- tandai komputer offline
- kirim command ke client
- start session dari operator
- stop session
- extend session
- top-up waktu user
- ubah pengaturan runtime
- backup DB
- export report CSV

### Pelajaran reusable

Untuk sistem operasional seperti ini, dashboard tidak perlu terlalu cantik dulu.
Prioritasnya:

1. cepat dipakai operator
2. semua aksi utama tersedia
3. error message jelas
4. state realtime gampang dibaca

---

## Phase 3 — Client Flow Validation via Web Prototype

Sebelum masuk native Windows, dibuat dulu client prototype berbasis web.

### Kenapa dibuat prototype web dulu

Karena bisa cepat menguji:

- login flow user
- heartbeat flow
- active session sync
- top-up / extend effect
- expire behavior
- remote command flow

Tanpa harus langsung pusing dengan:

- .NET
- Windows API
- kiosk mode
- auto-start
- installer

### Yang tervalidasi lewat prototype web

- client bisa register heartbeat
- admin bisa lihat status komputer
- user bisa login dan start session
- countdown session sinkron
- stop/extend/top-up sinkron
- command lock/shutdown/restart bisa diuji secara kontrak

### Pelajaran reusable

Untuk aplikasi device-control, prototype web itu sangat efektif sebagai:

- API contract tester
- flow validator
- demo cepat
- pengganti sementara native client

---

## Phase 4 — Reporting & Operasional Dasar

Setelah core flow stabil, ditambah fitur operasional supaya sistem layak diuji di dunia nyata.

### Yang ditambahkan

- laporan harian per tanggal
- total session per hari
- total durasi pemakaian
- detail session per hari
- export CSV
- usage logs
- backup database manual dari dashboard

### Kenapa ini penting

Karena aplikasi seperti ini bukan cuma soal login-lock timer.
Operator butuh:

- bukti penggunaan
- rekap harian
- data historis
- backup sebelum update atau setelah operasional

### Pelajaran reusable

Begitu core flow hidup, segera tambah:

1. logs
2. reporting minimal
3. export
4. backup

Tanpa ini, MVP sulit diuji secara operasional.

---

## Phase 5 — Security & Hardening Backend/Admin

Sebelum lanjut ke Windows client native, backend/admin diperkuat dulu.

### Yang di-hardening

#### Password storage
- sebelumnya: hash sederhana/legacy
- ditingkatkan ke: **PBKDF2 + salt**
- tetap backward-compatible dengan hash lama

#### Operator auth
- ditambah **token-based operator session**
- endpoint admin/operator kini diproteksi Bearer token
- dashboard menyimpan token dan restore session
- tersedia logout dan revoke session

#### Maintenance
- backup database API
- backup button di dashboard
- logging untuk backup action

#### Smoke testing
- test auth token
- test endpoint private/protected
- test backup
- test logout revoke token
- test flow bisnis session/user/command/report

### Pelajaran reusable

Sebelum pindah ke client native atau pilot real-world, minimal bereskan:

1. auth operator
2. password hashing
3. backup
4. smoke tests
5. docs setup

---

## Phase 6 — LAN Demo Readiness

Setelah backend/admin kuat, langkah berikutnya adalah memastikan sistem bisa dipakai di jaringan lokal.

### Yang disiapkan

- backend bind ke `0.0.0.0`
- setup docs untuk LAN
- pairing berbasis:
  - `serverUrl`
  - `computerCode`
- testing level docs:
  - level 1 local Mac
  - level 2 LAN multi-device
  - level 3 Windows native

### Skenario target

- 1 operator/server device
- 1–2 client device
- semua satu LAN/WiFi
- tanpa internet pun tetap jalan

### Pelajaran reusable

Sebelum bilang “siap diuji”, pastikan ada:

- dokumen setup LAN
- dokumen testing step-by-step
- health check yang gampang diakses
- cara identify tiap client machine

---

## Phase 7 — Windows Client Native Skeleton

Begitu API contract stabil, baru masuk ke Windows client native.

### Yang dibuat

- project .NET 8 WPF
- config file `appsettings.json`
- API client untuk heartbeat, session start/stop, command ack
- fullscreen window dasar
- login form user
- session countdown UI
- warning panel
- Windows power actions:
  - lock workstation
  - shutdown
  - restart

### Kenapa bentuknya skeleton dulu

Karena target awalnya adalah membuktikan:

- build jalan
- app bisa connect ke backend
- flow session bisa dihidupkan
- command Windows bisa dieksekusi

Bukan langsung perfect kiosk.

### Hasil validasi

- berhasil dijalankan di UTM + Windows 11
- flow dasar sudah hidup
- ditemukan gap hardening/UX yang jadi sprint berikutnya

---

## 4. Gap / Feedback yang Ditemukan Setelah Test UTM

Dari test native Windows di UTM, ada beberapa kebutuhan refinement:

### A. Countdown shutdown behavior
Kebutuhan yang lebih tepat:

- countdown 60 detik terakhir harus mulai **sebelum waktu habis**
- jadi saat session benar-benar 0 detik, komputer langsung shutdown
- bukan habis dulu lalu nunggu tambahan 60 detik

### B. Logged-in UI behavior
Kebutuhan:

- setelah login sukses, app utama sebaiknya hide
- tampilkan **mini top bar** kecil di atas tengah
- bar menampilkan sisa waktu berjalan

### C. Lock/kiosk behavior sebelum login
Kebutuhan:

- user tidak mudah Alt+Tab
- user sulit pindah app/window
- user sulit menutup aplikasi

### D. Artinya apa?
Artinya fondasi sudah benar, tapi aplikasi sudah masuk tahap:

- refinement
- hardening
- kiosk UX

Bukan lagi tahap proof-of-concept murni.

---

## 5. Roadmap Lanjutan dari Posisi Sekarang

## Sprint A — Windows Countdown & Session Timing Fix

### Tujuan
- benahi countdown 60 detik terakhir
- pastikan action akhir sinkron dengan session end time

### Output
- countdown dimulai saat remaining time <= warning threshold
- ketika remaining = 0, action langsung jalan

### Status
- sprint ini sudah mulai dikerjakan
- target behavior: tidak ada tambahan delay shutdown setelah waktu habis
---

## Sprint B — Logged-in Mini Overlay Bar

### Tujuan
- hide main lock screen setelah login
- tampilkan mini bar always-on-top di atas tengah

### Output
- user tetap tahu sisa waktu
- app tidak mengganggu layar kerja user

### Status
- sprint ini sedang dikerjakan
- implementasi awal: mini top bar muncul saat login sukses, window utama di-hide selama session aktif
- warning 60 detik terakhir diarahkan tetap ke mini top bar dengan state visual berkedip agar tidak terlalu mengganggu aktivitas user
---

## Sprint C — Lock Screen / Kiosk Hardening

### Tujuan
- membuat app lebih susah dibypass saat belum login

### Output minimal
- fullscreen topmost stabil
- disable close normal / Alt+F4 semampunya
- kurangi escape path ke desktop lain
- mini bar saat logged-in dibuat lebih kecil dan minim gangguan

### Output lanjut
- evaluasi Assigned Access / Windows kiosk policy
- pertimbangkan helper/service tambahan
- dokumentasi anti-End-Task / standard-user / Task Manager restriction

### Status
- sprint ini mulai diarahkan
- mini bar sudah diperkecil ke mode lebih minimal, lalu diperkecil lagi dan ditambah tombol keluar cepat dengan konfirmasi
- hardening ringan app-level mulai ditambahkan untuk mode belum-login (tahan minimize/close dasar, re-activate saat kehilangan fokus, blok shortcut dasar)
- dokumentasi hardening Windows sudah mulai dipisah agar nanti bisa dipakai sebagai checklist deployment
---

## Sprint D — Auto-start + Local Logging

### Tujuan
- client hidup otomatis saat boot
- ada log lokal untuk troubleshooting

### Output
- startup integration
- log file rotasi sederhana
- easier diagnosis saat client offline/error

### Status
- startup integration sudah dibuat via `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- fallback startup shortcut sudah ditambahkan untuk kasus registry Run gagal/diblok policy
- config publish/install helper sudah ikut menulis toggle hardening/startup/recovery
- event penting sudah masuk log lokal, termasuk hasil startup registration dan crash pre-login
- crash saat pre-login mencoba relaunch executable yang sama sebagai recovery ringan

---

## Sprint E — Installer & Pairing Flow

### Tujuan
- mempermudah setup client baru

### Output
- installer / setup wizard sederhana
- input `serverUrl` + `computerCode` lewat installer atau panel setup first-run dengan simpan config, tes koneksi ulang, dan reset default
- validasi koneksi awal ke backend

---

## 6. Blueprint Reusable untuk Proyek Sejenis

Kalau next time bikin aplikasi mirip, struktur kerja yang direkomendasikan adalah ini.

## Step 1 — Lock requirement bisnis
Checklist:

- [ ] target OS apa
- [ ] online/offline/LAN/cloud
- [ ] siapa operator
- [ ] siapa user akhir
- [ ] device topology
- [ ] login model
- [ ] rule ketika waktu habis
- [ ] log/report minimum

## Step 2 — Desain state machine dan schema data
Checklist:

- [ ] status user
- [ ] status komputer
- [ ] status session
- [ ] action logs
- [ ] settings runtime

## Step 3 — Bangun backend dulu
Checklist:

- [ ] CRUD data master
- [ ] auth operator
- [ ] session engine
- [ ] heartbeat
- [ ] remote command
- [ ] report/log

## Step 4 — Buat admin dashboard operasional
Checklist:

- [ ] login operator
- [ ] kelola user/komputer
- [ ] start/stop/extend/top-up
- [ ] settings
- [ ] report
- [ ] backup

## Step 5 — Buat prototype client yang cepat
Checklist:

- [ ] login user
- [ ] heartbeat
- [ ] countdown
- [ ] remote command handling
- [ ] expire flow

## Step 6 — Hardening backend/admin
Checklist:

- [ ] password hashing aman
- [ ] token auth
- [ ] smoke tests
- [ ] backup
- [ ] docs setup

## Step 7 — Test LAN
Checklist:

- [ ] multi-device connectivity
- [ ] server IP stable
- [ ] heartbeat beberapa client
- [ ] session paralel

## Step 8 — Bangun native client target OS
Checklist:

- [ ] native UI
- [ ] API integration
- [ ] device action execution
- [ ] config file / pairing

## Step 9 — Hardening native client
Checklist:

- [ ] startup
- [ ] kiosk/lockdown
- [ ] local logs
- [ ] installer
- [ ] recovery behavior

## Step 10 — Pilot deployment kecil
Checklist:

- [ ] 1 operator + 2 client
- [ ] test harian real use
- [ ] backup rutin
- [ ] kumpulkan feedback operator

---

## 7. Status Project Saat Ini

Status sekarang bisa dibilang:

### Sudah kuat / siap lanjut
- backend core
- admin dashboard core
- auth operator token
- backup + reporting
- LAN demo flow
- Windows native client skeleton
- validasi awal native via UTM

### Belum selesai / next focus
- countdown fix 60 detik terakhir
- mini top bar saat logged in
- kiosk hardening sebelum login
- auto-start/service
- installer/pairing UX
- pilot test lebih realistis

---

## 8. Cara Memakai Dokumen Ini

Dokumen ini bisa dipakai sebagai:

1. **histori struktur project Perpus Billing**
2. **roadmap kerja lanjutan**
3. **template membangun aplikasi sejenis di masa depan**

Kalau nanti bikin project baru yang mirip, idealnya tinggal copy pola ini lalu ubah:

- jenis user
- rule bisnis waktu habis
- tipe device client
- aksi final device
- kebutuhan laporan/admin

---

## 9. Ringkasan Super Singkat

Kalau disingkat banget, pola bangunnya adalah:

1. kunci requirement
2. bangun backend + schema dulu
3. buat dashboard operator
4. validasi flow client lewat prototype cepat
5. tambah report/backup/auth hardening
6. test LAN
7. pindah ke native client
8. hardening kiosk/startup/installer
9. pilot kecil
10. iterasi dari feedback lapangan

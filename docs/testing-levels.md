# Testing Levels — Perpus Billing

Dokumen ini menjelaskan alur uji coba Perpus Billing per level, mulai dari test lokal di Mac sampai test Windows client native.

---

## Level 1 — Test Core di Mac (Backend + Admin + Web Client Prototype)

Level ini dipakai untuk validasi cepat seluruh flow utama tanpa perlu Windows.

### Tujuan

Memastikan komponen inti berjalan:

- backend server
- admin dashboard
- client web prototype
- login user
- session start/extend/stop
- command client
- backup database
- report harian

### Jalankan Backend

```bash
cd /Users/kominfo/Documents/Fikri/Project/perpus-billing
npm run dev:server
```

Backend default:

- HTTP: `http://localhost:3478`
- Health: `http://localhost:3478/health`

### Jalankan Admin Dashboard

```bash
cd /Users/kominfo/Documents/Fikri/Project/perpus-billing
npm run dev:admin
```

Buka di browser:

```text
http://localhost:5173
```

Login operator:

```text
Username: admin
Password: admin
```

### Jalankan Client Web Prototype

```bash
cd /Users/kominfo/Documents/Fikri/Project/perpus-billing
npm run dev:client
```

Buka di browser:

```text
http://localhost:5174
```

Konfigurasi client:

- Server URL: `http://localhost:3478`
- Computer Code: `PC-01`

### Skenario Uji Coba

#### 1. Health Check

- Buka `http://localhost:3478/health`
- Pastikan response `ok: true`

#### 2. Heartbeat Client

- Buka client web prototype
- Pastikan `PC-01` muncul di dashboard admin dengan status `online` atau `idle`

#### 3. Login User dari Client

Gunakan user demo:

- `user001 / 123456`
- `user002 / 123456`
- `guest001 / 123456`

Pastikan:

- login berhasil
- session aktif muncul di admin
- countdown muncul di client

#### 4. Extend / Top-up Session

Dari admin dashboard:

- extend session aktif
- top-up user aktif

Pastikan:

- waktu session bertambah
- countdown di client ikut berubah

#### 5. Stop Session

Dari admin atau client:

- hentikan session

Pastikan:

- client kembali ke lock/login screen
- session hilang dari daftar aktif
- refund berjalan sesuai aturan user member

#### 6. Command Client

Dari admin dashboard coba:

- `lock`
- `restart`
- `shutdown`

Catatan untuk web prototype:

- `lock` akan mengembalikan client ke lock screen
- `restart` dan `shutdown` masih berupa simulasi UI, bukan aksi nyata di Mac

#### 7. Expired Session

Coba buat session dengan durasi kecil lalu tunggu habis.

Pastikan:

- event expired muncul
- client menampilkan warning action
- untuk web prototype, action tetap simulasi

#### 8. Backup Database

Di tab **Pengaturan** klik:

- **Buat Backup Sekarang**

Pastikan:

- muncul notifikasi sukses
- file backup tersimpan di folder backup backend

#### 9. Report Harian

Di tab laporan:

- pilih tanggal
- cek total session dan total durasi
- export CSV

Pastikan file CSV berhasil terdownload.

### Hasil yang Diharapkan

Kalau Level 1 lulus, berarti:

- backend stabil
- dashboard operator berfungsi
- kontrak API client sudah benar
- flow bisnis utama sudah jalan

---

## Level 2 — Test LAN Lokal (Mac sebagai Server, Device Lain sebagai Client/Admin)

Level ini dipakai untuk simulasi kondisi nyata satu jaringan lokal.

### Tujuan

Memastikan backend yang jalan di Mac bisa diakses device lain dalam satu WiFi/LAN.

### Cari IP Lokal Mac

```bash
ipconfig getifaddr en0
```

Contoh hasil:

```text
192.168.1.20
```

Berarti backend nanti diakses lewat:

```text
http://192.168.1.20:3478
```

### Jalankan Backend

```bash
cd /Users/kominfo/Documents/Fikri/Project/perpus-billing
npm run dev:server
```

### Test Health dari Device Lain

Di HP/laptop lain yang satu WiFi, buka:

```text
http://192.168.1.20:3478/health
```

Kalau muncul response sehat, berarti backend sudah bisa diakses via LAN.

### Jalankan Admin Dashboard untuk Akses LAN

```bash
cd /Users/kominfo/Documents/Fikri/Project/perpus-billing
npm --workspace apps/admin-desktop run dev -- --host 0.0.0.0
```

Buka dari device lain:

```text
http://192.168.1.20:5173
```

### Jalankan Client Prototype untuk Akses LAN

```bash
cd /Users/kominfo/Documents/Fikri/Project/perpus-billing
npm --workspace apps/client-agent run dev -- --host 0.0.0.0
```

Buka dari device lain:

```text
http://192.168.1.20:5174
```

Di client prototype, isi:

- Server URL: `http://192.168.1.20:3478`
- Computer Code: `PC-01` atau `PC-02`

### Skenario Uji Coba

#### 1. Multi-device Access

Pastikan:

- admin bisa dibuka dari device lain
- client prototype bisa dibuka dari device lain
- backend tetap tersambung

#### 2. Banyak Client Sekaligus

Coba buka 2 client browser/device berbeda:

- `PC-01`
- `PC-02`

Pastikan:

- keduanya muncul terpisah di dashboard
- heartbeat masing-masing terbaca

#### 3. Session Paralel

Mulai session di dua komputer berbeda.

Pastikan:

- session per PC tercatat benar
- countdown masing-masing tidak bentrok
- command operator terkirim ke PC yang benar

#### 4. Top-up / Extend dari Admin LAN

Pastikan perubahan dari admin langsung tercermin di client terkait.

### Hasil yang Diharapkan

Kalau Level 2 lulus, berarti:

- backend siap untuk mode LAN lokal
- pairing server-client by IP + computer code sudah benar
- realtime/heartbeat antar device berjalan

---

## Level 3 — Test Windows Client Native

Level ini dipakai untuk menguji skeleton native Windows client yang baru dibuat.

### Tujuan

Memastikan client native Windows bisa:

- heartbeat ke backend
- login user
- tampilkan countdown
- menerima command
- menjalankan lock/restart/shutdown Windows

### Opsi Test

#### Opsi A — Laptop/PC Windows Fisik

Ini opsi terbaik dan paling realistis.

#### Opsi B — VM Windows di Mac

Bisa pakai:

- UTM
- Parallels Desktop
- VMware Fusion

Kalau kamu mau pakai **UTM + Windows 11**, itu cukup bagus untuk test awal heartbeat, login, countdown, dan flow session. Tapi untuk test shutdown/restart final, perangkat fisik Windows tetap lebih valid.

### Panduan UTM + Windows 11 di Mac

#### 1. Siapkan Bahan

Yang kamu butuhkan:

- UTM terinstall di Mac
- Image/ISO Windows 11
- koneksi internet untuk setup awal Windows
- repo project Perpus Billing di Mac

Kalau Mac kamu Apple Silicon, paling aman pakai image **Windows 11 ARM**.

#### 2. Buat VM di UTM

Di UTM:

1. Klik **Create a New Virtual Machine**
2. Pilih **Virtualize** kalau tersedia untuk Windows ARM
3. Pilih image Windows 11
4. Alokasi minimal yang aman untuk testing:
   - RAM: **8 GB** kalau memungkinkan
   - CPU: **4 core**
   - Storage: **64 GB** atau lebih
5. Aktifkan network default NAT dulu
6. Selesaikan wizard dan boot VM

#### 3. Install Windows 11

Selesaikan setup Windows sampai masuk desktop.

Setelah itu install tool yang diperlukan di dalam VM:

- .NET SDK 8
- Git (opsional tapi enak)
- Node.js (opsional, hanya kalau mau run bagian web/admin di VM juga)

Minimal untuk Windows client native, yang wajib hanya:

- .NET SDK 8

Cek di PowerShell:

```powershell
dotnet --version
```

#### 4. Pastikan VM Bisa Akses Backend di Mac

Di Mac, jalankan backend:

```bash
cd /Users/kominfo/Documents/Fikri/Project/perpus-billing
npm run dev:server
```

Cari IP lokal Mac:

```bash
ipconfig getifaddr en0
```

Contoh hasil:

```text
192.168.1.20
```

Di Windows VM, buka browser lalu test:

```text
http://192.168.1.20:3478/health
```

Kalau berhasil, berarti VM bisa reach backend di Mac.

Kalau gagal:

- pastikan Mac dan VM network-nya saling tembus
- tetap jalankan backend di `0.0.0.0`
- cek firewall macOS kalau perlu
- kalau NAT UTM susah reach host, pertimbangkan ganti ke **bridged/shared network** yang bikin VM lebih mudah akses host/LAN

#### 5. Bawa Project ke Windows VM

Pilih salah satu cara:

##### Opsi A — Shared Folder UTM

Mount folder project dari Mac ke Windows VM supaya langsung akses source yang sama.

##### Opsi B — Git Clone di VM

Clone repo langsung di Windows VM.

##### Opsi C — Copy Manual

Zip project lalu copy ke VM.

Untuk awal, **shared folder** paling praktis.

#### 6. Edit Konfigurasi Windows Client

Di VM, edit file:

```text
apps/windows-client/appsettings.json
```

Isi contoh:

```json
{
  "serverUrl": "http://192.168.1.20:3478",
  "computerCode": "PC-01",
  "clientVersion": "windows-client-0.1.0",
  "heartbeatFallbackSeconds": 5
}
```

#### 7. Build Windows Client

Di PowerShell dalam VM:

```powershell
dotnet build .\apps\windows-client\PerpusBilling.WindowsClient.csproj
```

Kalau sukses, jalankan:

```powershell
dotnet run --project .\apps\windows-client\PerpusBilling.WindowsClient.csproj
```

#### 8. Jalankan Skenario Test Utama

Test minimal yang disarankan di UTM:

- heartbeat ke backend
- login user
- countdown session
- stop session
- command lock

Test yang **boleh**, tapi hati-hati:

- command shutdown
- command restart

Karena di VM, shutdown/restart bisa memutus sesi test. Jadi mending simpan state dulu sebelum uji command itu.

#### 9. Rekomendasi Praktis Saat Test di UTM

- Pakai `PC-99` atau kode khusus VM supaya tidak bentrok dengan test lain
- Test `lock` dulu sebelum `shutdown/restart`
- Jalankan admin dashboard tetap dari Mac supaya lebih gampang monitor
- Kalau UTM terasa berat, matikan app Mac lain yang tidak penting

#### 10. Kapan UTM Cukup, Kapan Harus Windows Fisik

**UTM cukup untuk:**

- validasi build jalan atau tidak
- validasi UI WPF muncul
- validasi heartbeat/login/session flow
- validasi kontrak API client native

**Windows fisik tetap dibutuhkan untuk:**

- validasi auto-start saat boot
- validasi kiosk/lock real user environment
- validasi shutdown/restart di perangkat nyata
- validasi behavior performa di PC perpustakaan sebenarnya

### Persiapan di Mac

Jalankan backend di Mac:

```bash
cd /Users/kominfo/Documents/Fikri/Project/perpus-billing
npm run dev:server
```

Cari IP Mac:

```bash
ipconfig getifaddr en0
```

Contoh:

```text
192.168.1.20
```

### Persiapan di Windows

Install:

- .NET SDK 8

Cek:

```powershell
dotnet --version
```

### Konfigurasi Windows Client

Edit file:

```text
apps/windows-client/appsettings.json
```

Contoh:

```json
{
  "serverUrl": "http://192.168.1.20:3478",
  "computerCode": "PC-01",
  "clientVersion": "windows-client-0.1.0",
  "heartbeatFallbackSeconds": 5
}
```

### Build dan Run

Di Windows, dari root project:

```powershell
dotnet build .\apps\windows-client\PerpusBilling.WindowsClient.csproj
```

Lalu jalankan:

```powershell
dotnet run --project .\apps\windows-client\PerpusBilling.WindowsClient.csproj
```

Atau publish:

```powershell
dotnet publish .\apps\windows-client\PerpusBilling.WindowsClient.csproj -c Release -r win-x64 --self-contained false -o .\dist\windows-client
```

### Skenario Uji Coba

#### 1. Heartbeat Native Client

Pastikan:

- Windows client terbuka fullscreen
- dashboard admin di Mac melihat `PC-01` online/idle

#### 2. Login User

Coba login user demo dari Windows client:

- `user001 / 123456`

Pastikan:

- session aktif berhasil dibuat
- countdown tampil di Windows client
- admin dashboard melihat session aktif

#### 3. Stop Session

Hentikan session dari client atau admin.

Pastikan:

- layar kembali ke mode login/lock
- status session berubah benar di backend

#### 4. Command Lock

Kirim command `lock` dari admin.

Pastikan:

- Windows client kembali ke lock screen
- workstation Windows terkunci

#### 5. Command Shutdown

Kirim command `shutdown` dari admin.

Pastikan:

- muncul warning countdown
- Windows benar-benar shutdown saat countdown habis

#### 6. Command Restart

Kirim command `restart` dari admin.

Pastikan:

- muncul warning countdown
- Windows benar-benar restart saat countdown habis

#### 7. Expired Session

Biarkan session habis sendiri.

Pastikan:

- warning action muncul
- aksi akhir sesuai setting backend (`shutdown`, `restart`, atau `lock`)

### Catatan Penting

Untuk Windows native client:

- `shutdown` dan `restart` adalah aksi nyata
- lakukan testing awal di device non-produksi
- simpan pekerjaan lain sebelum test command ini

### Hasil yang Diharapkan

Kalau Level 3 lulus, berarti:

- fondasi Windows client native sudah valid
- backend contract sudah cocok dengan client native
- project siap lanjut ke hardening auto-start/service/kiosk

---

## Urutan Testing yang Direkomendasikan

1. **Level 1** — validasi semua flow inti di Mac.
2. **Level 2** — validasi akses LAN dari device lain.
3. **Level 3** — validasi Windows client native.

Kalau Level 1 dan 2 sudah mulus, biasanya bug yang tersisa tinggal bug spesifik Windows client.

---

## Checklist Singkat

### Level 1

- [ ] Backend jalan
- [ ] Admin login jalan
- [ ] Client prototype connect
- [ ] User login berhasil
- [ ] Session start/stop/extend/top-up berhasil
- [ ] Backup database berhasil
- [ ] Report CSV berhasil

### Level 2

- [ ] Backend bisa diakses via IP LAN
- [ ] Admin bisa dibuka dari device lain
- [ ] Client bisa dibuka dari device lain
- [ ] Multi-PC heartbeat terbaca
- [ ] Session paralel jalan

### Level 3

- [ ] Windows client build berhasil
- [ ] Windows client heartbeat berhasil
- [ ] Login user berhasil
- [ ] Countdown tampil
- [ ] Lock command berhasil
- [ ] Shutdown command berhasil
- [ ] Restart command berhasil
- [ ] Expired session action berhasil

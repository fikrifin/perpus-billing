# Windows Client Safe Setup Playbook

Playbook ini berisi langkah praktis untuk menyiapkan 1 PC client Windows Perpus Billing dengan baseline keamanan yang layak untuk test lapangan/pilot awal.

Fokus dokumen ini adalah setup yang realistis untuk:

- komputer publik perpustakaan
- login Windows otomatis ke akun client
- app Perpus Billing otomatis jalan
- membatasi user agar tidak mudah keluar dari flow aplikasi

---

## Scope

Playbook ini belum berarti kiosk sempurna 100%, tapi targetnya adalah:

- cukup aman untuk pilot/MVP lapangan
- mengurangi risiko End Task, sign out, dan keluar ke desktop
- menyiapkan fondasi untuk nanti naik ke Assigned Access / kiosk penuh

---

## Gambaran Akhir yang Diinginkan

Setelah setup selesai:

1. PC menyala
2. Windows auto-login ke akun `PerpusClient`
3. aplikasi Perpus Billing auto-run
4. user hanya melihat lock screen client
5. setelah login session perpustakaan, mini bar tampil
6. saat session habis, kembali lock / shutdown / restart sesuai aturan

---

## Checklist Ringkas

- [ ] buat akun `PerpusClient` sebagai **standard user**
- [ ] buat akun `PerpusAdmin` sebagai **administrator**
- [ ] aktifkan auto logon ke `PerpusClient`
- [ ] set aplikasi client auto-start saat logon
- [ ] isi config `serverUrl` dan `computerCode`
- [ ] uji koneksi ke backend LAN
- [ ] batasi/disable Task Manager
- [ ] batasi tool sistem yang tidak perlu
- [ ] uji sign out / restart / session expire

---

## Langkah 1 — Siapkan Dua Akun Windows

### Akun 1: Public Client
Contoh:

- Username: `PerpusClient`
- Type: **Standard User**

Fungsi:
- dipakai user perpustakaan
- jadi akun operasional default

### Akun 2: Maintenance Admin
Contoh:

- Username: `PerpusAdmin`
- Type: **Administrator**

Fungsi:
- install/update aplikasi
- ubah setting sistem
- troubleshooting

### Aturan penting
- jangan gunakan akun admin untuk user harian
- password admin harus kuat
- akun public jangan dimasukkan ke grup admin

---

## Langkah 2 — Aktifkan Auto Login ke Akun Client

Tujuan:

- saat komputer dinyalakan, langsung masuk ke `PerpusClient`
- tidak berhenti di layar login biasa

### Opsi umum
Bisa pakai:

- `netplwiz`
- registry / sysinternals autologon
- kebijakan deployment lokal kalau nanti mau distandardkan

### Hasil yang diinginkan
Setelah reboot:

- PC langsung masuk ke `PerpusClient`
- tanpa perlu operator ketik password tiap kali boot

### Catatan
Kalau nanti dipakai di lingkungan yang lebih ketat, auto-logon harus dipertimbangkan bersama kebijakan fisik dan SOP maintenance.

---

## Langkah 3 — Install dan Publish Windows Client

Di mesin build/dev, publish app WPF untuk Windows.

Contoh command publish (sesuaikan path):

```powershell
dotnet publish .\apps\windows-client\PerpusBilling.WindowsClient.csproj -c Release -r win-x64 --self-contained true
```

Lalu copy hasil publish ke PC client, misalnya ke:

```text
C:\PerpusBilling\Client\
```

---

## Langkah 4 — Isi Konfigurasi Client

Edit `appsettings.json` di PC client.

Contoh:

```json
{
  "serverUrl": "http://192.168.1.10:3478",
  "computerCode": "PC-01",
  "clientVersion": "0.1.0-windows",
  "heartbeatFallbackSeconds": 5
}
```

### Yang harus dicek
- `serverUrl` mengarah ke IP server LAN
- `computerCode` sesuai data komputer di backend
- backend bisa diakses dari PC client

### Tes cepat
Buka dari browser Windows client:

```text
http://192.168.1.10:3478/health
```

Kalau terbuka, koneksi dasarnya benar.

---

## Langkah 5 — Auto-Start App Saat Logon

Tujuan:

- setelah `PerpusClient` login otomatis
- app Perpus Billing langsung jalan sendiri

### Opsi umum
Bisa pakai salah satu:

1. folder `Startup`
2. registry `Run`
3. Task Scheduler saat logon

### Rekomendasi awal
Untuk MVP/pilot awal, paling simpel:

- pakai `Startup` folder atau Task Scheduler saat logon user `PerpusClient`

### Hasil yang diinginkan
Setelah restart PC:

- Windows login ke `PerpusClient`
- app client otomatis terbuka fullscreen

---

## Langkah 6 — Batasi Task Manager

Ini salah satu langkah paling penting.

### Tujuan
- user tidak gampang `End Task` aplikasi client

### Opsi umum
- Local Group Policy
- Registry policy

### Policy yang dicari
Cari kebijakan seperti:

- **Remove Task Manager**

### Hasil yang diinginkan
Di akun `PerpusClient`, Task Manager tidak bisa dibuka secara normal.

### Catatan
Ini harus diuji langsung di akun public, bukan cuma di akun admin.

---

## Langkah 7 — Batasi Escape Path Lain

Selain Task Manager, sebisa mungkin kurangi akses ke:

- Run dialog
- Command Prompt
- PowerShell
- Settings tertentu
- Control Panel
- file explorer jalur tertentu
- shortcut yang tidak perlu

### Cara
Bisa bertahap lewat:

- Local Group Policy
- Assigned Access / kiosk policy
- SOP penggunaan lokal

### Prinsip
Tidak harus sempurna langsung, tapi tiap escape path yang ditutup akan memperkuat client.

---

## Langkah 8 — Uji Sign Out dan Switch User

Ini penting karena standard user saja belum cukup.

### Yang diuji
- apakah user masih bisa sign out dengan mudah?
- kalau sign out, apakah layar login menampilkan akun lain?
- apakah akun admin terlihat jelas di layar login?
- apakah ada jalur untuk pindah user?

### Target minimal
- akun admin tidak mudah diakses user publik
- flow kembali ke akun client tetap terkendali

### Catatan
Solusi penuh untuk area ini biasanya butuh policy Windows tambahan atau Assigned Access.

---

## Langkah 9 — Uji Skenario Operasional

Tes minimal yang harus dijalankan:

### Test A — Boot normal
- nyalakan PC
- pastikan auto-login ke `PerpusClient`
- app otomatis terbuka

### Test B — Login session perpustakaan
- login user perpustakaan
- mini bar muncul
- countdown berjalan

### Test C — Session warning & expire
- warning muncul di mini bar
- expire menjalankan action tepat waktu

### Test D — Stop session
- session dihentikan operator/user
- client kembali ke lock screen

### Test E — Coba bypass
- coba Alt+Tab
- coba close app
- coba buka Task Manager
- coba sign out
- catat escape path yang masih lolos

---

## Langkah 10 — SOP Maintenance

Untuk maintenance, petugas harus punya SOP sederhana.

Contoh alur:

1. masuk ke akun `PerpusAdmin`
2. update aplikasi/config
3. tes koneksi backend
4. logout dari admin
5. kembali ke flow `PerpusClient`
6. pastikan auto-run tetap jalan

Ini penting supaya maintenance tidak merusak flow kiosk/client.

---

## Rekomendasi Tahap Lanjut

Kalau pilot awal berjalan baik, lanjutkan ke:

- Assigned Access / kiosk mode
- watchdog / auto-relaunch app
- local file logging
- installer/config helper
- update mechanism yang lebih rapi

---

## Red Flags yang Harus Dihindari

Jangan deploy client publik dengan kondisi ini:

- [ ] user harian memakai akun admin
- [ ] Task Manager masih bebas dibuka
- [ ] app tidak auto-start
- [ ] backend LAN belum stabil
- [ ] admin password lemah
- [ ] `serverUrl` masih localhost padahal dipakai dari client lain

---

## Kesimpulan

Setup aman untuk Windows client bukan cuma soal publish app, tapi soal gabungan:

- akun Windows yang benar
- auto-logon yang benar
- auto-start app
- pembatasan Task Manager/system tools
- pengujian bypass nyata

Untuk tahap awal, target paling realistis adalah **baseline aman untuk pilot**, lalu ditingkatkan ke kiosk policy yang lebih kuat.

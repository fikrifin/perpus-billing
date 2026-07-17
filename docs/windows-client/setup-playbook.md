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
4. user hanya melihat lock screen client, sementara taskbar/shell Windows disembunyikan
5. setelah login session perpustakaan, mini bar tampil dan shell Windows dimunculkan lagi
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
- [ ] verifikasi crash log & auto-relaunch saat pre-login
- [ ] uji sign out / restart / session expire
- [ ] jalankan checklist policy Windows pilot
- [ ] isi hasil bypass test matrix per PC

---

## Checklist Policy Windows Pilot

Checklist ini fokus ke hal-hal yang paling worth-it untuk pilot awal. Nama policy bisa sedikit beda tergantung edisi Windows, jadi anggap ini target kontrol, bukan nama menu yang harus 100% sama.

### Prioritas wajib

- [ ] **Remove Task Manager** untuk akun/public flow
- [ ] blok akses ke **Command Prompt**
- [ ] blok akses ke **PowerShell** kalau tidak dibutuhkan
- [ ] blok akses ke **Registry Editor**
- [ ] sembunyikan / batasi **Control Panel** dan **Settings**
- [ ] batasi **Run dialog**
- [ ] batasi **switch user / sign out path** semampunya
- [ ] pastikan akun `PerpusClient` tetap **standard user**

### Prioritas bagus kalau sempat

- [ ] sembunyikan drive tertentu dari Explorer
- [ ] batasi akses ke File Explorer area sensitif
- [ ] matikan shortcut atau entry point yang membuka shell sistem
- [ ] evaluasi Assigned Access / kiosk policy
- [ ] verifikasi hanya akun operasional yang terlihat jelas di flow publik

### Verifikasi setelah policy diterapkan

- [ ] `Ctrl+Shift+Esc` tidak membuka Task Manager untuk user publik
- [ ] `Win+R` tidak memberi jalan praktis ke shell
- [ ] `cmd` / `powershell` tidak bisa dibuka normal
- [ ] Settings/Control Panel tidak bisa dipakai keluar dari flow publik
- [ ] sign out / switch user tidak memberi jalur gampang ke akun admin

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

## Langkah 3 — Publish Windows Client

Di mesin build/dev Windows yang punya .NET SDK 8, publish app WPF dari root repo.

### Opsi rekomendasi: pakai helper script

```powershell
.\scripts\windows-client\Publish-WindowsClient.ps1 `
  -ServerUrl "http://192.168.1.10:3478" `
  -ComputerCode "PC-01" `
  -AdminExitCode "perpus-admin" `
  -SelfContained $true
```

Hasil publish default:

```text
dist\windows-client\
```

Script ini juga menulis `appsettings.json` dan menyalin `Install-WindowsClient.ps1` ke folder publish.

### Opsi manual

```powershell
dotnet publish .\apps\windows-client\PerpusBilling.WindowsClient.csproj -c Release -r win-x64 --self-contained true -o .\dist\windows-client
```

Lalu copy hasil publish ke PC client, misalnya ke:

```text
C:\PerpusBilling\Client\
```

### Penting: install dilakukan dari akun admin, tapi startup diregister dari akun client

Pisahkan dua tahap ini dengan jelas:

1. **Login sebagai `PerpusAdmin`**
   - copy/publish file app
   - edit konfigurasi
   - siapkan policy Windows bila perlu
2. **Login sebagai `PerpusClient`**
   - jalankan app minimal sekali
   - biarkan app mendaftarkan auto-start untuk profile user ini
   - verifikasi auto-start dengan sign out / logon ulang

Jangan anggap auto-start ini global untuk semua akun. Untuk implementasi saat ini, auto-start bersifat **per-user**.

---

## Langkah 4 — Install dan Isi Konfigurasi Client

Kalau folder hasil publish sudah dicopy ke PC client, buka PowerShell dari folder publish lalu jalankan:

```powershell
.\Install-WindowsClient.ps1 `
  -InstallDir "C:\PerpusBilling\Client" `
  -ServerUrl "http://192.168.1.10:3478" `
  -ComputerCode "PC-01" `
  -AdminExitCode "perpus-admin"
```

Script ini akan:

- copy file client ke `InstallDir`
- menulis `appsettings.json`
- menampilkan lokasi executable dan log

Kalau mau manual, edit `appsettings.json` di PC client. Kalau tidak, sekarang client juga punya panel setup first-run dengan simpan config, tes koneksi ulang, dan reset default untuk isi `serverUrl` dan `computerCode` dari UI.

Contoh:

```json
{
  "serverUrl": "http://192.168.1.10:3478",
  "computerCode": "PC-01",
  "clientVersion": "0.1.0-windows",
  "heartbeatFallbackSeconds": 5,
  "autoStartOnLogin": true,
  "enableTaskManagerGuard": true,
  "blockedProcessNames": ["Taskmgr"],
  "keepShellHiddenDuringSession": false,
  "enableStartupShortcutFallback": true,
  "enableExplorerRecoveryOnAdminExit": true
}
```

### Yang harus dicek
- `serverUrl` mengarah ke IP server LAN
- `computerCode` sesuai data komputer di backend
- backend bisa diakses dari PC client
- `enableTaskManagerGuard=true` kalau mau best-effort bunuh process terlarang saat pre-login
- `blockedProcessNames` default `Taskmgr`; bisa ditambah nanti, tapi tetap utamakan policy OS untuk blok tool sistem
- `keepShellHiddenDuringSession=true` hanya kalau memang ingin mode lebih kiosk saat session aktif; default `false` supaya desktop tetap normal saat user sedang memakai komputer
- `enableStartupShortcutFallback=true` kalau mau fallback ke shortcut Startup folder saat registry `Run` gagal atau diblok policy
- `enableExplorerRecoveryOnAdminExit=true` supaya admin exit mencoba memulihkan `explorer.exe` lagi

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

### Status implementasi saat ini
Windows client sekarang punya best-effort auto-start internal via registry:

- `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`
- aktif jika `autoStartOnLogin=true` di `appsettings.json`
- didaftarkan saat app dijalankan di akun target
- **hanya berlaku untuk user Windows yang sedang login saat registrasi dilakukan**

Karena pakai `HKCU` (`HKEY_CURRENT_USER`), startup ini **bukan global semua user**.

Contoh:
- kalau app pertama kali dijalankan di akun `PerpusClient`, maka auto-start menempel ke `PerpusClient`
- kalau app dijalankan di akun `PerpusAdmin`, maka auto-start bisa menempel ke akun admin juga

Karena itu, registrasi startup **harus** dilakukan dari akun `PerpusClient`.

### Rekomendasi awal
Untuk MVP/pilot awal, paling simpel:

- login dulu ke akun `PerpusClient`
- jalankan app sekali di akun itu
- biarkan app mendaftarkan auto-start registry
- verifikasi hasilnya dengan sign out / logon ulang `PerpusClient`

Atau dari akun `PerpusClient`, jalankan installer helper dengan startup eksplisit:

```powershell
.\Install-WindowsClient.ps1 `
  -InstallDir "C:\PerpusBilling\Client" `
  -ServerUrl "http://192.168.1.10:3478" `
  -ComputerCode "PC-01" `
  -RegisterStartup
```

Tetap ingat: `-RegisterStartup` menulis ke `HKCU`, jadi jalankan dari user Windows yang memang akan dipakai harian (`PerpusClient`).

Jangan mendaftarkan startup pertama kali dari akun `PerpusAdmin`, karena nanti app bisa ikut jalan saat admin maintenance.

### Fallback kalau perlu
Kalau registry Run tidak cukup atau diblok policy:

- app sekarang bisa best-effort bikin shortcut di `Startup` folder user jika `enableStartupShortcutFallback=true`
- atau tetap pakai Task Scheduler saat logon user `PerpusClient` kalau lingkungan Windows menolak dua opsi sebelumnya

### Verifikasi startup yang perlu dicek
- cek apakah value registry `Run` benar-benar terpasang di akun `PerpusClient`
- kalau registry gagal, cek apakah shortcut `.lnk` muncul di Startup folder user
- cek log `client-YYYYMMDD.log` untuk status startup registration/fallback

### Hasil yang diinginkan
Setelah restart PC:

- Windows login ke `PerpusClient`
- app client otomatis terbuka fullscreen
- taskbar Windows tidak terlihat selama client masih di lock screen

### Lokasi log troubleshooting

Kalau ada masalah di UTM/PC client, cek:

```text
%LOCALAPPDATA%\PerpusBilling\WindowsClient\logs\
```

File penting:

- `client-YYYYMMDD.log` untuk log operasional
- `crash-YYYYMMDD.log` untuk crash/unhandled exception

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

### Bypass Test Matrix (isi per PC client)

Gunakan tabel sederhana ini saat pilot supaya tiap mesin punya catatan nyata, bukan asumsi.

| Test | Hasil | Catatan |
|------|-------|---------|
| Alt+Tab saat pre-login | Lolos / Tertahan | |
| Tombol Windows saat pre-login | Lolos / Tertahan | |
| Close app normal | Lolos / Tertahan | |
| Task Manager | Lolos / Tertahan | |
| Run dialog / shell tool | Lolos / Tertahan | |
| Sign out / switch user | Lolos / Tertahan | |
| Crash relaunch pre-login | Berhasil / Gagal | |
| Session expire action | Berhasil / Gagal | |

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
- coba tombol Windows
- coba close app
- coba buka Task Manager
- coba sign out
- catat escape path yang masih lolos

Kalau `enableTaskManagerGuard=true`, verifikasi juga bahwa `Taskmgr.exe` memang tertutup lagi saat pre-login. Ini best-effort guard, bukan pengganti policy Windows.

### Test F — Simulasi crash saat pre-login
- pastikan client sedang di lock screen (belum ada session aktif)
- paksa crash/close abnormal dari Visual Studio atau Task Manager bila perlu untuk simulasi
- cek apakah app mencoba hidup lagi otomatis
- cek file log crash di `%LOCALAPPDATA%\\PerpusBilling\\WindowsClient\\logs`

---

## Langkah 10 — SOP Maintenance

Untuk maintenance, petugas harus punya SOP sederhana.

Contoh alur:

1. sign out / keluar dari flow `PerpusClient`
2. login ke akun `PerpusAdmin`
3. update aplikasi/config
4. tes koneksi backend bila perlu
5. logout dari admin
6. kembali login / auto-login ke `PerpusClient`
7. pastikan app auto-run tetap jalan di akun `PerpusClient`

### Catatan penting untuk maintenance

- auto-start saat ini bersifat **per-user**
- target operasional harian adalah `PerpusClient`
- `PerpusAdmin` dipakai hanya saat maintenance
- kalau app sempat terdaftar auto-start di akun admin, bersihkan/disable lalu registrasikan ulang dari `PerpusClient`

Ini penting supaya maintenance tidak merusak flow kiosk/client.

---

## Rekomendasi Tahap Lanjut

Kalau pilot awal berjalan baik, lanjutkan ke:

- Assigned Access / kiosk mode
- helper watchdog terpisah kalau recovery internal masih kurang
- local file logging yang lebih lengkap
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

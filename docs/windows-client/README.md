# Windows Client Agent

Target: client native Windows untuk PC publik perpustakaan.

Status saat ini: skeleton WPF/.NET 8 sudah dibuat untuk kontrak MVP:

- Konfigurasi `serverUrl` dan `computerCode` bisa via `appsettings.json` atau panel setup first-run dengan simpan config, tes koneksi ulang, dan reset default di aplikasi.
- Heartbeat ke backend.
- Login user dengan username/password.
- Menampilkan session aktif dan countdown.
- Saat login sukses, window utama di-hide dan muncul mini top bar always-on-top di atas tengah.
- Mini bar sekarang dibuat lebih kecil lagi dan punya tombol keluar cepat dengan konfirmasi.
- Warning 60 detik terakhir tampil non-intrusive di mini top bar dengan state berkedip.
- Menjalankan aksi akhir tepat saat waktu mencapai `00:00`.
- Status offline/reconnect lebih jelas: status server menampilkan waktu heartbeat terakhir, mini bar berubah ke state offline, dan timer lokal tetap berjalan.
- Logging lokal untuk event penting: startup, login gagal/berhasil, heartbeat offline/reconnect, command, stop session, final action, dan crash.
- Menerima command dari backend melalui response heartbeat.
- Acknowledge command.
- Lock workstation, shutdown, atau restart via Windows API/command.

## Struktur

```text
apps/windows-client/
├── PerpusBilling.WindowsClient.csproj
├── appsettings.json
├── App.xaml
├── MainWindow.xaml
├── MiniBarWindow.xaml
├── ClientConfig.cs
├── Models/ApiModels.cs
└── Services/
    ├── PerpusApiClient.cs
    └── WindowsPowerController.cs
```

## Requirement Build

Di Windows:

- Windows 10/11
- .NET SDK 8.x

Cek:

```powershell
dotnet --version
```

## Konfigurasi Client

Edit file ini setelah publish/install:

```text
appsettings.json
```

Contoh untuk LAN:

```json
{
  "serverUrl": "http://192.168.1.10:3478",
  "computerCode": "PC-01",
  "clientVersion": "windows-client-0.1.0",
  "heartbeatFallbackSeconds": 5,
  "autoStartOnLogin": true,
  "enableTaskManagerGuard": true,
  "blockedProcessNames": ["Taskmgr"],
  "keepShellHiddenDuringSession": false,
  "enableStartupShortcutFallback": true,
  "enableExplorerRecoveryOnAdminExit": true
}
```

- `serverUrl`: IP PC operator/server.
- `computerCode`: kode komputer sesuai dashboard admin, misal `PC-01`.
- `autoStartOnLogin`: jika `true`, app akan best-effort mendaftarkan dirinya ke startup user Windows saat app dijalankan. Karena registrasinya via `HKCU`, behavior ini bersifat per-user, bukan global semua akun Windows.
- `enableTaskManagerGuard`: jika `true`, app akan best-effort menutup process yang masuk daftar `blockedProcessNames` saat mode pre-login.
- `blockedProcessNames`: daftar process tanpa/atau dengan `.exe` yang akan ditutup saat pre-login, default `Taskmgr`. Ini lapisan tambahan, bukan pengganti policy Windows.
- `keepShellHiddenDuringSession`: jika `true`, shell/taskbar bisa tetap disembunyikan bahkan setelah user session aktif.
- `enableStartupShortcutFallback`: jika `true`, app akan mencoba fallback startup lewat shortcut di Startup folder kalau registry `Run` gagal.
- `enableExplorerRecoveryOnAdminExit`: jika `true`, app akan best-effort menjalankan `explorer.exe` saat admin exit supaya desktop Windows balik normal.

## Build

Dari root repo:

```powershell
dotnet build .\apps\windows-client\PerpusBilling.WindowsClient.csproj
```

Publish single-folder app via helper script:

```powershell
.\scripts\windows-client\Publish-WindowsClient.ps1 `
  -ServerUrl "http://192.168.1.10:3478" `
  -ComputerCode "PC-01" `
  -SelfContained $true
```

Helper ini menjalankan `dotnet publish`, menulis `appsettings.json`, dan menyalin installer helper ke `dist\windows-client`.

Publish manual:

```powershell
dotnet publish .\apps\windows-client\PerpusBilling.WindowsClient.csproj -c Release -r win-x64 --self-contained false -o .\dist\windows-client
```

Kalau target PC tidak punya .NET Runtime, pakai self-contained:

```powershell
dotnet publish .\apps\windows-client\PerpusBilling.WindowsClient.csproj -c Release -r win-x64 --self-contained true -o .\dist\windows-client
```

## Install Helper di PC Client

Dari folder hasil publish di PC client:

```powershell
.\Install-WindowsClient.ps1 `
  -InstallDir "C:\PerpusBilling\Client" `
  -ServerUrl "http://192.168.1.10:3478" `
  -ComputerCode "PC-01"
```

Untuk mendaftarkan startup `HKCU`, jalankan dari akun `PerpusClient` dan tambah:

```powershell
-RegisterStartup
```

## Run Test Manual

1. Jalankan backend di PC operator/server.
2. Pastikan komputer client sudah terdaftar di admin dashboard, contoh `PC-01`.
3. Jalankan `PerpusBilling.WindowsClient.exe`. Kalau config masih default/belum valid, isi panel setup dulu.
4. Pastikan `serverUrl` mengarah ke IP server dan `computerCode` sesuai data komputer.
5. Pastikan status server berubah online dan PC muncul heartbeat di dashboard.
6. Kalau `autoStartOnLogin=true`, tutup-buka/login ulang Windows lalu cek app muncul otomatis.
7. Login memakai user demo atau user yang dibuat operator.
8. Test command dari dashboard:
   - lock
   - restart
   - shutdown

## Catatan Penting

- Countdown expire sekarang diarahkan untuk mulai masuk warning saat sisa waktu sudah menyentuh threshold terakhir (default 60 detik), lalu action akhir dijalankan tepat saat waktu session habis.
- Command `shutdown` dan `restart` memakai `shutdown.exe /s /t 0` dan `shutdown.exe /r /t 0`. Ini nyata di Windows, bukan simulasi.
- Command `lock` memakai `LockWorkStation()` dari `user32.dll`.
- Window dibuat fullscreen/topmost sebagai lock screen dasar. Saat user sudah login, warning akhir diarahkan tetap di mini top bar agar tidak terlalu mengganggu aktivitas user.
- Mini bar menyediakan tombol keluar cepat. Saat ditekan, user diminta konfirmasi dulu. Jika dikonfirmasi, client akan stop session ke server dulu agar waktu/user state tersimpan, lalu komputer shutdown.
- Pada mode belum-login sekarang ditambah hardening ringan: best-effort tahan minimize, tahan close normal, re-activate window saat kehilangan fokus, blok `Alt+F4`, tahan `Alt+Tab` / `Alt+Esc`, dan sembunyikan taskbar/shell Windows.
- App juga bisa best-effort mendaftarkan auto-start di registry `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run` jika `autoStartOnLogin=true`.
- Kalau registry `Run` gagal atau diblok policy, app sekarang bisa fallback membuat shortcut startup di folder Startup user bila `enableStartupShortcutFallback=true`.
- Karena auto-start ini tetap per-user, registrasi awal sebaiknya dilakukan dari akun `PerpusClient`, bukan `PerpusAdmin`.
- App sekarang punya recovery ringan: kalau crash saat masih di mode pre-login, executable akan mencoba relaunch sendiri dan menulis crash log ke `%LOCALAPPDATA%\\PerpusBilling\\WindowsClient\\logs`.
- Saat admin exit dipakai, app sekarang bisa best-effort memulihkan `explorer.exe` lagi lewat config `enableExplorerRecoveryOnAdminExit`.
- Log operasional harian ditulis ke `%LOCALAPPDATA%\\PerpusBilling\\WindowsClient\\logs\\client-YYYYMMDD.log` untuk troubleshooting client di lapangan, termasuk hasil evaluasi startup registration/fallback.
- Ini belum hardening kiosk penuh, tapi mode pre-login sekarang lebih rapat: hidden from taskbar, reclaim foreground lebih agresif, startup fallback tambahan, dan opsi recovery explorer saat admin exit.

## Hardening Berikutnya

Sebelum pilot serius di perpustakaan:

- Perkuat lagi mode belum-login agar lebih susah di-bypass (Alt+Tab / pindah app / close app). Dasar guard app-level sudah mulai ditambahkan, tapi OS-level policy tetap dibutuhkan.
- Auto-start saat Windows boot.
- Jalankan sebagai Windows service/helper untuk heartbeat tetap hidup.
- Disable close/Alt+F4/Task Manager bypass semampunya atau pakai Windows Assigned Access/kiosk policy.
- Panel setup first-run untuk isi `serverUrl` + `computerCode` sudah mulai ada; installer helper tinggal melengkapi flow deploy.
- WebSocket realtime optional; heartbeat polling sudah cukup untuk MVP.
- Kirim/ambil log lokal dari PC client saat troubleshooting pilot.
- Installer sederhana dengan wizard/server URL + computer code.

Dokumen terkait:
- [`docs/windows-client/hardening.md`](hardening.md)
- [`docs/windows-client/security-architecture.md`](security-architecture.md)
- [`docs/windows-client/setup-playbook.md`](setup-playbook.md)

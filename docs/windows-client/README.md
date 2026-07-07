# Windows Client Agent

Target: client native Windows untuk PC publik perpustakaan.

Status saat ini: skeleton WPF/.NET 8 sudah dibuat untuk kontrak MVP:

- Konfigurasi `serverUrl` dan `computerCode` via `appsettings.json`.
- Heartbeat ke backend.
- Login user dengan username/password.
- Menampilkan session aktif dan countdown.
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
  "heartbeatFallbackSeconds": 5
}
```

- `serverUrl`: IP PC operator/server.
- `computerCode`: kode komputer sesuai dashboard admin, misal `PC-01`.

## Build

Dari root repo:

```powershell
dotnet build .\apps\windows-client\PerpusBilling.WindowsClient.csproj
```

Publish single-folder app:

```powershell
dotnet publish .\apps\windows-client\PerpusBilling.WindowsClient.csproj -c Release -r win-x64 --self-contained false -o .\dist\windows-client
```

Kalau target PC tidak punya .NET Runtime, pakai self-contained:

```powershell
dotnet publish .\apps\windows-client\PerpusBilling.WindowsClient.csproj -c Release -r win-x64 --self-contained true -o .\dist\windows-client
```

## Run Test Manual

1. Jalankan backend di PC operator/server.
2. Pastikan komputer client sudah terdaftar di admin dashboard, contoh `PC-01`.
3. Edit `appsettings.json` agar `serverUrl` mengarah ke IP server.
4. Jalankan `PerpusBilling.WindowsClient.exe`.
5. Pastikan status server berubah online dan PC muncul heartbeat di dashboard.
6. Login memakai user demo atau user yang dibuat operator.
7. Test command dari dashboard:
   - lock
   - restart
   - shutdown

## Catatan Penting

- Command `shutdown` dan `restart` memakai `shutdown.exe /s /t 0` dan `shutdown.exe /r /t 0`. Ini nyata di Windows, bukan simulasi.
- Command `lock` memakai `LockWorkStation()` dari `user32.dll`.
- Window dibuat fullscreen/topmost sebagai lock screen dasar. Ini belum hardening kiosk penuh.

## Hardening Berikutnya

Sebelum pilot serius di perpustakaan:

- Auto-start saat Windows boot.
- Jalankan sebagai Windows service/helper untuk heartbeat tetap hidup.
- Disable close/Alt+F4/Task Manager bypass semampunya atau pakai Windows Assigned Access/kiosk policy.
- Installer sederhana untuk isi `serverUrl` + `computerCode`.
- WebSocket realtime optional; heartbeat polling sudah cukup untuk MVP.
- Logging lokal ke file untuk troubleshooting client.

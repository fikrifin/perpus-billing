# Client Agent Prototype

Prototype awal client agent/lock screen.

Saat ini berbasis Vite React agar flow bisa dites cepat di macOS/browser. Versi final Windows tetap diarahkan ke native Windows agent (.NET Worker Service + WPF/WinUI) agar bisa menjalankan shutdown sungguhan.

## Fitur Prototype

- Full-screen style lock screen
- Set kode komputer client
- Setup awal alamat server LAN dan kode komputer; konfigurasi disimpan lokal
- Validasi kode komputer lewat heartbeat ke backend
- Login username/password ke backend
- Start session memakai saldo waktu dari backend
- Countdown sisa waktu
- Heartbeat ke backend tiap 5 detik
- Restore session aktif dari heartbeat jika client reload/restart
- Listen WebSocket event `session.started`, `session.extended`, `session.stopped`, dan `session.expired`
- Bisa menerima session yang dimulai dari dashboard operator
- Simulasi shutdown saat waktu habis

## Jalankan

Dari root project:

```bash
npm run dev:server
npm run dev:client
```

Default:

- Client UI: `http://localhost:5174`
- Backend API: `http://localhost:3478`
- Default kode komputer: `PC-01`

Catatan: user/client tidak boleh menentukan durasi sendiri. Durasi akses ditentukan oleh operator dari dashboard/backend.

Jika ingin set kode komputer dari environment:

```bash
VITE_COMPUTER_CODE=PC-02 npm run dev:client
```

Jika backend di PC operator lain:

```bash
VITE_API_BASE=http://192.168.1.10:3478 VITE_COMPUTER_CODE=PC-02 npm run dev:client
```

## Catatan Shutdown

Di prototype browser, shutdown hanya disimulasikan. Di Windows agent final, event expired akan memanggil command OS seperti:

```powershell
shutdown /s /t 60 /c "Waktu penggunaan komputer perpustakaan telah habis."
```

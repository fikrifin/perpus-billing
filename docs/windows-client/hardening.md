# Windows Client Hardening Notes

Dokumen ini fokus ke masalah hardening Windows client native untuk Perpus Billing, terutama risiko user menutup app, pindah app, atau menghentikan proses lewat Task Manager.

---

## Masalah Inti

Kalau Windows client hanya berjalan sebagai aplikasi desktop biasa:

- user bisa mencoba `Alt+Tab`
- user bisa mencoba minimize / close app
- user bisa membuka Task Manager
- user bisa `End Task`

Kalau proses client mati tanpa proteksi tambahan, lock screen hilang dan komputer bisa dipakai bebas. Jadi **UI app saja tidak cukup** untuk keamanan final.

---

## Prinsip Solusi

Hardening harus bertingkat:

1. **App behavior**
2. **Windows account restriction**
3. **Task Manager / system tools restriction**
4. **Kiosk / Assigned Access policy**
5. **Optional watchdog/service**

Jangan bergantung pada satu lapisan saja.

---

## Layer 1 — App-Level Hardening

Yang bisa dilakukan langsung di aplikasi:

- fullscreen/topmost saat belum login
- tahan close normal
- tahan minimize semampunya
- setelah login, app utama hide dan tinggal mini bar
- warning akhir tetap muncul non-intrusive di mini bar

### Status saat ini

Sudah ada implementasi dasar:

- main window fullscreen/topmost
- attempt close ditahan
- attempt minimize ditahan pada mode belum-login
- re-activate window saat kehilangan fokus pada mode belum-login
- blok shortcut dasar seperti `Alt+F4` pada mode belum-login
- saat session aktif, main window di-hide
- mini top bar always-on-top
- mini bar punya tombol keluar cepat, tapi tetap pakai konfirmasi dulu sebelum stop session + shutdown
- warning countdown tetap di mini bar

### Keterbatasan

Ini **tidak cukup** untuk melawan Task Manager atau user yang masih bisa buka shell/system tools.

---

## Layer 2 — Gunakan Standard User, Bukan Admin

Ini wajib untuk komputer client.

### Rekomendasi

- buat akun Windows khusus client/public
- akun ini harus **standard user**
- jangan pakai akun administrator untuk operasional harian user perpustakaan
- simpan akun admin terpisah untuk maintenance operator/teknisi

### Kenapa penting

Kalau user duduk di akun admin, semua proteksi app jadi jauh lebih lemah.

---

## Layer 3 — Batasi / Disable Task Manager

Ini salah satu proteksi paling penting untuk MVP.

### Tujuan

Mencegah user menghentikan proses client dari Task Manager.

### Cara umum

Bisa lewat:

- Local Group Policy (`gpedit.msc`)
- Registry policy
- MDM / local policy script kalau nanti mau diotomasi

### Policy yang dicari

Cari policy seperti:

- **Remove Task Manager**
- pembatasan akses ke system tools tertentu
- pembatasan hotkeys tertentu jika memungkinkan

### Catatan

Ini harus diterapkan di akun/public profile yang dipakai user client.

---

## Layer 4 — Assigned Access / Kiosk Mode

Ini solusi Windows yang lebih proper untuk deployment final.

### Tujuan

Menjadikan komputer client lebih mirip kiosk:

- user tidak bebas pindah app
- akses ke shell/system tool dibatasi
- app tertentu jadi fokus utama

### Cocok untuk kapan?

Dipakai saat:

- MVP sudah stabil
- flow operasional sudah fix
- siap masuk pilot lapangan yang lebih serius

### Catatan

UTM bisa dipakai untuk eksperimen, tapi validasi final tetap lebih baik di Windows fisik.

---

## Layer 5 — Watchdog / Auto-Relaunch

Tambahan proteksi yang bagus:

- kalau UI app mati
- ada proses lain yang mendeteksi
- lalu auto-run ulang app

### Bentuk implementasi yang mungkin

- helper process ringan
- scheduled task saat logon
- Windows service terpisah

### Manfaat

Kalau user berhasil menutup app, app bisa muncul lagi.

### Keterbatasan

Kalau user bisa kill watchdog juga, tetap bobol. Jadi ini pelengkap, bukan pengganti policy Windows.

---

## Prioritas Rekomendasi untuk Perpus Billing

### Tahap sekarang

1. rapikan mini bar dan UX
2. hardening close/minimize dasar
3. dokumentasi policy Windows

### Tahap berikutnya

4. standard user account setup
5. disable Task Manager
6. uji Assigned Access / kiosk policy
7. tambah watchdog / auto-relaunch

---

## Checklist Implementasi Lapangan

### Minimum layak test

- [ ] client jalan di akun standard user
- [ ] main window tidak mudah ditutup
- [ ] mini bar tampil saat session aktif
- [ ] Task Manager dibatasi / dinonaktifkan

### Menuju pilot serius

- [ ] policy kiosk / Assigned Access diuji
- [ ] auto-start saat boot/logon
- [ ] watchdog / auto-relaunch dipertimbangkan
- [ ] logging lokal tersedia

---

## Kesimpulan

Kalau pertanyaannya:

> “Kalau app di-End Task, apakah user bisa lanjut pakai komputer bebas?”

Jawabannya: **iya, bisa**, kalau belum ada hardening OS/policy tambahan.

Karena itu solusi final harus gabungan antara:

- app UI
- account restriction
- disable Task Manager
- kiosk policy
- optional watchdog

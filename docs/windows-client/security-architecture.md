# Windows Client Security Architecture

Dokumen ini menjelaskan arsitektur akun dan alur operasional Windows client yang lebih aman untuk Perpus Billing di komputer publik/perpustakaan.

---

## Tujuan

Target arsitektur ini:

- user perpustakaan hanya memakai 1 akun client publik
- app Perpus Billing otomatis berjalan di akun itu
- user tidak mudah pindah ke user lain atau mematikan proteksi
- admin/teknisi tetap punya jalur maintenance yang terpisah dan aman

---

## Prinsip Desain

1. **Pisahkan akun public dan akun admin**
2. **Jangan pakai akun administrator untuk user perpustakaan**
3. **Client harus auto-login ke akun public**
4. **App client harus auto-start saat logon**
5. **Task Manager dan system tools perlu dibatasi**
6. **Kalau perlu hardening lebih lanjut, pakai Assigned Access / kiosk policy**

---

## Struktur Akun yang Direkomendasikan

### 1. Akun Public Client
Contoh:

- Username: `PerpusClient`
- Role: **Standard User**
- Fungsi: akun yang dipakai user perpustakaan setiap hari

Karakteristik:

- auto-login saat boot
- auto-start aplikasi Perpus Billing
- auto-start diregister dari profile user ini
- tidak punya hak admin
- dibatasi semaksimal mungkin dari system tools

### 2. Akun Maintenance / Teknisi
Contoh:

- Username: `PerpusAdmin`
- Role: **Administrator**
- Fungsi: maintenance, update, troubleshooting, ganti konfigurasi

Karakteristik:

- password kuat
- tidak dipakai user harian
- hanya dipakai saat maintenance
- idealnya aksesnya dibatasi ke petugas/teknisi

---

## Diagram Arsitektur Sederhana

```text
+---------------------------+
| Windows Boot              |
+-------------+-------------+
              |
              v
+---------------------------+
| Auto Logon: PerpusClient  |
| (Standard User)           |
+-------------+-------------+
              |
              v
+---------------------------+
| Startup / Run at Logon    |
| Perpus Billing Client     |
+-------------+-------------+
              |
              v
+---------------------------+
| Pre-Login Lock Screen     |
| Fullscreen + Topmost      |
+-------------+-------------+
              |
              v
+---------------------------+
| User login ke session     |
| perpustakaan (bukan akun  |
| Windows)                  |
+-------------+-------------+
              |
              v
+---------------------------+
| Session aktif             |
| Mini top bar tampil       |
| Heartbeat ke server       |
+-------------+-------------+
              |
              v
+---------------------------+
| Waktu habis / stop / lock |
| Kembali ke lock screen    |
| atau shutdown/restart     |
+---------------------------+


+---------------------------+
| PerpusAdmin               |
| (Administrator)           |
| Maintenance only          |
+---------------------------+
```

---

## Diagram Kontrol Akses

```text
User Perpustakaan
    |
    | memakai
    v
PerpusClient (standard user)
    |
    | menjalankan
    v
Perpus Billing Windows Client
    |
    | dibatasi oleh
    +--> app guard (fullscreen/topmost/close guard)
    +--> Windows policy (disable Task Manager, system tools)
    +--> optional kiosk / Assigned Access

Petugas / Teknisi
    |
    | memakai
    v
PerpusAdmin (administrator)
    |
    +--> install/update app
    +--> ubah konfigurasi
    +--> maintenance sistem
```

---

## Flow Operasional yang Disarankan

### Saat komputer menyala
1. Windows boot
2. otomatis login ke akun `PerpusClient`
3. aplikasi Perpus Billing auto-run
4. lock screen client tampil

### Catatan tentang auto-start
Auto-start yang sekarang dipakai client berjalan via registry user:

- `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`
- artinya sifatnya **per-user**, bukan global semua akun Windows

Implikasinya:

- `PerpusClient` harus jadi akun tempat startup diregister
- `PerpusAdmin` tidak perlu ikut punya auto-start
- proses registrasi startup harus diuji dari akun `PerpusClient`

### Saat user perpustakaan datang
1. user memasukkan akun perpustakaan di app client
2. session aktif dari server
3. main lock screen hide
4. mini top bar tampil

### Saat session selesai
1. waktu habis / operator stop / remote lock
2. client kembali ke lock screen
3. atau jalankan shutdown/restart sesuai setting

### Saat maintenance
1. petugas keluar dari mode operasional
2. login ke `PerpusAdmin`
3. lakukan update/perbaikan
4. logout dari admin
5. kembali ke flow `PerpusClient`

### Flow instalasi awal yang direkomendasikan
1. login ke `PerpusAdmin`
2. install/copy publish hasil build
3. edit `appsettings.json`
4. setup policy dasar bila perlu
5. logout dari admin
6. login ke `PerpusClient`
7. jalankan app sekali agar auto-start terdaftar di akun client
8. sign out / logon ulang `PerpusClient` untuk verifikasi

---

## Risiko Kalau Arsitektur Ini Tidak Dipakai

Kalau user langsung memakai akun admin atau akun Windows biasa yang tidak dikunci dengan baik:

- Task Manager bisa dibuka
- app bisa di-End Task
- sign out / switch user lebih gampang
- user bisa masuk ke area desktop normal
- keamanan client bergantung penuh pada app, yang tidak cukup

---

## Rekomendasi Minimum untuk Pilot

Untuk tahap pilot awal, minimal:

- [ ] ada akun `PerpusClient` standard user
- [ ] ada akun `PerpusAdmin` administrator terpisah
- [ ] auto-logon ke `PerpusClient`
- [ ] app auto-start saat logon
- [ ] Task Manager dibatasi
- [ ] admin password kuat

---

## Rekomendasi Menuju Produksi/Publik

Untuk tahap lebih matang:

- [ ] Assigned Access / kiosk policy diuji
- [ ] opsi sign out / switch user dibatasi semampunya
- [ ] watchdog / auto-relaunch dipertimbangkan
- [ ] local logging tersedia
- [ ] SOP maintenance ditulis untuk operator/teknisi

---

## Kesimpulan

Arsitektur aman untuk komputer perpustakaan bukan cuma soal app login user perpustakaan, tapi juga soal **bagaimana Windows account dan policy diatur**.

Pola yang direkomendasikan adalah:

- **PerpusClient** untuk operasional user harian
- **PerpusAdmin** untuk maintenance
- app auto-run di akun public
- policy Windows membatasi escape path

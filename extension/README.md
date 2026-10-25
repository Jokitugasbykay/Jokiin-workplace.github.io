# JOKI.IN Workplace Monitor Chrome Extension (Manifest V3)

Ekstensi browser resmi untuk memantau status operasional, pesanan masuk, dan performa tim **JOKI.IN Workplace** secara ringkas, cepat, dan aman langsung dari toolbar browser Google Chrome.

---

## 1. Fitur Utama

- **Dashboard Ringkas & Statistik Real-Time**:
  - Menampilkan total pesanan, pesanan baru (pending), pesanan sedang diproses, dan pesanan selesai.
  - Ringkasan omset selesai dan saldo admin (apabila diotorisasi).
  - Indikator status koneksi backend dan waktu pembaruan terakhir.
- **Daftar Pesanan & Filter Cepat**:
  - Filter tab: Baru, Diproses, Selesai, Batal.
  - Pencarian instan berdasarkan kode order, nama pelanggan, atau judul tugas.
  - Kartu pesanan rapi dengan badge status warna resmi JOKI.IN.
  - Tombol pintas untuk membuka detail pesanan langsung di website Workplace.
- **Autentikasi Aman & Otomatis**:
  - **Sinkronisasi 1-Klik**: Menarik sesi admin yang sedang aktif dari tab Workplace yang terbuka tanpa perlu memasukkan ulang password.
  - **Login Mandiri**: Opsi login email dan password admin melalui Supabase Auth.
- **Mode Read-Only Murni**:
  - Hanya membaca data tanpa kemampuan mengubah status, membatalkan pesanan, atau melakukan mutasi transaksi.
- **Background Worker & Badge Counter**:
  - Menampilkan jumlah pesanan baru yang menunggu langsung pada ikon toolbar Chrome (badge counter).
  - Interval auto-refresh yang dapat disesuaikan (30 detik, 1 menit, 5 menit, atau manual).

---

## 2. Struktur Berkas Extension

```
extension/
├── manifest.json              # Konfigurasi Chrome Extension Manifest V3
├── popup/
│   ├── popup.html             # Tampilan antarmuka popup monitor (390px)
│   ├── popup.css              # Desain responsif, modern, dan palet warna Workplace
│   └── popup.js               # Kontroler logika tampilan, filter, dan event handler
├── js/
│   ├── config.js              # Kredensial publik Supabase, URL target, dan konstanta
│   ├── storage.js             # Abstraksi penyimpanan chrome.storage.local
│   ├── auth.js                # Pengelola autentikasi, token refresh, dan sinkronisasi tab
│   └── api.js                 # Klien API read-only resmi Supabase PostgREST
├── background/
│   └── service-worker.js      # Background alarm, update badge counter, dan cache
├── icons/
│   ├── icon-16.png            # Ikon toolbar 16x16
│   ├── icon-32.png            # Ikon display 32x32
│   ├── icon-48.png            # Ikon manajemen extension 48x48
│   ├── icon-128.png           # Ikon Chrome Web Store / instalasi 128x128
│   └── logo-jokiin.png        # Aset logo untuk header popup
└── README.md                  # Panduan instalasi dan dokumentasi teknis
```

---

## 3. Cara Memasang di Google Chrome (Developer Mode)

1. Buka browser **Google Chrome**.
2. Masuk ke halaman pengelolaan ekstensi dengan mengetikkan di address bar:
   ```
   chrome://extensions/
   ```
3. Aktifkan saklar **Developer mode** (Mode Pengembang) di pojok kanan atas.
4. Klik tombol **Load unpacked** (Muat yang belum dibongkar) di pojok kiri atas.
5. Arahkan dan pilih folder:
   ```
   C:\Users\Maulana Riski\.gemini\antigravity\scratch\Jokiin-workplace.github.io\extension
   ```
6. Ekstensi **JOKI.IN Workplace Monitor** akan langsung terpasang dan muncul di toolbar Chrome.
7. Klik ikon puzzle di toolbar Chrome, lalu klik pin pada **JOKI.IN Workplace Monitor** agar selalu terlihat di pojok kanan atas browser Anda.

---

## 4. Integrasi Backend & Keamanan

1. **Endpoint Backend Resmi**:
   - Autentikasi: `POST https://xdbnwjvxqtpkoaigedsk.supabase.co/auth/v1/token`
   - Data Pesanan: `GET https://xdbnwjvxqtpkoaigedsk.supabase.co/rest/v1/orders`
   - Data Profil Admin: `GET https://xdbnwjvxqtpkoaigedsk.supabase.co/rest/v1/profiles`
2. **Keamanan Otorisasi (Row Level Security)**:
   - Query dibatasi oleh kebijakan RLS Supabase di mana data pesanan hanya bisa diakses oleh token pengguna yang memiliki atribut `role = 'admin'`.
3. **Tanpa Secret Kunci Pribadi**:
   - Ekstensi hanya menggunakan Publishable / Anon Key Supabase yang aman untuk sisi klien.
   - Token akses disimpan secara terisolasi di `chrome.storage.local`.
4. **Tujuan Tautan Tetap**:
   - Seluruh tautan pembuka pesanan dan dashboard terkunci secara permanen ke repositori dan domain produksi GitHub Pages: `https://jokitugasbykay.github.io/Jokiin-workplace.github.io/`.


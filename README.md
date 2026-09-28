# JOKI.IN Workplace Admin Web & iOS Safari PWA

Untuk deployment GitHub Pages Workplace dan perbaikan login Google, ikuti [OAUTH-SETUP.md](OAUTH-SETUP.md). Panduan tersebut memakai repo yang sudah ada dan menjadi acuan menggantikan opsi deployment umum di bawah.

Aplikasi Web Admin & Progressive Web App (PWA) resmi untuk sistem manajemen operasional **JOKI.IN Workplace**. Dirancang khusus dengan tampilan mobile-first yang responsif, navigasi swipe geser layar yang halus, dukungan penuh untuk **Safari di iPhone (iOS)**, browser Android, dan desktop.

---

## Fitur Utama

1. **Autentikasi & Keamanan Admin**:
   - Login Email & Password Supabase dengan pemulihan sesi 24 jam.
   - **Login dengan Google** (*Sign in with Google OAuth*).
   - Gerbang keamanan: hanya akun dengan `role === 'admin'` pada database yang diberikan hak akses.
   
2. **Navigasi Layar Sentuh & Animasi Halus**:
   - Gesture **Swipe Layar Kanan & Kiri** untuk berpindah tab (*Beranda*, *Pesanan*, *Layanan*, *Bayar*).
   - Animasi slide transisi halus (`tabSlideFromRight` & `tabSlideFromLeft`).
   - Proteksi gesture tepi Safari iOS agar tidak bentrok dengan navigasi browser bawaan.

3. **Manajemen Pesanan (Orders)**:
   - Tab **Proses** (pesanan baru, sedang dikerjakan, revisi) & **Riwayat** (selesai, batal).
   - Fitur **Ambil Pesanan** (*Claim order*) untuk pekerja/admin.
   - Pengatur estimasi pengerjaan otomatis dan batas maksimal sesuai permintaan pelanggan.
   - Tombol langsung **Chat WhatsApp** pelanggan (`wa.me`) dan link folder lampiran Google Drive.
   - Pembaruan status pesanan real-time.

4. **Katalog & Layanan (Services)**:
   - Saklar On/Off aktif/nonaktif layanan dengan toggle switch modern.
   - Tampilan label diskon dan potongan harga.

5. **Pembayaran & Riwayat Keuangan (Payments)**:
   - Data pesanan checkout situs (`payment_orders`) dan pembayaran akun (`payments`).
   - Format mata uang Rupiah standar IDR.

6. **Performa Tim & Analitik (Supervisor)**:
   - Filter Hari ini, 7 Hari, dan 1 Bulan (dengan kontrol geser bulan).
   - Perhitungan otomatis pendapatan kotor, biaya gateway, fee 10% JOKI.IN, dan pendapatan bersih.
   - Grafik interaktif jumlah order & tren pendapatan.
   - Pengatur saldo admin per pekerja via RPC Supabase.

7. **Katalog Promo & Pengaturan**:
   - Hitungan mundur aktif (*countdown timer*) per detik.
   - Saklar banner promo website, buat promo baru, edit kupon, dan atur diskon.
   - Konfigurasi tautan folder Google Drive untuk unggahan lampiran tugas.

---

## Struktur Folder Proyek

```
jokiin-workplace-website/
├── assets/                  # Ikon aplikasi, logo, GIF stempel, QR code
├── css/
│   └── style.css            # Desain styling responsif, tema gelap/terang, animasi
├── js/
│   ├── app.js               # Logika aplikasi, swipe gesture, auth, manajemen data
│   └── supabaseClient.js    # Konfigurasi Supabase Client & hak akses
├── index.html               # Halaman utama aplikasi (SPA)
├── manifest.json            # Web App Manifest untuk instalasi PWA
├── service-worker.js        # Service worker untuk caching & offline support
├── server.js                # Server HTTP Node.js mandiri (zero-dependency)
├── package.json             # Konfigurasi npm package & scripts
├── START-SERVER.bat         # Skrip klik-ganda untuk menjalankan server di Windows
├── .gitignore               # Konfigurasi file yang diabaikan Git
└── README.md                # Dokumentasi proyek
```

---

## Cara Menjalankan di Komputer Lokal

### Menggunakan File Batch (Windows):
Cukup klik ganda (double-click) file:
```
START-SERVER.bat
```

### Menggunakan Terminal / Command Prompt:
```bash
# Menggunakan Node.js langsung:
node server.js

# Atau menggunakan npm:
npm start
```

Server akan aktif di:
- **Komputer ini**: `http://localhost:3000`
- **Jaringan Wi-Fi (untuk HP/iPhone)**: `http://<IP-Lokal-Anda>:3000` (alamat IP otomatis tertera di terminal saat server dijalankan).

---

## Cara Membuka di iPhone (Safari) via Wi-Fi

1. Pastikan iPhone dan komputer Anda terhubung ke **jaringan Wi-Fi yang sama**.
2. Buka aplikasi **Safari** di iPhone.
3. Masukkan alamat IP yang tertera pada terminal server (misal: `http://192.168.1.55:3000`).
4. **Instal ke Layar Utama (PWA Fullscreen)**:
   - Tekan ikon **Share / Bagikan** (kotak dengan panah ke atas di bagian bawah Safari).
   - Gulir ke bawah dan pilih **"Tambah ke Layar Utama" (Add to Home Screen)**.
   - Beri nama (misal: *JOKI.IN Admin*) lalu klik **Tambah**.
   - Buka aplikasi dari Home Screen iPhone Anda. Aplikasi akan terbuka **fullscreen tanpa bilah alamat browser**, persis seperti aplikasi native iOS!

---

## Cara Upload ke GitHub

Ikuti langkah-langkah berikut di terminal (Command Prompt / PowerShell / Git Bash) di dalam folder ini:

1. **Buat Repository Baru di GitHub**:
   - Buka [github.com/new](https://github.com/new).
   - Beri nama repository: `jokiin-workplace-website`.
   - Pilih **Public** atau **Private**.
   - Jangan centang "Initialize this repository with a README" (karena sudah dibuat di sini).
   - Klik **Create repository**.

2. **Hubungkan dan Push ke GitHub**:
   ```bash
   # Masuk ke folder proyek jika belum berada di dalamnya
   cd "C:\Users\Maulana Riski\Downloads\workplace-current\jokiin-workplace-website"

   # Inisialisasi Git
   git init

   # Tambahkan semua file
   git add .

   # Buat commit pertama
   git commit -m "Initial commit: JOKI.IN Workplace Admin Web & iOS Safari PWA"

   # Ubah branch utama menjadi main
   git branch -M main

   # Tambahkan remote repository GitHub Anda (ganti USERNAME dengan akun GitHub Anda)
   git remote add origin https://github.com/USERNAME/jokiin-workplace-website.git

   # Upload (Push) ke GitHub
   git push -u origin main
   ```

---

## Cara Deploy Online Gratis (Akses Dari Mana Saja)

Aplikasi ini adalah situs web statis murni dengan integrasi langsung ke Supabase API, sehingga dapat di-hosting secara gratis tanpa perlu menyalakan komputer terus-menerus:

### Opsi 1: Vercel (Paling Direkomendasikan)
1. Buka [vercel.com](https://vercel.com) dan login dengan akun GitHub Anda.
2. Klik **Add New Project** -> Pilih repository `jokiin-workplace-website`.
3. Klik **Deploy**.
4. Dalam hitungan detik Anda mendapatkan URL publik HTTPS (contoh: `https://jokiin-workplace-website.vercel.app`) yang bisa diakses dari mana pun di Safari iPhone Anda!

### Opsi 2: Cloudflare Pages
1. Masuk ke [dash.cloudflare.com](https://dash.cloudflare.com) -> **Workers & Pages**.
2. Klik **Create application** -> **Pages** -> **Connect to Git**.
3. Pilih repository `jokiin-workplace-website` -> Klik **Save and Deploy**.

### Opsi 3: Netlify
1. Masuk ke [netlify.com](https://www.netlify.com) dan login via GitHub.
2. Pilih **Add new site** -> **Import an existing project** -> Pilih repository Anda.
3. Klik **Deploy site**.

---

## Lisensi & Hak Cipta
Hak Cipta © 2026 JOKI.IN Workplace. Seluruh hak cipta dilindungi undang-undang.

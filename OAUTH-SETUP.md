# Perbaikan login Google Workplace

## Wajib: Supabase Auth URL Configuration

Buka https://supabase.com/dashboard/project/xdbnwjvxqtpkoaigedsk/auth/url-configuration

1. Pertahankan **Site URL** pelanggan yang sudah ada (jokiin.my.id). Jangan menggantinya dengan Workplace.
2. Di **Redirect URLs**, tambahkan persis URL berikut, termasuk huruf besar/kecil pada path dan slash terakhir:

   `https://jokitugasbykay.github.io/Jokiin-workplace.github.io/`

3. Pertahankan semua Redirect URLs pelanggan yang sudah ada, lalu simpan.

Pengaturan dashboard ini belum diubah atau diverifikasi dari sesi ini. Perubahan kode saja belum cukup jika URL tersebut belum diizinkan.

## Google Cloud

Tetap gunakan Authorized redirect URI Supabase yang sama:

`https://xdbnwjvxqtpkoaigedsk.supabase.co/auth/v1/callback`

Jangan mengganti URI callback ini dengan GitHub Pages, menghapus URI pelanggan, atau mengganti Google client ID/secret. Alurnya: Google → callback Supabase → URL aplikasi dalam redirectTo. Tidak perlu proyek Supabase atau kredensial Google baru untuk memisahkan tujuan kembali.

## Temuan dan perubahan

- `index.html` menjalankan `js/app.js`; modul `js/supabaseClient.js` yang tidak digunakan telah dihapus. Perbaikan dilakukan pada kode yang benar-benar dipakai.
- Sebelumnya `redirectTo` memakai `window.location.origin + window.location.pathname`. Tidak ditemukan tujuan jokiin.my.id yang ditulis langsung. Dugaan penyebabnya adalah URL Workplace belum cocok dengan allowlist Supabase, sehingga jatuh ke Site URL pelanggan; ZIP tidak menyertakan konfigurasi Auth dashboard untuk mengonfirmasinya.
- `js/app.js` sekarang memakai konstanta `WORKPLACE_REDIRECT_URL` untuk tujuan Google yang tetap. Membuka `/index.html`, URL dengan query/hash, atau server lokal tetap mengembalikan login Google ke URL GitHub Pages di atas.
- Tiga pemanggilan logout (logout biasa dan penolakan akun non-admin) memakai `scope: 'local'` agar tidak mencabut sesi lain milik pengguna di proyek Supabase yang sama. Pemeriksaan role admin tetap dipertahankan.
- `service-worker.js` memakai cache v2 agar pembaruan login tersedia. Pembersihan cache dibatasi ke awalan cache aplikasi ini.
- Proyek Supabase, publishable key, data, dan kode situs pelanggan tidak diubah. Pemisahan ini untuk redirect dan logout; akun/database tetap bersama. Hak akses data tetap bergantung pada kebijakan RLS yang sudah ada.

## Upload ke GitHub Pages

1. Ekstrak ZIP perbaikan. Salin **isi** folder `jokiin-workplace-website` ke root repo `Jokitugasbykay/Jokiin-workplace.github.io`, mengganti file lama. Jangan menaruhnya di subfolder tambahan.
2. Gunakan deployment GitHub Pages yang sudah ada. Untuk situs statis ini tidak diperlukan build.
3. Di Settings → Pages, hapus Custom domain Workplace jika masih terpasang. Jika repo masih memiliki file `CNAME`, hapus file tersebut juga. ZIP sumber tidak memuat `CNAME`.
4. Tunggu deployment selesai, buka URL Workplace, lalu muat ulang setelah service worker baru terpasang. Jika versi lama masih terlihat, tutup tab/PWA Workplace lalu buka lagi.

## Verifikasi

Jalankan `node test-oauth.cjs` dari folder proyek untuk pemeriksaan lokal tanpa login sungguhan.

Sesudah deployment dan pengaturan Supabase disimpan:

1. Login Google memakai akun admin di Workplace; pastikan kembali ke path GitHub Pages di atas dan dashboard terbuka.
2. Coba akun non-admin; akses Workplace harus ditolak.
3. Login Google di jokiin.my.id; pastikan tetap kembali ke situs pelanggan.
4. Dengan sesi pelanggan tetap terbuka, logout Workplace; pastikan sesi pelanggan masih bisa digunakan.

Pemeriksaan lokal memakai simulasi Supabase. Login Google nyata, allowlist dashboard, dan regresi situs pelanggan belum diuji langsung.

Referensi: https://supabase.com/docs/guides/auth/redirect-urls · https://supabase.com/docs/guides/auth/social-login/auth-google · https://supabase.com/docs/reference/javascript/auth-signout

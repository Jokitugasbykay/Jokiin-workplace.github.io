# Koreksi pembukuan — 25 Oktober 2026

## Temuan dan perubahan

- Angka Rp300.000 berasal dari teks hardcoded pada kartu `Suntikan Modal Bisnis` di `index.html`, bukan hasil agregasi database. Keterangan sebelumnya menyebut total Rp400.000 lalu mengurangi pribadi Rp100.000 lagi. Dikoreksi menjadi pendanaan awal kakak Rp500.000, pribadi Kayla Rp100.000, bisnis Rp400.000.
- Panel pembukuan adalah referensi laporan, bukan saldo bank langsung. `business_bookkeeping_records` dimuat ke state oleh `js/operational-fund.js`, tetapi tidak digunakan untuk mengisi kartu referensi tersebut. Tidak ada penambahan otomatis Rp400.000 ke ledger/inflow.
- Dipertahankan: 12 pesanan, modal pribadi 12 × Rp16.000 = Rp192.000, jual Rp22.000, penerimaan per pesanan Rp21.300, total bersih Rp255.600, laba Rp63.600, saldo penjualan dilaporkan Rp277.700, selisih belum diketahui Rp22.100. Angka penerimaan dan saldo dilaporkan tidak dijumlahkan. Talangan pribadi tidak mengurangi pendanaan bisnis.
- Saldo awal pembukuan Rp0 ditampilkan terpisah dari saldo aktual. Laba dialokasikan ke kas bisnis, pengembalian talangan diklasifikasikan sebagai pelunasan kewajiban. Pernyataan lama bahwa seluruh saldo laporan pasti masih tersedia telah diperbaiki.
- Modul Mayar memakai tabel yang sudah ada `mayar_monthly_withdrawals`. Fungsi render sebelumnya salah terpasang hanya pada klik tab inventori reseller; kini dipanggil dari `renderAll` setelah pemuatan data. Tidak ada modul/tabel kedua.
- Jadwal mengikuti tanggal 25 pada zona Asia/Jakarta, saat koreksi ini 25 Oktober 2026. Form mengikuti bulan berjalan, tidak lagi terkunci ke Oktober selamanya.
- Total pencairan hanya menghitung `success` dengan petugas dan waktu konfirmasi, bruto valid, biaya Rp2.775, serta bersih = bruto − biaya. Catatan berhasil tanpa metadata/nominal valid tetap tampil untuk pemeriksaan, tidak dihitung sebagai dana terkonfirmasi. Referensi tetap opsional jika tidak tersedia.
- Menandai berhasil meminta konfirmasi bahwa transaksi sudah diperiksa dan dana masuk. Tidak otomatis mengeksekusi transfer Mayar. Klik simpan dikunci selama permintaan berjalan; pemeriksaan tanggal aktif yang sudah ada tetap digunakan. Jaminan keunikan lintas perangkat di database belum bisa diaudit.
- Kegagalan membaca Mayar menampilkan belum terverifikasi, bukan nol palsu. Database yang terbaca dan tidak berisi pencairan terkonfirmasi menampilkan Rp0. Tabel menampilkan bruto, biaya, bersih, status, tanggal dan referensi; tabel dapat digeser pada mobile.

## Database dan saldo admin

Tidak ada perubahan database, migrasi, penghapusan transaksi, penambahan pendanaan, atau transaksi withdraw pengujian yang dijalankan. Supabase belum terhubung pada sesi ini. Karena itu saldo aktual Kayla/Riski dan kemungkinan catatan pendanaan Rp300.000 di database belum dapat diperiksa. Tidak ada saldo admin yang dipaksakan menjadi nol. Angka referensi yang diberikan pengguna tidak diperlakukan sebagai bukti mutasi rekening.

Setelah akses tersedia, periksa `profiles.admin_balance` Kayla/Riski, riwayat `admin_withdrawals` dan penyesuaian saldo, `business_bookkeeping_records`, `operational_settings`, `operational_inflows`, serta `mayar_monthly_withdrawals`. Jika saldo salah satu admin belum Rp0, laporkan nominalnya sebelum perubahan. Jika pendanaan tersimpan keliru, koreksi catatan sumber yang sama dengan jejak audit; jangan menambahkan pendanaan baru. Periksa constraint unik dan izin penulisan Mayar sebelum mengklaim pencegahan duplikasi lintas perangkat.

## Validasi

- `node test-bookkeeping.cjs`: lulus untuk angka referensi, perhitungan, total terkonfirmasi, jadwal WIB pada pergantian hari/bulan, error database/pemulihan, penolakan nominal/tanggal salah, duplikasi tanggal aktif, penolakan konfirmasi yang dibatalkan, escaping referensi; database dimock, tidak ada penulisan nyata.
- `node --check js/operational-fund.js`: lulus.
- `node test-withdrawals.cjs`, `node test-invoice.cjs`: lulus.
- Browser Chrome melalui Playwright pada panel HTML/CSS/JS sebenarnya, dengan database dimock: 390px dan 1366px lulus, tidak ada page error/overflow halaman, tabel bisa digeser di dalam panel. Screenshot diperiksa langsung. Ini bukan uji integrasi database produksi.
- `git diff --check`: lulus.

## File

`index.html`, `js/operational-fund.js`, `css/style.css`, `service-worker.js`, `test-bookkeeping.cjs`, dan laporan ini. Skrip pemeriksaan browser lokal berada di `../work/verify-bookkeeping.cjs`, screenshot di `../outputs/bookkeeping-390.png` dan `../outputs/bookkeeping-1366.png`.

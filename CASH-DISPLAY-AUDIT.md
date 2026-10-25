# Audit penyajian saldo kas — 26 Oktober 2026

## Hasil audit

Kartu pembukuan dan kartu operasional mewakili konsep berbeda. Sebelumnya, `Saldo Awal Kas JOKI.IN` ditulis langsung Rp0 di HTML. Kartu `Saldo buku operasional` memakai `operational_fund_summary.current_balance` melalui `fetchOperationalData()` dan `renderKPI()`. Tidak ditemukan penjumlahan kedua kartu, tetapi nama kartu dan sumber nilai pembukanya menimbulkan kesan ada dua kas.

## Sumber kanonis dan fungsi nilai

Semua nilai saldo berasal dari satu objek `opData.summary`, yang dibaca dari view database yang sudah ada, `public.operational_fund_summary`.

- **Saldo Awal Pembukuan**: `initial_fund`. Nilai pembuka yang sudah termasuk dalam saldo berjalan. Tidak ditambah lagi sebagai saldo lain. Diikat melalui `renderKPI()`, tidak lagi berupa Rp0 hardcoded.
- **Saldo Kas Operasional**: `current_balance`, hanya ditampilkan sebagai kas setelah sumber dana terkonfirmasi. Selama rekonsiliasi atau gagal membaca summary, tampil `—` dengan alasan. Saldo buku tetap disebutkan dalam keterangan untuk melacak rumusnya: `max(0, initial_fund + total_inflow − total_spent)`.
- **Dana Siap Dialokasikan**: `allocation_basis`. Nama lama `Sisa kas tersedia` diganti untuk memperjelas bahwa ini bagian dari kas setelah kewajiban domain dipisahkan, bukan kas tambahan.

Query baca produksi saat audit: pembuka Rp0, pemasukan tercatat Rp11.000, pengeluaran Rp0, saldo buku Rp11.000, `allocation_ready=false`, basis alokasi Rp0. Tidak ada klaim bahwa Rp11.000 sudah terkonfirmasi sebagai saldo rekening. Tidak ada perubahan database, migrasi, fungsi transaksi, saldo admin, pendanaan, atau catatan Mayar pada pekerjaan ini.

Data pendanaan Rp400.000, talangan Rp192.000, laba Rp63.600, saldo penjualan Rp277.700 dan fitur Mayar tetap menggunakan alur yang sudah ada. Angka referensi tidak ditambahkan lagi ke rumus kas. Tidak ada komponen baru atau perubahan desain halaman.

## Pengujian

- `node test-operational-allocation.cjs`: lulus. Menguji saldo awal Rp0 dan Rp5.000, saldo berjalan Rp47.003 tetap Rp47.003 (bukan Rp52.003), pembaruan nilai, status belum terkonfirmasi, kegagalan pemuatan, sumber kanonis, nilai referensi, dan tidak ada pemanggilan penulisan transaksi.
- `node test-bookkeeping.cjs`: lulus. Pemeriksaan lama yang mengharuskan Rp0 statis diperbarui karena nilai pembuka sekarang dibaca dari database; kasus nilai nol dan nonnol diuji pada tes alokasi.
- Pemeriksaan sintaks JS dan `git diff --check`: lulus.
- Chrome/Playwright pada HTML/CSS/JS Keuangan sebenarnya dengan fixture database: 390px dan 1366px lulus, tidak ada overflow halaman atau page error, state pending dan terkonfirmasi ditampilkan sesuai sumber. Screenshot ringkasan desktop dan mobile diperiksa langsung. Pengujian browser tidak melakukan transaksi produksi.

## File yang berubah

`index.html`, `js/operational-fund.js`, `service-worker.js`, `test-operational-allocation.cjs`, `test-bookkeeping.cjs`, dan laporan ini. Skrip browser lokal `../work/verify-operational-allocation.cjs` diperbarui; bukti gambar `../outputs/cash-summary-390.png` dan `../outputs/cash-summary-1366.png`.

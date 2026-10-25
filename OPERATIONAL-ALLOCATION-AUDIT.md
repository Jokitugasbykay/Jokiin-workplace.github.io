# Audit alokasi operasional — 26 Oktober 2026 WIB

## Penyebab Rp24.196

Database memiliki lima pos variabel: empat × Rp2.639 dan satu × Rp2.640 = Rp13.196 tanpa sumber saldo awal. Fungsi `trigger_sync_operational_inflow` menambahkan pembagian pemasukan aktif ke angka bawaan tersebut. Lima inflow aktif masing-masing Rp2.200 menghasilkan Rp11.000; satu inflow Rp5.000 sudah direfund dan tidak dihitung. Hasil tersimpan adalah Rp4.840 + empat × Rp4.839 = **Rp24.196**. Ini anggaran tersimpan, bukan kas aktual.

Di sisi frontend, donut menjumlahkan `allocated_amount` dari anggaran tersebut, sedangkan kartu kas menghitung ulang `initial_fund + inflows − expenses` = Rp11.000. Caption grafik masih menyebut Rp13.196 dan fallback frontend juga memiliki Rp2.639/Rp2.640 serta fallback promo/bonus lain. Karena itu beberapa komponen memiliki sumber yang berbeda.

Angka Rp300.000 ditemukan dalam catatan `capital_injection` database: bruto Rp400.000, neto Rp300.000. Sumber ini dikoreksi pada baris yang sama menjadi bruto Rp500.000 dan neto Rp400.000. Deskripsi lama dipertahankan dengan tambahan catatan koreksi. Tidak ada inflow Rp400.000 baru. Preset tarik saldo Rp300.000 dan angka dalam tes bukan pendanaan bisnis dan tetap dipertahankan.

## Perbaikan yang sudah diterapkan

- Dua view yang sudah ada diperbaiki dalam migrasi `20261025172106_project_operational_allocations_from_reconciled_pool`. Tidak membuat tabel atau fitur kedua. Data transaksi, anggaran mentah, policy, dan trigger lama dipertahankan.
- `operational_fund_summary` menjadi sumber saldo buku, pengeluaran aktual, kewajiban domain, status rekonsiliasi, dan basis alokasi. Dana kakak, laporan penjualan, talangan, laba, serta selisih tidak dijumlahkan kembali ke kas.
- Basis dapat dialokasikan hanya setelah setting `allocation_reconciliation_status` dikonfirmasi `verified` berdasarkan rekonsiliasi aktual. Saat ini belum ada konfirmasi tersebut; sistem menampilkan **menunggu rekonsiliasi**, bukan menganggap saldo buku atau penjualan tersedia untuk dibelanjakan. Tidak ada setting verifikasi yang dibuat atau diaktifkan untuk memaksakan alokasi.
- Saat terkonfirmasi: basis = floor(max(0, saldo buku setelah pengeluaran − sisa kewajiban domain)). Sisa kewajiban = max(0, Rp22.000 − pembayaran domain aktual). Domain belum dibayar tidak menjadi pengeluaran; saat dibayar, kewajiban turun bersamaan dengan kas sehingga tidak dipotong dua kali.
- `operational_budgets_status` menghitung ulang lima sisa kategori dari basis yang sama. Target masing-masing 20%; floor(basis/5), lalu sisa rupiah dibagi menurut urutan ID kategori agar selisih antarpos maksimal Rp1 dan jumlah tepat sama dengan basis. Anggaran versus realisasi memperlihatkan realisasi historis ditambah sisa alokasi; donut memperlihatkan sisa, bukan mengulang anggaran yang sudah dibelanjakan.
- Frontend memakai summary database, menghapus fallback anggaran fiktif, menolak proyeksi yang tidak cocok saat data berubah selama pemuatan, dan menghitung ulang semua komponen melalui `renderAll`.
- Promo, bonus, reseller, darurat, AI, grafik dan kartu kas menampilkan nominal belum ditetapkan selama rekonsiliasi. Aksi pengeluaran di Workplace diblokir selama status tersebut. Kartu referensi pendanaan, talangan, laba, dan saldo penjualan mengambil nilai dari baris pembukuan tanpa menjumlahkannya.
- Subscription mencakup perubahan pembukuan. Grafik tidak menggambarkan pembagian nominal yang belum sah. Struktur/desain halaman dipertahankan; label baris pada mobile diberi ruang membungkus agar tidak bertumpuk.

## Hasil database produksi

Saldo awal Rp0; pemasukan operasional tercatat Rp11.000; pengeluaran aktual Rp0; saldo buku Rp11.000; dasar alokasi belum dikonfirmasi; nominal alokasi belum ditetapkan. Domain Rp22.000, belum dibayar, jatuh tempo 12 September 2027. Saldo penjualan referensi Rp277.700, laba Rp63.600, talangan Rp192.000 dan selisih Rp22.100 tetap dipertahankan. Jumlah catatan pembukuan tetap 6. Saldo Kayla **Rp0**, Riski **Rp0**. Tidak ada saldo admin atau withdraw yang diubah oleh pekerjaan ini.

Saat pembacaan awal, tabel Mayar kosong. Pada pemeriksaan akhir terdapat satu pencairan jadwal 25 Oktober 2026: bruto Rp252.990, biaya Rp2.775, neto Rp250.215, status success, petugas/waktu konfirmasi dan referensi terisi. Catatan masuk selama audit dari aktivitas lain; tidak dibuat oleh tes atau perbaikan ini. Dipertahankan tanpa dihitung lagi sebagai pemasukan kas operasional. Metadata pencairan bukan pengganti rekonsiliasi mutasi rekening. Tes browser memakai snapshot audit awal yang belum berisi catatan ini.

## Batas perubahan fungsi produksi

Pemeriksaan otomatis menolak migrasi luas yang mencakup policy/trigger dan menolak usulan mengganti teks definisi fungsi transaksi. Versi aman yang hanya memperbaiki view serta koreksi pendanaan diterapkan. Fungsi transaksi lama masih utuh: trigger inflow dapat menulis angka warisan pada tabel anggaran mentah, tetapi view/dashboard tidak menggunakan nominal warisan tersebut sebagai dasar alokasi.

`record_reseller_purchase` lama masih memeriksa anggaran mentah. Karena itu perbaikan pemeriksaan alokasi di fungsi transaksi produksi masih memerlukan persetujuan sebelum diubah. Jangan mengklaim bahwa semua API lama kini menegakkan gate rekonsiliasi di server; gate saat ini berlaku di Workplace dan proyeksi pembacaan database. Sebelum mengaktifkan alokasi atau membuka kembali pembelian reseller, ubah pembacaan anggaran fungsi tersebut ke `operational_budgets_status` dengan definisi eksplisit yang ditinjau, dan bersihkan konstanta seed pada trigger inflow melalui perubahan yang ditinjau. Jangan mengubah transaksi historis untuk tujuan ini.

## Pengujian

- `supabase/test-operational-allocation.sql`: lulus pada database aktual. Menguji basis 0,1,2,4,5,24.196,63.600,100.003; total tepat, selisih rupiah ≤1, perubahan saldo, status pending, domain belum dibayar bukan pengeluaran, pembayaran domain sekali, pengeluaran kategori sekali. Seluruh fixture berada dalam BEGIN/ROLLBACK. Verifikasi setelah tes: 0 baris uji, pengeluaran tetap 0, setting awal tetap 0.
- Query sebagai role authenticated/Kayla berhasil membaca summary, enam kategori, serta modal bisnis Rp400.000.
- `node test-operational-allocation.cjs`: lulus; sumber DB konsisten, state pending/verified, pergantian saldo, kegagalan fetch, proyeksi berubah saat dimuat, blokir pengeluaran pending, referensi pembukuan. Fixture disalin dari audit DB dan tidak memuat identitas admin.
- `node test-bookkeeping.cjs`, `node test-withdrawals.cjs`, pemeriksaan sintaks JS, dan `git diff --check`: lulus.
- Chrome/Playwright, HTML/CSS/JS Keuangan sebenarnya dengan fixture audit DB: 390px dan 1366px lulus; state pending dan verified, kelima irisan grafik, kartu dan subsystem sinkron, tanpa overflow halaman/page error. Screenshot diperiksa; pengujian browser tidak melakukan transaksi produksi.

Advisory lama mengenai view SECURITY DEFINER dan fungsi/policy operasional tetap menjadi temuan di luar perubahan izin sesi ini. [Dokumentasi advisory view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

## File

`js/operational-fund.js`, `index.html`, `service-worker.js`, migrasi dua view, `supabase/correct-business-capital.sql`, `supabase/test-operational-allocation.sql`, `test-operational-allocation.cjs`, `test-allocation-fixture.json`, laporan ini. Pemeriksaan browser: `../work/verify-operational-allocation.cjs`. Bukti tampilan: `../outputs/allocation-charts-390.png` dan `../outputs/allocation-charts-1366.png`.

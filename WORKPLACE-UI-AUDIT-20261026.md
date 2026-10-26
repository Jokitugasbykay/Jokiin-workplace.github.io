# Keuangan, dropdown dan diagram — 26 Oktober 2026

## Perubahan ringkasan Keuangan

Empat kartu lama dihapus dari HTML dan fungsi `renderKPI` dihapus. Dependensinya hanya penyajian; data `opData.summary` tetap dipakai alokasi, domain dan rekonsiliasi. Saldo awal pembukuan tetap terikat ke summary tersebut melalui renderer pengganti.

Satu section **Ringkasan Arus Kas Bulanan** menggantikan keempat kartu. Tersedia total pemasukan/pengeluaran, rincian kategori, filter bulan WIB, filter kategori riwayat, tabel tanggal/jenis/kategori/nominal/status/keterangan, serta rekonsiliasi saldo. Filter kategori hanya mengubah tabel, bukan mengubah arti total seluruh bulan. Input bulan yang dikosongkan dikembalikan ke bulan terakhir yang valid.

`js/monthly-cashflow.js` memisahkan perhitungan murni dan penyajian. `fetchOperationalData` memakai pembacaan berpaginasi 500 baris dan urutan ID tetap untuk sumber transaksi agar jumlah tidak berhenti diam-diam pada batas 1.000 baris. Kegagalan salah satu sumber membuat total tidak tersedia (`—`), bukan nol palsu. Query tetap memakai Supabase client, hak akses dan RLS yang sudah ada; tidak ada service key, endpoint baru, migrasi, perubahan policy atau otorisasi.

### Sumber dan pencegahan hitung ganda

- `payment_orders`: penerimaan berstatus dibayar memakai `paid_at`. Nominal merupakan bruto penjualan sebelum biaya gateway yang belum direkonsiliasi.
- `payments`: transaksi pembayaran tercatat yang tidak merupakan salinan checkout dengan kode order sama. `orders` dipakai menghubungkan ID/kode; order PAID tanpa bukti waktu penerimaan ditampilkan untuk pemeriksaan dan tidak diberi tanggal bayar rekaan dari waktu pembuatan order. Tanggal pencatatan dipakai hanya untuk menempatkan catatan pemeriksaan pada filter bulan.
- `business_bookkeeping_records`: hanya `capital_injection`/`other_cash_income` yang diperlakukan sebagai penerimaan pembukuan jika status verified, menurut tanggal pencatatan. Pendanaan memakai neto bisnis Rp400.000, bukan bruto Rp500.000 dan tidak mengurangi pribadi Rp100.000 lagi. Tanggal pencatatan ini tidak diklaim sebagai tanggal mutasi bank.
- Kategori laba, kewajiban modal pribadi, alokasi pribadi, saldo penjualan dilaporkan, dan selisih rekonsiliasi tidak menjadi penerimaan baru. Referensinya tetap ada di panel Pembukuan & Rekonsiliasi.
- `operational_expenses`: sumber pengeluaran aktual. Pengembalian modal dibedakan jika kategori transaksi memang `capital_repayment`, `admin_capital_repayment`, atau `order_cogs_repayment`; kewajiban Rp192.000 tidak disulap menjadi pengeluaran yang telah terjadi.
- `operational_reseller_transactions`: penjualan reseller menambah omzet; belanja stok tidak dihitung lagi karena telah dibuatkan baris pengeluaran operasional. Biaya pembayaran penjualan reseller dipisahkan dari omzet.
- `mayar_monthly_withdrawals`: pencairan terkonfirmasi ditampilkan sebagai transfer internal, bukan omzet atau pemasukan tambahan. Hanya biaya tercatat Rp2.775 yang masuk pengeluaran, sekali. Konfirmasi memerlukan status sukses, petugas/waktu dan bruto − biaya = neto. Referensi/nominal ganda pada dua ID tetap ditampilkan untuk pemeriksaan dan total menjadi belum pasti; catatan tidak dihapus. Jika ada biaya Mayar di tabel pengeluaran sekaligus sumber Mayar, total juga menunggu pemeriksaan agar tidak menjumlahkan dua sumber yang mungkin sama.
- Rekonsiliasi menampilkan saldo buku operasional dari view yang sudah ada dengan cakupan eksplisit. Nilai ini tidak diklaim sebagai saldo penutup seluruh bisnis berdasarkan mutasi bulanan. Rekening aktual tetap `—` dan **Belum Direkonsiliasi**, karena belum ada sumber mutasi rekening terverifikasi.

### Hasil audit data aktual

Terdapat 12 order PAID; 7 memiliki checkout PAID dengan waktu penerimaan. Omzet bertanggal Rp154.000 dan pendanaan pembukuan Rp400.000 memberi jumlah bertanggal Rp554.000, tetapi total pemasukan lengkap tetap belum diketahui karena 5 order PAID tidak mempunyai waktu penerimaan. Bukan dipaksa menjadi angka referensi Rp277.700 atau Rp255.600.

Pengeluaran operasional tercatat 0 baris; Mayar memiliki satu pencairan bruto Rp252.990, biaya Rp2.775, bersih Rp250.215. Biaya ditampilkan pada bulan konfirmasi dalam WIB; tanggal jadwal Mayar tetap 25 Oktober 2026 pada modul lama. Nominal pengeluaran bulanan bertanggal saat audit Rp2.775. Saldo buku operasional masih Rp11.000 dan bukan bukti saldo rekening aktual.

Pemeriksaan akhir: 6 baris pembukuan tetap ada, modal bisnis Rp400.000, talangan Rp192.000, laba Rp63.600, saldo laporan Rp277.700, serta pencairan Mayar tetap utuh. Semua operasi database pekerjaan ini hanya SELECT. Tidak ada transaksi dummy, reset saldo, penulisan produksi, atau penghapusan audit trail.

## Audit seluruh dropdown

Ditemukan **11 lokasi definisi select**: 10 elemen statis dan 1 template berulang. Seluruhnya sekarang menggunakan aturan `select:is(.form-input, .form-select)` yang sama; enam lokasi `form-select` sebelumnya tidak dicakup styling picker lama.

| Lokasi | Kontrol |
| --- | --- |
| Ringkasan arus kas | `cf-category` |
| Riwayat operasional | `op-filter-category` |
| Pelanggaran | `violation-admin`, `violation-status` |
| Invoice | `invoice-order-picker` |
| Modal pengeluaran | `expense-category-input` |
| Modal bonus | `bonus-admin-input` |
| Modal penjualan reseller | `reseller-sale-product-select` |
| Modal Mayar | `mayar-withdraw-status-select`, `update-mayar-status-select` |
| Kartu pesanan dinamis | `.order-status-select` pada `createOrderCard` |

Perbaikan bersama: warna/border/radius/arrow, lebar aman, target sentuh minimal 44px, focus ring, hover, disabled, error yang tidak dikalahkan border inline, dan pembungkusan teks opsi panjang. Label aksesibel ditambahkan pada filter operasional, invoice, dan status pesanan. Nilai/opsi bisnis tidak diubah.

Browser yang mendukung `appearance: base-select` memakai picker di top layer, sehingga tidak dipotong overflow container/modal. Lebar mengikuti kontrol dan viewport, tinggi dibatasi untuk scrolling. Browser tanpa dukungan tetap memakai popup native dan styling kontrol dengan chevron; popup OS tidak dipaksakan menjadi custom JS. Tidak ada dependency tambahan. Aplikasi belum menyediakan tema gelap, sehingga tidak ditambahkan tema baru.

Audit seluruh sumber HTML/JS/TSX/CSS tidak menemukan menu select custom lain. Menu profil/navigasi memakai drawer bersama; handler existing menutup menu setelah navigasi dan Escape. Tidak diubah menjadi dropdown baru.

## Diagram interaktif

Donut, legenda, dan baris kategori variabel sekarang dapat dipilih dengan klik, Enter, atau Space. Irisan terpilih bergeser keluar, irisan lain meredup, legenda serta baris anggaran tersorot, dan teks tengah berganti dengan fade 180ms. Klik ulang/Escape menghapus pemilihan. Focus tetap di kontrol yang dipakai. Path SVG dan tombol memiliki nama aksesibel serta `aria-pressed`.

Saat rekonsiliasi tertunda, cincin berwarna menggambarkan **target 20%**, disertai keterangan belum tersedia/menunggu verifikasi; tidak menggambarkan nominal kas yang dibuat-buat. Saat terverifikasi, irisan memakai sisa alokasi sebenarnya. Kewajiban domain tidak masuk donut. `prefers-reduced-motion` menonaktifkan transisi dan animasi teks.

## Tes dan bukti

- Seluruh **13 berkas `test-*.cjs`** lulus, termasuk tes baru arus kas, pembukuan, alokasi, invoice, autentikasi, navigasi, notifikasi, peran, dan grafik.
- `test-monthly-cashflow.cjs`: sumber dana terpisah, salinan checkout/payment/order tidak ganda, laba/talangan tidak menjadi penerimaan, Mayar transfer/fee sekali, referensi ganda ditandai, tanggal WIB melewati batas bulan, nilai/tanggal tidak diketahui, pembacaan >1.000 baris, error sumber, kartu lama hilang.
- Pemeriksaan sintaks JS dan `git diff --check` lulus.
- Chrome/Playwright pada viewport **320, 375, 390, 768, 1366px**: semua 11 definisi select diuji pilihan/nilai/opsi tidak hilang/fokus/disabled/error/validasi; picker asli dalam modal diuji buka, pilih dengan keyboard, Escape, klik di luar picker, dan lebar viewport. Diagram diuji klik/keyboard/toggle/highlight/reduced motion. Filter bulan/kategori dan total memakai snapshot baca DB aktual. Drawer diuji Escape dan navigasi invoice lalu menutup. Tidak ada error JavaScript, horizontal overflow halaman, atau pemanggilan write.
- Screenshot ditinjau langsung: `../outputs/chart-interactive-390.png`, `../outputs/dropdown-modal-320.png`, `../outputs/monthly-cashflow-1366.png`. Bukti ukuran lain disimpan pada folder outputs yang sama.
- Skrip browser: `../work/verify-workplace-ui.cjs`, dengan fixture audit baca `../work/cashflow-db-fixture.json`; tidak memuat sesi auth, API secret atau data kontak pelanggan. Ini bukan pengujian keyboard virtual pada perangkat fisik.

## File di repo

`index.html`, `css/style.css`, `js/app.js` (label aksesibel), `js/operational-fund.js`, `js/monthly-cashflow.js` (baru), `service-worker.js`, `test-monthly-cashflow.cjs` (baru), `test-bookkeeping.cjs`, `test-operational-allocation.cjs`, dan laporan ini.

## Yang masih memerlukan data

Waktu penerimaan lima order PAID, biaya gateway penjualan yang cocok dengan bukti, dan saldo rekening aktual belum tersedia. Ditandai untuk rekonsiliasi; tidak dikarang atau ditulis balik ke produksi. Popup native pada browser yang belum mendukung customizable select mengikuti OS. Perubahan fungsi/policy transaksi yang tertunda dari audit sebelumnya tidak dijalankan dalam pekerjaan UI ini.

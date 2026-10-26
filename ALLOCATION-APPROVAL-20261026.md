# Pembagian alokasi kas sesuai instruksi pengguna

Instruksi: kas dikurangi cadangan domain, lalu lima kategori masing-masing 20%.

- Kas: Rp463.600 = modal Rp400.000 + laba bersih Rp63.600.
- Cadangan domain yang belum dibayar: Rp22.000, terpisah dari diagram lima kategori.
- Basis alokasi: Rp441.600.
- AI/tools, bonus tim, dana darurat, promo, reseller: masing-masing **Rp88.320** (20%). Jumlah lima kategori tepat Rp441.600.

Penyebab nominal belum tampil: view sebelumnya selalu mengembalikan allocation_ready=false/basis=0, dan frontend mencampurkan persetujuan anggaran dengan status verifikasi rekening. Kini approval anggaran mengikuti rumus yang dikonfirmasi pengguna; status rekonsiliasi bank tetap pending dan actual_cash_verified=false. Pengeluaran tetap memakai guard rekonsiliasi yang sudah ada. Alokasi anggaran tidak dianggap bukti pembayaran/pengeluaran.

Migrasi produksi **20261026082534_allocate_confirmed_business_cash_five_equal_categories** diterapkan sesuai instruksi langsung pengguna. Hanya proyeksi view yang diubah. Raw transaksi, saldo sumber pembukuan, cadangan, status pembayaran domain tidak diubah. Expense dan konfirmasi domain tetap 0.

View siap alokasi hanya bila sumber saldo valid rupiah bulat dan set kategori tepat lima ditambah domain. Sumber modal/laba ambigu atau hilang tetap ditolak. Basis memiliki floor nol; kas dan kas bebas tidak di-floor. Pembulatan tetap deterministik melalui view kategori yang sudah ada.

Frontend membedakan allocationError dari spendingError, memvalidasi basis/semua kategori dan sumber persetujuan, lalu menampilkan nominal dan diagram aktual. Status pending rekening tidak menghapus anggaran yang sudah disetujui. Guard backend pengeluaran tidak dilonggarkan.

Tes: 17 berkas test root, PostgreSQL/WASM terisolasi, serta browser 390/1366px. Lima nominal 88320 dan jumlah441600, source approval, bank pending, sumber duplikat/invalid, diagram/semua kartu sinkron diuji. Pengeluaran ketika bank belum direkonsiliasi tetap ditolak. Pemeriksaan produksi READ ONLY sebagai authenticated Founder memverifikasi lima kategori88320, total441600, kas463600, domain22000 dan status pending. Tidak ada pembayaran produksi untuk tes.

File: js/operational-fund.js, index.html, service-worker.js, migrasi20261026082534, supabase/enable-business-allocation.sql (pointer), supabase/test-operational-server.cjs, test-domain-reserve.cjs, laporan ini. Browser: ../work/verify-business-allocation-ui.cjs, screenshot ../outputs/business-allocation-{390,1366}.png.

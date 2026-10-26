> Pembaruan saldo setelah koreksi pengguna: kas kini Rp463.600 = modal Rp400.000 + laba Rp63.600, kas bebas Rp441.600. Lihat CASH-SYNC-20261026.md. Angka Rp11.000 di bawah adalah hasil audit sebelum perubahan definisi sumber kas, dipertahankan sebagai riwayat.

# Dana Cadangan Domain — Implementasi dan pengujian

Tanggal audit: 26 Oktober 2026. Baseline Git: ab630ef.

## Status implementasi

Frontend diterapkan dan diuji di codebase. Setelah persetujuan eksplisit pengguna, backend konfirmasi/reservasi **diterapkan ke Supabase produksi** melalui migrasi 20261026075521_workplace_domain_reserve_and_operational_guards_v2. SQL yang sama diuji pada PostgreSQL terisolasi. Tidak ada perubahan saldo, transaksi, riwayat, atau status verifikasi produksi; tidak ada pembayaran percobaan produksi.

## Sumber aktual yang diperiksa

Query SELECT produksi pada **26 Oktober 2026, 14:33:26 WIB**:

- `operational_fund_summary`: saldo awal Rp0, inflow operasional Rp11.000, expense Rp0, saldo buku Rp11.000, cadangan domain Rp22.000, allocation_ready=false, reconciliation_status=pending.
- `operational_expenses WHERE category_id='domain'`: kosong.
- `operational_settings`: hanya key initial_fund; tidak ada bukti saldo aktual/verifikasi.
- Tidak ditemukan relasi public bernama reserve/reconciliation/bank pada pemeriksaan katalog. Tidak ditemukan sumber saldo rekening aktual dalam alur yang diperiksa; tidak menganggap Rp11.000 sebagai saldo bank seluruh bisnis.
- Definisi RPC `pay_domain_obligation(text,text)` diperiksa ulang: langsung INSERT expense dan UPDATE status setelah memeriksa saldo/flag, tanpa bukti pembayaran. Workplace tidak memanggil RPC ini.

## Rumus dan tampilan

| Nilai | Definisi |
|---|---|
| Kas buku | Saldo awal + inflow aktif − expense; nilai negatif dipertahankan |
| Saldo kas aktual | Sumber kas/rekening yang terverifikasi; saat ini **belum diketahui**, bukan Rp0 |
| Cadangan domain | Rp22.000, tujuan perpanjangan jokiin.my.id, jatuh tempo 12 September 2027 |
| Status aktif | **Dicadangkan, belum dibayar** |
| Total cadangan aktif tercatat | Saat ini hanya domain. Tidak menjumlahkan lima target kategori sebagai cadangan baru |
| Kas bebas aktual | Kas aktual − total cadangan aktif; nullable bila kas aktual belum diketahui, negatif tidak di-floor |
| Proyeksi kas bebas dari buku | Kas buku − total cadangan aktif, ditampilkan terpisah dari kas aktual |
| Dana memenuhi syarat alokasi | Tetap pending sampai sumber actual cash, kewajiban/cadangan, dan rekonsiliasi sah lengkap |

Pada data saat ini: kas buku Rp11.000, cadangan Rp22.000, **proyeksi kas bebas buku −Rp11.000**. Kas aktual dan kas bebas aktual tetap belum diketahui. Ini tidak membuktikan dana berada pada rekening/dompet terpisah.

Kartu domain kini memisahkan semua nilai tersebut, menandai defisit dengan warna merah, dan menjelaskan bahwa cadangan bukan pengeluaran atau transfer. Diagram lima target 20% tidak berubah menjadi dana tersedia hanya karena cadangan telah ditetapkan.

## Perbaikan dibanding implementasi sebelumnya

- Sebelumnya jumlah expense domain dapat mengurangi cadangan atau menunjukkan paid tanpa bukti terlindungi. Kini expense legacy/flag budget saja **tidak** menyelesaikan cadangan. Tetap Rp22.000 sampai ada konfirmasi sah; expense historis tanpa bukti harus direkonsiliasi, bukan dicatat ulang.
- Bukti konfirmasi dilindungi pada tabel private usulan `operational_domain_payments`: due_date unik, nominal tepat Rp22.000, referensi pembayaran unik, sumber pembayaran, paid_at, verified_at, verifier auth.uid, dan expense_id unik dengan FK deferred. Tidak ada row awal/verified buatan.
- RPC usulan `workplace_confirm_domain_payment` hanya menerima founder/supervisor, referensi/sumber/waktu yang valid, dan pemeriksaan keberhasilan yang eksplisit. Ia **mencatat pembayaran yang SUDAH terjadi**, tidak melakukan transfer uang atau memeriksa bank secara otomatis.
- Bukti dan expense Rp22.000 dicatat dalam satu transaksi dengan lock ledger bersama. Referensi identik untuk kewajiban yang sama mengembalikan record semula; referensi/payload berbeda pada kewajiban yang sudah diselesaikan ditolak. Due date dan expense/reference unik mencegah pencatatan ulang.
- Konfirmasi gagal, bukti kosong, tanggal future/infinity, role tidak sah, atau checkbox pemeriksaan false tidak menyelesaikan cadangan/tidak mengurangi kas. Bila penulisan gagal, transaksi rollback.
- Bila expense domain lama sudah ada tanpa bukti, RPC menolak menambah expense. Diperlukan rekonsiliasi baris historis tersebut secara terpisah; tidak dihapus atau diubah oleh pekerjaan ini.
- Setelah konfirmasi sah: saldo buku berkurang sekali melalui expense, domain_reserved menjadi Rp0, total cadangan aktif ikut turun. Kas bebas tidak dikurangi lagi saat reload. Saldo bank aktual tetap memerlukan sumber verifikasi; receipt pembayaran bukan bukti saldo rekening tersisa.
- Tidak ada pembatalan cadangan tanpa otorisasi/bukti. Alur pembatalan legal belum disediakan; status raw budget tidak dapat digunakan untuk membebaskan cadangan.

## Kompatibilitas dan batas produksi

Frontend dan backend kini memakai kontrak `allocation_guard_version=2`. Tombol konfirmasi membuka form **Konfirmasi bukti pembayaran**, bukan langsung memotong kas. Referensi, sumber, waktu pembayaran, dan pernyataan pemeriksaan wajib diisi. Nama pemeriksa tidak dipercaya dari browser; server memakai auth.uid.

Patch sengaja tetap allocation_ready=false dan actual_cash_balance/free_cash_balance=NULL: bukti domain bukan rekonsiliasi seluruh kas. Membuka alokasi memerlukan sumber saldo aktual terlindungi beserta rekonsiliasi semua kewajiban, identitas pemeriksa, referensi, waktu, dan invalidasi ketika transaksi material berubah. Tidak mengarang nilai bank untuk mengaktifkan grafik.

Migrasi forward diterapkan sesudah persetujuan pengguna terhadap tabel bukti, perubahan view/RLS/RPC, dan penguatan guard. Versi 20261026075521 berasal dari riwayat migrasi database, bukan timestamp yang dikarang. File migrasi historis tidak diubah pada tugas ini. Artifact .proposed.sql sekarang hanya menunjuk SQL kanonis yang telah diterapkan.

## Hasil tes yang benar-benar dijalankan

- **17 file test-*.cjs root: lulus.** Cakupan lama dipertahankan; fixture positif memakai kontrak sumber terverifikasi tiruan versi 2.
- `test-domain-reserve.cjs`: Rp100.000−Rp22.000=Rp78.000; Rp22.000−Rp22.000=Rp0; Rp15.000−Rp22.000=−Rp7.000 dan saldo kas Rp15.000 tetap. Kas aktual tidak diketahui tidak dijadikan nol. Rekonsiliasi pending tetap blocked. Konfirmasi gagal tidak berubah; berhasil dan reload tidak mengurangi cadangan dua kali; expense legacy tanpa bukti tidak membebaskan cadangan.
- `supabase/test-operational-server.cjs`: SQL patch dikompilasi/dijalankan di PostgreSQL/WASM disposable. Tiga kasus kas/free-cash, successful confirmation, retry record identik, hanya satu domain expense, failed confirmation tidak mengubah kas, kegagalan INSERT setelah attestation rollback tanpa meninggalkan bukti/settlement, referensi berbeda setelah selesai ditolak, source permissions/RLS dan numeric/category guards lulus. Actual bank balance tetap NULL pada sumber SQL tanpa verifikasi.
- Gate verifikasi positif pada test SQL merupakan stub di database disposable, bukan perubahan produksi. Receipt/date/identity test semuanya dummy terisolasi.
- Pemeriksaan sintaks JS dan git diff --check lulus.
- Pengujian browser berada pada `../work/verify-domain-reserve-ui.cjs`: desktop/mobile, kartu defisit, form bukti, checkbox wajib, dan konfirmasi gagal memakai RPC tiruan. Lulus pada 320/375/390/768/1366px; tambahan modal bukti 320/390/1366px, checkbox wajib dan kegagalan konfirmasi tanpa perubahan kas lulus. Screenshot modal 320px ditinjau. Browser menemukan override tombol domain yang sebelumnya terikat ke allocationError; diperbaiki agar pencatatan bukti dan rekonsiliasi seluruh kas tetap terpisah.

Belum diuji: dua koneksi PostgreSQL sungguhan yang berlomba, verifikasi receipt di bank/provider, dan pembayaran berhasil sungguhan produksi (sengaja tidak membuat transaksi untuk tes). Runtime PostgreSQL pengujian dipin di folder work terpisah; bukan dependency aplikasi. Tidak menjalankan SQL legacy yang memutasi produksi.

## File yang berubah pada tugas ini

- `js/operational-fund.js`: kalkulasi reserve/free cash, pemisahan aktual/buku, status reserve, kontrak v2, form/RPC konfirmasi yang idempotensinya ditangani backend.
- `js/monthly-cashflow.js`: saldo aktual yang benar-benar terverifikasi dapat ditampilkan dari sumber sama; tidak hardcode unknown bila sumber tersedia.
- `index.html`: informasi cadangan dan form bukti memakai modal yang sudah ada dalam design system; query version untuk cache.
- `service-worker.js`: versi cache.
- `supabase/operational-allocation-hardening.proposed.sql`: sumber cadangan terlindungi dan konfirmasi atomik/idempotent; **diterapkan melalui migrasi resmi setelah persetujuan**.
- `supabase/test-operational-server.cjs`, `test-domain-reserve.cjs`, `test-operational-hardening.cjs`, `test-operational-allocation.cjs`: regresi dan fixture kontrak terbaru.
- Laporan ini.

Final pengujian: tidak ada tes gagal yang tersisa. Konfirmasi provider/bank otomatis dan race dua sesi PostgreSQL tidak diklaim telah diuji.

## Verifikasi setelah migrasi produksi

- Versi migrasi resmi: **20261026075521**, nama workplace_domain_reserve_and_operational_guards_v2.
- Hash seluruh row expenses, inflows, business_bookkeeping_records dan operational_settings **identik** sebelum/sesudah migrasi. Counts: expenses 0, inflows 6, books 6, Mayar 1; private domain confirmations 0. Tidak ada pembayaran palsu atau setting verified baru.
- Summary produksi v2: buku Rp11.000; cadangan dan total aktif Rp22.000; proyeksi bebas buku −Rp11.000; actual_cash_balance/free_cash_balance NULL; actual_cash_verified=false; allocation_ready=false, pending.
- Pemeriksaan read-only dengan SET LOCAL ROLE authenticated + identitas Founder: summary dan 6 kategori terbaca, nilai cadangan/proyeksi benar, grant RPC konfirmasi tersedia. Transaksi uji READ ONLY di-ROLLBACK. Tidak memanggil RPC pembayaran produksi.
- Grant anon pada RPC konfirmasi=false, grant authenticated pada RPC klik-domain lama=false.
- Dua advisory ERROR security_definer_view pada view keuangan tidak muncul lagi setelah security_invoker. Tabel private dengan RLS tanpa policy disengaja untuk menolak akses langsung; hanya RPC terotorisasi yang menulis. RPC SECURITY DEFINER authenticated yang baru memang disengaja dan memiliki guard role. Advisory legacy search_path/trigger dan advisory proyek lain masih ada; tidak diklaim seluruh proyek bebas temuan. [Penjelasan RLS tanpa policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [SECURITY DEFINER authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [search_path legacy](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
- SQL kanonis tersimpan di supabase/migrations/20261026075521_workplace_domain_reserve_and_operational_guards_v2.sql.

Pemeriksaan produksi tambahan sebagai Supervisor authenticated juga lulus: summary/cadangan terbaca dan grant INSERT langsung ke tabel bukti privat ditolak. Tidak ada RPC pembayaran yang dieksekusi untuk pengujian produksi.

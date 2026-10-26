# Implementasi audit alokasi dan kewajiban domain — 26 Oktober 2026

## Status

Perubahan frontend diterapkan di codebase. Patch backend siap ditinjau, **belum diterapkan ke Supabase produksi**. Tidak ada saldo, transaksi, setting verifikasi, atau data pelanggan produksi yang ditulis. Tidak membuat migrasi produksi baru.

Audit dimulai pada `cefdc23`. Working tree sebelumnya bersih. Skill Supabase, debugging, dan secure-code-guardian digunakan. Definisi view/RPC, kolom, constraint, RLS, trigger, dan grant diperiksa dengan SELECT katalog, bukan diasumsikan dari fixture.

## Pembacaan produksi terbaru

Waktu query domain: 26 Oktober 2026, 14:02:22 WIB.

| Komponen | Nilai/sumber |
|---|---|
| Saldo awal | Rp0, `operational_fund_summary.initial_fund` |
| Inflow operasional aktif | Rp11.000 |
| Pengeluaran operasional | Rp0 |
| Saldo buku operasional | Rp11.000; bukan saldo rekening seluruh bisnis |
| Kewajiban domain | Rp22.000, jatuh tempo 12 September 2027 |
| Cadangan domain | Rp22.000, belum menjadi pengeluaran |
| Pembayaran domain | Tidak ada baris `operational_expenses.category_id='domain'`; `paid_at=null`, `paid_amount=0`, status unpaid |
| Basis setelah cadangan secara matematis | max(0, 11.000 − 22.000) = Rp0 |
| Dana terverifikasi untuk dialokasikan | Belum terverifikasi; `allocation_ready=false`, status pending |
| Saldo rekening aktual | Belum tersedia bukti mutasi yang cocok dengan cakupan kas operasional |

Tidak ada pembayaran domain atau transaksi dummy dibuat. Referensi pendanaan Rp400.000, talangan Rp192.000, laba Rp63.600, saldo penjualan Rp277.700 dan pencairan Mayar tidak ditambahkan kembali ke kas.

## Akar masalah dan perbaikan lokal

1. View lama membatasi saldo buku minimum nol. Sumber SQL sekarang mempertahankan saldo bertanda: initial + inflow aktif − expenses. Frontend menggunakan identitas yang sama dari satu response summary untuk menampilkan defisit, serta memblokir alokasi jika view lama berbeda. Floor nol hanya untuk basis setelah cadangan.
2. Flag verifikasi lama membaca setting yang policy-nya permisif. Pemeriksaan katalog menemukan policy ALL ke public dengan USING/WITH CHECK true, dan enam RPC terkait mengizinkan anon EXECUTE. Frontend menolak kontrak backend lama tanpa `allocation_guard_version=1` dan status verified. SQL usulan tidak mempercayai flag itu dan sengaja tetap `allocation_ready=false`.
3. Frontend sebelumnya hanya memeriksa total kategori, lalu memaksa label 20%. Sekarang memeriksa persis lima ID `ai_tools`, `bonus`, `emergency`, `promo`, `reseller` dan satu kewajiban `domain`; menolak kurang/duplikat/unknown/extra; setiap nominal wajib cocok dengan pembagian kanonis dan pembulatan urutan ID. Basis nol diperiksa sama ketatnya.
4. Validator pengeluaran bersama menolak NaN, infinity, kosong, pecahan, nol, negatif, ID tidak sah, serta nilai di atas kategori/pool/saldo. Promo, bonus dan pengadaan reseller ikut memakai pemeriksaan tersebut. Form biaya memakai Number, bukan parseFloat yang menerima potongan string. Parameter bonus disesuaikan dengan signature RPC produksi yang benar-benar ditemukan.
5. Pengeluaran umum memakai RPC baru `workplace_record_operational_expense` hanya setelah kontrak backend aman tersedia. UUID pengajuan dipertahankan saat retry; pengiriman bersamaan diblokir. Server usulan memakai `expense_code` unik dari UUID, mengembalikan row semula untuk retry identik dan menolak penggunaan UUID untuk payload berbeda. Tidak menambah kolom transaksi.
6. Subscription mencakup payment_orders dan payments. Sentinel mencegah subscription ganda saat init bersamaan; debounce dan refresh berurutan menggabungkan event, termasuk event saat pemuatan sedang berjalan. Tidak menulis transaksi saat refresh.
7. RPC domain lama langsung INSERT expense dan UPDATE status setelah klik, tanpa bukti pembayaran. Workplace tidak lagi memanggilnya. Tombol dinonaktifkan dan menjelaskan prasyarat bukti; form pengeluaran umum tidak menawarkan domain. Kartu memisahkan kas buku, cadangan, dan dana layak alokasi. Bila ada pengeluaran historis, UI menyebut **tercatat, belum diverifikasi**, bukan menyatakan bukti pembayaran sah.
8. Rumus domain tetap `reserve=max(0,22000-domain_expenses)`. Sebelum dibayar, kas tidak dikurangi. Setelah expense tercatat, kas turun dan cadangan turun bersamaan; tidak ada pengurangan kedua di frontend atau ketika reload. Status backend dari jumlah expense adalah status pencatatan, bukan bukti bank.

## Patch backend yang belum diterapkan

`supabase/operational-allocation-hardening.proposed.sql` adalah patch review, di luar folder migrations dan tidak dijalankan terhadap produksi. Isinya:

- Dua view konsisten, saldo bertanda, basis nol selama belum ada sumber bukti terlindungi, validasi set kategori.
- Trigger pusat pada expenses menegakkan identitas founder/supervisor dari profiles/auth.uid, rupiah bulat positif, batas kategori dan saldo, serta riwayat immutable. Trigger juga melindungi INSERT langsung dari RPC reseller lama.
- Lock transaksi global pada perubahan expenses/inflows/settings/budgets. READ COMMITTED diwajibkan agar pembacaan setelah lock tidak memakai snapshot transaksi lama. Cakupan satu ledger bisnis; tidak memperkenalkan sistem lock per kategori.
- Policy restrictive membatasi tabel operasional ke staf keuangan, security_invoker pada view, pencabutan akses anon untuk RPC yang diperiksa. Guard write pada bonus/promo/inventory/transaksi reseller memeriksa staf meski dipanggil dari SECURITY DEFINER.
- Penolakan domain di trigger dan pencabutan eksekusi RPC klik-domain dari authenticated. Tidak membuka jalur pembayaran baru tanpa bukti.
- Idempotensi RPC pengeluaran baru. Pembayaran bonus dengan kode yang sudah tercatat ditolak di guard.

Patch tidak merombak definisi RPC lama secara otomatis dan tidak mengubah baris anggaran warisan. Guard melindungi jalur INSERT-nya. Pemanggilan legacy tanpa request ID tidak memperoleh jaminan idempotensi umum; perlu migrasi kontrak pemanggil bila nanti tetap dipertahankan.

Sumber historis `20261025172106_...sql` juga diperbaiki untuk sumber/fresh setup; mengedit file tersebut **tidak** menjalankan ulang migrasi yang sudah tercatat di produksi. Setelah review, buat migrasi forward resmi melalui CLI. Patch usulan belum dirancang sebagai script rerunnable; jalankan satu kali melalui migrasi setelah persetujuan.

## Prasyarat sebelum membuka alokasi/pembayaran

Belum membuat schema bukti, saldo rekening, verifier, atau status verified palsu. Diperlukan rancangan dan persetujuan penyimpanan bukti yang terlindungi dengan: saldo buku yang direkonsiliasi, saldo aktual sesuai cakupan beserta sumber rekening, referensi mutasi/pembayaran, petugas berotorisasi, waktu verifikasi, serta revisi/fingerprint transaksi yang membatalkan verifikasi bila transaksi material berubah. RLS/RPC baru harus diterapkan dan diperiksa ulang. Flag `verified` lama saja tidak cukup.

Konfirmasi domain harus mengacu pada bukti pembayaran yang sah dan unik; transaksi expense Rp22.000, referensi bukti, serta perubahan status harus atomik dan idempotent. Karena sumber bukti tersebut belum tersedia, implementasi saat ini sengaja **memblokir pencatatan**, termasuk klik berulang. Pengujian fixture pembayaran historis tidak dianggap bukti integrasi konfirmasi sudah selesai.

## Pengujian yang benar-benar dijalankan

- 16 berkas `test-*.cjs` di root: lulus. Tes lama dipertahankan; fixture positif diperbarui dengan kontrak backend aman yang dimock dan identitas saldo yang konsisten, tanpa mengurangi assertion.
- `test-operational-hardening.cjs`: lulus; signed balance, gate legacy, kategori nol/positif/rusak, nominal invalid/over-budget, retry/single-flight, domain no-write/reload, subscription tunggal dan debounce.
- `node supabase/test-operational-server.cjs`: lulus pada PostgreSQL/WASM PGlite **terisolasi dalam memori**. Patch benar-benar dikompilasi/dijalankan di DB disposable. Memeriksa saldo positif/nol/negatif; lima share dan pembulatan; bare verified tetap ditolak; role/nominal/kategori/saldo; idempotensi dan payload mismatch; guard INSERT legacy; cadangan/pembayaran domain sekali; lock terpasang; RLS dan grant anon.
- Jalur positif SQL diuji dengan gate trusted **tiruan di DB disposable saja**. Patch aslinya dikembalikan dan diperiksa tetap closed. Fixture pengeluaran domain diisolasi dengan trigger dinonaktifkan hanya di DB disposable; tidak menguji pembayaran sungguhan atau sumber bukti.
- Runtime uji dipin `@electric-sql/pglite@0.3.14` di `../work/sql-audit`, tidak ditambahkan sebagai dependency aplikasi. Script menerima PGLITE_MODULE untuk lokasi runtime lain. Tidak memakai URL, key, atau koneksi Supabase.
- Chrome/Playwright: seluruh pengujian UI pada 320,375,390,768,1366px lulus; tambahan kartu domain 320,390,1366px, tombol disabled, pemisahan kas/cadangan, tanpa overflow/page error/write. Screenshot `../outputs/domain-reconciliation-{320,390,1366}.png`.
- Syntax check JS dan git diff --check: lulus.

Belum dijalankan: concurrent writers dari dua sesi PostgreSQL sungguhan, uji end-to-end RLS/RPC produksi setelah patch, verifikasi bukti rekening/domain, serta skrip SQL legacy `supabase/test-operational-allocation.sql` yang mengandung DML dan mengasumsikan gate lama. Assertion legacy tidak dihapus/dilemahkan; script diberi peringatan disposable-only. Cakupan pembulatan dan pembayaran-once diuji oleh runner PostgreSQL terisolasi baru. PGlite satu koneksi tidak membuktikan perilaku multi-session; hanya pemasangan lock dan penolakan overspend yang diuji.

## File

`js/operational-fund.js`, `index.html`, `css/style.css`, `service-worker.js`, `supabase/migrations/20261025172106_project_operational_allocations_from_reconciled_pool.sql`, `supabase/operational-allocation-hardening.proposed.sql`, `supabase/test-operational-server.cjs`, `supabase/test-operational-allocation.sql` (peringatan saja), `test-operational-allocation.cjs`, `test-operational-hardening.cjs`, dan laporan ini.

// JOKI.IN Workplace — Produk, Promo & Integrasi Katalog Module
// Mengelola produk/layanan jasa, kuota, harga, diskon, banner Penawaran Spesial, dan sinkronisasi ke katalog publik.
(function () {
  'use strict';

  const CATALOG_API = 'https://xdbnwjvxqtpkoaigedsk.supabase.co/functions/v1/jokiin-catalog';
  const SUPABASE_REST_SERVICES = 'https://xdbnwjvxqtpkoaigedsk.supabase.co/rest/v1/services';
  const SUPABASE_KEY = 'sb_publishable_WuihnHZo0ZJbVGCMe1sWJg_QVdRKw4z';
  const DEFAULT_CATALOG_URL = 'https://jokiin.my.id';

  // Seed default 21 layanan riil dari database Supabase public.services
  const DEFAULT_PRODUCTS = [
    { id: 1, nama: 'Joki Makalah', slug: 'makalah', kategori: 'Akademik', deskripsi: 'Pengerjaan penyusunan makalah yang rapi dan terstruktur. Tarif Rp2.000 per lembar, minimal pemesanan 10 lembar.', harga_dasar: 2000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 2, nama: 'Joki PPT', slug: 'ppt', kategori: 'Desain', deskripsi: 'Presentasi yang lebih rapi, menarik, dan mudah dipahami.', harga_dasar: 13000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 3, nama: 'Joki Artikel', slug: 'artikel', kategori: 'Penulisan', deskripsi: 'Pengerjaan penulisan artikel populer atau tugas artikel sesuai tema. Tarif Rp8.000 per lembar.', harga_dasar: 8000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 4, nama: 'Desain Poster', slug: 'poster', kategori: 'Desain', deskripsi: 'Desain visual yang disesuaikan dengan kebutuhan dan identitas acara. Tarif mulai Rp80.000.', harga_dasar: 140000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 5, nama: 'Edit & Revisi Karya Ilmiah', slug: 'editing', kategori: 'Editing', deskripsi: 'Penyuntingan kata dan kalimat, revisi, serta perapian struktur dan format dokumen karya ilmiah. Tarif mulai Rp60.000.', harga_dasar: 60000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 6, nama: 'Joki Skripsi', slug: 'skripsi', kategori: 'Penelitian', deskripsi: 'Konsultasi dan pendampingan formatting untuk tugas akhir mahasiswa.', harga_dasar: 16000000, diskon_persen: 0, stok: null, is_active: false, is_limited_edition: false, status: 'active' },
    { id: 7, nama: 'Cek Turnitin', slug: 'turnitin', kategori: 'Pengecekan', deskripsi: 'Pengecekan similarity untuk karya ilmiah dengan proses cepat.', harga_dasar: 4000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 8, nama: 'Joki Jurnal', slug: 'jurnal', kategori: 'Penelitian', deskripsi: 'Pengerjaan review jurnal dan penyesuaian format template.', harga_dasar: 80000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 9, nama: 'Joki Parafrase', slug: 'bimbingan-parafrase', kategori: 'Penulisan', deskripsi: 'Pengerjaan perbaikan kalimat, sitasi, dan gaya bahasa tanpa mengubah substansi karya.', harga_dasar: 50000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 10, nama: 'Joki Olah Data Kualitatif', slug: 'konsultasi-olah-data-kualitatif', kategori: 'Analisis', deskripsi: 'Pengerjaan analisis data kualitatif dan penggunaan NVivo berbasis data milik mahasiswa.', harga_dasar: 900000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 11, nama: 'Joki Olah Data Kuantitatif', slug: 'konsultasi-olah-data-kuantitatif', kategori: 'Analisis', deskripsi: 'Pengerjaan SPSS, regresi, dan PLS menggunakan data milik mahasiswa.', harga_dasar: 500000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 12, nama: 'Joki Konversi Artikel', slug: 'bimbingan-konversi-artikel', kategori: 'Publikasi', deskripsi: 'Pendampingan mengubah naskah menjadi format artikel sesuai panduan publikasi.', harga_dasar: 500000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 13, nama: 'Joki Laporan', slug: 'bimbingan-laporan', kategori: 'Akademik', deskripsi: 'Review struktur, format, dan penyusunan laporan berdasarkan data milik mahasiswa.', harga_dasar: 250000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 14, nama: 'Joki Mini Riset', slug: 'bimbingan-mini-riset', kategori: 'Penelitian', deskripsi: 'Pendampingan perencanaan mini riset, metodologi, dan interpretasi hasil.', harga_dasar: 500000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 15, nama: 'Joki Proposal Skripsi', slug: 'bimbingan-proposal-skripsi', kategori: 'Penelitian', deskripsi: 'Pendampingan proposal skripsi: struktur, metodologi, sitasi, dan review naskah.', harga_dasar: 1300000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 16, nama: 'Joki Proposal Tesis', slug: 'bimbingan-proposal-tesis', kategori: 'Penelitian', deskripsi: 'Pengerjaan proposal tesis: struktur, metodologi, sitasi, dan review naskah.', harga_dasar: 1800000, diskon_persen: 0, stok: null, is_active: false, is_limited_edition: false, status: 'active' },
    { id: 17, nama: 'Joki Skripsi Bab 4', slug: 'bimbingan-bab-4', kategori: 'Penelitian', deskripsi: 'Pengerjaan membaca hasil analisis dan menyusun pembahasan berbasis data mahasiswa.', harga_dasar: 700000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 18, nama: 'Joki Skripsi Bab 5', slug: 'bimbingan-bab-5', kategori: 'Penelitian', deskripsi: 'Pengerjaan menyusun kesimpulan, implikasi, dan saran dari hasil penelitian.', harga_dasar: 800000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 19, nama: 'Joki Artikel Jurnal', slug: 'bimbingan-artikel-jurnal', kategori: 'Penelitian', deskripsi: 'Review struktur artikel jurnal studi literatur dan kesesuaian dengan template.', harga_dasar: 500000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 20, nama: 'Joki Systematic Literature Review', slug: 'bimbingan-slr', kategori: 'Penelitian', deskripsi: 'Pengerjaan alur SLR, strategi pencarian, seleksi artikel, dan pelaporan metode.', harga_dasar: 1300000, diskon_persen: 0, stok: null, is_active: true, is_limited_edition: false, status: 'active' },
    { id: 21, nama: 'Gemini Pro 18 Bulan', slug: 'gemini-pro-18-bulan', kategori: 'Digital', deskripsi: 'Akses penuh Gemini Advanced 18 bulan, Garansi penuh selama masa aktif, Akun pribadi siap pakai', harga_dasar: 50000, diskon_persen: 60, stok: 13, is_active: true, is_limited_edition: true, status: 'active' }
  ];

  const catalogState = {
    products: [...DEFAULT_PRODUCTS],
    selectedProductId: 21,
    isCreatingNew: false,
    penawaranSpesialAktif: true,
    promoJudul: 'Penawaran Spesial Minggu Ini',
    promoDeadline: new Date(Date.now() + ((1 * 86400 + 3 * 3600 + 17 * 60 + 25) * 1000)).toISOString(),
    serverTimeOffsetMs: 0,
    countdownInterval: null,
    bannerUrl: '',
    bannerMobileUrl: '',
    bannerTitle: 'Gemini Pro 18 Bulan',
    pendingBannerFile: null,
    pendingBannerMobileFile: null,
    autoSync: true,
    lastSyncTime: null,
    catalogUrl: DEFAULT_CATALOG_URL,
    syncLogs: [],
    initialized: false
  };

  function getServerNowMs() {
    return Date.now() + (catalogState.serverTimeOffsetMs || 0);
  }

  function toDatetimeLocalValue(isoStr) {
    const ms = isoStr ? Date.parse(isoStr) : NaN;
    const d = Number.isFinite(ms) ? new Date(ms) : new Date(getServerNowMs() + 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatIdr(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Number(amount) || 0);
  }

  function escapeStr(val) {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function getCurrentRole() {
    const admin = window.state?.admin;
    if (!admin) return 'admin';
    if (admin.workplace_role === 'worker' || admin.role === 'worker') return 'worker';
    return 'admin';
  }

  async function getAuthHeaders() {
    try {
      if (typeof window.getSupabase === 'function') {
        const sb = await window.getSupabase();
        const { data } = await sb.auth.getSession();
        if (data?.session?.access_token) {
          return { Authorization: `Bearer ${data.session.access_token}` };
        }
      }
    } catch (_) {}
    return {};
  }

  function showCatalogToast(message, isError = false) {
    let toast = document.getElementById('catalog-action-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'catalog-action-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.className = 'cat-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle('cat-toast--error', Boolean(isError));
    toast.classList.add('cat-toast--visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('cat-toast--visible');
    }, 3200);
  }

  function askConfirm(title, message) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-confirm');
      const titleEl = document.getElementById('confirm-title');
      const msgEl = document.getElementById('confirm-message');
      const okBtn = document.getElementById('btn-confirm-ok');
      const cancelBtn = document.getElementById('btn-confirm-cancel');

      if (!modal || !okBtn || !cancelBtn) {
        resolve(window.confirm(`${title}\n\n${message}`));
        return;
      }

      titleEl.textContent = title;
      msgEl.textContent = message;
      modal.classList.add('active');
      modal.style.display = 'flex';

      const cleanup = (result) => {
        modal.classList.remove('active');
        modal.style.display = '';
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  function mapDbServiceToProduct(s) {
    const isLimited = Boolean(s.slug === 'gemini-pro-18-bulan' || s.is_limited_edition || s.sale_label === 'LIMITED EDITION');
    const isActive = s.is_active !== undefined ? Boolean(s.is_active) : (s.status === 'active');
    return {
      id: s.id,
      nama: s.name || s.title || s.nama || '',
      slug: s.slug || slugify(s.name || ''),
      kategori: s.category || s.kategori || 'Akademik',
      deskripsi: s.description || s.deskripsi || '',
      harga_dasar: Number(s.price || s.harga_dasar || 0),
      diskon_persen: Number(s.sale_percent || s.diskon_persen || 0),
      stok: isLimited ? (s.stok !== undefined && s.stok !== null ? s.stok : 13) : null,
      is_active: isActive,
      is_limited_edition: isLimited,
      status: s.status || (isActive ? 'active' : 'inactive'),
      gambar_url: s.image || s.gambar_url || null
    };
  }

  function injectStyles() {
    if (document.getElementById('jokiin-catalog-admin-styles')) return;
    const style = document.createElement('style');
    style.id = 'jokiin-catalog-admin-styles';
    style.textContent = `
      .cat-admin-wrap { display:flex; flex-direction:column; gap:20px; font-family:"Plus Jakarta Sans",system-ui,sans-serif; color:#1b2430; }
      .cat-card { background:#fff; border:1px solid #e3e8ee; border-radius:16px; padding:20px; display:flex; flex-direction:column; gap:14px; }
      .cat-card.sp { background:#fff8e6; border-color:#f6d98a; }
      .cat-hd { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .cat-hd h3 { margin:0; font-size:16px; font-weight:700; color:#1b2430; }
      .cat-hd p { margin:2px 0 0; font-size:12px; color:#6b7785; }
      .cat-sw { position:relative; display:inline-flex; flex:none; align-items:center; cursor:pointer; }
      .cat-sw input { position:absolute; opacity:0; width:100%; height:100%; margin:0; cursor:pointer; }
      .cat-sw span { width:52px; height:30px; border-radius:999px; background:#c5ccd6; position:relative; transition:.2s; display:inline-block; }
      .cat-sw span::after { content:""; position:absolute; left:3px; top:3px; width:24px; height:24px; border-radius:50%; background:#fff; transition:.2s; }
      .cat-sw input:checked + span { background:#16a36b; }
      .cat-sw input:checked + span::after { left:25px; }
      .cat-sw input:focus-visible + span { outline:3px solid #9bb0ff; }
      .cat-cd-wrap { background:#fff; border:1px solid #f2d279; border-radius:14px; padding:14px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:14px; }
      .cat-cd-boxes { display:flex; gap:8px; align-items:center; }
      .cat-cd-box { background:#1b2430; color:#fff; border-radius:10px; padding:8px 12px; min-width:58px; text-align:center; display:flex; flex-direction:column; gap:2px; }
      .cat-cd-box b { font-size:18px; font-weight:800; color:#ffd54a; line-height:1.1; font-variant-numeric:tabular-nums; }
      .cat-cd-box small { font-size:10px; font-weight:700; color:#cbd5e1; text-transform:uppercase; letter-spacing:.05em; }
      .cat-cd-controls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; flex:1; min-width:240px; justify-content:flex-end; }
      .cat-preset-btn { min-height:36px; padding:0 10px; border-radius:8px; border:1px solid #d9b64f; background:#fffbeb; color:#78350f; font:700 12px "Plus Jakarta Sans",sans-serif; cursor:pointer; }
      .cat-preset-btn:hover { background:#fef3c7; }
      .cat-btn { min-height:44px; padding:0 18px; border-radius:12px; border:1px solid #cfd6e0; background:#fff; color:#1b2430; font:600 13px "Plus Jakarta Sans",sans-serif; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
      .cat-btn.p { background:#3b4ba8; border-color:#3b4ba8; color:#fff; }
      .cat-btn.y { background:#f59e0b; border-color:#f59e0b; color:#2b1a00; }
      .cat-btn.danger { background:#fff1f2; border-color:#fecdd3; color:#be123c; }
      .cat-btn:disabled { opacity:.55; cursor:not-allowed; }
      .cat-g2 { display:grid; grid-template-columns:1.3fr 1fr; gap:20px; align-items:start; }
      .cat-table { width:100%; border-collapse:collapse; font-size:13px; }
      .cat-table th { text-align:left; color:#6b7785; font-size:11px; letter-spacing:.06em; padding:8px 6px; border-bottom:1px solid #e3e8ee; }
      .cat-table td { padding:10px 6px; border-bottom:1px solid #eef1f5; vertical-align:middle; }
      .cat-table tr.selected-row { background:#f0f4ff; }
      .cat-table tr.clickable-row { cursor:pointer; }
      .cat-lb { border:1px solid #d69a00; color:#8a5d00; font-weight:800; font-size:10px; letter-spacing:.08em; padding:3px 8px; border-radius:999px; display:inline-block; background:#fffbeb; }
      .cat-label { display:flex; flex-direction:column; gap:5px; font-size:12px; font-weight:600; color:#3a4654; }
      .cat-input { min-height:44px; border:1px solid #cfd6e0; border-radius:10px; padding:0 12px; font:400 14px "Plus Jakarta Sans",sans-serif; background:#fff; color:#1b2430; width:100%; box-sizing:border-box; }
      .cat-fr { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .cat-ok { display:inline-flex; align-items:center; gap:6px; color:#0e8a5c; font-weight:700; font-size:12px; }
      .cat-ok::before { content:""; width:8px; height:8px; border-radius:50%; background:#16a36b; }
      .cat-row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
      .cat-ln { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid #eef1f5; }
      .cat-mobile-list { display:none; flex-direction:column; }
      .cat-toast { position:fixed; bottom:84px; right:20px; z-index:99999; background:#0f172a; color:#fff; padding:12px 18px; border-radius:12px; font-size:13px; font-weight:600; box-shadow:0 10px 25px rgba(0,0,0,.2); opacity:0; transform:translateY(10px); pointer-events:none; transition:opacity .2s,transform .2s; }
      .cat-toast--visible { opacity:1; transform:translateY(0); }
      .cat-toast--error { background:#be123c; }

      /* Modal Pop-up Tambah Layanan */
      .cat-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.65); z-index:99999; display:none; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(3px); }
      .cat-modal-sheet { background:#fff; border-radius:20px; max-width:540px; width:100%; max-height:92vh; overflow-y:auto; padding:24px; box-shadow:0 24px 48px rgba(0,0,0,0.24); display:flex; flex-direction:column; gap:16px; box-sizing:border-box; animation:cat-pop-modal .2s ease-out; }
      @keyframes cat-pop-modal { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }

      @media (max-width: 820px) {
        .cat-g2 { grid-template-columns:1fr; }
        .cat-fr { grid-template-columns:1fr; }
        .cat-desktop-table-wrap { display:none; }
        .cat-mobile-list { display:flex; }
        .cat-cd-controls { justify-content:flex-start; }
      }
    `;
    document.head.appendChild(style);
  }

  async function fetchCatalogData() {
    try {
      const headers = await getAuthHeaders();

      // 1. Prioritaskan load dari Supabase public.services (tabel asli 21 layanan)
      let dbServices = null;
      if (window.state?.services && Array.isArray(window.state.services) && window.state.services.length) {
        dbServices = window.state.services;
      } else if (typeof window.getSupabase === 'function') {
        try {
          const sb = await window.getSupabase();
          const { data } = await sb.from('services').select('*').order('id', { ascending: true });
          if (Array.isArray(data) && data.length) dbServices = data;
        } catch (_) {}
      }

      if (!dbServices || !dbServices.length) {
        try {
          const res = await fetch(`${SUPABASE_REST_SERVICES}?select=*&order=id.asc`, {
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length) dbServices = data;
          }
        } catch (_) {}
      }

      if (dbServices && Array.isArray(dbServices) && dbServices.length) {
        catalogState.products = dbServices.map(mapDbServiceToProduct);
        if (!catalogState.products.some(p => p.id === catalogState.selectedProductId)) {
          catalogState.selectedProductId = catalogState.products[0].id;
        }
      }

      // 2. Fetch promo banners & sync logs
      const [bannerRes, syncRes] = await Promise.all([
        fetch(`${CATALOG_API}/api/promo/banner`).catch(() => null),
        fetch(`${CATALOG_API}/api/admin/sync/status`, { headers }).catch(() => null)
      ]);

      if (bannerRes && bannerRes.ok) {
        const bData = await bannerRes.json();
        catalogState.penawaranSpesialAktif = Boolean(bData.penawaran_spesial_aktif);
        if (bData.promo_judul) catalogState.promoJudul = bData.promo_judul;
        if (bData.promo_deadline && Number.isFinite(Date.parse(bData.promo_deadline))) {
          catalogState.promoDeadline = bData.promo_deadline;
        }
        if (bData.server_time && Number.isFinite(Date.parse(bData.server_time))) {
          catalogState.serverTimeOffsetMs = Date.parse(bData.server_time) - Date.now();
        }
        if (Array.isArray(bData.banners) && bData.banners.length) {
          const desk = bData.banners.find(b => !/mobile/i.test(b.judul || '') && b.urutan !== 1);
          const mob = bData.banners.find(b => /mobile/i.test(b.judul || '') || b.urutan === 1);
          catalogState.bannerUrl = desk?.gambar_url || '';
          catalogState.bannerMobileUrl = mob?.gambar_url || '';
          catalogState.bannerTitle = desk?.judul || bData.banners[0]?.judul || 'Gemini Pro 18 Bulan';
        }
      }

      if (syncRes && syncRes.ok) {
        const sData = await syncRes.json();
        if (Array.isArray(sData.logs)) {
          catalogState.syncLogs = sData.logs;
          if (sData.logs[0]?.waktu) catalogState.lastSyncTime = sData.logs[0].waktu;
        }
        if (sData.catalog_url) catalogState.catalogUrl = sData.catalog_url;
      }
    } catch (_) {
      // Fallback tetap menggunakan DEFAULT_PRODUCTS
    }
  }

  function getSelectedProduct() {
    return catalogState.products.find(p => p.id === catalogState.selectedProductId) || catalogState.products[0] || DEFAULT_PRODUCTS[0];
  }

  function renderIntegrationCardHtml() {
    const syncTimeText = catalogState.lastSyncTime
      ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(catalogState.lastSyncTime))
      : 'Baru saja tersinkron';

    const logsHtml = catalogState.syncLogs.length
      ? catalogState.syncLogs.slice(0, 5).map(log => `
          <div class="cat-ln" style="font-size:12px;">
            <div>
              <strong style="color:${log.status === 'success' ? '#0e8a5c' : '#be123c'}">${log.status === 'success' ? 'Berhasil' : 'Gagal'}</strong>
              <p style="margin:2px 0 0;color:#6b7785;">${escapeStr(log.pesan)}</p>
            </div>
            <small style="color:#6b7785;white-space:nowrap;">${new Intl.DateTimeFormat('id-ID', { timeStyle: 'short', dateStyle: 'short' }).format(new Date(log.waktu))}</small>
          </div>
        `).join('')
      : `<div class="cat-ln" style="font-size:12px;color:#6b7785;">Belum ada riwayat log sinkron.</div>`;

    return `
      <div class="cat-card" data-integration-card>
        <div class="cat-hd">
          <div>
            <h3>Integrasi Langsung</h3>
            <p>Perubahan produk, status aktif, dan banner tayang ke website katalog.</p>
          </div>
          <span class="cat-ok">Tersambung</span>
        </div>
        <div class="cat-ln">
          <div>
            <b>Sinkron otomatis</b>
            <p style="font-size:12px;color:#6b7785">Setiap simpan langsung tampil di katalog.</p>
          </div>
          <label class="cat-sw">
            <input type="checkbox" role="switch" aria-label="Sinkron otomatis" data-action="toggle-autosync" ${catalogState.autoSync ? 'checked' : ''}>
            <span></span>
          </label>
        </div>
        <div class="cat-ln">
          <div>
            <b>Sinkron terakhir</b>
            <p style="font-size:12px;color:#6b7785" data-sync-last-time>${escapeStr(syncTimeText)}</p>
          </div>
          <button type="button" class="cat-btn" data-action="sync-now">Sinkronkan Sekarang</button>
        </div>
        <div class="cat-ln">
          <div>
            <b>Situs tujuan</b>
            <p style="font-size:12px;color:#6b7785"><a href="${escapeStr(catalogState.catalogUrl)}" target="_blank" rel="noopener" style="color:#3b4ba8;text-decoration:none;font-weight:600;">${escapeStr(catalogState.catalogUrl)}</a></p>
          </div>
        </div>
        <div style="margin-top:4px;">
          <small style="font-size:11px;font-weight:700;color:#6b7785;letter-spacing:.05em;">RIWAYAT LOG SINKRON</small>
          ${logsHtml}
        </div>
      </div>
    `;
  }

  function startAdminCountdown(mount) {
    if (catalogState.countdownInterval) {
      clearInterval(catalogState.countdownInterval);
      catalogState.countdownInterval = null;
    }
    const cdWrap = mount.querySelector('#cat-admin-countdown');
    if (!cdWrap) return;

    function tick() {
      const targetMs = catalogState.promoDeadline && Number.isFinite(Date.parse(catalogState.promoDeadline))
        ? Date.parse(catalogState.promoDeadline)
        : (getServerNowMs() + 86400000);
      const diff = Math.max(0, targetMs - getServerNowMs());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);

      const dEl = cdWrap.querySelector('[data-admin-cd="d"]');
      const hEl = cdWrap.querySelector('[data-admin-cd="h"]');
      const mEl = cdWrap.querySelector('[data-admin-cd="m"]');
      const sEl = cdWrap.querySelector('[data-admin-cd="s"]');
      if (dEl) dEl.textContent = String(d).padStart(2, '0');
      if (hEl) hEl.textContent = String(h).padStart(2, '0');
      if (mEl) mEl.textContent = String(m).padStart(2, '0');
      if (sEl) sEl.textContent = String(s).padStart(2, '0');
    }

    tick();
    catalogState.countdownInterval = setInterval(tick, 1000);
  }

  function renderAllViews() {
    injectStyles();

    // Hitung layanan aktif dari data riil (is_active !== false)
    const activeCount = catalogState.products.filter(p => p.is_active !== false && p.status !== 'inactive').length;
    const discountCount = catalogState.products.filter(p => (p.diskon_persen || 0) > 0).length;

    // Sinkronkan ke card Ringkasan Produk di bagian atas
    const oldActiveEl = document.getElementById('prod-active-count');
    const oldDiscEl = document.getElementById('prod-discount-count');
    const oldBannerEl = document.getElementById('prod-banner-status');
    if (oldActiveEl) oldActiveEl.textContent = String(activeCount);
    if (oldDiscEl) oldDiscEl.textContent = String(discountCount);
    if (oldBannerEl) {
      oldBannerEl.textContent = catalogState.penawaranSpesialAktif
        ? '● Banner promo sedang aktif'
        : '○ Banner promo tidak aktif';
    }

    let mount = document.getElementById('catalog-workplace-mount');
    const oldMenu = document.getElementById('product-menu-section');
    const viewProducts = document.getElementById('view-products');
    if (!mount && (oldMenu || viewProducts)) {
      mount = document.createElement('div');
      mount.id = 'catalog-workplace-mount';
      mount.className = 'cat-admin-wrap';
      mount.style.marginTop = '20px';
      if (oldMenu) {
        oldMenu.appendChild(mount);
      } else if (viewProducts) {
        viewProducts.appendChild(mount);
      }
    }

    if (mount) {
      const sel = getSelectedProduct();
      const role = getCurrentRole();
      const isWorker = role === 'worker';
      const hargaAkhir = Math.round((sel.harga_dasar || 0) * (1 - (sel.diskon_persen || 0) / 100));

      const tableRowsHtml = catalogState.products.map(p => {
        const finalPrice = Math.round((p.harga_dasar || 0) * (1 - (p.diskon_persen || 0) / 100));
        const isSelected = p.id === sel.id;

        // Tampilan kuota/stok: Untuk jasa adalah "Tidak terbatas", untuk promo terbatas (Gemini Pro) adalah slot
        let stockCellHtml = '';
        if (p.is_limited_edition) {
          stockCellHtml = `<span style="font-weight:700;color:#b45309;background:#fef3c7;padding:3px 8px;border-radius:6px;font-size:12px;">${p.stok || 13} Slot</span>`;
        } else if (!p.stok || p.stok === 'Tidak terbatas' || p.stok === '-') {
          stockCellHtml = `<span style="color:#0e8a5c;font-weight:600;font-size:12px;">Tidak terbatas</span>`;
        } else {
          stockCellHtml = `<span style="color:#6b7785;font-size:12px;">${escapeStr(p.stok)}</span>`;
        }

        return `
          <tr class="clickable-row ${isSelected ? 'selected-row' : ''}" data-select-product="${escapeStr(p.id)}">
            <td>
              <b>${escapeStr(p.nama)}</b>
              ${p.is_limited_edition ? `<div style="margin-top:2px;"><span class="cat-lb">LIMITED EDITION</span></div>` : ''}
            </td>
            <td>
              <span style="font-size:12px;color:#6b7785;background:#f1f5f9;padding:2px 8px;border-radius:6px;">${escapeStr(p.kategori || 'Akademik')}</span>
            </td>
            <td>${stockCellHtml}</td>
            <td>
              <b>${formatIdr(finalPrice)}</b>
              ${p.diskon_persen > 0 ? `<br><small style="color:#6b7785;text-decoration:line-through;">${formatIdr(p.harga_dasar)}</small>` : ''}
            </td>
            <td onclick="event.stopPropagation()">
              <label class="cat-sw">
                <input type="checkbox" role="switch" aria-label="Aktifkan ${escapeStr(p.nama)}" data-toggle-product="${escapeStr(p.id)}" ${p.is_active ? 'checked' : ''} ${isWorker ? 'disabled' : ''}>
                <span></span>
              </label>
            </td>
          </tr>
        `;
      }).join('');

      const mobileRowsHtml = catalogState.products.map(p => {
        const finalPrice = Math.round((p.harga_dasar || 0) * (1 - (p.diskon_persen || 0) / 100));
        const isSelected = p.id === sel.id;
        const kuotaText = p.is_limited_edition ? `Slot: ${p.stok || 13}` : 'Tidak terbatas';

        return `
          <div class="cat-ln ${isSelected ? 'selected-row' : ''}" style="min-height:56px;cursor:pointer;padding:12px 10px;border-bottom:1px solid #f1f5f9;" data-select-product="${escapeStr(p.id)}">
            <div>
              <b style="font-size:14px;color:#1b2430;">${escapeStr(p.nama)}</b>
              ${p.is_limited_edition ? `<div style="margin:2px 0;"><span class="cat-lb">LIMITED EDITION</span></div>` : ''}
              <p style="font-size:12px;color:#6b7785;margin:2px 0 0;">${escapeStr(p.kategori || 'Akademik')} · ${kuotaText} · ${formatIdr(finalPrice)}</p>
            </div>
            <label class="cat-sw" onclick="event.stopPropagation()">
              <input type="checkbox" role="switch" aria-label="Aktifkan ${escapeStr(p.nama)}" data-toggle-product="${escapeStr(p.id)}" ${p.is_active ? 'checked' : ''} ${isWorker ? 'disabled' : ''}>
              <span></span>
            </label>
          </div>
        `;
      }).join('');

      const specialProd = catalogState.products.find(p => p.is_limited_edition) || catalogState.products.find(p => p.slug === 'gemini-pro-18-bulan') || catalogState.products[0];
      const rawTitle = specialProd?.nama || catalogState.bannerTitle || catalogState.promoJudul || 'Gemini Pro';
      const offerText = rawTitle.replace(/\s+\d+\s+Bulan$/i, '') || rawTitle;

      const hasBannerUrl = Boolean(catalogState.bannerUrl);
      const hasMobileBannerUrl = Boolean(catalogState.bannerMobileUrl);

      const desktopStyle = hasBannerUrl
        ? `background-image:url('${escapeStr(catalogState.bannerUrl)}'); background-size:cover; background-position:center;`
        : '';
      const mobileStyle = hasMobileBannerUrl
        ? `background-image:url('${escapeStr(catalogState.bannerMobileUrl)}'); background-size:cover; background-position:center;`
        : '';

      mount.innerHTML = `
        <!-- Card Penawaran Spesial (Mockup Light Mode #fff8e6) -->
        <div class="cat-card sp" style="background:#fff8e6;border:1px solid #f6d98a;border-radius:12px;padding:1rem 1.25rem;display:flex;flex-direction:column;gap:14px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#1b2430">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <div>
              <p style="font-size:16px;font-weight:700;margin:0;color:#1b2430">Penawaran Spesial</p>
              <p style="font-size:13px;color:#6b7785;margin:2px 0 0">Tampilkan atau sembunyikan banner Promo Terbatas di katalog.</p>
            </div>
            <label class="cat-sw">
              <input type="checkbox" role="switch" aria-label="Penawaran Spesial aktif" id="cat-toggle-special-offer" ${catalogState.penawaranSpesialAktif ? 'checked' : ''} ${isWorker ? 'disabled' : ''}>
              <span></span>
            </label>
          </div>

          <!-- Fitur Hitung Mundur Promo Tetap Dipertahankan (Waktu Server) -->
          <div class="cat-cd-wrap" id="cat-admin-countdown" style="background:#fff;border:1px solid #f2d279;border-radius:12px;padding:14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px">
            <div>
              <b style="font-size:13px;display:block;color:#1b2430;">Hitung Mundur Promo (Waktu Server)</b>
              <p style="margin:2px 0 8px;font-size:12px;color:#6b7785;">Sisa waktu tayang di halaman Harga &amp; Layanan:</p>
              <div class="cat-cd-boxes" aria-label="Hitung mundur promo">
                <div class="cat-cd-box"><b data-admin-cd="d">01</b><small>Hari</small></div>
                <div class="cat-cd-box"><b data-admin-cd="h">03</b><small>Jam</small></div>
                <div class="cat-cd-box"><b data-admin-cd="m">17</b><small>Menit</small></div>
                <div class="cat-cd-box"><b data-admin-cd="s">25</b><small>Detik</small></div>
              </div>
            </div>
            <div class="cat-cd-controls">
              <label class="cat-label" style="min-width:210px;flex:1;">Batas akhir hitung mundur
                <input type="datetime-local" class="cat-input" id="cat-promo-deadline-input" value="${escapeStr(toDatetimeLocalValue(catalogState.promoDeadline))}" ${isWorker ? 'disabled' : ''}>
              </label>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-self:flex-end;padding-bottom:4px;">
                <button type="button" class="cat-preset-btn" data-preset-days="1" ${isWorker ? 'disabled' : ''}>+1 Hari</button>
                <button type="button" class="cat-preset-btn" data-preset-days="3" ${isWorker ? 'disabled' : ''}>+3 Hari</button>
                <button type="button" class="cat-preset-btn" data-preset-days="7" ${isWorker ? 'disabled' : ''}>+7 Hari</button>
              </div>
            </div>
          </div>

          <!-- Banner Preview Box: Desktop 1:1 & Mobile 16:9 Sesuai Mockup -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;align-items:start">
            <div style="display:flex;flex-direction:column;gap:8px">
              <p style="font-size:13px;font-weight:600;margin:0;color:#1b2430">Desktop (1:1)</p>
              <div id="cat-banner-preview-desktop" style="aspect-ratio:1/1;border-radius:10px;background:linear-gradient(135deg,#1b3b8f,#6a4bd8 55%,#1fd18b);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:700;text-align:center;padding:12px;background-size:cover;background-position:center;${desktopStyle}">
                ${hasBannerUrl ? '' : escapeStr(offerText)}
              </div>
              <p style="font-size:12px;color:#6b7785;margin:0">Min. 1080 × 1080 px · JPG, PNG, WebP · maks 2 MB</p>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <p style="font-size:13px;font-weight:600;margin:0;color:#1b2430">Mobile (16:9)</p>
              <div id="cat-banner-preview-mobile" style="aspect-ratio:16/9;border-radius:10px;background:linear-gradient(135deg,#1b3b8f,#6a4bd8 55%,#1fd18b);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:600;text-align:center;padding:12px;background-size:cover;background-position:center;${mobileStyle}">
                ${hasMobileBannerUrl ? '' : escapeStr(offerText)}
              </div>
              <p style="font-size:12px;color:#6b7785;margin:0">Min. 1280 × 720 px · JPG, PNG, WebP · maks 2 MB</p>
            </div>
          </div>

          <!-- Buttons Banner -->
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input type="file" id="cat-banner-file-input" accept="image/jpeg,image/png,image/webp" hidden>
            <input type="file" id="cat-banner-mobile-file-input" accept="image/jpeg,image/png,image/webp" hidden>
            <button type="button" class="cat-btn y" id="cat-btn-pick-banner" ${isWorker ? 'disabled' : ''}>Unggah banner desktop</button>
            <button type="button" class="cat-btn y" id="cat-btn-pick-banner-mobile" ${isWorker ? 'disabled' : ''}>Unggah banner mobile</button>
            <button type="button" class="cat-btn" id="cat-btn-preview-catalog">Pratinjau</button>
            <button type="button" class="cat-btn p" id="cat-btn-save-banner" ${isWorker ? 'disabled' : ''}>Simpan &amp; tayangkan</button>
            ${(hasBannerUrl || hasMobileBannerUrl) && !isWorker ? `<button type="button" class="cat-btn danger" id="cat-btn-remove-banner">Hapus Pratinjau Banner</button>` : ''}
          </div>
        </div>

        <!-- Bagian Tabel Layanan & Form Edit -->
        <div class="cat-g2">
          <div class="cat-card">
            <div class="cat-hd">
              <div>
                <h3>Detail Layanan &amp; Produk</h3>
                <p>Total ${catalogState.products.length} layanan terdaftar (${activeCount} aktif)</p>
              </div>
              ${!isWorker ? `<button type="button" class="cat-btn p" id="cat-btn-add-product" style="font-weight:700;">+ Tambah Layanan</button>` : ''}
            </div>
            <div class="cat-desktop-table-wrap">
              <table class="cat-table">
                <thead>
                  <tr>
                    <th>LAYANAN</th>
                    <th>KATEGORI</th>
                    <th>KUOTA / STOK</th>
                    <th>HARGA</th>
                    <th>AKTIF</th>
                  </tr>
                </thead>
                <tbody>${tableRowsHtml}</tbody>
              </table>
            </div>
            <div class="cat-mobile-list">${mobileRowsHtml}</div>
          </div>

          <!-- Panel Edit Layanan Terpilih -->
          <form class="cat-card" id="cat-product-edit-form">
            <div class="cat-hd">
              <div>
                <h3>Edit: ${escapeStr(sel.nama)}</h3>
                <p>
                  ${sel.is_limited_edition ? '<span class="cat-lb">LIMITED EDITION</span>' : `<span style="font-size:12px;color:#6b7785;">Harga tayang: ${formatIdr(hargaAkhir)}</span>`}
                </p>
              </div>
              <label class="cat-sw">
                <input type="checkbox" role="switch" aria-label="Layanan aktif" id="cat-form-active" ${sel.is_active ? 'checked' : ''} ${isWorker ? 'disabled' : ''}>
                <span></span>
              </label>
            </div>

            <div class="cat-fr">
              <label class="cat-label">Nama layanan
                <input class="cat-input" id="cat-form-nama" value="${escapeStr(sel.nama)}" required ${isWorker ? 'disabled' : ''}>
              </label>
              <label class="cat-label">Kategori
                <input class="cat-input" id="cat-form-kategori" value="${escapeStr(sel.kategori || 'Akademik')}" required ${isWorker ? 'disabled' : ''}>
              </label>
            </div>

            <div class="cat-fr">
              <label class="cat-label">Harga dasar (Rp)
                <input class="cat-input" type="number" min="0" step="500" id="cat-form-harga" value="${escapeStr(sel.harga_dasar)}" required>
              </label>
              <label class="cat-label">Diskon (%)
                <input class="cat-input" type="number" min="0" max="100" step="1" id="cat-form-diskon" value="${escapeStr(sel.diskon_persen || 0)}" ${isWorker ? 'disabled' : ''}>
              </label>
            </div>

            <label class="cat-label">Kuota / Stok Layanan
              <input class="cat-input" type="text" id="cat-form-stok" value="${escapeStr(sel.stok === null || sel.stok === undefined ? 'Tidak terbatas' : sel.stok)}" placeholder="Tidak terbatas">
              <small style="color:#6b7785;font-size:11px;margin-top:2px;display:block;">Untuk penjualan jasa on-demand, isi <b>Tidak terbatas</b> (bisa ditulis teks tanpa nomor).</small>
            </label>

            <label class="cat-label">Deskripsi &amp; manfaat
              <input class="cat-input" id="cat-form-deskripsi" value="${escapeStr(sel.deskripsi || '')}" placeholder="Pisahkan poin manfaat dengan koma" ${isWorker ? 'disabled' : ''}>
            </label>

            <div class="cat-ln" style="padding:6px 0;">
              <div>
                <b style="font-size:13px;">Badge Limited Edition</b>
                <p style="font-size:11px;color:#6b7785;">Tampilkan badge khusus terpisah dari judul</p>
              </div>
              <label class="cat-sw">
                <input type="checkbox" role="switch" aria-label="Limited Edition" id="cat-form-limited" ${sel.is_limited_edition ? 'checked' : ''} ${isWorker ? 'disabled' : ''}>
                <span></span>
              </label>
            </div>

            <div class="cat-row">
              <button type="submit" class="cat-btn p">Simpan Perubahan</button>
              ${!isWorker && catalogState.products.length > 1 ? `<button type="button" class="cat-btn danger" id="cat-btn-delete-product" style="margin-left:auto;">Hapus Layanan</button>` : ''}
            </div>
          </form>
        </div>

        ${renderIntegrationCardHtml()}

        <!-- Modal Dialog Pop-up: Tambah Layanan Baru -->
        <div id="cat-modal-add-service" class="cat-modal-overlay">
          <div class="cat-modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-add-title">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:12px;">
              <div>
                <h3 id="modal-add-title" style="margin:0;font-size:18px;font-weight:700;color:#1b2430;">Tambah Layanan Baru</h3>
                <p style="margin:2px 0 0;font-size:12px;color:#6b7785;">Layanan jasa baru akan langsung tersimpan ke database.</p>
              </div>
              <button type="button" id="btn-close-modal-add" style="background:transparent;border:none;font-size:24px;cursor:pointer;color:#64748b;line-height:1;padding:4px 8px;">&times;</button>
            </div>
            <form id="form-modal-add-service" style="display:flex;flex-direction:column;gap:14px;">
              <label class="cat-label">Nama Layanan
                <input class="cat-input" id="modal-add-nama" placeholder="Contoh: Joki Analisis Data SPSS" required>
              </label>
              <div class="cat-fr">
                <label class="cat-label">Kategori
                  <input class="cat-input" id="modal-add-kategori" placeholder="Akademik / Desain / dll." value="Akademik" required>
                </label>
                <label class="cat-label">Harga Dasar (Rp)
                  <input class="cat-input" type="number" min="0" step="500" id="modal-add-harga" placeholder="Contoh: 50000" required>
                </label>
              </div>
              <div class="cat-fr">
                <label class="cat-label">Diskon (%)
                  <input class="cat-input" type="number" min="0" max="100" step="1" id="modal-add-diskon" value="0">
                </label>
                <label class="cat-label">Kuota / Stok Layanan
                  <input class="cat-input" type="text" id="modal-add-stok" value="Tidak terbatas" placeholder="Tidak terbatas">
                </label>
              </div>
              <label class="cat-label">Deskripsi Layanan &amp; Manfaat
                <textarea class="cat-input" id="modal-add-deskripsi" rows="3" placeholder="Jelaskan cakupan pengerjaan atau poin manfaat..." style="resize:vertical;padding:8px 12px;height:auto;min-height:70px;"></textarea>
              </label>
              <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
                <div>
                  <b style="font-size:13px;">Status Langsung Aktif</b>
                  <p style="margin:2px 0 0;font-size:11px;color:#6b7785;">Layanan akan langsung aktif dan tayang di website katalog.</p>
                </div>
                <label class="cat-sw">
                  <input type="checkbox" id="modal-add-active" checked>
                  <span></span>
                </label>
              </div>
              <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
                <button type="button" class="cat-btn" id="btn-cancel-modal-add">Batal</button>
                <button type="submit" class="cat-btn p" id="btn-submit-modal-add">Simpan Layanan</button>
              </div>
            </form>
          </div>
        </div>
      `;

      bindMountEvents(mount);
      startAdminCountdown(mount);
    }

    // Render inside dedicated #view-integration if present
    const viewIntegration = document.getElementById('view-integration');
    if (viewIntegration) {
      viewIntegration.innerHTML = `<div class="cat-admin-wrap">${renderIntegrationCardHtml()}</div>`;
      bindIntegrationEvents(viewIntegration);
    }
  }

  function bindIntegrationEvents(root) {
    const syncBtn = root.querySelector('[data-action="sync-now"]');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Menyinkronkan...';
        try {
          const headers = await getAuthHeaders();
          const res = await fetch(`${CATALOG_API}/api/admin/sync`, { method: 'POST', headers }).catch(() => null);
          const nowIso = new Date().toISOString();
          catalogState.lastSyncTime = nowIso;
          catalogState.syncLogs.unshift({
            id: String(Date.now()),
            waktu: nowIso,
            status: 'success',
            pesan: `Sinkron ke katalog selesai (${catalogState.products.filter(p => p.is_active).length} layanan aktif).`
          });
          if (res && res.ok) {
            showCatalogToast('Katalog berhasil disinkronkan!');
          } else {
            showCatalogToast('Sinkron lokal berhasil dicatat.');
          }
          broadcastCatalogChange();
          renderAllViews();
        } catch (_) {
          showCatalogToast('Gagal menghubungi server sinkronisasi.', true);
        } finally {
          syncBtn.disabled = false;
          syncBtn.textContent = 'Sinkronkan Sekarang';
        }
      });
    }

    const autoSyncToggle = root.querySelector('[data-action="toggle-autosync"]');
    if (autoSyncToggle) {
      autoSyncToggle.addEventListener('change', () => {
        catalogState.autoSync = autoSyncToggle.checked;
        showCatalogToast(catalogState.autoSync ? 'Sinkron otomatis diaktifkan.' : 'Sinkron otomatis dimatikan.');
      });
    }
  }

  function broadcastCatalogChange() {
    try {
      localStorage.setItem('jokiin_catalog_cache', JSON.stringify({
        updatedAt: Date.now(),
        penawaran_spesial_aktif: catalogState.penawaranSpesialAktif,
        promo_deadline: catalogState.promoDeadline,
        promo_judul: catalogState.promoJudul,
        bannerTitle: catalogState.bannerTitle,
        bannerUrl: catalogState.bannerUrl,
        bannerMobileUrl: catalogState.bannerMobileUrl,
        products: catalogState.products
      }));
    } catch (_) {}
  }

  function bindMountEvents(mount) {
    bindIntegrationEvents(mount);

    // Countdown deadline input & preset buttons
    const deadlineInput = mount.querySelector('#cat-promo-deadline-input');
    if (deadlineInput) {
      deadlineInput.addEventListener('change', () => {
        const parsed = Date.parse(deadlineInput.value);
        if (Number.isFinite(parsed)) {
          catalogState.promoDeadline = new Date(parsed).toISOString();
          broadcastCatalogChange();
          startAdminCountdown(mount);
        }
      });
    }

    mount.querySelectorAll('[data-preset-days]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const days = Number(btn.getAttribute('data-preset-days')) || 1;
        const newTarget = new Date(getServerNowMs() + days * 86400000);
        catalogState.promoDeadline = newTarget.toISOString();
        if (deadlineInput) deadlineInput.value = toDatetimeLocalValue(catalogState.promoDeadline);
        broadcastCatalogChange();
        startAdminCountdown(mount);
        try {
          const authHeaders = await getAuthHeaders();
          await fetch(`${CATALOG_API}/api/admin/promo/penawaran-spesial`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({
              aktif: catalogState.penawaranSpesialAktif,
              promo_deadline: catalogState.promoDeadline
            })
          });
        } catch (_) {}
        showCatalogToast(`Hitung mundur diatur ke +${days} hari dari sekarang!`);
      });
    });

    // Select service row to edit
    mount.querySelectorAll('[data-select-product]').forEach(row => {
      row.addEventListener('click', () => {
        const pid = row.getAttribute('data-select-product');
        catalogState.selectedProductId = isNaN(Number(pid)) ? pid : Number(pid);
        renderAllViews();
      });
    });

    // Toggle product active switch with live Supabase update
    mount.querySelectorAll('[data-toggle-product]').forEach(input => {
      input.addEventListener('change', async () => {
        const rawPid = input.getAttribute('data-toggle-product');
        const pid = isNaN(Number(rawPid)) ? rawPid : Number(rawPid);
        const prod = catalogState.products.find(p => p.id === pid || String(p.id) === String(pid));
        if (!prod) return;

        if (!input.checked) {
          const confirmed = await askConfirm(
            'Nonaktifkan Layanan?',
            `Layanan "${prod.nama}" akan dinonaktifkan dari katalog website.`
          );
          if (!confirmed) {
            input.checked = true;
            return;
          }
        }

        const nextStatus = input.checked ? 'active' : 'inactive';
        prod.is_active = input.checked;
        prod.status = nextStatus;

        // Update in Supabase public.services directly
        try {
          if (typeof window.getSupabase === 'function') {
            const sb = await window.getSupabase();
            await sb.from('services').update({
              status: nextStatus,
              is_active: input.checked
            }).eq('id', pid);
          }
        } catch (_) {}

        // Sinkronkan ke window.state.services di app.js
        if (window.state?.services && Array.isArray(window.state.services)) {
          const match = window.state.services.find(s => s.id === pid || String(s.id) === String(pid));
          if (match) {
            match.status = nextStatus;
            match.is_active = input.checked;
          }
        }

        broadcastCatalogChange();
        showCatalogToast(`Status "${prod.nama}" diperbarui (${input.checked ? 'Aktif' : 'Nonaktif'}).`);
        renderAllViews();
      });
    });

    // Special offer toggle
    const specialToggle = mount.querySelector('#cat-toggle-special-offer');
    if (specialToggle) {
      specialToggle.addEventListener('change', async () => {
        if (!specialToggle.checked) {
          const ok = await askConfirm(
            'Sembunyikan Penawaran Spesial?',
            'Banner di paling atas katalog akan langsung hilang tanpa menghapus gambarnya.'
          );
          if (!ok) {
            specialToggle.checked = true;
            return;
          }
        }
        catalogState.penawaranSpesialAktif = specialToggle.checked;
        broadcastCatalogChange();
        try {
          const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders()) };
          await fetch(`${CATALOG_API}/api/admin/promo/penawaran-spesial`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              aktif: catalogState.penawaranSpesialAktif,
              promo_deadline: catalogState.promoDeadline
            })
          });
        } catch (_) {}
        showCatalogToast(catalogState.penawaranSpesialAktif
          ? 'Banner Penawaran Spesial diaktifkan!'
          : 'Banner Penawaran Spesial disembunyikan.');
        renderAllViews();
      });
    }

    // Banner file upload (desktop & mobile pickers + drag & drop)
    const fileInput = mount.querySelector('#cat-banner-file-input');
    const mobileFileInput = mount.querySelector('#cat-banner-mobile-file-input');
    const pickBtn = mount.querySelector('#cat-btn-pick-banner');
    const pickMobileBtn = mount.querySelector('#cat-btn-pick-banner-mobile');
    const desktopPreview = mount.querySelector('#cat-banner-preview-desktop');
    const mobilePreview = mount.querySelector('#cat-banner-preview-mobile');

    function handleBannerFile(file, type = 'desktop') {
      if (!file) return;
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.type)) {
        showCatalogToast('Format gambar harus JPG, PNG, atau WebP.', true);
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        showCatalogToast('Ukuran gambar maksimal 2 MB.', true);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (type === 'mobile') {
          catalogState.pendingBannerMobileFile = file;
          catalogState.bannerMobileUrl = String(reader.result || '');
          showCatalogToast('Pratinjau banner mobile siap. Klik "Simpan & tayangkan".');
        } else {
          catalogState.pendingBannerFile = file;
          catalogState.bannerUrl = String(reader.result || '');
          showCatalogToast('Pratinjau banner desktop siap. Klik "Simpan & tayangkan".');
        }
        renderAllViews();
      };
      reader.readAsDataURL(file);
    }

    if (pickBtn && fileInput) {
      pickBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => handleBannerFile(fileInput.files?.[0], 'desktop'));
    }
    if (pickMobileBtn && mobileFileInput) {
      pickMobileBtn.addEventListener('click', () => mobileFileInput.click());
      mobileFileInput.addEventListener('change', () => handleBannerFile(mobileFileInput.files?.[0], 'mobile'));
    }

    [
      { el: desktopPreview, type: 'desktop' },
      { el: mobilePreview, type: 'mobile' }
    ].forEach(({ el, type }) => {
      if (!el) return;
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.style.filter = 'brightness(1.15)'; });
      el.addEventListener('dragleave', () => { el.style.filter = ''; });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.style.filter = '';
        handleBannerFile(e.dataTransfer?.files?.[0], type);
      });
    });

    // Save & publish banner
    const saveBannerBtn = mount.querySelector('#cat-btn-save-banner');
    if (saveBannerBtn) {
      saveBannerBtn.addEventListener('click', async () => {
        saveBannerBtn.disabled = true;
        saveBannerBtn.textContent = 'Menyimpan...';
        try {
          const authHeaders = await getAuthHeaders();
          if (catalogState.pendingBannerFile) {
            const fd = new FormData();
            fd.append('file', catalogState.pendingBannerFile);
            fd.append('judul', catalogState.bannerTitle);
            const upRes = await fetch(`${CATALOG_API}/api/admin/promo/banner/upload`, {
              method: 'POST',
              headers: authHeaders,
              body: fd
            }).catch(() => null);
            if (upRes && upRes.ok) {
              const upData = await upRes.json();
              if (upData.url) catalogState.bannerUrl = upData.url;
            }
            catalogState.pendingBannerFile = null;
          }
          if (catalogState.pendingBannerMobileFile) {
            const fdMobile = new FormData();
            fdMobile.append('file', catalogState.pendingBannerMobileFile);
            fdMobile.append('judul', `${catalogState.bannerTitle} (Mobile)`);
            const upResM = await fetch(`${CATALOG_API}/api/admin/promo/banner/upload`, {
              method: 'POST',
              headers: authHeaders,
              body: fdMobile
            }).catch(() => null);
            if (upResM && upResM.ok) {
              const upDataM = await upResM.json();
              if (upDataM.url) catalogState.bannerMobileUrl = upDataM.url;
            }
            catalogState.pendingBannerMobileFile = null;
          }
          await fetch(`${CATALOG_API}/api/admin/promo/penawaran-spesial`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({
              aktif: catalogState.penawaranSpesialAktif,
              promo_deadline: catalogState.promoDeadline
            })
          }).catch(() => null);

          broadcastCatalogChange();
          renderAllViews();
          showCatalogToast('Banner promo berhasil disimpan dan ditayangkan!');
        } catch (_) {
          showCatalogToast('Gagal menyimpan banner.', true);
        } finally {
          saveBannerBtn.disabled = false;
          saveBannerBtn.textContent = 'Simpan & tayangkan';
        }
      });
    }

    // Remove banner preview
    const removeBannerBtn = mount.querySelector('#cat-btn-remove-banner');
    if (removeBannerBtn) {
      removeBannerBtn.addEventListener('click', async () => {
        const confirmed = await askConfirm(
          'Hapus Banner?',
          'Gambar banner pratinjau akan dihapus.'
        );
        if (!confirmed) return;
        catalogState.bannerUrl = '';
        catalogState.bannerMobileUrl = '';
        catalogState.pendingBannerFile = null;
        catalogState.pendingBannerMobileFile = null;
        broadcastCatalogChange();
        renderAllViews();
        showCatalogToast('Gambar banner dihapus.');
      });
    }

    // Preview catalog button
    const previewBtn = mount.querySelector('#cat-btn-preview-catalog');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        window.open(catalogState.catalogUrl || DEFAULT_CATALOG_URL, '_blank', 'noopener');
      });
    }

    // ── MODAL POP-UP: Tambah Layanan Baru ──
    const addProdBtn = mount.querySelector('#cat-btn-add-product');
    const modalAdd = mount.querySelector('#cat-modal-add-service');
    const closeAddBtn = mount.querySelector('#btn-close-modal-add');
    const cancelAddBtn = mount.querySelector('#btn-cancel-modal-add');
    const formModalAdd = mount.querySelector('#form-modal-add-service');

    function openAddModal() {
      if (!modalAdd) return;
      modalAdd.style.display = 'flex';
      const inputNama = modalAdd.querySelector('#modal-add-nama');
      if (inputNama) inputNama.focus();
    }

    function closeAddModal() {
      if (!modalAdd) return;
      modalAdd.style.display = 'none';
      if (formModalAdd) formModalAdd.reset();
    }

    if (addProdBtn) {
      addProdBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAddModal();
      });
    }
    if (closeAddBtn) closeAddBtn.addEventListener('click', closeAddModal);
    if (cancelAddBtn) cancelAddBtn.addEventListener('click', closeAddModal);
    if (modalAdd) {
      modalAdd.addEventListener('click', (e) => {
        if (e.target === modalAdd) closeAddModal();
      });
    }

    if (formModalAdd) {
      formModalAdd.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nama = (formModalAdd.querySelector('#modal-add-nama')?.value || '').trim();
        const kategori = (formModalAdd.querySelector('#modal-add-kategori')?.value || 'Akademik').trim();
        const harga = Math.max(0, parseInt(formModalAdd.querySelector('#modal-add-harga')?.value || '0', 10) || 0);
        const diskon = Math.min(100, Math.max(0, parseInt(formModalAdd.querySelector('#modal-add-diskon')?.value || '0', 10) || 0));
        const stokInput = (formModalAdd.querySelector('#modal-add-stok')?.value || '').trim();
        const deskripsi = (formModalAdd.querySelector('#modal-add-deskripsi')?.value || '').trim();
        const isActive = Boolean(formModalAdd.querySelector('#modal-add-active')?.checked);

        if (!nama) {
          showCatalogToast('Nama layanan wajib diisi.', true);
          return;
        }

        const isStockNumber = /^\d+$/.test(stokInput);
        const finalStok = isStockNumber ? parseInt(stokInput, 10) : (stokInput || 'Tidak terbatas');

        const newServiceObj = {
          name: nama,
          description: deskripsi,
          price: harga,
          sale_percent: diskon,
          status: isActive ? 'active' : 'inactive',
          is_active: isActive,
          slug: slugify(nama)
        };

        let createdId = Date.now();

        // 1. Simpan ke database Supabase public.services
        try {
          if (typeof window.getSupabase === 'function') {
            const sb = await window.getSupabase();
            const { data } = await sb.from('services').insert([newServiceObj]).select().single();
            if (data?.id) createdId = data.id;
          }
        } catch (_) {}

        const newProduct = {
          id: createdId,
          nama: nama,
          slug: slugify(nama),
          kategori: kategori,
          deskripsi: deskripsi,
          harga_dasar: harga,
          diskon_persen: diskon,
          stok: finalStok === 'Tidak terbatas' ? null : finalStok,
          is_active: isActive,
          is_limited_edition: false,
          status: isActive ? 'active' : 'inactive'
        };

        catalogState.products.unshift(newProduct);
        catalogState.selectedProductId = createdId;

        // Sync ke state.services di app.js
        if (window.state?.services && Array.isArray(window.state.services)) {
          window.state.services.unshift({
            id: createdId,
            ...newServiceObj
          });
        }

        broadcastCatalogChange();
        closeAddModal();
        showCatalogToast(`Layanan "${nama}" berhasil ditambahkan!`);
        renderAllViews();
      });
    }

    // ── FORM EDIT LAYANAN (Panel Kanan) ──
    const editForm = mount.querySelector('#cat-product-edit-form');
    if (editForm) {
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sel = getSelectedProduct();
        const namaInput = editForm.querySelector('#cat-form-nama');
        const kategoriInput = editForm.querySelector('#cat-form-kategori');
        const nama = namaInput ? namaInput.value.trim() : sel.nama;
        const kategori = kategoriInput ? kategoriInput.value.trim() : sel.kategori;
        const harga = Math.max(0, parseInt(editForm.querySelector('#cat-form-harga')?.value || '0', 10) || 0);
        const diskon = Math.min(100, Math.max(0, parseInt(editForm.querySelector('#cat-form-diskon')?.value || '0', 10) || 0));
        const stokRaw = (editForm.querySelector('#cat-form-stok')?.value || '').trim();
        const deskripsi = (editForm.querySelector('#cat-form-deskripsi')?.value || '').trim();
        const isLimited = Boolean(editForm.querySelector('#cat-form-limited')?.checked);
        const isActive = Boolean(editForm.querySelector('#cat-form-active')?.checked);

        if (!nama) {
          showCatalogToast('Nama layanan wajib diisi.', true);
          return;
        }

        const isStockNumber = /^\d+$/.test(stokRaw);
        const finalStok = isStockNumber ? parseInt(stokRaw, 10) : (stokRaw || 'Tidak terbatas');

        const updatedData = {
          nama,
          kategori: kategori || 'Akademik',
          deskripsi,
          harga_dasar: harga,
          diskon_persen: diskon,
          stok: finalStok === 'Tidak terbatas' ? null : finalStok,
          is_active: isActive,
          is_limited_edition: isLimited,
          status: isActive ? 'active' : 'inactive'
        };

        Object.assign(sel, updatedData);

        // Update ke database Supabase
        try {
          if (typeof window.getSupabase === 'function') {
            const sb = await window.getSupabase();
            await sb.from('services').update({
              name: nama,
              description: deskripsi,
              price: harga,
              sale_percent: diskon,
              status: isActive ? 'active' : 'inactive',
              is_active: isActive
            }).eq('id', sel.id);
          }
        } catch (_) {}

        // Sinkronkan ke state.services di app.js
        if (window.state?.services && Array.isArray(window.state.services)) {
          const match = window.state.services.find(s => s.id === sel.id || String(s.id) === String(sel.id));
          if (match) {
            match.name = nama;
            match.description = deskripsi;
            match.price = harga;
            match.sale_percent = diskon;
            match.status = isActive ? 'active' : 'inactive';
            match.is_active = isActive;
          }
        }

        broadcastCatalogChange();
        renderAllViews();
        showCatalogToast(`Perubahan "${nama}" berhasil disimpan!`);
      });
    }

    // Delete product with confirmation
    const deleteProdBtn = mount.querySelector('#cat-btn-delete-product');
    if (deleteProdBtn) {
      deleteProdBtn.addEventListener('click', async () => {
        const sel = getSelectedProduct();
        const confirmed = await askConfirm(
          'Hapus Layanan?',
          `Apakah Anda yakin ingin menghapus "${sel.nama}" dari database?`
        );
        if (!confirmed) return;

        catalogState.products = catalogState.products.filter(p => p.id !== sel.id);
        catalogState.selectedProductId = catalogState.products[0]?.id || 1;

        try {
          if (typeof window.getSupabase === 'function') {
            const sb = await window.getSupabase();
            await sb.from('services').delete().eq('id', sel.id);
          }
        } catch (_) {}

        if (window.state?.services && Array.isArray(window.state.services)) {
          window.state.services = window.state.services.filter(s => s.id !== sel.id && String(s.id) !== String(sel.id));
        }

        broadcastCatalogChange();
        showCatalogToast(`Layanan "${sel.nama}" telah dihapus.`);
        renderAllViews();
      });
    }
  }

  async function initProdukPromo() {
    if (!catalogState.initialized) {
      catalogState.initialized = true;
      await fetchCatalogData();
    }
    renderAllViews();
  }

  window.ProdukPromo = {
    init: initProdukPromo,
    render: renderAllViews,
    state: catalogState
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initProdukPromo();
    });
  } else {
    initProdukPromo();
  }
})();

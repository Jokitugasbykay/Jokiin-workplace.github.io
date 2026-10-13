// JOKI.IN Workplace — Produk, Promo & Integrasi Katalog Module
// Mengelola produk, stok, harga, diskon, banner Penawaran Spesial, dan sinkronisasi langsung ke katalog publik.
(function () {
  'use strict';

  const CATALOG_API = 'https://xdbnwjvxqtpkoaigedsk.supabase.co/functions/v1/jokiin-catalog';
  const DEFAULT_CATALOG_URL = 'https://jokiin.my.id';

  const DEFAULT_PRODUCTS = [
    {
      id: '11111111-1111-4111-8111-111111111101',
      nama: 'Gemini Pro 18 Bulan',
      slug: 'gemini-pro-18-bulan',
      kategori: 'Digital',
      deskripsi: 'Akses penuh Gemini Advanced 18 bulan, garansi penuh, akun pribadi.',
      harga_dasar: 50000,
      diskon_persen: 60,
      stok: 20,
      batas_beli_per_orang: 1,
      is_active: true,
      is_limited_edition: true,
      gambar_url: null
    },
    {
      id: '11111111-1111-4111-8111-111111111102',
      nama: 'Cek Turnitin',
      slug: 'cek-turnitin',
      kategori: 'Pengecekan',
      deskripsi: 'Pengecekan plagiarisme Turnitin no-repository aman dan cepat.',
      harga_dasar: 4000,
      diskon_persen: 0,
      stok: 999,
      batas_beli_per_orang: 10,
      is_active: true,
      is_limited_edition: false,
      gambar_url: null
    },
    {
      id: '11111111-1111-4111-8111-111111111103',
      nama: 'Joki Skripsi',
      slug: 'joki-skripsi',
      kategori: 'Penelitian',
      deskripsi: 'Pendampingan dan pengerjaan skripsi lengkap hingga sidang.',
      harga_dasar: 16000000,
      diskon_persen: 19,
      stok: 10,
      batas_beli_per_orang: 1,
      is_active: true,
      is_limited_edition: false,
      gambar_url: null
    },
    {
      id: '11111111-1111-4111-8111-111111111104',
      nama: 'Joki PPT',
      slug: 'joki-ppt',
      kategori: 'Desain',
      deskripsi: 'Pembuatan slide presentasi profesional, menarik, dan rapi.',
      harga_dasar: 13000,
      diskon_persen: 0,
      stok: 100,
      batas_beli_per_orang: 5,
      is_active: true,
      is_limited_edition: false,
      gambar_url: null
    },
    {
      id: '11111111-1111-4111-8111-111111111105',
      nama: 'Joki Proposal Skripsi',
      slug: 'joki-proposal-skripsi',
      kategori: 'Penelitian',
      deskripsi: 'Penyusunan proposal skripsi Bab 1-3 lengkap beserta referensi.',
      harga_dasar: 1300000,
      diskon_persen: 0,
      stok: 25,
      batas_beli_per_orang: 2,
      is_active: true,
      is_limited_edition: false,
      gambar_url: null
    }
  ];

  const catalogState = {
    products: [...DEFAULT_PRODUCTS],
    selectedProductId: DEFAULT_PRODUCTS[0].id,
    isCreatingNew: false,
    penawaranSpesialAktif: true,
    promoJudul: 'Penawaran Spesial Minggu Ini',
    promoDeadline: new Date(Date.now() + ((1 * 86400 + 3 * 3600 + 17 * 60 + 25) * 1000)).toISOString(),
    serverTimeOffsetMs: 0,
    countdownInterval: null,
    bannerUrl: '',
    bannerTitle: 'Gemini Pro 18 Bulan',
    pendingBannerFile: null,
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
      .cat-bn { display:flex; gap:16px; }
      .cat-pv { flex:1; min-height:140px; border-radius:12px; background:linear-gradient(135deg,#1b3b8f,#6a4bd8 55%,#1fd18b); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; text-align:center; padding:12px; position:relative; overflow:hidden; background-size:cover; background-position:center; }
      .cat-dz { flex:1; border:2px dashed #d9b64f; border-radius:12px; padding:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; text-align:center; color:#6b7785; font-size:12px; transition:background .15s; }
      .cat-dz.dragover { background:rgba(245,158,11,.12); border-color:#f59e0b; }
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
      .cat-input { min-height:44px; border:1px solid #cfd6e0; border-radius:10px; padding:0 12px; font:400 14px "Plus Jakarta Sans",sans-serif; background:#fff; color:#1b2430; width:100%; }
      .cat-fr { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .cat-ok { display:inline-flex; align-items:center; gap:6px; color:#0e8a5c; font-weight:700; font-size:12px; }
      .cat-ok::before { content:""; width:8px; height:8px; border-radius:50%; background:#16a36b; }
      .cat-row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
      .cat-ln { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid #eef1f5; }
      .cat-mobile-list { display:none; flex-direction:column; }
      .cat-new-badge { margin-left:auto; background:#f59e0b; color:#2b1a00; font-size:10px; font-weight:800; padding:2px 7px; border-radius:999px; }
      .cat-toast { position:fixed; bottom:84px; right:20px; z-index:9999; background:#0f172a; color:#fff; padding:12px 18px; border-radius:12px; font-size:13px; font-weight:600; box-shadow:0 10px 25px rgba(0,0,0,.2); opacity:0; transform:translateY(10px); pointer-events:none; transition:opacity .2s,transform .2s; }
      .cat-toast--visible { opacity:1; transform:translateY(0); }
      .cat-toast--error { background:#be123c; }
      @media (max-width: 820px) {
        .cat-bn { flex-direction:column; }
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
      const [prodRes, bannerRes, syncRes] = await Promise.all([
        fetch(`${CATALOG_API}/api/admin/products`, { headers }).catch(() => null),
        fetch(`${CATALOG_API}/api/promo/banner`).catch(() => null),
        fetch(`${CATALOG_API}/api/admin/sync/status`, { headers }).catch(() => null)
      ]);

      if (prodRes && prodRes.ok) {
        const data = await prodRes.json();
        if (Array.isArray(data.products) && data.products.length) {
          catalogState.products = data.products;
          if (!catalogState.products.some(p => p.id === catalogState.selectedProductId)) {
            catalogState.selectedProductId = catalogState.products[0].id;
          }
        }
      } else {
        const pubRes = await fetch(`${CATALOG_API}/api/products`).catch(() => null);
        if (pubRes && pubRes.ok) {
          const data = await pubRes.json();
          if (Array.isArray(data.products) && data.products.length) {
            catalogState.products = data.products;
            catalogState.selectedProductId = catalogState.products[0].id;
          }
        }
      }

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
        if (Array.isArray(bData.banners) && bData.banners[0]) {
          catalogState.bannerUrl = bData.banners[0].gambar_url || '';
          catalogState.bannerTitle = bData.banners[0].judul || 'Gemini Pro 18 Bulan';
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
      // Fallback uses seeded DEFAULT_PRODUCTS when offline or before Edge Function deploy
    }
  }

  function getSelectedProduct() {
    if (catalogState.isCreatingNew) {
      return {
        id: '',
        nama: '',
        slug: '',
        kategori: 'Akademik',
        deskripsi: '',
        harga_dasar: 10000,
        diskon_persen: 0,
        stok: 20,
        batas_beli_per_orang: 1,
        is_active: true,
        is_limited_edition: false
      };
    }
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
            <p>Perubahan produk, stok, dan banner tayang ke website katalog.</p>
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

    const activeCount = catalogState.products.filter(p => p.is_active).length;
    const discountCount = catalogState.products.filter(p => (p.diskon_persen || 0) > 0).length;

    // Update top Ringkasan produk card counters
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
        const isSelected = !catalogState.isCreatingNew && p.id === sel.id;
        return `
          <tr class="clickable-row ${isSelected ? 'selected-row' : ''}" data-select-product="${escapeStr(p.id)}">
            <td>
              <b>${escapeStr(p.nama)}</b>
              ${p.is_limited_edition ? `<div style="margin-top:2px;"><span class="cat-lb">LIMITED EDITION</span></div>` : ''}
            </td>
            <td>${p.stok === 0 ? '<span style="color:#be123c;font-weight:700;">Habis (0)</span>' : escapeStr(p.stok)}</td>
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
        return `
          <div class="cat-ln" style="min-height:56px;cursor:pointer;" data-select-product="${escapeStr(p.id)}">
            <div>
              <b>${escapeStr(p.nama)}</b>
              <p style="font-size:12px;color:#6b7785;margin:2px 0 0;">Stok ${p.stok} · ${formatIdr(finalPrice)}</p>
            </div>
            <label class="cat-sw" onclick="event.stopPropagation()">
              <input type="checkbox" role="switch" aria-label="Aktifkan ${escapeStr(p.nama)}" data-toggle-product="${escapeStr(p.id)}" ${p.is_active ? 'checked' : ''} ${isWorker ? 'disabled' : ''}>
              <span></span>
            </label>
          </div>
        `;
      }).join('');

      const hasBannerUrl = Boolean(catalogState.bannerUrl);
      const previewStyle = hasBannerUrl
        ? `background-image:url('${escapeStr(catalogState.bannerUrl)}'); background-size:cover; background-position:center;`
        : '';

      mount.innerHTML = `
        <div class="cat-card sp">
          <div class="cat-hd">
            <div>
              <h3>Penawaran Spesial</h3>
              <p>Tampilkan atau sembunyikan banner Promo Terbatas &amp; atur hitung mundur di katalog.</p>
            </div>
            <label class="cat-sw">
              <input type="checkbox" role="switch" aria-label="Penawaran Spesial aktif" id="cat-toggle-special-offer" ${catalogState.penawaranSpesialAktif ? 'checked' : ''} ${isWorker ? 'disabled' : ''}>
              <span></span>
            </label>
          </div>

          <div class="cat-cd-wrap" id="cat-admin-countdown">
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

          <div class="cat-bn">
            <div class="cat-pv" id="cat-banner-preview" style="${previewStyle}">
              ${hasBannerUrl ? '' : `<span>${escapeStr(catalogState.bannerTitle)}<br><small style="font-weight:600;opacity:.9;">[PRATINJAU BANNER]</small></span>`}
            </div>
            <div class="cat-dz" id="cat-banner-dropzone">
              <span>Seret gambar ke sini atau pilih file<br>Maks 2 MB · JPG, PNG, WebP</span>
              <input type="file" id="cat-banner-file-input" accept="image/jpeg,image/png,image/webp" hidden>
              <button type="button" class="cat-btn y" id="cat-btn-pick-banner" ${isWorker ? 'disabled' : ''}>Unggah Gambar Banner</button>
            </div>
          </div>
          <div class="cat-row">
            <button type="button" class="cat-btn p" id="cat-btn-save-banner" ${isWorker ? 'disabled' : ''}>Simpan &amp; Tayangkan</button>
            <button type="button" class="cat-btn" id="cat-btn-preview-catalog">Pratinjau</button>
            ${catalogState.bannerUrl && !isWorker ? `<button type="button" class="cat-btn danger" id="cat-btn-remove-banner">Hapus Pratinjau Banner</button>` : ''}
          </div>
        </div>

        <div class="cat-g2">
          <div class="cat-card">
            <div class="cat-hd">
              <h3>Detail Produk</h3>
              ${!isWorker ? `<button type="button" class="cat-btn" id="cat-btn-add-product">+ Tambah Produk</button>` : ''}
            </div>
            <div class="cat-desktop-table-wrap">
              <table class="cat-table">
                <thead>
                  <tr><th>PRODUK</th><th>STOK</th><th>HARGA</th><th>AKTIF</th></tr>
                </thead>
                <tbody>${tableRowsHtml}</tbody>
              </table>
            </div>
            <div class="cat-mobile-list">${mobileRowsHtml}</div>
          </div>

          <form class="cat-card" id="cat-product-edit-form">
            <div class="cat-hd">
              <div>
                <h3>${catalogState.isCreatingNew ? 'Tambah Produk Baru' : escapeStr(sel.nama)}</h3>
                <p>
                  ${sel.is_limited_edition ? '<span class="cat-lb">LIMITED EDITION</span>' : `<span style="font-size:12px;color:#6b7785;">Harga tayang: ${formatIdr(hargaAkhir)}</span>`}
                </p>
              </div>
              <label class="cat-sw">
                <input type="checkbox" role="switch" aria-label="Produk aktif" id="cat-form-active" ${sel.is_active ? 'checked' : ''} ${isWorker ? 'disabled' : ''}>
                <span></span>
              </label>
            </div>

            ${catalogState.isCreatingNew || !isWorker ? `
              <div class="cat-fr">
                <label class="cat-label">Nama produk
                  <input class="cat-input" id="cat-form-nama" value="${escapeStr(sel.nama)}" required ${isWorker ? 'disabled' : ''}>
                </label>
                <label class="cat-label">Kategori
                  <input class="cat-input" id="cat-form-kategori" value="${escapeStr(sel.kategori)}" required ${isWorker ? 'disabled' : ''}>
                </label>
              </div>
            ` : ''}

            <div class="cat-fr">
              <label class="cat-label">Stok
                <input class="cat-input" type="number" min="0" step="1" id="cat-form-stok" value="${escapeStr(sel.stok)}" required>
              </label>
              <label class="cat-label">Batas beli per orang
                <input class="cat-input" type="number" min="1" step="1" id="cat-form-batas" value="${escapeStr(sel.batas_beli_per_orang || 1)}" ${isWorker ? 'disabled' : ''} required>
              </label>
              <label class="cat-label">Harga dasar (Rp)
                <input class="cat-input" type="number" min="0" step="500" id="cat-form-harga" value="${escapeStr(sel.harga_dasar)}" required>
              </label>
              <label class="cat-label">Diskon (%)
                <input class="cat-input" type="number" min="0" max="100" step="1" id="cat-form-diskon" value="${escapeStr(sel.diskon_persen || 0)}" ${isWorker ? 'disabled' : ''}>
              </label>
            </div>

            <label class="cat-label">Deskripsi &amp; manfaat
              <input class="cat-input" id="cat-form-deskripsi" value="${escapeStr(sel.deskripsi || '')}" placeholder="Pisahkan poin manfaat dengan koma" ${isWorker ? 'disabled' : ''}>
            </label>

            <div class="cat-ln" style="padding:6px 0;">
              <div>
                <b style="font-size:13px;">Badge Limited Edition</b>
                <p style="font-size:11px;color:#6b7785;">Tampilkan badge terpisah dari judul produk</p>
              </div>
              <label class="cat-sw">
                <input type="checkbox" role="switch" aria-label="Limited Edition" id="cat-form-limited" ${sel.is_limited_edition ? 'checked' : ''} ${isWorker ? 'disabled' : ''}>
                <span></span>
              </label>
            </div>

            <div class="cat-row">
              <button type="submit" class="cat-btn p">Simpan Produk</button>
              <button type="button" class="cat-btn" id="cat-btn-cancel-edit">Batal</button>
              ${!catalogState.isCreatingNew && !isWorker ? `<button type="button" class="cat-btn danger" id="cat-btn-delete-product" style="margin-left:auto;">Hapus Produk</button>` : ''}
            </div>
          </form>
        </div>

        ${renderIntegrationCardHtml()}
      `;

      bindMountEvents(mount);
      startAdminCountdown(mount);
    }

    // Also render inside dedicated #view-integration if present
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
          const res = await fetch(`${CATALOG_API}/api/admin/sync`, { method: 'POST', headers });
          const nowIso = new Date().toISOString();
          catalogState.lastSyncTime = nowIso;
          catalogState.syncLogs.unshift({
            id: String(Date.now()),
            waktu: nowIso,
            status: 'success',
            pesan: `Sinkron ke katalog selesai (${catalogState.products.filter(p => p.is_active).length} produk aktif).`
          });
          if (res.ok) {
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

    // Select product row
    mount.querySelectorAll('[data-select-product]').forEach(row => {
      row.addEventListener('click', () => {
        catalogState.isCreatingNew = false;
        catalogState.selectedProductId = row.getAttribute('data-select-product');
        renderAllViews();
      });
    });

    // Toggle product active switch with confirmation before deactivating
    mount.querySelectorAll('[data-toggle-product]').forEach(input => {
      input.addEventListener('change', async () => {
        const pid = input.getAttribute('data-toggle-product');
        const prod = catalogState.products.find(p => p.id === pid);
        if (!prod) return;

        if (!input.checked) {
          const confirmed = await askConfirm(
            'Nonaktifkan Produk?',
            `Produk "${prod.nama}" akan disembunyikan dari katalog publik.`
          );
          if (!confirmed) {
            input.checked = true;
            return;
          }
        }

        prod.is_active = input.checked;
        broadcastCatalogChange();
        try {
          const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders()) };
          await fetch(`${CATALOG_API}/api/admin/products/${pid}/toggle`, { method: 'PATCH', headers });
        } catch (_) {}
        showCatalogToast(`Status "${prod.nama}" diperbarui.`);
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

    // Banner file upload (drag & drop + file picker)
    const dropzone = mount.querySelector('#cat-banner-dropzone');
    const fileInput = mount.querySelector('#cat-banner-file-input');
    const pickBtn = mount.querySelector('#cat-btn-pick-banner');

    function handleBannerFile(file) {
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
      catalogState.pendingBannerFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        catalogState.bannerUrl = String(reader.result || '');
        renderAllViews();
        showCatalogToast('Pratinjau gambar siap. Klik "Simpan & Tayangkan".');
      };
      reader.readAsDataURL(file);
    }

    if (pickBtn && fileInput) {
      pickBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => handleBannerFile(fileInput.files?.[0]));
    }
    if (dropzone) {
      dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
      dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        handleBannerFile(e.dataTransfer?.files?.[0]);
      });
    }

    // Save & publish banner + countdown deadline
    const saveBannerBtn = mount.querySelector('#cat-btn-save-banner');
    if (saveBannerBtn) {
      saveBannerBtn.addEventListener('click', async () => {
        saveBannerBtn.disabled = true;
        saveBannerBtn.textContent = 'Menyimpan...';
        try {
          if (deadlineInput && deadlineInput.value) {
            const parsed = Date.parse(deadlineInput.value);
            if (Number.isFinite(parsed)) {
              catalogState.promoDeadline = new Date(parsed).toISOString();
            }
          }
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
          await fetch(`${CATALOG_API}/api/admin/promo/penawaran-spesial`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({
              aktif: catalogState.penawaranSpesialAktif,
              promo_deadline: catalogState.promoDeadline,
              promo_judul: catalogState.promoJudul
            })
          }).catch(() => null);

          broadcastCatalogChange();
          showCatalogToast('Banner & Hitung Mundur disimpan & ditayangkan!');
          renderAllViews();
        } catch (_) {
          showCatalogToast('Gagal menyimpan banner.', true);
        } finally {
          saveBannerBtn.disabled = false;
          saveBannerBtn.textContent = 'Simpan & Tayangkan';
        }
      });
    }

    // Remove banner preview with confirmation
    const removeBannerBtn = mount.querySelector('#cat-btn-remove-banner');
    if (removeBannerBtn) {
      removeBannerBtn.addEventListener('click', async () => {
        const confirmed = await askConfirm(
          'Hapus Gambar Banner?',
          'Gambar pratinjau banner saat ini akan dihapus.'
        );
        if (!confirmed) return;
        catalogState.bannerUrl = '';
        catalogState.pendingBannerFile = null;
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

    // Add product button
    const addProdBtn = mount.querySelector('#cat-btn-add-product');
    if (addProdBtn) {
      addProdBtn.addEventListener('click', () => {
        catalogState.isCreatingNew = true;
        renderAllViews();
      });
    }

    // Cancel edit
    const cancelEditBtn = mount.querySelector('#cat-btn-cancel-edit');
    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => {
        catalogState.isCreatingNew = false;
        renderAllViews();
      });
    }

    // Delete product with confirmation
    const deleteProdBtn = mount.querySelector('#cat-btn-delete-product');
    if (deleteProdBtn) {
      deleteProdBtn.addEventListener('click', async () => {
        const sel = getSelectedProduct();
        const confirmed = await askConfirm(
          'Hapus Produk?',
          `Apakah Anda yakin ingin menghapus "${sel.nama}" secara permanen?`
        );
        if (!confirmed) return;

        catalogState.products = catalogState.products.filter(p => p.id !== sel.id);
        catalogState.selectedProductId = catalogState.products[0]?.id || '';
        broadcastCatalogChange();
        try {
          const headers = await getAuthHeaders();
          await fetch(`${CATALOG_API}/api/admin/products/${sel.id}`, { method: 'DELETE', headers });
        } catch (_) {}
        showCatalogToast(`Produk "${sel.nama}" dihapus.`);
        renderAllViews();
      });
    }

    // Save product form
    const form = mount.querySelector('#cat-product-edit-form');
    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const sel = getSelectedProduct();
        const stok = Math.max(0, parseInt(mount.querySelector('#cat-form-stok')?.value || '0', 10) || 0);
        const batas = Math.max(1, parseInt(mount.querySelector('#cat-form-batas')?.value || '1', 10) || 1);
        const harga = Math.max(0, parseInt(mount.querySelector('#cat-form-harga')?.value || '0', 10) || 0);
        const diskon = Math.min(100, Math.max(0, parseInt(mount.querySelector('#cat-form-diskon')?.value || '0', 10) || 0));
        const deskripsi = (mount.querySelector('#cat-form-deskripsi')?.value || '').trim();
        const isLimited = Boolean(mount.querySelector('#cat-form-limited')?.checked);
        const isActive = Boolean(mount.querySelector('#cat-form-active')?.checked);
        const namaInput = mount.querySelector('#cat-form-nama');
        const kategoriInput = mount.querySelector('#cat-form-kategori');
        const nama = namaInput ? namaInput.value.trim() : sel.nama;
        const kategori = kategoriInput ? kategoriInput.value.trim() : sel.kategori;

        if (!nama) {
          showCatalogToast('Nama produk wajib diisi.', true);
          return;
        }

        const payload = {
          nama,
          slug: catalogState.isCreatingNew ? slugify(nama) : sel.slug,
          kategori: kategori || 'Umum',
          deskripsi,
          harga_dasar: harga,
          diskon_persen: diskon,
          stok,
          batas_beli_per_orang: batas,
          is_active: isActive,
          is_limited_edition: isLimited
        };

        try {
          const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders()) };
          if (catalogState.isCreatingNew) {
            const newProd = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), ...payload };
            catalogState.products.unshift(newProd);
            catalogState.selectedProductId = newProd.id;
            catalogState.isCreatingNew = false;
            await fetch(`${CATALOG_API}/api/admin/products`, {
              method: 'POST',
              headers,
              body: JSON.stringify(payload)
            }).catch(() => null);
            showCatalogToast(`Produk "${nama}" berhasil ditambahkan!`);
          } else {
            Object.assign(sel, payload);
            await fetch(`${CATALOG_API}/api/admin/products/${sel.id}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify(payload)
            }).catch(() => null);
            showCatalogToast(`Perubahan "${nama}" berhasil disimpan!`);
          }
          broadcastCatalogChange();
          renderAllViews();
        } catch (_) {
          showCatalogToast('Gagal menyimpan produk.', true);
        }
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

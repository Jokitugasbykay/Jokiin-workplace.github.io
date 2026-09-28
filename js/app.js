// JOKI.IN Workplace Admin - Core Web Application

// ========================================================
// Supabase Client & Permissions
// ========================================================
const SUPABASE_URL = 'https://xdbnwjvxqtpkoaigedsk.supabase.co';
const WORKPLACE_REDIRECT_URL = 'https://jokitugasbykay.github.io/Jokiin-workplace.github.io/';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WuihnHZo0ZJbVGCMe1sWJg_QVdRKw4z';

let supabaseClient = null;

async function ensureSupabaseLoaded() {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    return window.supabase;
  }
  return new Promise((resolve) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        clearInterval(interval);
        resolve(window.supabase);
      } else if (attempts > 30) {
        clearInterval(interval);
        resolve(null);
      }
    }, 100);
  });
}

async function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const sb = await ensureSupabaseLoaded();
  if (sb && typeof sb.createClient === 'function') {
    supabaseClient = sb.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    });
    return supabaseClient;
  }
  throw new Error('Supabase client SDK tidak dapat dimuat.');
}

const USER_MANAGEMENT_ADMIN_IDS = new Set([
  '92e7a1cb-2136-496a-913b-00cd402c04f5', // Kayla
  '73a14e88-9421-4936-ba99-745768343a13'  // Riski
]);

function isOrderSupervisor(profile) {
  return profile && profile.role === 'admin' && USER_MANAGEMENT_ADMIN_IDS.has(profile.id);
}

function canManageAdminBalances(profile) {
  return profile && profile.role === 'admin' && USER_MANAGEMENT_ADMIN_IDS.has(profile.id);
}

function canAccessPromos(profile) {
  return profile && profile.role === 'admin';
}

function canManagePromos(profile) {
  return isOrderSupervisor(profile);
}

function canChangeOrder(profile, order) {
  return isOrderSupervisor(profile) || (order.assigned_to && order.assigned_to === profile?.id);
}

const ORDER_STATUSES = ['pending', 'processing', 'revision', 'completed', 'cancelled'];

function allowedOrderStatusTargets(profile, order) {
  const current = order.status || 'pending';
  if (isOrderSupervisor(profile)) {
    return ORDER_STATUSES.filter(s => !(current === 'processing' && s === 'pending'));
  }
  if (!canChangeOrder(profile, order)) return [];
  if (current === 'processing') return ['revision', 'completed'];
  if (current === 'revision') return ['completed'];
  return [];
}

function profileNickname(profile) {
  if (!profile) return 'Admin';
  const identity = (profile.name || profile.email || '').trim();
  const lower = identity.toLowerCase();
  if (lower === 'kaylafisika24@gmail.com') return 'Kayla';
  if (lower === 'gamingyoga14@gmail.com') return 'Yoga';

  const base = identity.split('@')[0].split(' ')[0];
  if (!base) return 'Admin';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const ESTIMATE_OPTIONS = [
  { hours: 12, label: '<12 jam' },
  { hours: 24, label: '1 hari' },
  { hours: 48, label: '2 hari' },
  { hours: 72, label: '3 hari' },
  { hours: 96, label: '4 hari' }
];

// Application State
const state = {
  admin: null,
  returningAdmin: null,
  orders: [],
  paymentOrders: [],
  services: [],
  payments: [],
  reviews: [],
  profiles: [],
  balanceAdjustments: [],
  promoSettings: null,
  promoCampaigns: [],
  driveFolderUrl: '',
  activeTab: 'home',
  orderMode: 'process', // 'process' | 'history'
  orderPage: 1,
  orderPageSize: 10,
  perfRange: 'month', // 'today' | 'week' | 'month'
  perfMonthOffset: 0,
  searchQuery: '',
  knownOrderIds: new Set(),
  loading: false,
  liveUpdateTimer: null,
  countdownTimer: null
};

const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const PERFORMANCE_LAUNCH_AT = new Date('2026-09-27T10:35:00Z');

// ========================================================
// Initialization
// ========================================================
let appInitialized = false;

function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  try {
    setupEventListeners();
  } catch (err) {
    console.error('Setup listeners error:', err);
  }

  // Evaluate session and reveal login or dashboard
  setTimeout(async () => {
    try {
      await checkInitialSession();
    } catch (err) {
      console.warn('Initial session check error:', err);
      showLoginView();
    } finally {
      hideSplash();
    }
  }, 900);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

function hideSplash() {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.classList.add('hidden');
    setTimeout(() => { splash.style.display = 'none'; }, 500);
  }
}

// ========================================================
// Session & Authentication
// ========================================================
function isSessionValid() {
  const loginAt = parseInt(localStorage.getItem('password_login_at') || '0', 10);
  if (!loginAt) return false;
  return (Date.now() - loginAt) < SESSION_DURATION;
}

async function checkInitialSession() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (session && session.user) {
    if (!localStorage.getItem('password_login_at')) {
      localStorage.setItem('password_login_at', Date.now().toString());
    }

    if (isSessionValid()) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profile && profile.role === 'admin') {
          state.admin = profile;
          showAppShell();
          await loadData();
          startLiveUpdates();
          return;
        } else {
          await supabase.auth.signOut({ scope: 'local' });
          localStorage.removeItem('password_login_at');
          const errorBox = document.getElementById('login-error-box');
          if (errorBox) {
            errorBox.textContent = 'Akun Google ini tidak memiliki hak akses admin JOKI.IN.';
            errorBox.style.display = 'block';
          }
        }
      } catch (err) {
        console.warn('Session profile check error:', err);
      }
    }
  }

  // Check if there was a remembered email
  const rememberedEmail = localStorage.getItem('remembered_email');
  if (rememberedEmail) {
    const emailInput = document.getElementById('login-email');
    if (emailInput) emailInput.value = rememberedEmail;
  }

  showLoginView();
}

function showLoginView() {
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-view').style.display = 'flex';
}

function showAppShell() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';

  // Update UI with admin details
  const nickname = profileNickname(state.admin);
  document.getElementById('welcome-admin-name').textContent = `Halo, Kak ${nickname}`;
  document.getElementById('drawer-admin-name').textContent = nickname;
  document.getElementById('drawer-admin-role').textContent = isOrderSupervisor(state.admin) ? 'Supervisor' : 'Admin';
  document.getElementById('drawer-avatar').textContent = nickname.charAt(0).toUpperCase();

  // Supervisor tabs visibility
  const isSupervisor = isOrderSupervisor(state.admin);
  document.getElementById('drawer-tab-performance').style.display = isSupervisor ? 'flex' : 'none';
  document.getElementById('drawer-tab-users').style.display = isSupervisor ? 'flex' : 'none';
}

async function handleLogin(email, password, rememberMe) {
  const errorBox = document.getElementById('login-error-box');
  const submitBtn = document.getElementById('btn-login-submit');
  const btnText = document.getElementById('login-btn-text');
  const btnSpinner = document.getElementById('login-btn-spinner');

  errorBox.style.display = 'none';
  submitBtn.disabled = true;
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline-flex';

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) throw error;
    if (!data.user) throw new Error('Pengguna tidak ditemukan.');

    // Gate: role must be admin
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profError || !profile || profile.role !== 'admin') {
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error('Akun ini tidak memiliki akses admin.');
    }

    // Success
    localStorage.setItem('password_login_at', Date.now().toString());
    if (rememberMe) {
      localStorage.setItem('remembered_email', email.trim());
    } else {
      localStorage.removeItem('remembered_email');
    }

    state.admin = profile;
    showAppShell();
    await loadData();
    startLiveUpdates();
  } catch (err) {
    errorBox.textContent = err.message || 'Gagal masuk. Periksa kembali email dan password.';
    errorBox.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    btnText.style.display = 'inline';
    btnSpinner.style.display = 'none';
  }
}

async function handleLogout() {
  stopLiveUpdates();
  const supabase = await getSupabase();
  await supabase.auth.signOut({ scope: 'local' });
  localStorage.removeItem('password_login_at');
  state.admin = null;
  closeDrawer();
  showLoginView();
}

// ========================================================
// Data Loading & Synchronization
// ========================================================
async function loadData() {
  if (state.loading) return;
  state.loading = true;

  try {
    const supabase = await getSupabase();

    // Re-verify current admin profile
    if (state.admin) {
      const { data: refreshedAdmin } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', state.admin.id)
        .single();
      if (refreshedAdmin) state.admin = refreshedAdmin;
    }

    // Fetch all collections concurrently
    const [
      ordersRes,
      paymentOrdersRes,
      servicesRes,
      paymentsRes,
      reviewsRes,
      profilesRes,
      promoSettingsRes,
      driveRes
    ] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('payment_orders').select('*').order('created_at', { ascending: false }).range(0, 99),
      supabase.from('services').select('*').order('id', { ascending: true }),
      supabase.from('payments').select('*').order('created_at', { ascending: false }),
      supabase.from('reviews').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('site_settings').select('value').eq('key', 'home_promo').single(),
      supabase.from('site_settings').select('value').eq('key', 'task_upload_drive_folder').single()
    ]);

    const newOrders = ordersRes.data || [];
    const newPaymentOrders = paymentOrdersRes.data || [];

    // Check for incoming new orders (sound & toast alert)
    if (state.knownOrderIds.size > 0) {
      let newlyArrived = 0;
      for (const ord of newOrders) {
        if (!state.knownOrderIds.has(ord.id) && ord.status === 'pending') {
          newlyArrived++;
        }
      }
      if (newlyArrived > 0) {
        showNotice(newlyArrived === 1 ? 'Ada pesanan baru masuk' : `Ada ${newlyArrived} pesanan baru masuk`);
        playNoticeSound();
      }
    }

    // Update known IDs
    state.knownOrderIds = new Set(newOrders.map(o => o.id));

    state.orders = newOrders;
    state.paymentOrders = newPaymentOrders;
    state.services = servicesRes.data || [];
    state.payments = paymentsRes.data || [];
    state.reviews = reviewsRes.data || [];
    state.profiles = profilesRes.data || [];
    state.promoSettings = promoSettingsRes.data?.value || null;
    state.driveFolderUrl = driveRes.data?.value?.folder_url || '';

    // Fetch promo campaigns if admin
    if (canAccessPromos(state.admin)) {
      try {
        const { data: promos } = await supabase.rpc('jokiin_list_promos');
        state.promoCampaigns = promos || [];
      } catch (e) {
        state.promoCampaigns = [];
      }
    }

    // Fetch balance adjustments if supervisor
    if (canManageAdminBalances(state.admin)) {
      try {
        const { data: adjustments } = await supabase.rpc('list_admin_balance_adjustments');
        state.balanceAdjustments = adjustments || [];
      } catch (e) {
        state.balanceAdjustments = [];
      }
    }

    renderActiveTab();
  } catch (err) {
    console.error('Error loading data:', err);
  } finally {
    state.loading = false;
  }
}

function startLiveUpdates() {
  stopLiveUpdates();
  state.liveUpdateTimer = setInterval(() => {
    if (!state.loading && isSessionValid()) {
      loadData();
    } else if (!isSessionValid() && state.admin) {
      alert('Sesi 24 jam telah berakhir. Silakan masuk kembali.');
      handleLogout();
    }
  }, 15000); // Poll every 15s (matching Android app)
}

function stopLiveUpdates() {
  if (state.liveUpdateTimer) {
    clearInterval(state.liveUpdateTimer);
    state.liveUpdateTimer = null;
  }
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
}

// ========================================================
// View Rendering & Tab Switching
// ========================================================
const BOTTOM_TABS = ['home', 'orders', 'services', 'payments'];

function switchTab(tabName, forcedDirection = null) {
  const prevTab = state.activeTab;
  let direction = forcedDirection;

  if (!direction && prevTab !== tabName) {
    const prevIdx = BOTTOM_TABS.indexOf(prevTab);
    const nextIdx = BOTTOM_TABS.indexOf(tabName);
    if (prevIdx !== -1 && nextIdx !== -1) {
      direction = nextIdx > prevIdx ? 'right' : 'left';
    }
  }

  state.activeTab = tabName;
  state.searchQuery = '';
  state.orderPage = 1;

  const searchInput = document.getElementById('global-search-input');
  if (searchInput) searchInput.value = '';

  // Update Bottom Nav
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update Drawer Nav
  document.querySelectorAll('.drawer-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Show/Hide Tab Views with slide animation
  document.querySelectorAll('.tab-view').forEach(view => {
    view.style.display = 'none';
    view.classList.remove('slide-right', 'slide-left');
  });

  const activeView = document.getElementById(`view-${tabName}`);
  if (activeView) {
    activeView.style.display = 'block';
    if (direction) {
      activeView.classList.add(direction === 'left' ? 'slide-left' : 'slide-right');
    }
  }

  // Toggle Search Section visibility
  const searchSec = document.getElementById('search-section');
  if (tabName === 'home' || tabName === 'performance' || tabName === 'products' || tabName === 'task-files') {
    searchSec.style.display = 'none';
  } else {
    searchSec.style.display = 'block';
    searchInput.placeholder = `Cari ${tabName}...`;
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  renderActiveTab();
}

function renderActiveTab() {
  switch (state.activeTab) {
    case 'home':
      renderHome();
      break;
    case 'orders':
      renderOrders();
      break;
    case 'services':
      renderServices();
      break;
    case 'payments':
      renderPayments();
      break;
    case 'reviews':
      renderReviews();
      break;
    case 'performance':
      renderPerformance();
      break;
    case 'products':
      renderProducts();
      break;
    case 'task-files':
      renderTaskFiles();
      break;
    case 'users':
      renderUsers();
      break;
  }
}

// ========================================================
// Tab: Beranda (Home)
// ========================================================
function renderHome() {
  // Saldo
  const balance = state.admin?.admin_balance || 0;
  document.getElementById('home-admin-balance').textContent = formatRupiah(balance);
  document.getElementById('balance-title').textContent = `Saldo Admin ${profileNickname(state.admin)}`;

  // Stat Counters
  const pendingCount = state.orders.filter(o => o.status === 'pending').length;
  const processingCount = state.orders.filter(o => o.status === 'processing').length;
  const completedCount = state.orders.filter(o => o.status === 'completed').length;
  const waitingPaymentCount = state.orders.filter(o => (o.payment_status || '').toLowerCase() === 'pending').length;

  document.getElementById('stat-pending').textContent = pendingCount;
  document.getElementById('stat-processing').textContent = processingCount;
  document.getElementById('stat-completed').textContent = completedCount;
  document.getElementById('stat-waiting-payment').textContent = waitingPaymentCount;

  // Recent 4 Orders
  const recentOrdersList = document.getElementById('home-recent-orders-list');
  recentOrdersList.innerHTML = '';

  const recent = state.orders.slice(0, 4);
  if (recent.length === 0) {
    recentOrdersList.innerHTML = '<p style="color: var(--ink-secondary); font-size: 13px;">Belum ada pesanan.</p>';
  } else {
    recent.forEach(ord => {
      const card = document.createElement('div');
      card.className = 'order-card';
      card.innerHTML = `
        <img src="./assets/logo-white.png" alt="Logo" class="order-brand-logo">
        <div class="order-info">
          <div class="order-code">${ord.order_code || '#' + ord.id}</div>
          <div class="order-customer">${escapeHtml(getCustomerName(ord))}</div>
          <div class="order-price">${formatRupiah(ord.total_price)}</div>
        </div>
        <div class="order-status-col">
          ${renderStatusBadge(ord.status || 'pending')}
          <span class="order-date">${formatShortDate(ord.created_at)}</span>
          <button class="btn-outline btn-detail-order" data-order-id="${ord.id}" style="height: 28px; padding: 0 10px; font-size: 12px; margin-top: 4px;">Detail</button>
        </div>
      `;
      recentOrdersList.appendChild(card);
    });
  }

  // Recent Site Orders
  const siteSec = document.getElementById('home-site-orders-section');
  const siteList = document.getElementById('home-recent-site-orders');
  if (state.paymentOrders.length > 0) {
    siteSec.style.display = 'block';
    siteList.innerHTML = '';
    state.paymentOrders.slice(0, 3).forEach(po => {
      const entry = document.createElement('div');
      entry.className = 'entry-card';
      entry.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700;">${po.order_code}</span>
          <span class="status-badge ${po.payment_status === 'paid' ? 'completed' : 'pending'}">${po.payment_status}</span>
        </div>
        <div style="font-size: 13px; color: var(--ink-secondary);">${escapeHtml(po.customer?.name || 'Pelanggan')} • ${po.customer?.email || '-'}</div>
        <div style="font-size: 15px; font-weight: 800;">${formatRupiah(po.total_price)}</div>
      `;
      siteList.appendChild(entry);
    });
  } else {
    siteSec.style.display = 'none';
  }
}

// ========================================================
// Tab: Pesanan (Orders)
// ========================================================
function renderOrders() {
  const container = document.getElementById('orders-list-container');
  container.innerHTML = '';

  const q = state.searchQuery.toLowerCase();
  const isProcessMode = state.orderMode === 'process';

  // Filter by mode and query
  const filtered = state.orders.filter(ord => {
    const status = (ord.status || 'pending').toLowerCase();
    const inMode = isProcessMode
      ? ['pending', 'processing', 'revision'].includes(status)
      : ['completed', 'cancelled'].includes(status);
    if (!inMode) return false;

    if (!q) return true;
    const code = (ord.order_code || '#' + ord.id).toLowerCase();
    const cust = getCustomerName(ord).toLowerCase();
    return code.includes(q) || cust.includes(q) || status.includes(q);
  });

  document.getElementById('orders-count-label').textContent = `Data dari server • ${filtered.length} data`;

  // Pagination (10 per page)
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.orderPageSize));
  if (state.orderPage > totalPages) state.orderPage = totalPages;

  const startIdx = (state.orderPage - 1) * state.orderPageSize;
  const pageItems = filtered.slice(startIdx, startIdx + state.orderPageSize);

  if (pageItems.length === 0) {
    container.innerHTML = '<div class="entry-card" style="text-align: center; color: var(--ink-secondary);">Tidak ada pesanan ditemukan.</div>';
  } else {
    pageItems.forEach(ord => {
      const card = createOrderCard(ord);
      container.appendChild(card);
    });
  }

  renderPagination(totalPages);
}

function createOrderCard(ord) {
  const card = document.createElement('div');
  card.className = 'entry-card';

  const custName = getCustomerName(ord);
  const custEmail = ord.customer?.email || '-';
  const workerLabel = getWorkerLabel(ord);
  const isSupervisor = isOrderSupervisor(state.admin);
  const canEdit = canChangeOrder(state.admin, ord);
  const targets = allowedOrderStatusTargets(state.admin, ord);

  let claimBtnHtml = '';
  if (ord.status === 'pending' && !ord.assigned_to) {
    claimBtnHtml = `
      <button class="btn-primary btn-claim-order" data-order-id="${ord.id}" style="height: 42px; margin-top: 4px;">
        Ambil Pesanan
      </button>
    `;
  }

  let statusSelectorHtml = '';
  if (canEdit && targets.length > 0) {
    statusSelectorHtml = `
      <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
        <span style="font-size: 13px; font-weight: 600;">Ubah status:</span>
        <select class="form-input order-status-select" data-order-id="${ord.id}" data-current-status="${ord.status || 'pending'}" style="height: 38px; padding: 0 10px; font-size: 13px; border-radius: 10px; flex: 1;">
          <option value="" disabled selected>Pilih Status</option>
          ${targets.map(s => `<option value="${s}">${statusLabel(s)}</option>`).join('')}
        </select>
      </div>
    `;
  } else if (!canEdit && ord.status !== 'pending') {
    statusSelectorHtml = `<div style="font-size: 11px; color: var(--ink-muted); text-align: center;">Status dikunci untuk pengambil order</div>`;
  }

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <h4 style="font-size: 16px; font-weight: 800;">${ord.order_code || '#' + ord.id}</h4>
        <div style="font-size: 13px; font-weight: 600; color: var(--ink);">${escapeHtml(custName)}</div>
        <a href="mailto:${escapeHtml(custEmail)}" style="font-size: 12px; color: var(--accent-blue); text-decoration: none;">${escapeHtml(custEmail)}</a>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 16px; font-weight: 800; color: var(--ink);">${formatRupiah(ord.total_price)}</div>
        <div style="font-size: 11px; color: var(--ink-muted);">${formatShortDate(ord.created_at)}</div>
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
      <span style="font-size: 13px; color: var(--ink-secondary);">Status kerja:</span>
      ${renderStatusBadge(ord.status || 'pending')}
    </div>

    <div style="font-size: 12px; color: var(--ink-secondary);">${workerLabel}</div>

    <div style="display: flex; gap: 8px; margin-top: 4px;">
      <button class="btn-outline btn-detail-order" data-order-id="${ord.id}" style="height: 38px; flex: 1;">
        Lihat detail
      </button>
    </div>

    ${claimBtnHtml}
    ${statusSelectorHtml}
  `;

  return card;
}

function renderPagination(totalPages) {
  const container = document.getElementById('orders-pagination');
  if (totalPages <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn';
  prevBtn.textContent = '‹';
  prevBtn.disabled = state.orderPage <= 1;
  prevBtn.onclick = () => { state.orderPage--; renderOrders(); };
  container.appendChild(prevBtn);

  // Generate page numbers with ellipsis
  const p = state.orderPage;
  const pages = Array.from(new Set([1, totalPages, p - 1, p, p + 1]))
    .filter(x => x >= 1 && x <= totalPages)
    .sort((a, b) => a - b);

  let last = 0;
  pages.forEach(val => {
    if (val - last > 1) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.padding = '0 4px';
      dots.style.color = 'var(--ink-muted)';
      container.appendChild(dots);
    }

    const btn = document.createElement('button');
    btn.className = `page-btn ${val === p ? 'active' : ''}`;
    btn.textContent = val;
    btn.onclick = () => { state.orderPage = val; renderOrders(); };
    container.appendChild(btn);
    last = val;
  });

  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn';
  nextBtn.textContent = '›';
  nextBtn.disabled = state.orderPage >= totalPages;
  nextBtn.onclick = () => { state.orderPage++; renderOrders(); };
  container.appendChild(nextBtn);
}

// ========================================================
// Order Detail Modal
// ========================================================
function openOrderDetail(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  document.getElementById('detail-order-code').textContent = order.order_code || '#' + order.id;
  document.getElementById('detail-customer-name').textContent = getCustomerName(order);
  document.getElementById('detail-customer-email').textContent = order.customer?.email || '-';

  // WhatsApp
  const rawWa = order.customer?.whatsapp || '';
  const waContainer = document.getElementById('detail-customer-wa');
  const waUrl = getWhatsAppUrl(rawWa);
  if (waUrl) {
    waContainer.innerHTML = `<a href="${waUrl}" target="_blank" rel="noopener" style="color: #12845E; font-weight: 700; text-decoration: none;">Chat WhatsApp (${rawWa})</a>`;
  } else {
    waContainer.textContent = rawWa || '-';
  }

  // Summary
  document.getElementById('detail-order-total').textContent = formatRupiah(order.total_price);
  document.getElementById('detail-order-status-badge').innerHTML = renderStatusBadge(order.status || 'pending');
  document.getElementById('detail-order-payment').textContent = `${order.payment_method || '-'} • ${order.payment_status || '-'}`;
  document.getElementById('detail-order-date').textContent = formatDate(order.created_at);

  // Estimate
  const deadlineLabel = order.estimated_completion ? formatDate(order.estimated_completion) : 'Belum diatur';
  document.getElementById('detail-order-deadline').textContent = deadlineLabel;

  const maxHours = getCustomerMaxEstimateHours(order);
  const maxOpt = ESTIMATE_OPTIONS.filter(o => o.hours <= maxHours).pop() || ESTIMATE_OPTIONS[0];
  document.getElementById('detail-max-estimate-label').textContent = maxOpt.label;

  const canEdit = canChangeOrder(state.admin, order);
  const estimateBtn = document.getElementById('btn-open-estimate-edit');
  const estimateEditor = document.getElementById('detail-estimate-editor');

  estimateEditor.style.display = 'none';
  if (canEdit) {
    estimateBtn.style.display = 'block';
    setupEstimateButtons(order, maxHours);
  } else {
    estimateBtn.style.display = 'none';
  }

  // Items
  const itemsContainer = document.getElementById('detail-order-items');
  itemsContainer.innerHTML = '';
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) {
    itemsContainer.innerHTML = '<span style="font-size: 13px; color: var(--ink-muted);">Tidak ada item.</span>';
  } else {
    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'modal-row';
      row.style.background = 'var(--bg-variant)';
      row.style.padding = '8px 12px';
      row.style.borderRadius = '10px';
      row.innerHTML = `
        <div>
          <div style="font-weight: 600;">${escapeHtml(it.name || 'Item')}</div>
          <div style="font-size: 11px; color: var(--ink-secondary);">Jumlah: ${it.quantity || 1}</div>
        </div>
        <div style="font-weight: 700; color: var(--accent-blue);">${formatRupiah(it.price)}</div>
      `;
      itemsContainer.appendChild(row);
    });
  }

  // Task
  document.getElementById('detail-task-title').textContent = order.task?.title || '-';
  document.getElementById('detail-task-notes').textContent = order.task?.notes || order.notes || 'Tidak ada catatan.';
  document.getElementById('detail-task-deadline').textContent = order.task?.deadline || '-';

  // Task Attachments & Drive links
  const linksContainer = document.getElementById('detail-task-drive-links');
  linksContainer.innerHTML = '';

  const gDrive = (order.task?.googleDriveUrl || '').trim();
  if (gDrive && isSafeDriveLink(gDrive)) {
    const btn = document.createElement('a');
    btn.href = gDrive;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.className = 'btn-outline';
    btn.style.textDecoration = 'none';
    btn.innerHTML = 'Buka Google Drive Tugas';
    linksContainer.appendChild(btn);
  }

  const attachments = Array.isArray(order.task?.attachments) ? order.task.attachments : [];
  attachments.forEach(att => {
    if (att.drive_url && isSafeDriveLink(att.drive_url)) {
      const attBtn = document.createElement('a');
      attBtn.href = att.drive_url;
      attBtn.target = '_blank';
      attBtn.rel = 'noopener';
      attBtn.className = 'btn-outline';
      attBtn.style.textDecoration = 'none';
      attBtn.textContent = att.name || 'Lampiran';
      linksContainer.appendChild(attBtn);
    }
  });

  if (!gDrive && attachments.length === 0) {
    linksContainer.innerHTML = '<span style="font-size: 12px; color: var(--ink-muted);">Belum ada lampiran.</span>';
  }

  openModal('modal-order-detail');
}

function setupEstimateButtons(order, maxHours) {
  const container = document.getElementById('estimate-buttons-container');
  container.innerHTML = '';

  let selectedHours = 24;

  ESTIMATE_OPTIONS.forEach(opt => {
    const btn = document.createElement('button');
    const available = opt.hours <= maxHours;
    btn.className = `btn-outline estimate-opt-btn ${available ? '' : 'disabled'}`;
    btn.style.flex = '1';
    btn.style.fontSize = '12px';
    btn.style.height = '36px';
    btn.style.padding = '0 4px';
    btn.textContent = opt.label;
    btn.disabled = !available;

    btn.onclick = () => {
      container.querySelectorAll('.estimate-opt-btn').forEach(b => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');
      selectedHours = opt.hours;
    };

    container.appendChild(btn);
  });

  // Select first available
  const firstBtn = container.querySelector('.estimate-opt-btn:not(:disabled)');
  if (firstBtn) firstBtn.click();

  document.getElementById('btn-save-estimate').onclick = async () => {
    const completion = new Date(Date.now() + selectedHours * 3600 * 1000).toISOString();
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('orders')
        .update({ estimated_completion: completion })
        .eq('id', order.id);

      if (error) throw error;
      closeModal('modal-order-detail');
      await loadData();
    } catch (err) {
      alert('Gagal menyimpan estimasi: ' + err.message);
    }
  };
}

// ========================================================
// Tab: Layanan (Services)
// ========================================================
function renderServices() {
  const container = document.getElementById('services-list-container');
  container.innerHTML = '';

  const q = state.searchQuery.toLowerCase();
  const filtered = state.services.filter(s => s.name.toLowerCase().includes(q));

  document.getElementById('services-count-label').textContent = `Data dari server • ${filtered.length} data`;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="entry-card" style="text-align: center; color: var(--ink-secondary);">Tidak ada layanan ditemukan.</div>';
    return;
  }

  filtered.forEach(srv => {
    const card = document.createElement('div');
    card.className = 'entry-card';

    const isActive = srv.status === 'active';
    const saleLabel = srv.sale_percent > 0 ? `Diskon ${srv.sale_percent}%` : srv.sale_amount > 0 ? `Potongan ${formatRupiah(srv.sale_amount)}` : '';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 14px;">
        <div style="flex: 1; min-width: 0;">
          <h4 style="font-size: 16px; font-weight: 700; word-break: break-word;">${escapeHtml(srv.name)}</h4>
          <p style="font-size: 13px; color: var(--ink-secondary); margin-top: 4px; line-height: 1.4; word-break: break-word;">${escapeHtml(srv.description || '-')}</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" class="service-status-toggle" data-service-id="${srv.id}" ${isActive ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
        <div>
          <span style="font-size: 15px; font-weight: 800; color: var(--ink);">${formatRupiah(srv.price)}</span>
          ${saleLabel ? `<span class="status-badge processing" style="margin-left: 8px;">${saleLabel}</span>` : ''}
        </div>
        <span class="status-badge ${isActive ? 'active' : 'inactive'} service-badge-indicator">${isActive ? 'Aktif' : 'Nonaktif'}</span>
      </div>
    `;

    container.appendChild(card);
  });
}

// ========================================================
// Tab: Pembayaran (Payments)
// ========================================================
function renderPayments() {
  const poContainer = document.getElementById('payment-orders-list');
  const payContainer = document.getElementById('payments-list');

  poContainer.innerHTML = '';
  payContainer.innerHTML = '';

  const q = state.searchQuery.toLowerCase();

  // Site Orders
  const filteredPO = state.paymentOrders.filter(po => {
    return (po.order_code || '').toLowerCase().includes(q) ||
           (po.customer?.name || '').toLowerCase().includes(q);
  });

  if (filteredPO.length === 0) {
    poContainer.innerHTML = '<div class="entry-card" style="font-size: 13px; color: var(--ink-muted);">Tidak ada checkout situs.</div>';
  } else {
    filteredPO.forEach(po => {
      const card = document.createElement('div');
      card.className = 'entry-card';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between;">
          <span style="font-weight: 800;">${po.order_code}</span>
          <span class="status-badge ${po.payment_status === 'paid' ? 'completed' : 'pending'}">${po.payment_status}</span>
        </div>
        <div style="font-size: 13px;">${escapeHtml(po.customer?.name || 'Pelanggan')} • <a href="mailto:${po.customer?.email || ''}" style="color: var(--accent-blue);">${po.customer?.email || '-'}</a></div>
        <div style="font-size: 15px; font-weight: 800; color: var(--ink);">${formatRupiah(po.total_price)}</div>
      `;
      poContainer.appendChild(card);
    });
  }

  // Account Payments
  const filteredPay = state.payments.filter(p => {
    return (p.order_id?.toString() || '').includes(q) || (p.status || '').toLowerCase().includes(q);
  });

  if (filteredPay.length === 0) {
    payContainer.innerHTML = '<div class="entry-card" style="font-size: 13px; color: var(--ink-muted);">Tidak ada pembayaran akun.</div>';
  } else {
    filteredPay.forEach(p => {
      const card = document.createElement('div');
      card.className = 'entry-card';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between;">
          <span style="font-weight: 700;">Order #${p.order_id || '-'}</span>
          <span class="status-badge ${p.status === 'paid' || p.status === 'success' ? 'completed' : 'pending'}">${p.status || '-'}</span>
        </div>
        <div style="font-size: 13px; color: var(--ink-secondary);">Metode: ${p.payment_method || '-'} • ID: #${p.id}</div>
        <div style="font-size: 15px; font-weight: 800; color: var(--ink);">${formatRupiah(p.amount)}</div>
      `;
      payContainer.appendChild(card);
    });
  }
}

// ========================================================
// Tab: Ulasan (Reviews)
// ========================================================
function renderReviews() {
  const container = document.getElementById('reviews-list-container');
  container.innerHTML = '';

  const q = state.searchQuery.toLowerCase();
  const filtered = state.reviews.filter(r => {
    return (r.customer_name || '').toLowerCase().includes(q) ||
           (r.comment || '').toLowerCase().includes(q);
  });

  document.getElementById('reviews-count-label').textContent = `Data dari server • ${filtered.length} data`;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="entry-card" style="text-align: center; color: var(--ink-secondary);">Belum ada ulasan.</div>';
    return;
  }

  filtered.forEach(rev => {
    const card = document.createElement('div');
    card.className = 'entry-card';

    const ratingVal = rev.rating || 5;
    const linkedOrder = state.orders.find(o => o.id === rev.order_id);
    const worker = linkedOrder?.assigned_to ? state.profiles.find(p => p.id === linkedOrder.assigned_to) : null;
    const workerName = worker ? profileNickname(worker) : 'Belum terhubung';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 800;">${escapeHtml(rev.customer_name || 'Pelanggan')}</span>
        <span style="font-weight: 800; font-size: 13px; color: #986010;">Rating: ${ratingVal} / 5</span>
      </div>
      <p style="font-size: 13px; color: var(--ink); font-style: italic;">"${escapeHtml(rev.comment || 'Pelanggan memberi rating tanpa komentar.')}"</p>
      <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-muted); margin-top: 4px;">
        <span>Pengerja: Admin ${workerName}</span>
        <span>${rev.verified ? 'Terverifikasi' : 'Belum terverifikasi'}</span>
      </div>
    `;

    container.appendChild(card);
  });
}

// ========================================================
// Tab: Performa (Performance) - Supervisors Only
// ========================================================
function renderPerformance() {
  const now = new Date();
  let since, until;

  if (state.perfRange === 'today') {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    until = new Date(now.getTime() + 1000);
    document.getElementById('perf-month-switcher').style.display = 'none';
  } else if (state.perfRange === 'week') {
    since = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
    until = new Date(now.getTime() + 1000);
    document.getElementById('perf-month-switcher').style.display = 'none';
  } else { // month
    document.getElementById('perf-month-switcher').style.display = 'flex';
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + state.perfMonthOffset, 1);
    since = targetMonth;
    until = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 1);

    const monthName = targetMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    document.getElementById('perf-current-month-label').textContent = monthName;
  }

  // Filter orders
  const periodOrders = state.orders.filter(o => {
    const created = new Date(o.created_at);
    return created >= PERFORMANCE_LAUNCH_AT && created >= since && created < until;
  });

  const paidOrders = periodOrders.filter(o => (o.payment_status || '').toLowerCase() === 'paid' || o.status === 'completed');
  const gross = paidOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
  const gatewayCut = paidOrders.reduce((sum, o) => sum + (o.payment_fee || 0), 0);
  const devCut = gross * 0.10;
  const net = Math.max(0, gross - gatewayCut - devCut);

  const completedCount = periodOrders.filter(o => o.status === 'completed').length;

  document.getElementById('perf-net-revenue').textContent = formatRupiah(net);
  document.getElementById('perf-completed-orders').textContent = `${completedCount} pesanan selesai`;

  document.getElementById('breakdown-gross').textContent = formatRupiah(gross);
  document.getElementById('breakdown-gateway').textContent = `− ${formatRupiah(gatewayCut)}`;
  document.getElementById('breakdown-dev').textContent = `− ${formatRupiah(devCut)}`;
  document.getElementById('breakdown-net').textContent = formatRupiah(net);

  // SVG Chart
  renderCombinedChart(periodOrders, state.perfRange, state.perfMonthOffset);

  // Admin Team Stats
  renderAdminTeamStats(periodOrders);
}

function renderCombinedChart(orders, range, monthOffset) {
  const wrapper = document.getElementById('perf-chart-svg-wrapper');
  wrapper.innerHTML = '';

  // Bucket points
  const points = [];
  const now = new Date();

  if (range === 'today') {
    const currentHour = now.getHours();
    for (let h = 0; h <= currentHour; h++) {
      const match = orders.filter(o => {
        const d = new Date(o.created_at);
        return d.toDateString() === now.toDateString() && d.getHours() === h;
      });
      const amt = match.filter(o => o.status === 'completed' || o.payment_status === 'paid').reduce((s, o) => s + (o.total_price || 0), 0);
      points.push({ label: `${h}:00`, amount: amt, count: match.filter(o => o.status === 'completed').length });
    }
  } else if (range === 'week') {
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 3600 * 1000);
      const match = orders.filter(o => new Date(o.created_at).toDateString() === day.toDateString());
      const amt = match.filter(o => o.status === 'completed' || o.payment_status === 'paid').reduce((s, o) => s + (o.total_price || 0), 0);
      const dayLabel = day.toLocaleDateString('id-ID', { weekday: 'short' });
      points.push({ label: dayLabel, amount: amt, count: match.filter(o => o.status === 'completed').length });
    }
  } else {
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const daysInMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
    const visibleDays = (monthOffset === 0) ? now.getDate() : daysInMonth;

    for (let d = 1; d <= visibleDays; d++) {
      const day = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), d);
      const match = orders.filter(o => new Date(o.created_at).toDateString() === day.toDateString());
      const amt = match.filter(o => o.status === 'completed' || o.payment_status === 'paid').reduce((s, o) => s + (o.total_price || 0), 0);
      points.push({ label: `${d}`, amount: amt, count: match.filter(o => o.status === 'completed').length });
    }
  }

  // Draw SVG Chart
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'chart-svg');
  svg.setAttribute('viewBox', '0 0 500 180');

  const maxAmount = Math.max(1000, ...points.map(p => p.amount));
  const maxCount = Math.max(1, ...points.map(p => p.count));

  // Grid lines
  for (let s = 0; s < 4; s++) {
    const y = 20 + (130 / 3) * s;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', '30');
    line.setAttribute('y1', y);
    line.setAttribute('x2', '480');
    line.setAttribute('y2', y);
    line.setAttribute('stroke', '#E5E9EF');
    line.setAttribute('stroke-dasharray', '3,3');
    svg.appendChild(line);
  }

  const slotW = 450 / Math.max(1, points.length);
  const barW = Math.min(16, slotW * 0.55);

  // Bars (Orders Yellow)
  points.forEach((p, idx) => {
    if (p.count > 0) {
      const barH = (p.count / maxCount) * 120;
      const x = 30 + idx * slotW + (slotW - barW) / 2;
      const y = 150 - barH;
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', barW);
      rect.setAttribute('height', barH);
      rect.setAttribute('fill', '#E2AE16');
      rect.setAttribute('rx', '3');
      svg.appendChild(rect);
    }
  });

  // Line (Revenue Green)
  let pathD = '';
  points.forEach((p, idx) => {
    const x = 30 + idx * slotW + slotW / 2;
    const y = 150 - (p.amount / maxAmount) * 120;
    if (idx === 0) pathD += `M ${x} ${y}`;
    else pathD += ` L ${x} ${y}`;

    // Node circles
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', '3');
    circle.setAttribute('fill', '#16834B');
    svg.appendChild(circle);
  });

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', pathD);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#16834B');
  path.setAttribute('stroke-width', '2.5');
  path.setAttribute('stroke-linecap', 'round');
  svg.insertBefore(path, svg.querySelector('circle'));

  wrapper.appendChild(svg);
}

function renderAdminTeamStats(periodOrders) {
  const container = document.getElementById('perf-admins-list');
  container.innerHTML = '';

  const workers = state.profiles.filter(p => p.role === 'admin');
  const canManage = canManageAdminBalances(state.admin);

  workers.forEach(w => {
    const nickname = profileNickname(w);
    const completedOrders = periodOrders.filter(o => o.assigned_to === w.id && o.status === 'completed');
    const netEarned = completedOrders.reduce((sum, o) => {
      const total = o.total_price || 0;
      const fee = o.payment_fee || 0;
      return sum + Math.max(0, total - fee - total * 0.10);
    }, 0);

    const balance = w.admin_balance || 0;

    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h4 style="font-size: 16px; font-weight: 800;">Admin ${nickname}</h4>
        <span class="status-badge active">${completedOrders.length} order selesai</span>
      </div>
      <div style="font-size: 14px; font-weight: 700; color: var(--revenue-green);">
        Pendapatan order: ${formatRupiah(netEarned)}
      </div>
      <div style="font-size: 15px; font-weight: 800; color: var(--ink);">
        Saldo akun: ${formatRupiah(balance)}
      </div>
      <p style="font-size: 11px; color: var(--ink-secondary);">Saldo termasuk penyesuaian private ledger.</p>
      ${canManage ? `
        <button class="btn-outline btn-adjust-admin-balance" data-admin-id="${w.id}" style="height: 36px; margin-top: 6px;">
          Ubah Saldo
        </button>
      ` : ''}
    `;

    container.appendChild(card);
  });
}

// ========================================================
// Tab: Produk & Promo (Products)
// ========================================================
function renderProducts() {
  const activeSrvCount = state.services.filter(s => s.status === 'active').length;
  const activeDiscCount = state.services.filter(s => (s.sale_percent || 0) > 0 || (s.sale_amount || 0) > 0).length;

  document.getElementById('prod-active-count').textContent = activeSrvCount;
  document.getElementById('prod-discount-count').textContent = activeDiscCount;

  const isBannerActive = state.promoSettings?.active === true;
  document.getElementById('prod-banner-status').textContent = isBannerActive
    ? 'Banner promo sedang aktif'
    : 'Banner promo tidak aktif';

  renderPromoCampaigns();
  renderProductDiscountsList();
  renderProductPricesList();
}

function renderPromoCampaigns() {
  const container = document.getElementById('promos-list-container');
  container.innerHTML = '';

  const isSupervisor = canManagePromos(state.admin);

  if (state.promoCampaigns.length === 0) {
    container.innerHTML = '<div class="entry-card" style="font-size: 13px; color: var(--ink-muted);">Belum ada promo. Buat baru di bawah.</div>';
    return;
  }

  state.promoCampaigns.forEach(promo => {
    const card = document.createElement('div');
    card.className = 'entry-card';

    const starts = promo.starts_at ? new Date(promo.starts_at) : null;
    const ends = promo.ends_at ? new Date(promo.ends_at) : null;

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 17px; font-weight: 800;">${promo.coupon}</span>
        <span class="status-badge ${promo.active ? 'active' : 'inactive'}">${promo.active ? 'Aktif' : 'Nonaktif'}</span>
      </div>
      <div style="font-weight: 800; color: var(--revenue-green);">Diskon s.d ${promo.discount_percent}%</div>
      <p style="font-size: 13px; color: var(--ink);">${escapeHtml(promo.text)}</p>

      <div class="countdown-row" id="countdown-${promo.id}">
        <div class="countdown-box"><div class="countdown-num">0</div><div class="countdown-label">Hari</div></div>
        <div class="countdown-box"><div class="countdown-num">0</div><div class="countdown-label">Jam</div></div>
        <div class="countdown-box"><div class="countdown-num">0</div><div class="countdown-label">Menit</div></div>
        <div class="countdown-box"><div class="countdown-num">0</div><div class="countdown-label">Detik</div></div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
        <span style="font-size: 13px; font-weight: 600;">Tampilkan di website</span>
        <label class="toggle-switch">
          <input type="checkbox" class="promo-toggle-active" data-promo-id="${promo.id}" ${promo.active ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 6px;">
        <button class="btn-outline btn-edit-promo" data-promo-id="${promo.id}" style="flex: 1; height: 36px;">Edit Promo</button>
        ${isSupervisor ? `
          <button class="btn-outline btn-delete-promo" data-promo-id="${promo.id}" style="color: var(--balance-red); border-color: rgba(212,53,70,0.3); height: 36px;">Hapus</button>
        ` : ''}
      </div>
    `;

    container.appendChild(card);
    setupPromoCountdown(promo.id, ends);
  });
}

function setupPromoCountdown(promoId, ends) {
  function tick() {
    const el = document.getElementById(`countdown-${promoId}`);
    if (!el || !ends) return;

    const diff = Math.max(0, ends.getTime() - Date.now());
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    const nums = el.querySelectorAll('.countdown-num');
    if (nums.length === 4) {
      nums[0].textContent = days;
      nums[1].textContent = hours;
      nums[2].textContent = minutes;
      nums[3].textContent = seconds;
    }
  }

  tick();
  const timer = setInterval(tick, 1000);
}

function renderProductDiscountsList() {
  const container = document.getElementById('product-discounts-list');
  container.innerHTML = '';

  state.services.forEach(srv => {
    const card = document.createElement('div');
    card.className = 'entry-card';

    const discPrice = (srv.price || 0) * (1 - (srv.sale_percent || 0) / 100) - (srv.sale_amount || 0);

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between;">
        <h4 style="font-size: 15px; font-weight: 700;">${escapeHtml(srv.name)}</h4>
        ${(srv.sale_percent > 0 || srv.sale_amount > 0) ? '<span class="status-badge processing">Diskon Aktif</span>' : ''}
      </div>
      <div style="font-size: 13px;">Harga dasar: <b>${formatRupiah(srv.price)}</b></div>
      ${(srv.sale_percent > 0 || srv.sale_amount > 0) ? `
        <div style="font-size: 14px; font-weight: 800; color: var(--balance-red);">Harga setelah diskon: ${formatRupiah(Math.max(0, discPrice))}</div>
      ` : ''}
      <button class="btn-primary btn-open-discount-modal" data-service-id="${srv.id}" style="height: 38px; margin-top: 6px;">
        Atur Diskon
      </button>
    `;
    container.appendChild(card);
  });
}

function renderProductPricesList() {
  const container = document.getElementById('product-prices-list');
  container.innerHTML = '';

  state.services.forEach(srv => {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <h4 style="font-size: 15px; font-weight: 700;">${escapeHtml(srv.name)}</h4>
      <div style="font-size: 14px;">Harga dasar sekarang: <b>${formatRupiah(srv.price)}</b></div>
      <button class="btn-primary btn-open-price-modal" data-service-id="${srv.id}" style="height: 38px; margin-top: 6px;">
        Ubah Harga Dasar
      </button>
    `;
    container.appendChild(card);
  });
}

// ========================================================
// Tab: Folder Lampiran (Task Files)
// ========================================================
function renderTaskFiles() {
  const input = document.getElementById('task-drive-input');
  if (input) input.value = state.driveFolderUrl || '';
}

// ========================================================
// Tab: Pengguna (Users) - Supervisor Only
// ========================================================
function renderUsers() {
  const container = document.getElementById('users-list-container');
  container.innerHTML = '';

  const q = state.searchQuery.toLowerCase();
  const filtered = state.profiles.filter(p => {
    return (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
  });

  document.getElementById('users-count-label').textContent = `Data dari server • ${filtered.length} pengguna`;

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h4 style="font-size: 15px; font-weight: 700;">${escapeHtml(p.name || 'Pengguna')}</h4>
        <span class="status-badge ${p.role === 'admin' ? 'active' : 'pending'}">${p.role || 'user'}</span>
      </div>
      <a href="mailto:${escapeHtml(p.email || '')}" style="font-size: 13px; color: var(--accent-blue); text-decoration: none;">${escapeHtml(p.email || '-')}</a>
      <div style="font-size: 12px; color: var(--ink-secondary);">${escapeHtml(p.phone || 'Nomor telepon belum tersedia')}</div>
    `;
    container.appendChild(card);
  });
}

// ========================================================
// Modals & Action Sheet Management
// ========================================================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('open');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;

  const okBtn = document.getElementById('btn-confirm-ok');
  okBtn.onclick = () => {
    closeModal('modal-confirm');
    onConfirm();
  };

  openModal('modal-confirm');
}

function showNotice(text) {
  const toast = document.getElementById('notice-toast');
  const msg = document.getElementById('notice-text');
  msg.textContent = text;
  toast.style.display = 'flex';
  setTimeout(() => { toast.style.display = 'none'; }, 5000);
}

function playNoticeSound() {
  try {
    const audio = document.getElementById('notification-sound');
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  } catch (e) {}
}

function openDrawer() {
  document.getElementById('drawer-overlay').classList.add('open');
  document.getElementById('drawer-panel').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer-overlay').classList.remove('open');
  document.getElementById('drawer-panel').classList.remove('open');
}

// ========================================================
// Event Listeners & User Actions
// ========================================================
function setupEventListeners() {
  // Login Form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const rem = document.getElementById('remember-me').checked;
    await handleLogin(email, pass, rem);
  });

  // Google Sign-In
  const googleBtn = document.getElementById('btn-login-google');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      const errorBox = document.getElementById('login-error-box');
      if (errorBox) errorBox.style.display = 'none';

      if (window.location.protocol === 'file:') {
        if (errorBox) {
          errorBox.textContent = 'Login Google memerlukan web server aktif. Jalankan START-SERVER.bat lalu buka http://localhost:3000, atau masuk menggunakan Email & Password.';
          errorBox.style.display = 'block';
        }
        return;
      }

      try {
        const supabase = await getSupabase();
        localStorage.setItem('password_login_at', Date.now().toString());
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: WORKPLACE_REDIRECT_URL
          }
        });
        if (error) throw error;
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message || 'Gagal masuk dengan Google.';
          errorBox.style.display = 'block';
        }
      }
    });
  }

  // Top Bar Refresh
  document.getElementById('btn-refresh').addEventListener('click', () => {
    loadData();
  });

  // Drawer Controls
  document.getElementById('btn-open-drawer').addEventListener('click', openDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);
  document.getElementById('btn-drawer-refresh').addEventListener('click', () => {
    closeDrawer();
    loadData();
  });
  document.getElementById('btn-drawer-logout').addEventListener('click', handleLogout);

  // Bottom Navigation Click
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Drawer Menu Click
  document.querySelectorAll('.drawer-item').forEach(btn => {
    btn.addEventListener('click', () => {
      closeDrawer();
      switchTab(btn.dataset.tab);
    });
  });

  // Global Search Input
  document.getElementById('global-search-input').addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    state.orderPage = 1;
    renderActiveTab();
  });

  // See All Orders on Home
  document.getElementById('btn-see-all-orders').addEventListener('click', () => {
    switchTab('orders');
  });

  // Order Mode Selector (Proses vs Riwayat)
  document.getElementById('mode-process-btn').addEventListener('click', (e) => {
    state.orderMode = 'process';
    state.orderPage = 1;
    e.target.classList.add('active');
    document.getElementById('mode-history-btn').classList.remove('active');
    renderOrders();
  });
  document.getElementById('mode-history-btn').addEventListener('click', (e) => {
    state.orderMode = 'history';
    state.orderPage = 1;
    e.target.classList.add('active');
    document.getElementById('mode-process-btn').classList.remove('active');
    renderOrders();
  });

  // Performance Range Selector
  document.getElementById('perf-today-btn').addEventListener('click', (e) => {
    state.perfRange = 'today';
    document.querySelectorAll('#view-performance .mode-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderPerformance();
  });
  document.getElementById('perf-week-btn').addEventListener('click', (e) => {
    state.perfRange = 'week';
    document.querySelectorAll('#view-performance .mode-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderPerformance();
  });
  document.getElementById('perf-month-btn').addEventListener('click', (e) => {
    state.perfRange = 'month';
    state.perfMonthOffset = 0;
    document.querySelectorAll('#view-performance .mode-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderPerformance();
  });

  // Performance Month Switcher
  document.getElementById('perf-prev-month-btn').addEventListener('click', () => {
    state.perfMonthOffset--;
    renderPerformance();
  });
  document.getElementById('perf-next-month-btn').addEventListener('click', () => {
    if (state.perfMonthOffset < 0) {
      state.perfMonthOffset++;
      renderPerformance();
    }
  });

  // Product Navigation Subsections
  document.getElementById('btn-goto-promos').addEventListener('click', () => {
    document.getElementById('product-menu-section').style.display = 'none';
    document.getElementById('product-promo-section').style.display = 'block';
  });
  document.getElementById('btn-back-to-prod-menu').addEventListener('click', () => {
    document.getElementById('product-promo-section').style.display = 'none';
    document.getElementById('product-menu-section').style.display = 'block';
  });

  document.getElementById('btn-goto-discounts').addEventListener('click', () => {
    document.getElementById('product-menu-section').style.display = 'none';
    document.getElementById('product-discount-section').style.display = 'block';
  });
  document.getElementById('btn-back-to-prod-menu-2').addEventListener('click', () => {
    document.getElementById('product-discount-section').style.display = 'none';
    document.getElementById('product-menu-section').style.display = 'block';
  });

  document.getElementById('btn-goto-prices').addEventListener('click', () => {
    document.getElementById('product-menu-section').style.display = 'none';
    document.getElementById('product-price-section').style.display = 'block';
  });
  document.getElementById('btn-back-to-prod-menu-3').addEventListener('click', () => {
    document.getElementById('product-price-section').style.display = 'none';
    document.getElementById('product-menu-section').style.display = 'block';
  });

  // Modal Close Buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.closeModal);
    });
  });

  document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
    closeModal('modal-confirm');
  });

  // Open Estimate Edit
  document.getElementById('btn-open-estimate-edit').addEventListener('click', () => {
    document.getElementById('detail-estimate-editor').style.display = 'flex';
  });
  document.getElementById('btn-cancel-estimate').addEventListener('click', () => {
    document.getElementById('detail-estimate-editor').style.display = 'none';
  });

  // Save Drive Folder
  document.getElementById('btn-save-drive-folder').addEventListener('click', async () => {
    const input = document.getElementById('task-drive-input').value.trim();
    if (!input || !isSafeDriveLink(input)) {
      alert('Masukkan link folder Google Drive yang valid.');
      return;
    }
    try {
      const match = input.match(/^https:\/\/drive\.google\.com\/drive\/folders\/([A-Za-z0-9_-]{10,120})/);
      const folderId = match ? match[1] : '';
      const supabase = await getSupabase();
      const { error } = await supabase.from('site_settings').upsert({
        key: 'task_upload_drive_folder',
        value: { folder_url: input, folder_id: folderId }
      });
      if (error) throw error;
      state.driveFolderUrl = input;
      showNotice('Folder lampiran berhasil diperbarui');
    } catch (err) {
      alert('Gagal menyimpan folder: ' + err.message);
    }
  });

  // Delegated dynamic events (Claim order, Status change, Detail modal, Promo actions)
  document.addEventListener('click', async (e) => {
    // Detail Order Button
    const detailBtn = e.target.closest('.btn-detail-order');
    if (detailBtn) {
      const orderId = parseInt(detailBtn.dataset.orderId, 10);
      openOrderDetail(orderId);
      return;
    }

    // Claim Order Button
    const claimBtn = e.target.closest('.btn-claim-order');
    if (claimBtn) {
      const orderId = parseInt(claimBtn.dataset.orderId, 10);
      showConfirm('Konfirmasi Ambil Pesanan', 'Apakah Anda yakin ingin mengambil pesanan ini untuk dikerjakan?', async () => {
        try {
          const supabase = await getSupabase();
          const { error } = await supabase
            .from('orders')
            .update({
              status: 'processing',
              assigned_to: state.admin.id,
              assigned_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('status', 'pending');

          if (error) throw error;
          await loadData();
        } catch (err) {
          alert('Gagal mengambil pesanan: ' + err.message);
        }
      });
      return;
    }

    // Adjust Admin Balance Button
    const adjustBtn = e.target.closest('.btn-adjust-admin-balance');
    if (adjustBtn) {
      const adminId = adjustBtn.dataset.adminId;
      const targetProfile = state.profiles.find(p => p.id === adminId);
      if (targetProfile) openAdjustBalanceModal(targetProfile);
      return;
    }

    // Create Promo Button
    if (e.target.id === 'btn-create-promo') {
      openPromoEditor(null);
      return;
    }

    // Edit Promo Button
    const editPromoBtn = e.target.closest('.btn-edit-promo');
    if (editPromoBtn) {
      const promoId = editPromoBtn.dataset.promoId;
      const promo = state.promoCampaigns.find(p => p.id === promoId);
      if (promo) openPromoEditor(promo);
      return;
    }

    // Delete Promo Button
    const delPromoBtn = e.target.closest('.btn-delete-promo');
    if (delPromoBtn) {
      const promoId = delPromoBtn.dataset.promoId;
      const promo = state.promoCampaigns.find(p => p.id === promoId);
      if (promo) {
        showConfirm('Hapus Promo', `Hapus promo ${promo.coupon}? Jika sedang aktif, banner website akan dimatikan.`, async () => {
          try {
            const supabase = await getSupabase();
            const { error } = await supabase.rpc('jokiin_manage_promo', {
              p_action: 'delete',
              p_campaign_id: promoId
            });
            if (error) throw error;
            await loadData();
          } catch (err) {
            alert('Gagal menghapus promo: ' + err.message);
          }
        });
      }
      return;
    }

    // Open Discount Modal Button
    const discBtn = e.target.closest('.btn-open-discount-modal');
    if (discBtn) {
      const srvId = parseInt(discBtn.dataset.serviceId, 10);
      const srv = state.services.find(s => s.id === srvId);
      if (srv) openDiscountModal(srv);
      return;
    }

    // Open Price Modal Button
    const priceBtn = e.target.closest('.btn-open-price-modal');
    if (priceBtn) {
      const srvId = parseInt(priceBtn.dataset.serviceId, 10);
      const srv = state.services.find(s => s.id === srvId);
      if (srv) openPriceModal(srv);
      return;
    }
  });

  // Delegated Change Events
  document.addEventListener('change', async (e) => {
    // Order Status Select
    if (e.target.classList.contains('order-status-select')) {
      const select = e.target;
      const orderId = parseInt(select.dataset.orderId, 10);
      const prev = select.dataset.currentStatus;
      const next = select.value;
      if (!next || next === prev) return;

      showConfirm('Ubah Status Pesanan', `Ubah status pesanan #${orderId} menjadi ${statusLabel(next)}?`, async () => {
        try {
          const supabase = await getSupabase();
          const { error } = await supabase
            .from('orders')
            .update({ status: next })
            .eq('id', orderId)
            .eq('status', prev);

          if (error) throw error;
          await loadData();
        } catch (err) {
          alert('Gagal mengubah status: ' + err.message);
          select.value = prev;
        }
      });
      return;
    }

    // Service Status Toggle
    if (e.target.classList.contains('service-status-toggle')) {
      const toggle = e.target;
      const srvId = parseInt(toggle.dataset.serviceId, 10);
      const nextStatus = toggle.checked ? 'active' : 'inactive';

      const srv = state.services.find(s => s.id === srvId);
      const card = toggle.closest('.entry-card');
      const badge = card ? card.querySelector('.service-badge-indicator') : null;

      if (srv) srv.status = nextStatus;
      if (badge) {
        badge.className = `status-badge ${nextStatus === 'active' ? 'active' : 'inactive'} service-badge-indicator`;
        badge.textContent = nextStatus === 'active' ? 'Aktif' : 'Nonaktif';
      }

      try {
        const supabase = await getSupabase();
        const { error } = await supabase
          .from('services')
          .update({ status: nextStatus })
          .eq('id', srvId);

        if (error) throw error;
        showNotice(`Layanan "${srv?.name || ''}" diubah menjadi ${nextStatus === 'active' ? 'Aktif' : 'Nonaktif'}`);
      } catch (err) {
        alert('Gagal mengubah status layanan: ' + err.message);
        toggle.checked = !toggle.checked;
        const revertStatus = toggle.checked ? 'active' : 'inactive';
        if (srv) srv.status = revertStatus;
        if (badge) {
          badge.className = `status-badge ${revertStatus === 'active' ? 'active' : 'inactive'} service-badge-indicator`;
          badge.textContent = revertStatus === 'active' ? 'Aktif' : 'Nonaktif';
        }
      }
      return;
    }

    // Promo Active Toggle
    if (e.target.classList.contains('promo-toggle-active')) {
      const toggle = e.target;
      const promoId = toggle.dataset.promoId;
      const nextActive = toggle.checked;

      try {
        const supabase = await getSupabase();
        const { error } = await supabase.rpc('jokiin_manage_promo', {
          p_action: nextActive ? 'activate' : 'deactivate',
          p_campaign_id: promoId
        });
        if (error) throw error;
        await loadData();
      } catch (err) {
        alert('Gagal mengubah status promo: ' + err.message);
        toggle.checked = !toggle.checked;
      }
      return;
    }
  });

  // Promo Editor Submit
  document.getElementById('promo-editor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('promo-edit-id').value || null;
    const text = document.getElementById('promo-edit-text').value.trim();
    const coupon = document.getElementById('promo-edit-coupon').value.trim().toUpperCase();
    const percent = parseInt(document.getElementById('promo-edit-percent').value, 10);
    const startsAt = new Date(document.getElementById('promo-edit-starts').value).toISOString();
    const endsAt = new Date(document.getElementById('promo-edit-ends').value).toISOString();

    try {
      const supabase = await getSupabase();
      const params = {
        p_action: id ? 'edit' : 'create',
        p_text: text,
        p_coupon: coupon,
        p_discount_percent: percent,
        p_starts_at: startsAt,
        p_ends_at: endsAt
      };
      if (id) params.p_campaign_id = id;

      const { error } = await supabase.rpc('jokiin_manage_promo', params);
      if (error) throw error;

      closeModal('modal-promo-editor');
      await loadData();
    } catch (err) {
      alert('Gagal menyimpan promo: ' + err.message);
    }
  });

  // Tab Swipe Gestures (Mobile Safari & Touchscreens)
  setupSwipeGestures();
}

// ========================================================
// Touch & Swipe Gesture Navigation
// ========================================================
function setupSwipeGestures() {
  const container = document.getElementById('app-container');
  if (!container) return;

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let isTracking = false;

  container.addEventListener('touchstart', (e) => {
    // Ignore if drawer is open or modal is active
    if (document.getElementById('drawer-panel')?.classList.contains('open')) return;
    if (document.querySelector('.modal-overlay.open')) return;

    const target = e.target;
    // Don't intercept inputs, toggles, buttons, chart or selector pills
    if (target.closest('input, textarea, select, button, label.toggle-switch, .toggle-switch, .countdown-row, #perf-chart-svg-wrapper, .mode-selector')) {
      return;
    }

    const touch = e.touches[0];
    // Avoid iOS Safari edge swipe back navigation conflict
    if (touch.clientX < 24) return;

    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
    isTracking = true;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!isTracking || !startTime) return;
    isTracking = false;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const duration = Date.now() - startTime;
    startTime = 0;

    // Must be quick (< 550ms), horizontal enough (> 48px), and horizontal movement dominates vertical
    if (duration < 550 && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.35) {
      const currentTab = state.activeTab;
      const idx = BOTTOM_TABS.indexOf(currentTab);
      if (idx !== -1) {
        if (dx < -48 && idx < BOTTOM_TABS.length - 1) {
          // Swiped left -> move to next tab on the right
          switchTab(BOTTOM_TABS[idx + 1], 'right');
        } else if (dx > 48 && idx > 0) {
          // Swiped right -> move to previous tab on the left
          switchTab(BOTTOM_TABS[idx - 1], 'left');
        }
      }
    }
  }, { passive: true });

  container.addEventListener('touchcancel', () => {
    isTracking = false;
    startTime = 0;
  }, { passive: true });
}

// ========================================================
// Modal Helper Openers
// ========================================================
function openAdjustBalanceModal(target) {
  document.getElementById('adjust-balance-title').textContent = `Ubah Saldo Admin ${profileNickname(target)}`;
  document.getElementById('adjust-balance-current').textContent = `Saldo sekarang: ${formatRupiah(target.admin_balance)}`;

  let isAdding = true;
  const addBtn = document.getElementById('adjust-type-add');
  const subBtn = document.getElementById('adjust-type-subtract');
  const amountInput = document.getElementById('adjust-balance-amount');
  const errBox = document.getElementById('adjust-balance-error');

  amountInput.value = '';
  errBox.style.display = 'none';

  addBtn.onclick = () => {
    isAdding = true;
    addBtn.classList.add('active');
    subBtn.classList.remove('active');
  };
  subBtn.onclick = () => {
    isAdding = false;
    subBtn.classList.add('active');
    addBtn.classList.remove('active');
  };

  document.getElementById('btn-save-adjust-balance').onclick = () => {
    const val = parseInt(amountInput.value, 10);
    if (!val || val <= 0) {
      errBox.textContent = 'Nominal harus lebih dari 0.';
      errBox.style.display = 'block';
      return;
    }
    const currentBalance = target.admin_balance || 0;
    if (!isAdding && val > currentBalance) {
      errBox.textContent = 'Pengurangan melebihi saldo saat ini.';
      errBox.style.display = 'block';
      return;
    }

    const delta = isAdding ? val : -val;
    const actionLabel = isAdding ? 'menambah' : 'mengurangi';

    closeModal('modal-adjust-balance');
    showConfirm('Konfirmasi Perubahan Saldo', `Konfirmasi ${actionLabel} saldo ${profileNickname(target)} sebesar ${formatRupiah(val)}?`, async () => {
      try {
        const supabase = await getSupabase();
        const { error } = await supabase.rpc('adjust_admin_balance', {
          p_target_admin_id: target.id,
          p_delta: delta
        });
        if (error) throw error;
        await loadData();
      } catch (err) {
        alert('Gagal mengubah saldo: ' + err.message);
      }
    });
  };

  openModal('modal-adjust-balance');
}

function openPromoEditor(promo) {
  document.getElementById('promo-editor-title').textContent = promo ? 'Edit Promo' : 'Buat Promo Baru';
  document.getElementById('promo-edit-id').value = promo?.id || '';
  document.getElementById('promo-edit-text').value = promo?.text || '';
  document.getElementById('promo-edit-coupon').value = promo?.coupon || '';
  document.getElementById('promo-edit-percent').value = promo?.discount_percent || 10;

  // Datetime local formatting
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const startVal = promo?.starts_at ? new Date(promo.starts_at) : now;
  const endVal = promo?.ends_at ? new Date(promo.ends_at) : nextWeek;

  document.getElementById('promo-edit-starts').value = formatDateTimeLocal(startVal);
  document.getElementById('promo-edit-ends').value = formatDateTimeLocal(endVal);

  openModal('modal-promo-editor');
}

function openDiscountModal(srv) {
  document.getElementById('discount-editor-title').textContent = `Atur Diskon ${escapeHtml(srv.name)}`;
  document.getElementById('discount-editor-price').textContent = `Harga dasar: ${formatRupiah(srv.price)}`;

  const percentInput = document.getElementById('discount-percent-input');
  const amountInput = document.getElementById('discount-amount-input');

  percentInput.value = srv.sale_percent || '';
  amountInput.value = srv.sale_amount || '';

  document.getElementById('btn-save-discount').onclick = async () => {
    const pVal = parseInt(percentInput.value, 10) || 0;
    const aVal = parseInt(amountInput.value, 10) || 0;

    if (pVal > 0 && aVal > 0) {
      alert('Pilih salah satu jenis diskon (persen atau nominal).');
      return;
    }
    if (aVal >= (srv.price || 0)) {
      alert('Diskon nominal harus lebih kecil daripada harga dasar.');
      return;
    }

    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('services')
        .update({ sale_percent: pVal, sale_amount: aVal })
        .eq('id', srv.id);

      if (error) throw error;
      closeModal('modal-discount-editor');
      await loadData();
    } catch (err) {
      alert('Gagal menyimpan diskon: ' + err.message);
    }
  };

  openModal('modal-discount-editor');
}

function openPriceModal(srv) {
  document.getElementById('price-editor-title').textContent = `Ubah Harga Dasar ${escapeHtml(srv.name)}`;
  const input = document.getElementById('price-amount-input');
  input.value = srv.price || '';

  document.getElementById('btn-save-price').onclick = async () => {
    const newPrice = parseInt(input.value, 10);
    if (!newPrice || newPrice <= (srv.sale_amount || 0)) {
      alert('Harga baru harus lebih besar daripada potongan diskon nominal.');
      return;
    }

    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('services')
        .update({ price: newPrice })
        .eq('id', srv.id);

      if (error) throw error;
      closeModal('modal-price-editor');
      await loadData();
    } catch (err) {
      alert('Gagal memperbarui harga: ' + err.message);
    }
  };

  openModal('modal-price-editor');
}

// ========================================================
// Utility Helpers
// ========================================================
function formatRupiah(val) {
  const num = typeof val === 'number' ? val : parseFloat(val) || 0;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
}

function formatDate(isoStr) {
  if (!isoStr) return 'Belum diatur';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
  } catch (e) {
    return isoStr;
  }
}

function formatShortDate(isoStr) {
  if (!isoStr) return 'Baru saja';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  } catch (e) {
    return isoStr;
  }
}

function formatDateTimeLocal(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusLabel(status) {
  switch (status) {
    case 'pending': return 'Baru';
    case 'processing': return 'Diproses';
    case 'revision': return 'Revisi';
    case 'completed': return 'Selesai';
    case 'cancelled': return 'Dibatalkan';
    case 'active': return 'Aktif';
    case 'inactive': return 'Nonaktif';
    default: return status || '-';
  }
}

function renderStatusBadge(status) {
  const isComp = status === 'completed';
  return `
    <span class="status-badge ${status}">
      ${statusLabel(status)}
      ${isComp ? '<img src="./assets/secure.gif" class="completion-gif" alt="Selesai">' : ''}
    </span>
  `;
}

function getCustomerName(ord) {
  return ord.customer?.name || ord.customerName || 'Pelanggan';
}

function getWorkerLabel(ord) {
  if (!ord.assigned_to) return 'Dikerjakan oleh: Belum diambil';
  const worker = state.profiles.find(p => p.id === ord.assigned_to);
  const name = worker ? profileNickname(worker) : 'Admin';
  return `Dikerjakan oleh Admin ${name}`;
}

function getCustomerMaxEstimateHours(ord) {
  const raw = (ord.task?.deadline || '').trim().toLowerCase();
  if (!raw) return 96;

  const dayMatch = raw.match(/(\d+)\s*(hari|day)/);
  if (dayMatch) return Math.min(96, Math.max(12, parseInt(dayMatch[1], 10) * 24));

  const hrMatch = raw.match(/(\d+)\s*(jam|hour)/);
  if (hrMatch) return Math.min(96, Math.max(12, parseInt(hrMatch[1], 10)));

  return 96;
}

function getWhatsAppUrl(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  let norm = digits;
  if (digits.startsWith('0')) norm = '62' + digits.slice(1);
  else if (digits.startsWith('8')) norm = '62' + digits;
  if (norm.length >= 9 && norm.length <= 15) {
    return `https://wa.me/${norm}`;
  }
  return null;
}

function isSafeDriveLink(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(parsed.hostname.toLowerCase());
  } catch (e) {
    return false;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

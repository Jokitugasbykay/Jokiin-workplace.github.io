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
        storageKey: 'jokiin-workplace-auth',
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
  knownCheckoutIds: new Set(),
  ordersBaselineLoaded: false,
  checkoutBaselineLoaded: false,
  loading: false,
  liveUpdateTimer: null,
  countdownTimer: null
};

window.state = state;

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
  }, 0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

const introStartedAt = Date.now();
function hideSplash() {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const remaining = reduced ? 0 : Math.max(0, 1800 - (Date.now() - introStartedAt));
  if (remaining) { setTimeout(hideSplash, remaining); return; }
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
  return Boolean(state.admin);
}

async function recordLogin(supabase) {
  try {
    const { error } = await supabase.rpc('workplace_record_login', { device: navigator.userAgent.slice(0, 256) });
    if (error) console.warn('Catatan login belum tersimpan:', error.message);
  } catch (error) { console.warn('Catatan login belum tersimpan:', error.message); }
}

async function checkInitialSession() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (error) throw error;
    if (profile?.role === 'admin') {
      state.admin = { ...profile, avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || profile.avatar_url };
      await recordLogin(supabase);
      showAppShell();
      await loadData();
      startLiveUpdates();
      return;
    }
    await supabase.auth.signOut({ scope: 'local' });
    const errorBox = document.getElementById('login-error-box');
    errorBox.textContent = 'Akun ini tidak memiliki hak akses admin Workplace.';
    errorBox.style.display = 'block';
  }
  const rememberedEmail = localStorage.getItem('workplace_remembered_email');
  if (rememberedEmail) document.getElementById('login-email').value = rememberedEmail;
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
  document.getElementById('header-account-name').textContent = nickname;
  document.getElementById('header-account-role').textContent = isOrderSupervisor(state.admin) ? 'Supervisor' : 'Admin';
  const headerDate = document.getElementById('header-date');
  headerDate.textContent = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date());
  headerDate.dateTime = new Date().toISOString();
  for (const id of ['drawer-avatar', 'header-avatar-letter']) {
    const avatar = document.getElementById(id);
    if (!avatar) continue;
    const initial = nickname.charAt(0).toUpperCase();
    avatar.textContent = initial;
    try {
      const url = new URL(state.admin.avatar_url);
      if (url.protocol !== 'https:') continue;
      const image = document.createElement('img');
      image.src = url.href;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.onerror = () => { avatar.textContent = initial; };
      avatar.replaceChildren(image);
    } catch { /* Keep initials when no profile photo is available. */ }
  }
  // Supervisor tabs visibility
  const isSupervisor = isOrderSupervisor(state.admin);
  document.getElementById('drawer-tab-performance').style.display = isSupervisor ? 'flex' : 'none';
  document.getElementById('drawer-tab-users').style.display = isSupervisor ? 'flex' : 'none';

  // Initialize active tab and bottom nav pill
  const notificationTab = new URLSearchParams(window.location.search).get('tab');
  switchTab(['orders', 'payments'].includes(notificationTab) ? notificationTab : (state.activeTab || 'home'));
  syncPushSubscription().catch(error => setPushStatus(error.message || 'Gagal menyinkronkan notifikasi. Coba lagi.'));
}
window.showAppShell = showAppShell;

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
    await recordLogin(supabase);
    if (rememberMe) {
      localStorage.setItem('workplace_remembered_email', email.trim());
    } else {
      localStorage.removeItem('workplace_remembered_email');
    }

    state.admin = { ...profile, avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || profile.avatar_url };
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
  try { await disablePushNotifications(false); } catch {
    showNotice('Gagal menonaktifkan notifikasi perangkat. Coba keluar lagi saat koneksi tersedia.');
    return;
  }
  stopLiveUpdates();
  const supabase = await getSupabase();
  await supabase.auth.signOut({ scope: 'local' });
  state.admin = null;
  activityHistoryReady = false;
  state.knownOrderIds.clear();
  state.knownCheckoutIds.clear();
  state.ordersBaselineLoaded = false;
  state.checkoutBaselineLoaded = false;
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
      if (refreshedAdmin) state.admin = { ...refreshedAdmin, avatar_url: state.admin.avatar_url || refreshedAdmin.avatar_url };
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

    let newlyArrived = 0;
    if (!ordersRes.error) newlyArrived += trackIncomingOrders(newOrders, 'orders');
    if (!paymentOrdersRes.error) newlyArrived += trackIncomingOrders(newPaymentOrders, 'checkout');
    if (newlyArrived > 0) {
      showNotice(newlyArrived === 1 ? 'Ada pesanan baru masuk' : `Ada ${newlyArrived} pesanan baru masuk`);
      playNoticeSound();
    }

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
      stopLiveUpdates();
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

let restoringActivity = false;
let activityHistoryReady = false;
function activityView() {
  return { searchQuery: state.searchQuery, orderPage: state.orderPage, orderMode: state.orderMode, perfRange: state.perfRange, perfMonthOffset: state.perfMonthOffset };
}
function rememberActivity() {
  if (activityHistoryReady && !restoringActivity && window.history?.state?.workplace) {
    window.history.replaceState({ ...window.history.state, view: activityView() }, '', window.location.href);
  }
}
function saveActivity(modal = null) {
  if (!window.history || restoringActivity) return;
  const url = new URL(window.location.href);
  url.searchParams.set('tab', state.activeTab);
  const activity = { workplace: true, tab: state.activeTab, modal, view: activityView() };
  if (!activityHistoryReady) {
    window.history.replaceState({ ...activity, root: true }, '', url);
    activityHistoryReady = true;
  }
  window.history.pushState(activity, '', url);
}

function restoreActivity(event) {
  if (!activityHistoryReady || !state.admin) return;
  const activity = event.state;
  if (!activity?.workplace) return;
  activePageTransition?.();
  restoringActivity = true;
  try {
    document.querySelectorAll('.modal-overlay.open').forEach(modal => modal.classList.remove('open'));
    closeDrawer();
    const tab = ['performance', 'users'].includes(activity.tab) && !isOrderSupervisor(state.admin) ? 'home' : activity.tab;
    switchTab(tab, 'left');
    if (activity.view) Object.assign(state, activity.view);
    document.getElementById('global-search-input').value = state.searchQuery;
    renderActiveTab();
    if (activity.modal) openModal(activity.modal);
  } finally { restoringActivity = false; }
  if (activity.root) saveActivity();
}
window.addEventListener('popstate', restoreActivity);

let activePageTransition = null;
function switchTab(tabName, forcedDirection = null) {
  activePageTransition?.();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const previous = document.getElementById('view-' + state.activeTab);
  const content = document.getElementById('main-content');
  if (reduced || state.activeTab === tabName || !previous?.animate) return performSwitchTab(tabName, forcedDirection);
  const direction = forcedDirection || (BOTTOM_TABS.indexOf(tabName) >= BOTTOM_TABS.indexOf(state.activeTab) ? 'right' : 'left');
  const sign = direction === 'left' ? -1 : 1;
  const outgoing = previous.cloneNode(true);
  outgoing.removeAttribute('id');
  outgoing.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  outgoing.setAttribute('aria-hidden', 'true');
  outgoing.inert = true;
  outgoing.className = 'page-outgoing';
  content.classList.add('page-transitioning');
  outgoing.style.left = previous.offsetLeft + 'px';
  outgoing.style.top = previous.offsetTop + 'px';
  outgoing.style.width = previous.offsetWidth + 'px';
  performSwitchTab(tabName, direction);
  const incoming = document.getElementById('view-' + tabName);
  content.append(outgoing);
  const options = { duration: 420, easing: 'cubic-bezier(.22, .8, .25, 1)', fill: 'both' };
  const exit = outgoing.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-sign * 100) + '%)' }], options);
  const enter = incoming.animate([{ transform: 'translateX(' + (sign * 100) + '%)' }, { transform: 'translateX(0)' }], options);
  const cleanup = () => {
    incoming.classList.remove('slide-right', 'slide-left', 'fade-in');
    exit.cancel(); enter.cancel(); outgoing.remove();
    content.classList.remove('page-transitioning');
    if (activePageTransition === cleanup) activePageTransition = null;
  };
  activePageTransition = cleanup;
  enter.finished.then(cleanup, () => {});
}

function performSwitchTab(tabName, forcedDirection = null) {
  rememberActivity();
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
  if (!activityHistoryReady || prevTab !== tabName) saveActivity();
  const pageNames = { home: 'Beranda', orders: 'Pesanan', services: 'Layanan', payments: 'Pembayaran', reviews: 'Ulasan', performance: 'Performa tim', products: 'Produk & promo', 'task-files': 'Folder lampiran', users: 'Daftar pengguna', invoice: 'Invoice' };
  document.getElementById('header-page-title').textContent = pageNames[tabName] || 'Workplace';
  document.querySelector('.welcome-card').style.display = tabName === 'home' ? 'block' : 'none';
  state.searchQuery = '';
  state.orderPage = 1;

  const searchInput = document.getElementById('global-search-input');
  if (searchInput) searchInput.value = '';

  // Update Bottom Nav
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update Bottom Nav Fluid Sliding Pill
  const pill = document.getElementById('nav-active-pill');
  const bottomTabs = ['home', 'orders', 'services', 'payments'];
  const tabIndex = bottomTabs.indexOf(tabName);
  if (pill) {
    if (tabIndex !== -1) {
      pill.style.opacity = '1';
      pill.style.transform = `translateX(${tabIndex * 100}%)`;
    } else {
      pill.style.opacity = '0';
    }
  }

  // Hide Bottom Navigation on secondary tabs: ulasan, produk & promo, folder lampiran, peforma tim, daftar pengguna, invoice
  const HIDE_NAVBAR_TABS = ['reviews', 'products', 'task-files', 'performance', 'users', 'invoice'];
  const shouldHideNav = HIDE_NAVBAR_TABS.includes(tabName);

  const bottomNavContainer = document.querySelector('.bottom-nav-container');
  if (bottomNavContainer) {
    bottomNavContainer.classList.toggle('nav-hidden', shouldHideNav);
  }

  const appContainer = document.getElementById('app-container');
  if (appContainer) {
    appContainer.classList.toggle('nav-hidden', shouldHideNav);
  }

  // Header Back Button & Drawer Button toggle
  const headerBackBtn = document.getElementById('btn-header-back');
  const headerDrawerBtn = document.getElementById('btn-open-drawer');
  if (headerBackBtn) {
    headerBackBtn.style.display = shouldHideNav ? 'inline-flex' : 'none';
  }
  if (headerDrawerBtn) {
    headerDrawerBtn.style.display = shouldHideNav ? 'none' : 'inline-flex';
  }

  // Update Drawer Nav
  document.querySelectorAll('.drawer-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
    if (btn.dataset.tab === tabName) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  // Show/Hide Tab Views with slide/fade animation
  document.querySelectorAll('.tab-view').forEach(view => {
    view.style.display = 'none';
    view.classList.remove('slide-right', 'slide-left', 'fade-in');
  });

  const activeView = document.getElementById(`view-${tabName}`);
  if (activeView) {
    activeView.style.display = 'block';
    if (direction) {
      activeView.classList.add(direction === 'left' ? 'slide-left' : 'slide-right');
    } else {
      activeView.classList.add('fade-in');
    }
  }

  // Toggle Search Section visibility
  const searchSec = document.getElementById('search-section');
  if (tabName === 'home' || tabName === 'performance' || tabName === 'products' || tabName === 'task-files' || tabName === 'invoice') {
    searchSec.style.display = 'none';
  } else {
    searchSec.style.display = 'block';
    searchInput.placeholder = `Cari ${tabName}...`;
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  renderActiveTab();
}
window.switchTab = switchTab;

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
    case 'invoice':
      renderInvoice();
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
        <img src="./assets/logo-jokiin.png" alt="Logo" class="order-brand-logo">
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
    siteSec.style.display = 'block';
    siteList.innerHTML = '<p class="page-description">Belum ada checkout situs. Pesanan dari website akan muncul di sini.</p>';
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

  // Invoice button in order detail modal for paid orders
  const invoiceBtn = document.getElementById('btn-order-create-invoice');
  if (invoiceBtn) {
    const isPaid = (order.payment_status || '').toLowerCase() === 'paid' || (order.status || '').toLowerCase() === 'completed';
    invoiceBtn.style.display = isPaid ? 'flex' : 'none';
    invoiceBtn.onclick = () => {
      closeModal('modal-order-detail');
      loadOrderIntoInvoice(order);
      switchTab('invoice');
    };
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
  const filtered = state.services.filter(s => (s.name || s.title || '').toLowerCase().includes(q));

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
          <h4 style="font-size: 16px; font-weight: 700; word-break: break-word;">${escapeHtml(srv.name || srv.title || 'Layanan')}</h4>
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
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
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
  const gatewayCut = Math.round(gross * 0.01);
  const devCut = Math.round(gross * 0.10);
  const net = Math.max(0, gross - gatewayCut - devCut);

  const completedCount = periodOrders.filter(o => o.status === 'completed').length;

  // Count-Up KPI Metrics Cards Animations (CodeFronts Component)
  animateCountUp('perf-net-revenue', net, 950, true);
  animateCountUp('perf-completed-orders', completedCount, 750, false);

  const revPill = document.getElementById('perf-pill-revenue');
  if (revPill) {
    revPill.textContent = net > 0 ? '+Aktif' : 'Netto';
    revPill.className = `ac-12__pill ${net > 0 ? 'ac-12__pill--up' : 'ac-12__pill--flat'}`;
  }

  const orderPill = document.getElementById('perf-pill-orders');
  if (orderPill) {
    orderPill.textContent = completedCount > 0 ? `+${completedCount} order` : '0 order';
    orderPill.className = `ac-12__pill ${completedCount > 0 ? 'ac-12__pill--up' : 'ac-12__pill--flat'}`;
  }

  updateKpiSparkline(periodOrders, state.perfRange, state.perfMonthOffset);
  const chartPoints = renderCombinedChart(periodOrders, state.perfRange, state.perfMonthOffset);
  updateKpiBars(chartPoints);

  document.getElementById('breakdown-gross').textContent = formatRupiah(gross);
  document.getElementById('breakdown-gateway').textContent = `− ${formatRupiah(gatewayCut)}`;
  document.getElementById('breakdown-dev').textContent = `− ${formatRupiah(devCut)}`;
  document.getElementById('breakdown-net').textContent = formatRupiah(net);

  // Admin Team Stats
  renderAdminTeamStats(periodOrders);
}

// ========================================================
// CodeFronts KPI Card Helpers: Count-Up, Sparkline & Bars
// ========================================================
function animateCountUp(elementId, targetValue, duration = 850, isFormattedRupiah = false) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const startValue = parseInt((el.dataset.currentValue || '0').replace(/[^0-9]/g, ''), 10) || 0;
  el.dataset.currentValue = targetValue.toString();

  if (targetValue === startValue && targetValue === 0) {
    el.textContent = '0';
    return;
  }

  const startTime = performance.now();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = isFormattedRupiah ? targetValue.toLocaleString('id-ID') : targetValue.toString();
    return;
  }

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3.5);
    const current = Math.round(startValue + (targetValue - startValue) * ease);

    el.textContent = isFormattedRupiah ? current.toLocaleString('id-ID') : current.toString();

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = isFormattedRupiah ? targetValue.toLocaleString('id-ID') : targetValue.toString();
    }
  }

  requestAnimationFrame(step);
}

function updateKpiSparkline(periodOrders, range, monthOffset) {
  const path = document.getElementById('perf-sparkline-path');
  if (!path) return;

  path.style.animation = 'none';
  path.offsetHeight;
  path.style.animation = null;

  const points = [];
  const now = new Date();
  const numSteps = 7;

  if (range === 'today') {
    const currentHour = now.getHours();
    for (let i = 0; i < numSteps; i++) {
      const h = Math.round((currentHour / (numSteps - 1)) * i);
      const match = periodOrders.filter(o => {
        const d = new Date(o.created_at);
        return d.toDateString() === now.toDateString() && d.getHours() <= h;
      });
      const amt = match.filter(o => o.status === 'completed' || o.payment_status === 'paid').reduce((s, o) => s + (o.total_price || 0), 0);
      points.push(amt);
    }
  } else if (range === 'week') {
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 3600 * 1000);
      const match = periodOrders.filter(o => new Date(o.created_at).toDateString() === day.toDateString());
      const amt = match.filter(o => o.status === 'completed' || o.payment_status === 'paid').reduce((s, o) => s + (o.total_price || 0), 0);
      points.push(amt);
    }
  } else {
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const daysInMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
    for (let i = 0; i < numSteps; i++) {
      const dayNum = Math.max(1, Math.min(daysInMonth, Math.round(1 + (daysInMonth - 1) * (i / (numSteps - 1)))));
      const day = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), dayNum);
      const match = periodOrders.filter(o => new Date(o.created_at) <= day);
      const amt = match.filter(o => o.status === 'completed' || o.payment_status === 'paid').reduce((s, o) => s + (o.total_price || 0), 0);
      points.push(amt);
    }
  }

  const maxVal = Math.max(...points, 1000);
  const minVal = Math.min(...points, 0);
  const rangeVal = Math.max(1, maxVal - minVal);

  const coords = points.map((val, idx) => {
    const x = Math.round((120 / (numSteps - 1)) * idx);
    const norm = (val - minVal) / rangeVal;
    const y = Math.round(28 - norm * 24);
    return `${x} ${y}`;
  });

  const d = `M${coords[0]} ` + coords.slice(1).map(c => `L${c}`).join(' ');
  path.setAttribute('d', d);
}

function updateKpiBars(points) {
  const container = document.getElementById('perf-animated-bars');
  if (!container) return;
  const maxCount = Math.max(...points.map(p => p.count), 1);
  container.innerHTML = points.map(p => `<i style="--ac-12-h:${p.count / maxCount * 100}%"></i>`).join('');
}

function renderCombinedChart(orders, range, monthOffset) {
  const wrapper = document.getElementById('perf-chart-svg-wrapper');
  if (!wrapper) return [];
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
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Tren pendapatan dan pesanan selesai. Rincian tersedia pada tabel data grafik.');

  const maxAmount = Math.max(1000, ...points.map(p => p.amount));
  const maxCount = Math.max(1, ...points.map(p => p.count));
  document.getElementById('perf-chart-empty').hidden = points.some(p => p.amount > 0 || p.count > 0);
  document.getElementById('perf-chart-data').innerHTML = points.map(p => `<tr><th scope="row">${p.label}</th><td>${formatRupiah(p.amount)}</td><td>${p.count}</td></tr>`).join('');

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
    if (idx % Math.max(1, Math.ceil(points.length / 7)) === 0 || idx === points.length - 1) {
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', 30 + idx * slotW + slotW / 2);
      label.setAttribute('y', '172');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#526174');
      label.setAttribute('font-size', '11');
      label.textContent = p.label;
      svg.appendChild(label);
    }
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
  return points;
}

function renderAdminTeamStats(periodOrders) {
  const container = document.getElementById('perf-admins-list');
  container.innerHTML = '';

  const workers = state.profiles.filter(p => p.role === 'admin');
  const canManage = canManageAdminBalances(state.admin);
  if (workers.length === 0) {
    container.innerHTML = '<p class="page-description">Data admin belum tersedia. Gunakan Segarkan Data untuk memuat ulang.</p>';
  }

  const stats = workers.map(w => {
    const nickname = profileNickname(w);
    const completedOrders = periodOrders.filter(o => o.assigned_to === w.id && o.status === 'completed');
    const netEarned = completedOrders.reduce((sum, o) => {
      const total = o.total_price || 0;
      const gatewayFee = Math.round(total * 0.01);
      const devFee = Math.round(total * 0.10);
      return sum + Math.max(0, total - gatewayFee - devFee);
    }, 0);

    return { worker: w, nickname, count: completedOrders.length, netEarned };
  });
  renderAdminComparison(stats);

  stats.forEach(({ worker: w, nickname, count, netEarned }) => {
    const balance = w.admin_balance || 0;

    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h4 style="font-size: 16px; font-weight: 800;">Admin ${nickname}</h4>
        <span class="status-badge active">${count} order selesai</span>
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

function renderAdminComparison(stats) {
  const container = document.getElementById('perf-admin-comparison');
  const empty = document.getElementById('perf-admin-comparison-empty');
  empty.hidden = stats.some(s => s.count > 0);
  empty.textContent = stats.length
    ? 'Belum ada pesanan selesai pada periode ini. Pilih periode lain untuk membandingkan.'
    : 'Data admin belum tersedia. Gunakan Segarkan Data untuk memuat ulang.';
  container.innerHTML = stats.length ? [
    { key: 'netEarned', title: 'Pendapatan bersih', format: formatRupiah },
    { key: 'count', title: 'Pesanan selesai', format: value => `${value.toLocaleString('id-ID')} pesanan` }
  ].map(metric => {
    const sorted = [...stats].sort((a, b) => b[metric.key] - a[metric.key]);
    const max = Math.max(1, ...sorted.map(s => s[metric.key]));
    return `<table class="admin-bar-chart"><caption>${metric.title}</caption><thead><tr><th scope="col">Admin</th><th scope="col">${metric.title}</th></tr></thead><tbody>${sorted.map(s => `
      <tr><th scope="row">${escapeHtml(s.nickname)}</th><td>
        <span class="admin-bar-value">${metric.format(s[metric.key])}</span>
        <div class="admin-bar-track" aria-hidden="true"><div class="admin-bar-fill" style="width:${s[metric.key] / max * 100}%"></div></div>
      </td></tr>`).join('')}</tbody></table>`;
  }).join('') : '';
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
// Tab: Generator Invoice JOKI.IN
// ========================================================
function priceValue(val) {
  const n = Number(String(val).replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function recalculateInvoice() {
  let subtotal = 0;
  const rows = document.querySelectorAll('#inv-items tr');
  rows.forEach(row => {
    const qInput = row.querySelector('.inv-quantity');
    const pInput = row.querySelector('.inv-price');
    const dInput = row.querySelector('.inv-description');
    const qty = Number(qInput ? qInput.value : 0) || 0;
    const price = priceValue(pInput ? pInput.value : 0);
    const amount = Math.round(qty * price);
    row.classList.toggle('is-empty', (!dInput || !dInput.value.trim()) && price === 0);
    const lineTotal = row.querySelector('.inv-line-total');
    if (lineTotal) lineTotal.textContent = formatRupiah(amount);
    subtotal += amount;
  });

  const taxInput = document.getElementById('inv-tax');
  const taxRate = Math.min(100, Number(taxInput ? taxInput.value : 0) || 0);
  const tax = Math.round(subtotal * taxRate / 100);

  const subtotalEl = document.getElementById('inv-subtotal');
  const taxValueEl = document.getElementById('inv-tax-value');
  const taxLabelEl = document.getElementById('inv-tax-label');
  const grandEl = document.getElementById('inv-grand');

  if (taxLabelEl) taxLabelEl.textContent = `Nilai PPN (${taxRate}%)`;
  if (subtotalEl) subtotalEl.textContent = formatRupiah(subtotal);
  if (taxValueEl) taxValueEl.textContent = formatRupiah(tax);
  if (grandEl) grandEl.textContent = formatRupiah(subtotal + tax);

  document.querySelectorAll('.invoice-field').forEach(field => {
    const input = field.querySelector('input');
    field.classList.toggle('is-empty', input ? !input.value.trim() : false);
  });
}

function addInvoiceRow(desc = '', qty = 1, price = 0) {
  const items = document.getElementById('inv-items');
  if (!items) return;

  const row = document.createElement('tr');
  const formattedPrice = formatRupiah(price);
  const amount = Math.round((Number(qty) || 1) * (Number(price) || 0));

  row.innerHTML = `
    <td><input class="inv-description" placeholder="Uraian layanan" value="${escapeHtml(desc)}" aria-label="Deskripsi"></td>
    <td><input class="inv-quantity" type="number" min="0" step="1" value="${qty}" inputmode="numeric" aria-label="Jumlah"></td>
    <td><input class="inv-price" type="text" value="${formattedPrice}" inputmode="numeric" aria-label="Harga satuan"></td>
    <td class="invoice-money inv-line-total">${formatRupiah(amount)}</td>
    <td class="no-print"><button class="invoice-btn-remove" type="button" aria-label="Hapus baris">Hapus</button></td>
  `;
  items.appendChild(row);
  recalculateInvoice();
}

function populateInvoiceOrderPicker(selectedOrderId = null) {
  const picker = document.getElementById('invoice-order-picker');
  if (!picker) return;

  picker.innerHTML = '<option value="">-- Pilih Pesanan (Status: Paid) --</option>';

  // Find all orders that are paid or completed
  const paidOrders = state.orders.filter(o => 
    (o.payment_status || '').toLowerCase() === 'paid' || 
    (o.status || '').toLowerCase() === 'completed'
  );

  paidOrders.forEach(o => {
    const code = o.order_code || o.order_id || ('#' + o.id);
    const client = getCustomerName(o);
    const total = formatRupiah(o.total_price || 0);
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = `${code} - ${client} (${total})`;
    if (selectedOrderId && String(o.id) === String(selectedOrderId)) {
      opt.selected = true;
    }
    picker.appendChild(opt);
  });
}

function loadOrderIntoInvoice(order) {
  if (!order) return;

  // 1. Nama Admin yang mengambil pesanan
  const freelancerInput = document.getElementById('inv-freelancer');
  if (freelancerInput) {
    let adminName = '';
    if (order.assigned_to) {
      const assigned = state.profiles.find(p => p.id === order.assigned_to);
      if (assigned) {
        adminName = profileNickname(assigned);
      }
    }
    if (!adminName && state.admin) {
      adminName = profileNickname(state.admin);
    }
    freelancerInput.value = adminName || 'Admin JOKI.IN';
  }

  // 2. Nama Klien
  const clientInput = document.getElementById('inv-client');
  if (clientInput) {
    clientInput.value = getCustomerName(order);
  }

  // 3. Nomor Invoice
  const numberInput = document.getElementById('inv-number');
  if (numberInput) {
    numberInput.value = order.order_code || `INV-${String(order.order_id || order.id).replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  // 4. Tanggal Invoice (format YYYY-MM-DD)
  const dateInput = document.getElementById('inv-date');
  if (dateInput) {
    let invDate = '';
    if (order.created_at) {
      try {
        invDate = new Date(order.created_at).toISOString().split('T')[0];
      } catch(e) {}
    }
    dateInput.value = invDate || new Date().toISOString().split('T')[0];
  }

  // 5. Tanggal Deadline (format YYYY-MM-DD)
  const dueInput = document.getElementById('inv-due');
  if (dueInput) {
    let deadlineDate = '';
    if (order.estimated_completion) {
      try {
        deadlineDate = new Date(order.estimated_completion).toISOString().split('T')[0];
      } catch(e) {}
    } else if (order.task?.deadline) {
      try {
        const parsed = new Date(order.task.deadline);
        if (!isNaN(parsed.getTime())) {
          deadlineDate = parsed.toISOString().split('T')[0];
        }
      } catch(e) {}
    }
    dueInput.value = deadlineDate;
  }

  // 6. Deskripsi, Jumlah, Harga Satuan, Subtotal
  const itemsContainer = document.getElementById('inv-items');
  if (itemsContainer) {
    itemsContainer.innerHTML = '';
    const orderItems = Array.isArray(order.items) && order.items.length > 0 ? order.items : [];
    if (orderItems.length > 0) {
      orderItems.forEach(it => {
        const desc = it.name || it.title || it.service_name || it.description || 'Layanan Tugas';
        const qty = Number(it.quantity || it.qty) || 1;
        const price = Number(it.price || it.unit_price) || 0;
        addInvoiceRow(desc, qty, price);
      });
    } else {
      const desc = order.service_title || order.task?.title || 'Layanan Tugas Mahasiswa';
      const qty = 1;
      const price = Number(order.total_price) || 0;
      addInvoiceRow(desc, qty, price);
    }
  }

  // 7. PPN Non-PKP (0%) saat status pemesanan paid
  const taxInput = document.getElementById('inv-tax');
  if (taxInput) {
    taxInput.value = '0';
  }

  // Sync picker dropdown
  const picker = document.getElementById('invoice-order-picker');
  if (picker) {
    picker.value = order.id;
  }

  recalculateInvoice();
}

function renderInvoice() {
  populateInvoiceOrderPicker();

  const itemsTable = document.getElementById('inv-items');
  const freelancerInput = document.getElementById('inv-freelancer');

  // If the invoice is completely unpopulated, check if there is a paid order in state.orders
  if (itemsTable && itemsTable.rows.length === 0 && (!freelancerInput || !freelancerInput.value.trim())) {
    const paidOrders = state.orders.filter(o => 
      (o.payment_status || '').toLowerCase() === 'paid' || 
      (o.status || '').toLowerCase() === 'completed'
    );
    if (paidOrders.length > 0) {
      // Automatically load the latest paid order
      loadOrderIntoInvoice(paidOrders[0]);
    } else {
      // Default empty invoice row
      addInvoiceRow('Layanan JOKI.IN', 1, 0);
      if (document.getElementById('inv-date')) {
        document.getElementById('inv-date').value = new Date().toISOString().split('T')[0];
      }
      if (freelancerInput && state.admin) {
        freelancerInput.value = profileNickname(state.admin);
      }
      recalculateInvoice();
    }
  }
}

// ========================================================
// Modals & Action Sheet Management
// ========================================================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) { rememberActivity(); modal.classList.add('open'); saveActivity(modalId); }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
  if (!restoringActivity && window.history?.state?.modal === modalId) window.history.back();
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

function trackIncomingOrders(orders, source) {
  const ids = source === 'checkout' ? state.knownCheckoutIds : state.knownOrderIds;
  const baseline = source === 'checkout' ? 'checkoutBaselineLoaded' : 'ordersBaselineLoaded';
  const count = state[baseline] ? orders.filter(o => !ids.has(o.id) && o.status !== 'cancelled').length : 0;
  orders.forEach(o => ids.add(o.id));
  state[baseline] = true;
  return count;
}

function pushSupported() {
  return typeof navigator !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator
    && 'PushManager' in window && 'Notification' in window;
}

async function pushApi(action, data = {}) {
  const client = await getSupabase();
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) throw Error('Sesi berakhir. Silakan masuk ulang.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/workplace-push/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${sessionData.session.access_token}` }, body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Gagal menghubungkan notifikasi. Coba lagi.');
  return result;
}

function setPushStatus(text, enabled = false) {
  const panel = document.getElementById('push-settings-panel');
  const wasHidden = panel.hidden;
  panel.hidden = enabled;
  if (enabled && !wasHidden) showNotice('Fitur notifikasi sudah aktif');
  document.getElementById('push-status').textContent = text;
  document.getElementById('btn-enable-push').hidden = enabled;
  document.getElementById('btn-test-push').hidden = true;
  document.getElementById('btn-disable-push').hidden = true;
}

async function pushRegistration() {
  await navigator.serviceWorker.register('./service-worker.js');
  return Promise.race([navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(Error('Service worker belum siap. Muat ulang halaman dan coba lagi.')), 15000))]);
}

async function enablePushNotifications() {
  if (!pushSupported()) {
    setPushStatus('Browser belum mendukung Web Push. Di iPhone, buka lewat ikon Layar Utama; di Android, gunakan Chrome.');
    return;
  }
  const button = document.getElementById('btn-enable-push');
  button.disabled = true;
  try {
    // Permission must be requested directly from this button gesture on iOS.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw Error('Izin belum diberikan. Izinkan notifikasi di pengaturan browser/perangkat, lalu coba lagi.');
    const registration = await pushRegistration();
    const { publicKey } = await pushApi('config');
    const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4-publicKey.length%4)%4)), c => c.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription()
      || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    await pushApi('subscribe', { subscription: subscription.toJSON() });
    localStorage.setItem('workplace_push_enabled', '1');
    setPushStatus('Notifikasi order aktif pada perangkat ini, termasuk saat aplikasi ditutup.', true);
  } catch (error) { setPushStatus(error.message || 'Gagal mengaktifkan notifikasi. Coba lagi.'); }
  finally { button.disabled = false; }
}

async function syncPushSubscription() {
  if (!pushSupported()) return;
  if (localStorage.getItem('workplace_push_enabled') !== '1') return;
  const registration = await pushRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription || Notification.permission !== 'granted') {
    localStorage.removeItem('workplace_push_enabled');
    setPushStatus('Notifikasi belum aktif. Tekan Aktifkan notifikasi order.');
    return;
  }
  await pushApi('subscribe', { subscription: subscription.toJSON() });
  setPushStatus('Notifikasi order aktif pada perangkat ini, termasuk saat aplikasi ditutup.', true);
}

async function disablePushNotifications(showStatus = true) {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    try {
      await pushApi('unsubscribe', { endpoint: subscription.endpoint });
    } catch (error) {
      // An expired login may prevent server removal; revoking the browser endpoint still stops delivery.
      if (!await subscription.unsubscribe()) throw error;
      localStorage.removeItem('workplace_push_enabled');
      if (showStatus) setPushStatus('Notifikasi perangkat dimatikan.');
      return;
    }
    await subscription.unsubscribe();
  }
  localStorage.removeItem('workplace_push_enabled');
  if (showStatus) setPushStatus('Notifikasi perangkat dimatikan. Anda bisa mengaktifkannya kembali.');
}

async function testPushNotification() {
  const button = document.getElementById('btn-test-push');
  button.disabled = true;
  try {
    const registration = await pushRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) throw Error('Aktifkan notifikasi terlebih dahulu.');
    await pushApi('test', { subscription: subscription.toJSON() });
    setPushStatus('Tes dikirim. Periksa pusat notifikasi atau layar kunci HP.', true);
  } catch (error) { setPushStatus(error.message || 'Tes gagal. Coba lagi.', true); }
  finally { button.disabled = false; }
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
  if (window.matchMedia?.('(min-width: 1024px)').matches) {
    document.getElementById('btn-drawer-refresh').focus();
    return;
  }
  document.getElementById('drawer-overlay').classList.add('open');
  document.getElementById('drawer-panel').classList.add('open');
  document.getElementById('btn-open-drawer').setAttribute('aria-expanded', 'true');
  document.getElementById('btn-close-drawer').focus();
}

function closeDrawer() {
  document.getElementById('drawer-overlay').classList.remove('open');
  document.getElementById('drawer-panel').classList.remove('open');
  document.getElementById('btn-open-drawer')?.setAttribute?.('aria-expanded', 'false');
}

// ========================================================
// Event Listeners & User Actions
// ========================================================
function setupEventListeners() {
  document.getElementById('btn-toggle-password')?.addEventListener('click', () => {
    const input = document.getElementById('login-password');
    const button = document.getElementById('btn-toggle-password');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('aria-label', visible ? 'Sembunyikan password' : 'Tampilkan password');
    document.getElementById('password-eye-slash').style.display = visible ? 'block' : 'none';
  });
  document.getElementById('btn-enable-push')?.addEventListener('click', enablePushNotifications);
  document.getElementById('btn-test-push')?.addEventListener('click', testPushNotification);
  document.getElementById('btn-disable-push')?.addEventListener('click', async () => {
    try { await disablePushNotifications(); } catch (error) { setPushStatus(error.message, true); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.admin && isSessionValid()) loadData();
  });
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
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: WORKPLACE_REDIRECT_URL,
            queryParams: { prompt: 'select_account' }
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

  // Header Actions
  document.getElementById('btn-header-avatar')?.addEventListener('click', openDrawer);
  document.getElementById('btn-header-back')?.addEventListener('click', () => {
    if (activityHistoryReady) window.history.back();
    else switchTab('home', 'left');
  });

  // Drawer Controls
  document.getElementById('btn-open-drawer')?.addEventListener('click', openDrawer);
  document.getElementById('drawer-overlay')?.addEventListener('click', closeDrawer);
  document.getElementById('btn-close-drawer')?.addEventListener('click', () => {
    closeDrawer();
    document.getElementById('btn-open-drawer').focus();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('drawer-panel').classList.contains('open')) {
      closeDrawer();
      document.getElementById('btn-open-drawer').focus();
    }
  });
  document.getElementById('btn-drawer-refresh')?.addEventListener('click', () => {
    closeDrawer();
    loadData();
  });
  document.getElementById('btn-drawer-logout')?.addEventListener('click', handleLogout);

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

  // Product Navigation Subsections (Smooth Animated Push & Pop Transitions)
  function openProductSubView(targetId) {
    const menuSec = document.getElementById('product-menu-section');
    const targetSec = document.getElementById(targetId);
    if (!menuSec || !targetSec) return;

    menuSec.classList.remove('subview-push-enter', 'subview-pop-enter', 'subview-push-exit', 'subview-pop-exit');
    targetSec.classList.remove('subview-push-enter', 'subview-pop-enter', 'subview-push-exit', 'subview-pop-exit');

    menuSec.classList.add('subview-push-exit');
    setTimeout(() => {
      menuSec.style.display = 'none';
      menuSec.classList.remove('subview-push-exit');

      targetSec.style.display = 'block';
      targetSec.classList.add('subview-push-enter');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 120);
  }

  function closeProductSubView(currentId) {
    const currentSec = document.getElementById(currentId);
    const menuSec = document.getElementById('product-menu-section');
    if (!currentSec || !menuSec) return;

    currentSec.classList.remove('subview-push-enter', 'subview-pop-enter', 'subview-push-exit', 'subview-pop-exit');
    menuSec.classList.remove('subview-push-enter', 'subview-pop-enter', 'subview-push-exit', 'subview-pop-exit');

    currentSec.classList.add('subview-pop-exit');
    setTimeout(() => {
      currentSec.style.display = 'none';
      currentSec.classList.remove('subview-pop-exit');

      menuSec.style.display = 'block';
      menuSec.classList.add('subview-pop-enter');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 120);
  }

  document.getElementById('btn-goto-promos')?.addEventListener('click', () => {
    openProductSubView('product-promo-section');
  });
  document.getElementById('btn-back-to-prod-menu')?.addEventListener('click', () => {
    closeProductSubView('product-promo-section');
  });

  document.getElementById('btn-goto-discounts')?.addEventListener('click', () => {
    openProductSubView('product-discount-section');
  });
  document.getElementById('btn-back-to-prod-menu-2')?.addEventListener('click', () => {
    closeProductSubView('product-discount-section');
  });

  document.getElementById('btn-goto-prices')?.addEventListener('click', () => {
    openProductSubView('product-price-section');
  });
  document.getElementById('btn-back-to-prod-menu-3')?.addEventListener('click', () => {
    closeProductSubView('product-price-section');
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

  // ========================================================
  // Invoice Generator Listeners
  // ========================================================
  document.getElementById('inv-add-row')?.addEventListener('click', () => {
    addInvoiceRow('', 1, 0);
  });

  document.getElementById('inv-print')?.addEventListener('click', () => {
    const originalTitle = document.title;
    const invNumber = document.getElementById('inv-number')?.value.trim();
    const clientName = document.getElementById('inv-client')?.value.trim();
    const cleanTitle = (invNumber && clientName) ? `Invoice ${invNumber} - ${clientName}` : (invNumber ? `Invoice ${invNumber}` : 'Invoice JOKI.IN');

    document.title = cleanTitle;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1200);
  });

  document.getElementById('btn-invoice-load-order')?.addEventListener('click', () => {
    const picker = document.getElementById('invoice-order-picker');
    const orderId = picker ? picker.value : null;
    if (orderId) {
      const order = state.orders.find(o => String(o.id) === String(orderId));
      if (order) {
        loadOrderIntoInvoice(order);
      }
    }
  });

  document.getElementById('invoice-order-picker')?.addEventListener('change', (e) => {
    const orderId = e.target.value;
    if (orderId) {
      const order = state.orders.find(o => String(o.id) === String(orderId));
      if (order) {
        loadOrderIntoInvoice(order);
      }
    }
  });

  const invItems = document.getElementById('inv-items');
  if (invItems) {
    invItems.addEventListener('input', (event) => {
      if (event.target.classList.contains('inv-price')) {
        const val = priceValue(event.target.value);
        event.target.value = formatRupiah(val);
      }
      recalculateInvoice();
    });

    invItems.addEventListener('focusin', (event) => {
      if (event.target.classList.contains('inv-price')) {
        event.target.select();
      }
    });

    invItems.addEventListener('click', (event) => {
      const rmBtn = event.target.closest('.invoice-btn-remove');
      if (rmBtn) {
        const row = rmBtn.closest('tr');
        if (row) {
          row.remove();
          recalculateInvoice();
        }
      }
    });
  }

  document.getElementById('inv-tax')?.addEventListener('input', recalculateInvoice);
  document.querySelector('.invoice-fields')?.addEventListener('input', recalculateInvoice);

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

  const handleStart = (clientX, clientY, target) => {
    // Ignore if drawer is open or modal is active
    if (document.getElementById('drawer-panel')?.classList.contains('open')) return;
    if (document.querySelector('.modal-overlay.open')) return;

    // Don't intercept inputs, toggles, buttons, chart or selector pills
    if (target.closest('input, textarea, select, button, label.toggle-switch, .toggle-switch, .countdown-row, #perf-chart-svg-wrapper, .mode-selector, .search-container')) {
      return;
    }

    startX = clientX;
    startY = clientY;
    startTime = Date.now();
    isTracking = true;
  };

  const handleEnd = (clientX, clientY) => {
    if (!isTracking || !startTime) return;
    isTracking = false;

    const dx = clientX - startX;
    const dy = clientY - startY;
    const duration = Date.now() - startTime;
    startTime = 0;

    // Must be reasonably quick (< 650ms), horizontal enough (> 40px), horizontal movement dominates vertical
    if (duration < 650 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      const currentTab = state.activeTab;

      // Geser ke kanan pada beranda -> buka menu drawer!
      if (currentTab === 'home') {
        if (dx > 40) {
          openDrawer();
          return;
        } else if (dx < -40) {
          switchTab('orders', 'right');
          return;
        }
      }

      const idx = BOTTOM_TABS.indexOf(currentTab);
      if (idx !== -1) {
        if (dx < -40 && idx < BOTTOM_TABS.length - 1) {
          // Swiped left -> move to next tab on the right
          switchTab(BOTTOM_TABS[idx + 1], 'right');
        } else if (dx > 40 && idx > 0) {
          // Swiped right -> move to previous tab on the left
          switchTab(BOTTOM_TABS[idx - 1], 'left');
        }
      } else {
        // On hidden-nav tabs (reviews, products, task-files, performance, users): swipe right returns to home
        if (dx > 45) {
          switchTab('home', 'left');
        }
      }
    }
  };

  // Touch event listeners
  container.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY, e.target);
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!e.changedTouches || !e.changedTouches.length) return;
    const touch = e.changedTouches[0];
    handleEnd(touch.clientX, touch.clientY);
  }, { passive: true });

  container.addEventListener('touchcancel', () => {
    isTracking = false;
    startTime = 0;
  }, { passive: true });

  // Swipe left on drawer panel to close it
  const drawerPanel = document.getElementById('drawer-panel');
  if (drawerPanel) {
    let dStartX = 0;
    let dStartY = 0;
    let dTracking = false;

    drawerPanel.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      dStartX = touch.clientX;
      dStartY = touch.clientY;
      dTracking = true;
    }, { passive: true });

    drawerPanel.addEventListener('touchend', (e) => {
      if (!dTracking || !e.changedTouches || !e.changedTouches.length) return;
      dTracking = false;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - dStartX;
      const dy = touch.clientY - dStartY;
      if (dx < -45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        closeDrawer();
      }
    }, { passive: true });

    drawerPanel.addEventListener('touchcancel', () => {
      dTracking = false;
    }, { passive: true });
  }
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

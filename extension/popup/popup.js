// JOKI.IN Workplace Monitor - Popup Controller
import { CONFIG } from '../js/config.js';
import { Storage } from '../js/storage.js';
import { Auth } from '../js/auth.js';
import { Api } from '../js/api.js';

// Application State
const state = {
  session: null,
  profile: null,
  settings: { ...CONFIG.DEFAULT_SETTINGS },
  orders: [],
  paymentOrders: [],
  currentFilter: 'pending',
  searchQuery: '',
  loading: false,
  autoRefreshTimer: null
};

// DOM Elements
const el = {};

document.addEventListener('DOMContentLoaded', async () => {
  initDOMElements();
  bindEventListeners();
  await loadInitialState();
});

function initDOMElements() {
  el.connStatus = document.getElementById('conn-status');
  el.connText = document.getElementById('conn-text');
  el.btnRefresh = document.getElementById('btn-refresh');
  el.btnSettings = document.getElementById('btn-settings');
  el.btnOpenWorkplace = document.getElementById('btn-open-workplace');

  el.mainView = document.getElementById('main-view');
  el.unauthView = document.getElementById('unauth-view');
  el.authView = document.getElementById('auth-view');

  el.btnQuickSyncTab = document.getElementById('btn-quick-sync-tab');
  el.btnGoLogin = document.getElementById('btn-go-login');

  el.lastUpdateTime = document.getElementById('last-update-time');
  el.statTotal = document.getElementById('stat-total');
  el.statPending = document.getElementById('stat-pending');
  el.statProcessing = document.getElementById('stat-processing');
  el.statCompleted = document.getElementById('stat-completed');
  el.adminBalanceRow = document.getElementById('admin-balance-row');
  el.adminBalanceValue = document.getElementById('admin-balance-value');
  el.revenueCompletedValue = document.getElementById('revenue-completed-value');

  el.orderSearchInput = document.getElementById('order-search-input');
  el.btnClearSearch = document.getElementById('btn-clear-search');
  el.filterTabs = document.querySelectorAll('.tab-btn');

  el.ordersLoading = document.getElementById('orders-loading');
  el.ordersEmpty = document.getElementById('orders-empty');
  el.ordersError = document.getElementById('orders-error');
  el.errorMessageText = document.getElementById('error-message-text');
  el.btnRetryFetch = document.getElementById('btn-retry-fetch');
  el.ordersList = document.getElementById('orders-list');

  el.settingsView = document.getElementById('settings-view');
  el.btnCloseSettings = document.getElementById('btn-close-settings');
  el.accountName = document.getElementById('account-name');
  el.accountEmail = document.getElementById('account-email');
  el.btnLogout = document.getElementById('btn-logout');
  el.settingsLoginForm = document.getElementById('settings-login-form');
  el.inputLoginEmail = document.getElementById('input-login-email');
  el.inputLoginPassword = document.getElementById('input-login-password');
  el.loginErrorMsg = document.getElementById('login-error-msg');
  el.btnDoLogin = document.getElementById('btn-do-login');
  el.btnSyncFromTab = document.getElementById('btn-sync-from-tab');
  el.selectAutoRefresh = document.getElementById('select-auto-refresh');
  el.linkFooterOpen = document.getElementById('link-footer-open');
}

function bindEventListeners() {
  el.btnRefresh.addEventListener('click', () => refreshData(true));
  el.btnSettings.addEventListener('click', toggleSettings);
  el.btnCloseSettings.addEventListener('click', toggleSettings);
  el.btnOpenWorkplace.addEventListener('click', openWorkplace);
  el.linkFooterOpen.addEventListener('click', (e) => {
    e.preventDefault();
    openWorkplace();
  });

  el.btnQuickSyncTab.addEventListener('click', handleSyncFromTab);
  el.btnSyncFromTab.addEventListener('click', handleSyncFromTab);
  el.btnGoLogin.addEventListener('click', () => {
    toggleSettings(true);
    el.settingsLoginForm.style.display = 'block';
    el.inputLoginEmail.focus();
  });

  el.btnDoLogin.addEventListener('click', handleDirectLogin);
  el.btnLogout.addEventListener('click', handleLogout);

  el.orderSearchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    el.btnClearSearch.style.display = state.searchQuery ? 'block' : 'none';
    renderOrdersList();
  });

  el.btnClearSearch.addEventListener('click', () => {
    el.orderSearchInput.value = '';
    state.searchQuery = '';
    el.btnClearSearch.style.display = 'none';
    renderOrdersList();
  });

  el.filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      el.filterTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      state.currentFilter = tab.dataset.filter;
      renderOrdersList();
    });
  });

  document.querySelectorAll('.stat-box').forEach((box) => {
    box.addEventListener('click', () => {
      const targetFilter = box.dataset.stat === 'all' ? 'pending' : box.dataset.stat;
      const targetTab = document.querySelector(`.tab-btn[data-filter="${targetFilter}"]`);
      if (targetTab) targetTab.click();
    });
  });

  el.btnRetryFetch.addEventListener('click', () => refreshData(true));

  el.selectAutoRefresh.addEventListener('change', async (e) => {
    state.settings.autoRefreshSeconds = Number(e.target.value);
    await Storage.saveSettings(state.settings);
    setupAutoRefreshTimer();
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'UPDATE_ALARM_SETTINGS' }).catch(() => {});
    }
  });
}

async function loadInitialState() {
  state.settings = await Storage.getSettings();
  el.selectAutoRefresh.value = String(state.settings.autoRefreshSeconds);

  // Pre-fill email and credentials in login form if available
  const savedCreds = await Storage.getSavedCredentials();
  const savedAccount = await Storage.getSavedAccount();
  const emailToFill = savedCreds?.email || savedAccount?.email || '';
  if (emailToFill && el.inputLoginEmail) {
    el.inputLoginEmail.value = emailToFill;
  }
  if (savedCreds?.password && el.inputLoginPassword) {
    el.inputLoginPassword.value = savedCreds.password;
  }

  // Restore cached orders for immediate rendering
  const cached = await Storage.getCachedOrders();
  if (Array.isArray(cached) && cached.length > 0) {
    state.orders = cached;
    updateSummaryUI();
    renderOrdersList();
  }

  const lastSync = await Storage.getLastSync();
  if (lastSync) {
    el.lastUpdateTime.textContent = Api.formatShortDateTime(lastSync);
  }

  // Check auth session (with resilient auto-recovery)
  state.session = await Auth.getValidSession();
  if (state.session) {
    onAuthenticated(state.session);
    await refreshData(false);
  } else {
    // If we have cached orders, keep showing them in dashboard rather than blank screen
    if (state.orders.length > 0 && (savedCreds || savedAccount)) {
      const mockProfile = savedAccount || { name: 'Admin', email: emailToFill };
      onAuthenticated({ user: { email: emailToFill }, profile: mockProfile });
      setConnectionStatus(false, 'Perlu Sinkron');
    } else {
      onUnauthenticated();
    }
  }

  setupAutoRefreshTimer();
}

function onAuthenticated(session) {
  el.unauthView.style.display = 'none';
  el.authView.style.display = 'block';
  el.settingsLoginForm.style.display = 'none';

  setConnectionStatus(true, 'Terhubung');

  const profile = session.profile || session.user?.user_metadata || {};
  const name = profile.full_name || profile.name || profile.nickname || 'Admin Workplace';
  const email = session.user?.email || '-';

  el.accountName.textContent = name;
  el.accountEmail.textContent = email;
}

function onUnauthenticated() {
  el.unauthView.style.display = 'block';
  el.authView.style.display = 'none';
  el.settingsLoginForm.style.display = 'block';

  setConnectionStatus(false, 'Belum Masuk');

  el.accountName.textContent = 'Belum Masuk';
  el.accountEmail.textContent = '-';
}

function setConnectionStatus(connected, text) {
  el.connStatus.className = `conn-pill ${connected ? 'connected' : 'disconnected'}`;
  el.connText.textContent = text;
}

async function refreshData(showSpinner = true) {
  if (state.loading) return;
  if (!state.session) {
    state.session = await Auth.getValidSession();
    if (!state.session) {
      onUnauthenticated();
      return;
    }
  }

  state.loading = true;
  if (showSpinner) el.btnRefresh.classList.add('spinning');
  hideErrors();

  if (state.orders.length === 0) {
    el.ordersLoading.style.display = 'block';
    el.ordersEmpty.style.display = 'none';
  }

  try {
    const [freshOrders, freshProfile] = await Promise.all([
      Api.fetchOrders(state.session),
      Api.fetchRefreshedProfile(state.session)
    ]);

    state.orders = freshOrders;
    if (freshProfile) state.profile = freshProfile;

    await Storage.setCachedOrders(freshOrders);

    const nowIso = new Date().toISOString();
    el.lastUpdateTime.textContent = Api.formatShortDateTime(nowIso);

    setConnectionStatus(true, 'Terhubung');
    updateSummaryUI();
    renderOrdersList();

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'SYNC_BADGE' }).catch(() => {});
    }
  } catch (err) {
    console.warn('Refresh error caught:', err.message);
    const isOffline = !navigator.onLine || err.isNetworkError || err.message?.includes('offline') || err.message?.includes('Failed to fetch');

    if (isOffline) {
      setConnectionStatus(false, 'Offline (Lokal)');
      // If cached orders exist, preserve them on UI
      if (state.orders.length > 0) {
        updateSummaryUI();
        renderOrdersList();
      }
    } else if (err.message && (err.message.includes('Sesi') || err.message.includes('401'))) {
      // Attempt background re-authentication without destroying credentials
      const recoveredSession = await Auth.getValidSession();
      if (recoveredSession && recoveredSession.access_token !== state.session?.access_token) {
        state.session = recoveredSession;
        try {
          const freshOrders = await Api.fetchOrders(recoveredSession);
          state.orders = freshOrders;
          await Storage.setCachedOrders(freshOrders);
          setConnectionStatus(true, 'Terhubung');
          updateSummaryUI();
          renderOrdersList();
          return;
        } catch {}
      }
      showError('Sesi perlu diverifikasi ulang. Tekan tombol Masuk atau Sinkronkan Tab.');
      setConnectionStatus(false, 'Perlu Sinkron');
    } else {
      showError(err.message || 'Gagal menyinkronkan data dari backend Supabase.');
      setConnectionStatus(false, 'Gagal Sinkron');
    }
  } finally {
    state.loading = false;
    el.btnRefresh.classList.remove('spinning');
    el.ordersLoading.style.display = 'none';
  }
}

function updateSummaryUI() {
  const summary = Api.computeSummary(state.orders, state.paymentOrders, state.profile || state.session?.profile);

  el.statTotal.textContent = summary.total;
  el.statPending.textContent = summary.pending;
  el.statProcessing.textContent = summary.processing;
  el.statCompleted.textContent = summary.completed;

  // Update tab counter badges
  updateTabCount('pending', summary.pending);
  updateTabCount('processing', summary.processing);
  updateTabCount('completed', summary.completed);
  updateTabCount('cancelled', summary.cancelled);

  // Show balance if available
  if (summary.adminBalance !== null && !isNaN(summary.adminBalance)) {
    el.adminBalanceRow.style.display = 'flex';
    el.adminBalanceValue.textContent = Api.formatRupiah(summary.adminBalance);
    el.revenueCompletedValue.textContent = Api.formatRupiah(summary.completedRevenue);
  } else if (summary.completedRevenue > 0) {
    el.adminBalanceRow.style.display = 'flex';
    el.adminBalanceValue.textContent = '-';
    el.revenueCompletedValue.textContent = Api.formatRupiah(summary.completedRevenue);
  } else {
    el.adminBalanceRow.style.display = 'none';
  }
}

function updateTabCount(filterName, count) {
  const badge = document.getElementById(`tab-count-${filterName}`);
  if (badge) badge.textContent = String(count);
}

function renderOrdersList() {
  const list = state.orders;
  const q = state.searchQuery;
  const filter = state.currentFilter;

  const filtered = list.filter((ord) => {
    const status = (ord.status || 'pending').toLowerCase();

    // Tab filter matching
    if (filter === 'pending' && status !== 'pending') return false;
    if (filter === 'processing' && !['processing', 'revision'].includes(status)) return false;
    if (filter === 'completed' && status !== 'completed') return false;
    if (filter === 'cancelled' && status !== 'cancelled') return false;

    // Search query matching
    if (q) {
      const code = String(ord.order_code || '#' + ord.id).toLowerCase();
      const cust = Api.getCustomerName(ord).toLowerCase();
      const title = String(ord.judul_tugas || ord.notes || '').toLowerCase();
      return code.includes(q) || cust.includes(q) || title.includes(q) || status.includes(q);
    }
    return true;
  });

  el.ordersList.innerHTML = '';

  if (filtered.length === 0) {
    el.ordersEmpty.style.display = 'block';
    return;
  }

  el.ordersEmpty.style.display = 'none';

  filtered.forEach((ord) => {
    const card = document.createElement('div');
    card.className = 'order-item-card';

    const orderCode = escapeHtml(ord.order_code || '#' + ord.id);
    const custName = escapeHtml(Api.getCustomerName(ord));
    const priceFormatted = Api.formatRupiah(ord.total_price);
    const status = (ord.status || 'pending').toLowerCase();
    const statusLabel = CONFIG.STATUS_LABELS[status] || status;
    const rawType = (ord.tipe || (ord.service_id ? 'TUGAS' : 'REGULER')).toUpperCase();
    const typeLabel = escapeHtml(rawType);
    const typeClass = rawType.includes('SPESIAL') ? 'special' : (rawType.includes('TUGAS') ? 'task' : 'regular');
    const timeFormatted = Api.formatShortDateTime(ord.created_at);

    card.innerHTML = `
      <div class="card-top-row">
        <div class="order-id-group">
          <span class="order-code-text" title="${orderCode}">${orderCode}</span>
          <span class="order-type-tag ${typeClass}">${typeLabel}</span>
        </div>
        <span class="order-price-text">${priceFormatted}</span>
      </div>
      <div class="card-middle-row">
        <div class="order-customer-group">
          <svg viewBox="0 0 24 24" class="meta-icon"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          <span class="order-customer-name">${custName}</span>
        </div>
        <span class="status-badge ${status}">
          <span class="status-dot"></span>
          <span>${statusLabel}</span>
        </span>
      </div>
      <div class="card-bottom-row">
        <div class="order-date-group">
          <svg viewBox="0 0 24 24" class="meta-icon"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
          <span class="order-time-text">${timeFormatted}</span>
        </div>
        <button class="btn-open-detail" data-order-id="${ord.id}" title="Buka detail di Workplace">
          <span>Buka Detail</span>
          <svg viewBox="0 0 24 24" class="btn-arrow-icon">
            <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
          </svg>
        </button>
      </div>
    `;

    // Click card or detail button opens in Workplace
    card.addEventListener('click', (e) => {
      openWorkplace(ord.id);
    });

    const btnDetail = card.querySelector('.btn-open-detail');
    btnDetail.addEventListener('click', (e) => {
      e.stopPropagation();
      openWorkplace(ord.id);
    });

    el.ordersList.appendChild(card);
  });
}

function openWorkplace(orderId = null) {
  const base = CONFIG.DEFAULT_WORKPLACE_URL;
  let targetUrl = base;
  if (!targetUrl.includes('?')) {
    targetUrl += '?tab=orders';
  } else if (!targetUrl.includes('tab=')) {
    targetUrl += '&tab=orders';
  }

  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url: targetUrl });
  } else {
    window.open(targetUrl, '_blank');
  }
}

function setupAutoRefreshTimer() {
  if (state.autoRefreshTimer) {
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }

  const seconds = Number(state.settings.autoRefreshSeconds) || 0;
  if (seconds > 0) {
    state.autoRefreshTimer = setInterval(() => {
      refreshData(false);
    }, seconds * 1000);
  }
}

function toggleSettings(forceOpen = null) {
  const isOpen = el.settingsView.style.display !== 'none';
  const shouldOpen = forceOpen !== null ? forceOpen : !isOpen;
  el.settingsView.style.display = shouldOpen ? 'flex' : 'none';
}

async function handleSyncFromTab() {
  el.btnQuickSyncTab.disabled = true;
  el.btnSyncFromTab.disabled = true;
  el.loginErrorMsg.style.display = 'none';

  try {
    const session = await Auth.syncSessionFromActiveTab();
    state.session = session;
    onAuthenticated(session);
    toggleSettings(false);
    await refreshData(true);
  } catch (err) {
    alert(err.message || 'Gagal menyinkronkan sesi dari tab terbuka.');
  } finally {
    el.btnQuickSyncTab.disabled = false;
    el.btnSyncFromTab.disabled = false;
  }
}

async function handleDirectLogin() {
  const email = el.inputLoginEmail.value.trim();
  const password = el.inputLoginPassword.value;

  if (!email || !password) {
    el.loginErrorMsg.textContent = 'Harap isi email dan kata sandi.';
    el.loginErrorMsg.style.display = 'block';
    return;
  }

  el.btnDoLogin.disabled = true;
  el.btnDoLogin.textContent = 'Memverifikasi...';
  el.loginErrorMsg.style.display = 'none';

  try {
    const session = await Auth.login(email, password);
    state.session = session;
    onAuthenticated(session);
    toggleSettings(false);
    el.inputLoginPassword.value = '';
    await refreshData(true);
  } catch (err) {
    el.loginErrorMsg.textContent = err.message || 'Gagal masuk. Periksa kembali email dan password.';
    el.loginErrorMsg.style.display = 'block';
  } finally {
    el.btnDoLogin.disabled = false;
    el.btnDoLogin.textContent = 'Masuk';
  }
}

async function handleLogout() {
  if (!confirm('Apakah Anda yakin ingin keluar dari pemantau Workplace?')) return;
  await Auth.logout();
  state.session = null;
  state.profile = null;
  state.orders = [];
  onUnauthenticated();
  toggleSettings(false);
  if (typeof chrome !== 'undefined' && chrome.action?.setBadgeText) {
    chrome.action.setBadgeText({ text: '' });
  }
}

function showError(msg) {
  el.errorMessageText.textContent = msg;
  el.ordersError.style.display = 'block';
  el.ordersEmpty.style.display = 'none';
}

function hideErrors() {
  el.ordersError.style.display = 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

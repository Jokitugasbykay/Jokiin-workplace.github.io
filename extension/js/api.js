// JOKI.IN Workplace Monitor - Read-Only API Client
import { CONFIG } from './config.js';

export const Api = {
  async fetchOrders(session, canRetry = true) {
    if (!session?.access_token) throw new Error('Sesi tidak valid.');

    let res;
    try {
      res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/orders?select=*&order=created_at.desc&limit=100`, {
        method: 'GET',
        headers: {
          'apikey': CONFIG.SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session.access_token}`,
          'Range': '0-99'
        }
      });
    } catch (networkErr) {
      const err = new Error('Gagal menghubungkan ke server (offline atau koneksi terputus).');
      err.isNetworkError = true;
      throw err;
    }

    if (!res.ok) {
      if ((res.status === 401 || res.status === 403) && canRetry && session.refresh_token) {
        try {
          const { Auth } = await import('./auth.js');
          const refreshed = await Auth.refreshToken(session.refresh_token);
          if (refreshed?.access_token) {
            return this.fetchOrders(refreshed, false);
          }
        } catch {
          // fall through
        }
      }
      throw new Error(`Gagal mengambil data pesanan (HTTP ${res.status}).`);
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async fetchPaymentOrders(session) {
    if (!session?.access_token) return [];

    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/payment_orders?select=id,order_code,tipe,customer,total_price,payment_status,status,created_at,paid_at,auto_cancelled_at&order=created_at.desc&limit=50`, {
        method: 'GET',
        headers: {
          'apikey': CONFIG.SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  async fetchRefreshedProfile(session) {
    if (!session?.access_token || !session?.user?.id) return null;

    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}&select=*`, {
        method: 'GET',
        headers: {
          'apikey': CONFIG.SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.[0] || null;
    } catch {
      return null;
    }
  },

  computeSummary(orders, paymentOrders = [], profile = null) {
    const list = Array.isArray(orders) ? orders : [];
    
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let cancelled = 0;
    let revision = 0;
    let completedRevenue = 0;

    for (const ord of list) {
      const st = (ord.status || 'pending').toLowerCase();
      if (st === 'pending') pending++;
      else if (st === 'processing') processing++;
      else if (st === 'revision') revision++;
      else if (st === 'completed') {
        completed++;
        completedRevenue += Number(ord.total_price || 0);
      } else if (st === 'cancelled') {
        cancelled++;
      }
    }

    return {
      total: list.length,
      pending,
      processing: processing + revision, // Includes revision in active processing
      revision,
      completed,
      cancelled,
      completedRevenue,
      adminBalance: profile?.admin_balance !== undefined ? Number(profile.admin_balance) : null
    };
  },

  formatRupiah(amount) {
    const val = Number(amount) || 0;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  },

  formatShortDateTime(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta'
      }).format(d) + ' WIB';
    } catch {
      return isoStr;
    }
  },

  getCustomerName(ord) {
    if (!ord) return 'Pelanggan';
    return ord.customer?.name || ord.customer?.nama || ord.nama || ord.customerName || 'Pelanggan';
  }
};

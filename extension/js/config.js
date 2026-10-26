// JOKI.IN Workplace Monitor - Configuration Constants
export const CONFIG = {
  SUPABASE_URL: 'https://xdbnwjvxqtpkoaigedsk.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_WuihnHZo0ZJbVGCMe1sWJg_QVdRKw4z',
  DEFAULT_WORKPLACE_URL: 'https://jokitugasbykay.github.io/Jokiin-workplace.github.io/',
  STORAGE_KEY_AUTH: 'jokiin_monitor_auth_session',
  STORAGE_KEY_CREDENTIALS: 'jokiin_monitor_saved_credentials',
  STORAGE_KEY_SAVED_ACCOUNT: 'jokiin_monitor_saved_account',
  STORAGE_KEY_SETTINGS: 'jokiin_monitor_settings',
  STORAGE_KEY_ORDERS_CACHE: 'jokiin_monitor_orders_cache',
  STORAGE_KEY_LAST_SYNC: 'jokiin_monitor_last_sync',
  DEFAULT_SETTINGS: {
    autoRefreshSeconds: 60,
    notifyNewOrders: true
  },
  STATUS_LABELS: {
    pending: 'Baru',
    processing: 'Diproses',
    revision: 'Revisi',
    completed: 'Selesai',
    cancelled: 'Dibatalkan'
  }
};

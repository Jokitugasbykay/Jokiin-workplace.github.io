// Supabase Client Configuration for JOKI.IN Workplace Web
const SUPABASE_URL = 'https://xdbnwjvxqtpkoaigedsk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WuihnHZo0ZJbVGCMe1sWJg_QVdRKw4z';

// Ensure Supabase is available either from window.supabase or dynamic import
let client = null;

export async function getSupabase() {
  if (client) return client;

  if (window.supabase && typeof window.supabase.createClient === 'function') {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'jokiin-workplace-auth',
        storage: window.localStorage
      }
    });
    return client;
  }

  // Fallback to dynamic import from CDN
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm');
  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'jokiin-workplace-auth',
        storage: window.localStorage
    }
  });
  return client;
}

export const USER_MANAGEMENT_ADMIN_IDS = new Set([
  '92e7a1cb-2136-496a-913b-00cd402c04f5', // Kayla
  '73a14e88-9421-4936-ba99-745768343a13'  // Riski
]);

export function isOrderSupervisor(profile) {
  return profile && profile.role === 'admin' && USER_MANAGEMENT_ADMIN_IDS.has(profile.id);
}

export function canManageAdminBalances(profile) {
  return profile && profile.role === 'admin' && USER_MANAGEMENT_ADMIN_IDS.has(profile.id);
}

export function canAccessPromos(profile) {
  return profile && profile.role === 'admin';
}

export function canManagePromos(profile) {
  return isOrderSupervisor(profile);
}

export function canChangeOrder(profile, order) {
  return isOrderSupervisor(profile) || (order.assigned_to && order.assigned_to === profile?.id);
}

export const ORDER_STATUSES = ['pending', 'processing', 'revision', 'completed', 'cancelled'];

export function allowedOrderStatusTargets(profile, order) {
  const current = order.status || 'pending';
  if (isOrderSupervisor(profile)) {
    return ORDER_STATUSES.filter(s => !(current === 'processing' && s === 'pending'));
  }
  if (!canChangeOrder(profile, order)) return [];
  if (current === 'processing') return ['revision', 'completed'];
  if (current === 'revision') return ['completed'];
  return [];
}

export function profileNickname(profile) {
  if (!profile) return 'Admin';
  const identity = (profile.name || profile.email || '').trim();
  const lower = identity.toLowerCase();
  if (lower === 'kaylafisika24@gmail.com') return 'Kayla';
  if (lower === 'gamingyoga14@gmail.com') return 'Yoga';

  const base = identity.split('@')[0].split(' ')[0];
  if (!base) return 'Admin';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export const ESTIMATE_OPTIONS = [
  { hours: 12, label: '<12 jam' },
  { hours: 24, label: '1 hari' },
  { hours: 48, label: '2 hari' },
  { hours: 72, label: '3 hari' },
  { hours: 96, label: '4 hari' }
];

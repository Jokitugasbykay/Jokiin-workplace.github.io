// JOKI.IN Workplace Monitor - Persistent Authentication Manager
import { CONFIG } from './config.js';
import { Storage } from './storage.js';

export const Auth = {
  async getValidSession() {
    let session = await Storage.getAuthSession();

    // 1. If no session stored, attempt auto-restoration from saved credentials or open tab
    if (!session || !session.access_token) {
      const savedCreds = await Storage.getSavedCredentials();
      if (savedCreds && savedCreds.email && savedCreds.password) {
        try {
          console.log('Restoring session via saved credentials...');
          session = await this.login(savedCreds.email, savedCreds.password, true);
          return session;
        } catch (err) {
          console.warn('Auto login with saved credentials failed:', err.message);
        }
      }

      // Try syncing from open Workplace tab
      try {
        session = await this.syncSessionFromActiveTab(true);
        if (session) return session;
      } catch {
        // Silent fail for tab sync fallback
      }

      return null;
    }

    // 2. Check token expiration (with 120-second safety window)
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const isExpired = expiresAt > 0 && Date.now() > (expiresAt - 120000);

    if (isExpired) {
      // If currently offline, NEVER wipe the session. Keep cached state accessible.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.log('Device offline during session validation; keeping stored session.');
        return session;
      }

      if (session.refresh_token) {
        try {
          session = await this.refreshToken(session.refresh_token);
          return session;
        } catch (err) {
          console.warn('Refresh token attempt result:', err.message);

          // Network or temporary server failure: DO NOT LOGOUT! Keep the session.
          if (err.isNetworkError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
            console.log('Network unreachable; preserving session across restarts.');
            return session;
          }

          // If refresh token was truly revoked or invalidated by auth server, try transparent re-login
          const savedCreds = await Storage.getSavedCredentials();
          if (savedCreds && savedCreds.email && savedCreds.password) {
            try {
              console.log('Refresh token invalid; re-authenticating with saved credentials...');
              session = await this.login(savedCreds.email, savedCreds.password, true);
              return session;
            } catch (reLoginErr) {
              console.warn('Automatic re-login failed:', reLoginErr.message);
            }
          }

          // Try syncing from open tab
          try {
            const tabSession = await this.syncSessionFromActiveTab(true);
            if (tabSession) return tabSession;
          } catch {}

          // Still keep session object so cached data and account identity remain intact
          return session;
        }
      }
    }

    return session;
  },

  async login(email, password, isAutoLogin = false) {
    const trimmedEmail = email.trim();
    let res;

    try {
      res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': CONFIG.SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: trimmedEmail, password })
      });
    } catch (networkErr) {
      const err = new Error('Tidak dapat terhubung ke server Supabase. Periksa koneksi internet Anda.');
      err.isNetworkError = true;
      throw err;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.message || 'Login gagal. Periksa email dan password.');
    }

    // Verify admin role via profiles table
    let profile = null;
    try {
      const profileRes = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/profiles?id=eq.${data.user.id}&select=*`, {
        headers: {
          'apikey': CONFIG.SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${data.access_token}`
        }
      });

      if (profileRes.ok) {
        const profiles = await profileRes.json().catch(() => []);
        profile = profiles && profiles[0];
      }
    } catch (e) {
      console.warn('Profile fetch warning:', e);
    }

    if (profile && profile.role !== 'admin') {
      throw new Error('Akun ini tidak memiliki hak akses admin JOKI.IN Workplace.');
    }

    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      user: data.user,
      profile: profile || { role: 'admin', email: trimmedEmail }
    };

    // Store session, credentials, and account details for permanent persistence
    await Storage.setAuthSession(session);
    await Storage.setSavedCredentials({ email: trimmedEmail, password });
    await Storage.setSavedAccount({
      id: data.user.id,
      email: data.user.email,
      name: profile?.name || profile?.full_name || profile?.nickname || 'Admin',
      role: profile?.role || 'admin'
    });

    return session;
  },

  async refreshToken(refreshToken) {
    let res;
    try {
      res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'apikey': CONFIG.SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
    } catch (networkErr) {
      const err = new Error('Jaringan tidak tersedia saat memperbarui token.');
      err.isNetworkError = true;
      throw err;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.msg || data.message || data.error_description || 'Gagal memperbarui token sesi.');
      err.status = res.status;
      err.isAuthError = (res.status === 400 || res.status === 401);
      throw err;
    }

    const current = await Storage.getAuthSession();
    const updated = {
      ...current,
      access_token: data.access_token,
      refresh_token: data.refresh_token || current?.refresh_token || refreshToken,
      expires_at: data.expires_at,
      user: data.user || current?.user
    };

    await Storage.setAuthSession(updated);
    return updated;
  },

  async syncSessionFromActiveTab(silent = false) {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.scripting) {
      if (silent) return null;
      throw new Error('Fitur sinkronisasi tab hanya tersedia di lingkungan Chrome Extension.');
    }

    const tabs = await chrome.tabs.query({
      url: [
        'https://jokitugasbykay.github.io/*',
        'http://localhost/*',
        'http://127.0.0.1/*'
      ]
    });

    if (!tabs || tabs.length === 0) {
      if (silent) return null;
      throw new Error('Tidak ada tab JOKI.IN Workplace yang sedang dibuka di browser. Buka website Workplace terlebih dahulu.');
    }

    const targetTab = tabs[0];
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: () => {
        try {
          const authKey = 'jokiin-workplace-auth';
          const raw = localStorage.getItem(authKey);
          if (raw) return { success: true, data: JSON.parse(raw) };

          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.includes('auth-token') || k.includes('supabase.auth'))) {
              return { success: true, data: JSON.parse(localStorage.getItem(k)) };
            }
          }
          return { success: false, reason: 'Sesi belum ditemukan di localStorage tab.' };
        } catch (e) {
          return { success: false, reason: e.message };
        }
      }
    });

    const output = results?.[0]?.result;
    if (!output || !output.success || !output.data) {
      if (silent) return null;
      throw new Error(output?.reason || 'Belum ada sesi login aktif di tab Workplace tersebut.');
    }

    const tabSession = output.data;
    const accessToken = tabSession.access_token || tabSession.currentSession?.access_token;
    const refreshToken = tabSession.refresh_token || tabSession.currentSession?.refresh_token;
    const user = tabSession.user || tabSession.currentSession?.user;

    if (!accessToken || !user) {
      if (silent) return null;
      throw new Error('Data sesi di tab tidak lengkap.');
    }

    let profile = null;
    try {
      const profileRes = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=*`, {
        headers: {
          'apikey': CONFIG.SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (profileRes.ok) {
        const profiles = await profileRes.json().catch(() => []);
        profile = profiles && profiles[0];
      }
    } catch (e) {
      console.warn('Profile fetch warning on tab sync:', e);
    }

    if (profile && profile.role !== 'admin') {
      if (silent) return null;
      throw new Error('Akun pada tab tersebut tidak memiliki hak akses admin JOKI.IN.');
    }

    const session = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: tabSession.expires_at || Math.floor(Date.now() / 1000) + 3600,
      user: user,
      profile: profile || { role: 'admin', email: user.email }
    };

    await Storage.setAuthSession(session);
    await Storage.setSavedAccount({
      id: user.id,
      email: user.email,
      name: profile?.name || profile?.full_name || profile?.nickname || 'Admin',
      role: profile?.role || 'admin'
    });

    return session;
  },

  async logout() {
    // Only triggered when user manually confirms logout in settings
    await Storage.clearAuthSession();
    await Storage.clearSavedCredentials();
  }
};

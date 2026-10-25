// JOKI.IN Workplace Monitor - Storage Utilities
import { CONFIG } from './config.js';

export const Storage = {
  async get(key, defaultValue = null) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          resolve(result[key] !== undefined ? result[key] : defaultValue);
        });
      });
    }
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  async set(key, value) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      });
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  },

  async remove(key) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.remove([key], () => resolve());
      });
    }
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  },

  async getAuthSession() {
    return this.get(CONFIG.STORAGE_KEY_AUTH, null);
  },

  async setAuthSession(session) {
    return this.set(CONFIG.STORAGE_KEY_AUTH, session);
  },

  async clearAuthSession() {
    return this.remove(CONFIG.STORAGE_KEY_AUTH);
  },

  async getSavedCredentials() {
    return this.get(CONFIG.STORAGE_KEY_CREDENTIALS, null);
  },

  async setSavedCredentials(creds) {
    return this.set(CONFIG.STORAGE_KEY_CREDENTIALS, creds);
  },

  async clearSavedCredentials() {
    return this.remove(CONFIG.STORAGE_KEY_CREDENTIALS);
  },

  async getSavedAccount() {
    return this.get(CONFIG.STORAGE_KEY_SAVED_ACCOUNT, null);
  },

  async setSavedAccount(account) {
    return this.set(CONFIG.STORAGE_KEY_SAVED_ACCOUNT, account);
  },

  async getSettings() {
    const custom = await this.get(CONFIG.STORAGE_KEY_SETTINGS, {});
    return { ...CONFIG.DEFAULT_SETTINGS, ...custom };
  },

  async saveSettings(settings) {
    return this.set(CONFIG.STORAGE_KEY_SETTINGS, settings);
  },

  async getCachedOrders() {
    return this.get(CONFIG.STORAGE_KEY_ORDERS_CACHE, null);
  },

  async setCachedOrders(orders) {
    await this.set(CONFIG.STORAGE_KEY_ORDERS_CACHE, orders);
    await this.set(CONFIG.STORAGE_KEY_LAST_SYNC, new Date().toISOString());
  },

  async getLastSync() {
    return this.get(CONFIG.STORAGE_KEY_LAST_SYNC, null);
  }
};

// JOKI.IN Workplace Monitor - Background Service Worker
import { CONFIG } from '../js/config.js';
import { Storage } from '../js/storage.js';
import { Auth } from '../js/auth.js';
import { Api } from '../js/api.js';

const ALARM_NAME = 'jokiin_auto_refresh_alarm';

chrome.runtime.onInstalled.addListener(async () => {
  console.log('JOKI.IN Workplace Monitor Extension Installed.');
  await setupAlarm();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarm();
  await updateBadge();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await updateBadge();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_BADGE') {
    updateBadge().then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'UPDATE_ALARM_SETTINGS') {
    setupAlarm().then(() => sendResponse({ success: true }));
    return true;
  }
});

async function setupAlarm() {
  const settings = await Storage.getSettings();
  await chrome.alarms.clear(ALARM_NAME);

  const seconds = Number(settings.autoRefreshSeconds) || 60;
  if (seconds > 0) {
    // Chrome alarms minimum period is 1 minute (0.5 for dev, Chrome normalizes to 1 min in production)
    const periodInMinutes = Math.max(0.5, seconds / 60);
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: periodInMinutes,
      periodInMinutes: periodInMinutes
    });
  }
}

async function updateBadge() {
  try {
    const session = await Auth.getValidSession();
    if (!session || !session.access_token) {
      return;
    }

    const orders = await Api.fetchOrders(session);
    await Storage.setCachedOrders(orders);

    const pendingOrders = orders.filter(o => (o.status || '').toLowerCase() === 'pending');
    const count = pendingOrders.length;

    if (count > 0) {
      await chrome.action.setBadgeText({ text: String(count) });
      await chrome.action.setBadgeBackgroundColor({ color: '#E2AE16' }); // Warm amber/yellow
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.warn('Background badge update notice (transient/offline):', err.message);
  }
}

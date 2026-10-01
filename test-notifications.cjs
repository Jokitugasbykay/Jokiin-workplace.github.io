const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, classList: { add() {}, remove() {}, contains() {} }, addEventListener() {} });
    return elements.get(id);
  };
  const storage = new Map();
  const ctx = vm.createContext({ console, URLSearchParams, Uint8Array, atob,
    setTimeout() {}, window: { addEventListener() {} },
    document: { readyState: 'loading', addEventListener() {}, getElementById: el },
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }
  });
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), ctx);
  assert.equal(vm.runInContext("trackIncomingOrders([], 'orders')", ctx), 0);
  assert.equal(vm.runInContext("trackIncomingOrders([{id:1,status:'pending'}], 'orders')", ctx), 1);
  assert.equal(vm.runInContext("trackIncomingOrders([{id:1,status:'pending'}], 'orders')", ctx), 0);
  assert.equal(vm.runInContext("trackIncomingOrders([{id:2,status:'cancelled'}], 'orders')", ctx), 0);
  assert.equal(vm.runInContext("trackIncomingOrders([{id:1}], 'checkout')", ctx), 0);
  assert.equal(vm.runInContext("trackIncomingOrders([{id:1},{id:2}], 'checkout')", ctx), 1);
  await vm.runInContext('enablePushNotifications()', ctx);
  assert.match(el('push-status').textContent, /belum mendukung/);
  let saved = false;
  ctx.window.isSecureContext = true;
  ctx.window.PushManager = {};
  ctx.window.Notification = {};
  ctx.Notification = { requestPermission: async () => 'granted', permission: 'granted' };
  const subscription = { endpoint: 'https://fcm.googleapis.com/test', toJSON() { return { endpoint: this.endpoint }; }, unsubscribe: async () => true };
  const registration = { pushManager: { getSubscription: async () => subscription } };
  ctx.navigator = { serviceWorker: { register: async () => registration, ready: Promise.resolve(registration), getRegistration: async () => registration } };
  ctx.fakeApi = async action => {
    if (action === 'config') return { publicKey: 'BA'.repeat(43) + 'A' };
    if (action === 'subscribe') saved = true;
    return {};
  };
  vm.runInContext('pushApi = fakeApi', ctx);
  await vm.runInContext('enablePushNotifications()', ctx);
  assert.equal(saved, true);
  assert.equal(storage.get('workplace_push_enabled'), '1');
  assert.equal(el('btn-test-push').hidden, true);
  assert.equal(el('btn-disable-push').hidden, true);
  assert.equal(el('btn-enable-push').hidden, true);
  ctx.fakeApi = async () => { throw Error('Expired session'); };
  vm.runInContext('pushApi = fakeApi', ctx);
  await vm.runInContext('disablePushNotifications()', ctx);
  assert.equal(storage.has('workplace_push_enabled'), false);

  const handlers = {};
  let shown, opened, work;
  const worker = vm.createContext({ URL, caches: {}, self: {
    addEventListener: (type, handler) => { handlers[type] = handler; },
    registration: { scope: 'https://jokitugasbykay.github.io/Jokiin-workplace.github.io/', showNotification: async (title, options) => { shown = { title, ...options }; } },
    clients: { matchAll: async () => [], openWindow: async url => { opened = url; } }
  }});
  vm.runInContext(fs.readFileSync('service-worker.js', 'utf8'), worker);
  handlers.push({ data: { json: () => ({ title: 'Test', body: 'Order', tab: 'https://evil.example/' }) }, waitUntil: p => { work = p; } });
  await work;
  assert.equal(shown.data.tab, 'orders');
  handlers.notificationclick({ notification: { close() {}, data: { tab: 'payments' } }, waitUntil: p => { work = p; } });
  await work;
  assert.equal(opened, 'https://jokitugasbykay.github.io/Jokiin-workplace.github.io/index.html?tab=payments');
  worker.fetch = async () => ({ ok: true, version: 'new', clone() { return this; } });
  worker.caches = { open: async () => ({ put: async () => {} }), match: async () => ({ version: 'old' }) };
  let response;
  handlers.fetch({ request: { method: 'GET', url: 'https://jokitugasbykay.github.io/Jokiin-workplace.github.io/index.html', mode: 'navigate' }, respondWith: p => { response = p; }, waitUntil() {} });
  assert.equal((await response).version, 'new');
  worker.fetch = async () => { throw Error('Offline'); };
  handlers.fetch({ request: { method: 'GET', url: 'https://jokitugasbykay.github.io/Jokiin-workplace.github.io/index.html', mode: 'navigate' }, respondWith: p => { response = p; }, waitUntil() {} });
  assert.equal((await response).version, 'old');
  console.log('PASS: first order after empty baseline, checkout arrivals, no repeats, permission UI, endpoint revocation and safe notification navigation.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

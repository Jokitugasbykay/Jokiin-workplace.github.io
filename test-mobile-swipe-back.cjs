const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const events = {};
const stack = [{}];
let position = 0;

const classLists = new Map();
function getClassList(id) {
  if (!classLists.has(id)) {
    const classes = new Set();
    classLists.set(id, {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, force) => {
        if (force === true) classes.add(c);
        else if (force === false) classes.delete(c);
        else if (classes.has(c)) classes.delete(c);
        else classes.add(c);
        return classes.has(c);
      },
      contains: (c) => classes.has(c),
      _raw: classes
    });
  }
  return classLists.get(id);
}

const elements = new Map();
const containerListeners = {};
const element = (id) => {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      style: {},
      value: '',
      textContent: '',
      classList: getClassList(id),
      addEventListener: (type, fn) => {
        if (id === 'app-container') containerListeners[type] = fn;
      },
      setAttribute: () => {},
      removeAttribute: () => {},
      closest: () => null,
      dataset: {}
    });
  }
  return elements.get(id);
};

const history = {
  get length() { return stack.length; },
  get state() { return stack[position]; },
  replaceState(value, title, url) {
    stack[position] = value;
  },
  pushState(value, title, url) {
    stack.splice(position + 1);
    stack.push(value);
    position = stack.length - 1;
  },
  back() {
    if (position > 0) {
      position--;
      if (events.popstate) {
        events.popstate({ state: stack[position] });
      }
    }
  }
};

const ctx = vm.createContext({
  console,
  URL,
  URLSearchParams,
  Intl,
  Date,
  window: {
    history,
    location: new URL('https://example.test/workplace/?tab=reviews'),
    innerWidth: 390,
    scrollTo: () => {},
    addEventListener: (name, fn) => { events[name] = fn; },
    matchMedia: () => ({ matches: false })
  },
  document: {
    readyState: 'loading',
    addEventListener: () => {},
    getElementById: element,
    querySelector: (sel) => {
      if (sel === '.bottom-nav-container') return element('bottom-nav-container');
      if (sel === '.welcome-card') return element('welcome-card');
      return null;
    },
    querySelectorAll: () => []
  },
  setTimeout: () => {}
});

// Load app.js
vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), ctx);

// Setup authenticated admin (Founder role)
vm.runInContext(`
  state.admin = { role: 'admin', workplace_role: 'founder', id: '92e7a1cb-2136-496a-913b-00cd402c04f5' };
  state.activeTab = 'home';
  activityHistoryReady = true;
  closeDrawer = () => {};
  renderActiveTab = () => {};
`, ctx);

// Test 1: Visibilitas tab bar pada tab sekunder (reviews, products, violations)
vm.runInContext("switchTab('reviews');", ctx);
assert.equal(vm.runInContext("state.activeTab", ctx), 'reviews');
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), true, 'Tab bar harus disembunyikan pada reviews');
assert.equal(getClassList('app-container').contains('nav-hidden'), true, 'App container harus nav-hidden pada reviews');

// Test 2: Navigasi antara tab sekunder (reviews -> products -> violations)
vm.runInContext("switchTab('products');", ctx);
assert.equal(vm.runInContext("state.activeTab", ctx), 'products');
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), true, 'Tab bar harus tetap tersembunyi pada products');

vm.runInContext("switchTab('violations');", ctx);
assert.equal(vm.runInContext("state.activeTab", ctx), 'violations');
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), true, 'Tab bar harus tetap tersembunyi pada violations');

// Test 3: History back dari violations ke products (keduanya hidden-nav tab)
// Tab bar harus TETAP TERSEMBUNYI setelah kembali
history.back();
assert.equal(vm.runInContext("state.activeTab", ctx), 'products');
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), true, 'Tab bar harus tetap tersembunyi setelah kembali ke products');

// Test 4: History back dari products ke reviews (keduanya hidden-nav tab)
history.back();
assert.equal(vm.runInContext("state.activeTab", ctx), 'reviews');
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), true, 'Tab bar harus tetap tersembunyi setelah kembali ke reviews');

// Test 5: Popstate dengan event.state bernilai null (misal pemulihan URL awal ?tab=reviews)
// Sistem harus membaca URL parameter dan menjaga tab bar tetap tersembunyi
vm.runInContext("window.location = new URL('https://example.test/workplace/?tab=reviews');", ctx);
if (events.popstate) {
  events.popstate({ state: null });
}
assert.equal(vm.runInContext("state.activeTab", ctx), 'reviews');
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), true, 'Tab bar harus tetap tersembunyi saat popstate null pada reviews');

// Test 6: Bfcache restoration (pageshow event dengan event.persisted = true)
// Ketika halaman dipulihkan dari cache mobile browser, tab bar harus tetap nav-hidden
if (events.pageshow) {
  events.pageshow({ persisted: true });
}
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), true, 'Tab bar harus tetap tersembunyi setelah dipulihkan dari bfcache');

// Test 7: Kembali ke tab beranda atau orders (bottom-nav tab)
// Tab bar harus kembali terlihat
vm.runInContext("switchTab('orders');", ctx);
assert.equal(vm.runInContext("state.activeTab", ctx), 'orders');
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), false, 'Tab bar harus muncul kembali pada tab orders');

vm.runInContext("switchTab('home');", ctx);
assert.equal(vm.runInContext("state.activeTab", ctx), 'home');
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), false, 'Tab bar harus muncul kembali pada tab home');

// Test 8: Validasi seluruh daftar tab HIDE_NAVBAR_TABS
const expectedHiddenTabs = [
  'reviews', 'products', 'integration', 'task-files',
  'performance', 'keuangan', 'operational', 'users',
  'invoice', 'violations', 'withdrawals'
];
expectedHiddenTabs.forEach((tab) => {
  vm.runInContext(`switchTab('${tab}');`, ctx);
  assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), true, `Tab ${tab} harus menyembunyikan tab bar`);
});

// Test 9: Gesture swipe dari tepi kiri layar (native gesture zone clientX <= 40)
// Gesture handler JS harus mengabaikan touch ini agar tidak memblokir atau menabrak swipe-back native browser
vm.runInContext("setupSwipeGestures();", ctx);
vm.runInContext("switchTab('reviews');", ctx);
assert.equal(vm.runInContext("state.activeTab", ctx), 'reviews');

const targetMock = { closest: () => null };
// Simulasikan swipe start di tepi kiri (clientX = 15)
containerListeners.touchstart({
  touches: [{ clientX: 15, clientY: 200 }],
  target: targetMock
});
// Simulasikan swipe end ke kanan (clientX = 180)
containerListeners.touchend({
  changedTouches: [{ clientX: 180, clientY: 200 }]
});
// State tab tidak boleh di-reset ke home secara keliru
assert.equal(vm.runInContext("state.activeTab", ctx), 'reviews', 'Edge swipe tidak boleh mereset activeTab ke home');
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), true, 'Tab bar harus tetap tersembunyi');

// Test 10: Gesture swipe di dalam layar (clientX > 40) pada hidden-nav tab
// Harus memanggil history.back() dan memulihkan tab riwayat sebelumnya
vm.runInContext("switchTab('orders'); switchTab('reviews');", ctx);
assert.equal(vm.runInContext("state.activeTab", ctx), 'reviews');
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), true);

containerListeners.touchstart({
  touches: [{ clientX: 80, clientY: 200 }],
  target: targetMock
});
containerListeners.touchend({
  changedTouches: [{ clientX: 220, clientY: 200 }]
});
// Karena tab sebelumnya di history adalah orders, maka orders dipulihkan
assert.equal(vm.runInContext("state.activeTab", ctx), 'orders', 'Content swipe right harus kembali ke tab sebelumnya di riwayat');
assert.equal(getClassList('bottom-nav-container').contains('nav-hidden'), false, 'Tab bar harus terlihat kembali di orders');

console.log('PASS: Semua pengujian navigasi mobile swipe-back, tab bar visibility, popstate, dan bfcache berhasil.');

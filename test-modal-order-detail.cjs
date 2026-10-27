const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoDir = __dirname;
const indexHtml = fs.readFileSync(path.join(repoDir, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(repoDir, 'css', 'style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(repoDir, 'js', 'app.js'), 'utf8');

// 1. Verify index.html structural components
const requiredElementIds = [
  'modal-order-detail',
  'detail-modal-title',
  'detail-order-code',
  'detail-order-total',
  'detail-order-payment',
  'detail-order-status-badge',
  'detail-order-worker',
  'detail-order-date',
  'detail-task-title',
  'detail-task-deadline',
  'detail-task-notes',
  'detail-task-drive-links',
  'detail-order-items',
  'detail-customer-avatar',
  'detail-customer-name',
  'detail-customer-email',
  'detail-customer-wa',
  'detail-order-deadline',
  'detail-max-estimate-label',
  'btn-open-estimate-edit',
  'btn-order-create-invoice'
];

requiredElementIds.forEach(id => {
  assert.ok(indexHtml.includes(`id="${id}"`), `Missing element id="${id}" in index.html`);
});

// 2. Verify css/style.css mobile responsive rules
assert.ok(styleCss.includes('.odm-meta-box'), 'Missing .odm-meta-box in css/style.css');
assert.ok(styleCss.includes('.odm-avatar'), 'Missing .odm-avatar in css/style.css');
assert.ok(styleCss.includes('.odm-item-row'), 'Missing .odm-item-row in css/style.css');
assert.ok(styleCss.includes('.odm-whatsapp-btn'), 'Missing .odm-whatsapp-btn in css/style.css');
assert.ok(styleCss.includes('display: contents;'), 'Missing display: contents for mobile sheet sections in css/style.css');
assert.ok(styleCss.includes('order: 1;'), 'Missing order 1 for detail-total-section in css/style.css');
assert.ok(styleCss.includes('order: 2;'), 'Missing order 2 for detail-task-section in css/style.css');
assert.ok(styleCss.includes('order: 3;'), 'Missing order 3 for detail-items-section in css/style.css');
assert.ok(styleCss.includes('order: 4;'), 'Missing order 4 for detail-contact-section in css/style.css');
assert.ok(styleCss.includes('order: 5;'), 'Missing order 5 for detail-estimate-section in css/style.css');

// 3. Test openOrderDetail population logic
const elements = new Map();
const makeElement = () => ({
  style: {},
  textContent: '',
  innerHTML: '',
  className: '',
  children: [],
  appendChild(child) { this.children.push(child); },
  querySelector() { return null; }
});

const context = vm.createContext({
  Date,
  Intl,
  URL,
  setTimeout,
  clearTimeout,
  window: { addEventListener() {}, history: { replaceState() {} } },
  document: {
    readyState: 'loading',
    addEventListener() {},
    createElement: makeElement,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    activeElement: null
  }
});

vm.runInContext(appJs, context);
vm.runInContext("openModal = id => { globalThis.opened = id; };", context);

const mockOrder = {
  id: 42,
  order_code: 'JOKI-42-MOBILE',
  status: 'processing',
  worker_id: 'worker-uuid-1',
  payment_status: 'PAID',
  payment_method: 'QRIS',
  total_price: 45000,
  created_at: '2026-10-27T04:00:00.000Z',
  customer: {
    name: 'Gina Aolia',
    email: 'gina2aolia@gmail.com',
    whatsapp: '6282260576988'
  },
  task: {
    title: 'beragam warna,satu bangsa',
    notes: 'aku mau nanti setelah posternya jdi kmu berikan aku penjelasan terpisah',
    deadline: '2026-10-26'
  },
  items: [
    { name: 'Desain Poster', quantity: 1, unit_price: 45000 }
  ]
};

context.mockOrder = mockOrder;
vm.runInContext("state.orders = [mockOrder]; state.admin = { id: 'admin-1', role: 'admin' }; state.profiles = { 'worker-uuid-1': { id: 'worker-uuid-1', name: 'Admin Salsa' } };", context);

vm.runInContext("openOrderDetail(42);", context);

assert.equal(context.opened, 'modal-order-detail');
assert.equal(elements.get('detail-order-code').textContent, 'JOKI-42-MOBILE');
assert.equal(elements.get('detail-customer-name').textContent, 'Gina Aolia');
assert.equal(elements.get('detail-customer-email').textContent, 'gina2aolia@gmail.com');
assert.equal(elements.get('detail-customer-avatar').textContent, 'GA');
assert.equal(elements.get('detail-order-worker').textContent, 'Admin Salsa');
assert.ok(elements.get('detail-order-total').textContent.includes('45.000'));
assert.ok(elements.get('detail-order-status-badge').innerHTML.includes('Diproses'));
assert.ok(elements.get('detail-order-payment').textContent.includes('Sudah dibayar · QRIS'));
assert.equal(elements.get('detail-task-title').textContent, 'beragam warna,satu bangsa');
assert.ok(elements.get('detail-customer-wa').innerHTML.includes('Chat via WhatsApp'));
assert.ok(elements.get('detail-customer-wa').innerHTML.includes('6282260576988'));
assert.equal(elements.get('detail-order-items').children.length, 1);
assert.ok(elements.get('detail-order-items').children[0].innerHTML.includes('Desain Poster'));
assert.ok(elements.get('detail-order-items').children[0].innerHTML.includes('45.000'));
assert.equal(elements.get('btn-order-create-invoice').style.display, 'flex');

console.log('PASS: Modal order detail mobile popup design verified successfully.');

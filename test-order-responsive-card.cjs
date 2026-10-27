const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const elements = new Map();
const element = (tag = 'div') => ({
  tagName: tag.toUpperCase(),
  style: {},
  className: '',
  classList: {
    contains(cls) { return this.className ? this.className.split(' ').includes(cls) : false; },
    add(cls) { this.className = (this.className + ' ' + cls).trim(); }
  },
  textContent: '',
  innerHTML: '',
  children: [],
  appendChild(child) { this.children.push(child); }
});

const context = vm.createContext({
  Date,
  Intl,
  URL,
  window: { addEventListener() {} },
  document: {
    readyState: 'loading',
    addEventListener() {},
    createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }
  }
});

vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context);

// Test 1: createOrderCard with mock order matching Desktop and Mobile references
const mockOrder = {
  id: 101,
  order_code: 'NUGQJD68P3KRKD3XVE32CTXB74Y7P',
  tipe: 'REGULER',
  status: 'processing',
  payment_status: 'PAID',
  total_price: 45000,
  created_at: '2026-10-27T05:47:00Z',
  customer: {
    name: 'Gina Aolia',
    email: 'gina2aolia@gmail.com'
  },
  assigned_to: 'admin-salsa-uuid',
  items: [
    { name: 'Pembuatan Makalah Bab 1-3', quantity: 1, unit_price: 45000 }
  ],
  task: {
    title: 'Pembuatan Makalah Bab 1-3',
    notes: 'Keterangan pesanan lengkap dan format sesuai pedoman'
  }
};

vm.runInContext(`
  state.admin = { id: 'admin-salsa-uuid', role: 'admin', workplace_role: 'supervisor' };
  state.profiles = [
    { id: 'admin-salsa-uuid', name: 'Salsa', email: 'salsabila@gmail.com' }
  ];
`, context);

context.mockOrder = mockOrder;
const card = vm.runInContext('createOrderCard(mockOrder)', context);

assert.ok(card.className.includes('order-responsive-card'), 'Card must have order-responsive-card class');
assert.ok(card.innerHTML.includes('odc-avatar'), 'Card must contain odc-avatar');
assert.ok(card.innerHTML.includes('GA'), 'Avatar must contain initials GA');
assert.ok(card.innerHTML.includes('NUGQJD68P3KRKD3XVE32CTXB74Y7P'), 'Card must contain order code');
assert.ok(card.innerHTML.includes('REGULER'), 'Card must have REGULER badge');
assert.ok(card.innerHTML.includes('Gina Aolia'), 'Card must display customer name');
assert.ok(card.innerHTML.includes('gina2aolia@gmail.com'), 'Card must display customer email');
assert.ok(card.innerHTML.includes('Diproses'), 'Card must display Diproses status');
assert.ok(card.innerHTML.includes('Admin Salsa'), 'Card must display assigned admin Salsa');
assert.ok(card.innerHTML.includes('45.000'), 'Card must display 45.000');
assert.ok(card.innerHTML.includes('27 Okt 2026'), 'Card must display 27 Okt 2026');

// Mobile specific elements
assert.ok(card.innerHTML.includes('odc-mobile-top'), 'Card must contain odc-mobile-top container');
assert.ok(card.innerHTML.includes('TOTAL PEMBAYARAN'), 'Card must contain TOTAL PEMBAYARAN label for mobile');
assert.ok(card.innerHTML.includes('odc-code-box'), 'Card must contain odc-code-box for mobile');
assert.ok(card.innerHTML.includes('ITEM PESANAN'), 'Card must contain ITEM PESANAN label for mobile');

// Desktop specific elements
assert.ok(card.innerHTML.includes('odc-desktop-top'), 'Card must contain odc-desktop-top container');

// Product row
assert.ok(card.innerHTML.includes('odc-product-row'), 'Card must contain odc-product-row');
assert.ok(card.innerHTML.includes('Pembuatan Makalah Bab 1-3'), 'Card must contain product name');

// Actions
assert.ok(card.innerHTML.includes('Lihat detail'), 'Card must have Lihat detail button');
assert.ok(card.innerHTML.includes('btn-detail-order'), 'Button must have btn-detail-order class');
assert.ok(card.innerHTML.includes('order-status-select'), 'Card must have order-status-select');

// Test 2: Persona Guards - No em dash and no en dash
assert.ok(!card.innerHTML.includes('\u2014'), 'No em dash in order card HTML');
assert.ok(!card.innerHTML.includes('\u2013'), 'No en dash in order card HTML');

console.log('PASS: Responsive order card design (Desktop & Mobile) successfully verified.');

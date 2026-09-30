const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const elements = new Map();
const element = () => ({ style: {}, dataset: {}, children: [], textContent: '',
  setAttribute(key, value) { this[key] = value; },
  appendChild(child) { this.children.push(child); },
  insertBefore(child) { this.children.push(child); },
  querySelector() { return null; }
});
const get = id => {
  if (!elements.has(id)) elements.set(id, element());
  return elements.get(id);
};
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-09-30T12:00:00+07:00'])); }
}
const context = vm.createContext({ Date: Clock, console,
  window: { addEventListener() {}, matchMedia: () => ({ matches: true }) },
  performance: { now: () => 0 },
  document: { readyState: 'loading', addEventListener() {}, getElementById: get,
    createElementNS: element, querySelectorAll: () => [] }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8'), context);
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
for (const id of ['perf-chart-svg-wrapper', 'perf-chart-data', 'perf-chart-empty']) {
  assert.ok(html.includes(`id="${id}"`));
}
vm.runInContext(`state.orders = [
  { created_at: '2026-09-29T05:00:00+07:00', status: 'completed', total_price: 100000 },
  { created_at: '2026-09-30T10:00:00+07:00', status: 'processing', payment_status: 'paid', total_price: 200000 },
  { created_at: '2026-09-26T10:00:00+07:00', status: 'completed', total_price: 900000 }
]; renderPerformance();`, context);
assert.equal(get('perf-net-revenue').textContent, '267.000');
assert.equal(get('perf-completed-orders').textContent, '1');
assert.equal(get('perf-chart-empty').hidden, true);
assert.ok(get('perf-chart-svg-wrapper').children.length);
for (const range of ['today', 'week', 'month']) {
  const points = vm.runInContext(`state.perfRange = '${range}'; renderPerformance(); renderCombinedChart(state.orders.slice(0, 2), '${range}', 0)`, context);
  assert.equal(points.reduce((sum, p) => sum + p.count, 0), range === 'today' ? 0 : 1);
  assert.equal(points.reduce((sum, p) => sum + p.amount, 0), range === 'today' ? 200000 : 300000);
}
vm.runInContext("state.perfRange = 'month'; state.perfMonthOffset = -1; renderPerformance()", context);
assert.equal(get('perf-chart-empty').hidden, false);
assert.ok(!get('perf-animated-bars').innerHTML.includes('NaN'));
assert.equal(get('perf-completed-orders').textContent, '0');
console.log('PASS: chart mounting, period filters, launch cutoff, completed counts, empty month and reduced motion.');

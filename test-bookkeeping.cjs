const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/operational-fund.js', 'utf8').replace('  // Export to window', `
  window.testMayar = { renderMayarMonthlyWithdrawals, mayarScheduleDate, confirmedMayarWithdrawal,
    recordMayarWithdrawal, updateMayarWithdrawalStatus, fetchOperationalData };
  // Export to window`);
const elements = new Map();
for (const id of ['op-mayar-withdrawals-tbody', 'op-mayar-schedule-badge', 'op-mayar-current-date-text',
  'op-mayar-date-status-subtext', 'op-mayar-total-success-net', 'op-mayar-total-count-note']) {
  elements.set(id, { style: {}, textContent: '', innerHTML: '', querySelectorAll: () => [] });
}
let writes = [];
let readError = null;
const context = vm.createContext({
  window: {}, document: { readyState: 'loading', addEventListener() {}, getElementById: id => elements.get(id) },
  Date, Intl, console, alert() {}, confirm: () => false,
  formatRupiah: n => 'Rp' + Number(n).toLocaleString('id-ID'),
  getSupabase: async () => ({ from: table => ({
    select() { return this; }, order() { return this; }, single() { return this; },
    then(resolve) { return Promise.resolve({ data: [], error: table === 'mayar_monthly_withdrawals' ? readError : null }).then(resolve); },
    insert(row) { writes.push(row); throw new Error('Unexpected write'); },
    update(row) { writes.push(row); throw new Error('Unexpected write'); }
  }) })
});
vm.runInContext(source, context);
const api = context.window.testMayar;
const data = context.window.OperationalFund.getData();
const confirmed = { id: 'one', scheduled_date: '2026-10-25', gross_amount: 100000, fee_amount: 2775,
  net_amount: 97225, status: 'success', transaction_reference: 'BANK-123', confirmed_by: 'admin', confirmed_at: '2026-10-25T03:00:00Z' };

(async () => {
  assert.equal(api.mayarScheduleDate(new Date('2026-10-24T17:01:00Z')), '2026-10-25');
  assert.equal(api.mayarScheduleDate(new Date('2026-10-31T17:01:00Z')), '2026-11-25');
  assert.equal(api.confirmedMayarWithdrawal(confirmed), true);
  assert.equal(api.confirmedMayarWithdrawal({ ...confirmed, transaction_reference: '' }), true);
  for (const override of [{ confirmed_at: null }, { confirmed_by: null },
    { status: 'pending' }, { net_amount: 100000 }, { fee_amount: 0 }]) {
    assert.equal(api.confirmedMayarWithdrawal({ ...confirmed, ...override }), false);
  }
  data.mayarWithdrawalsError = '';
  data.mayarWithdrawals = [];
  api.renderMayarMonthlyWithdrawals();
  assert.equal(elements.get('op-mayar-total-success-net').textContent, '0');
  data.mayarWithdrawals = [confirmed, { ...confirmed, id: 'two', status: 'pending' },
    { ...confirmed, id: 'three', confirmed_at: null, transaction_reference: '\"><img src=x onerror=alert(1)>' }];
  api.renderMayarMonthlyWithdrawals();
  assert.equal(elements.get('op-mayar-total-success-net').textContent, '97.225');
  assert.match(elements.get('op-mayar-total-count-note').textContent, /1 perlu verifikasi/);
  assert.ok(!elements.get('op-mayar-withdrawals-tbody').innerHTML.includes('data-ref=""><img'));
  assert.equal(await api.recordMayarWithdrawal('2026-10-25', 100000, 'BANK', 'pending', ''), false); // duplicate date
  data.mayarWithdrawals = [];
  for (const args of [['2026-10-25', 2775, '', 'pending', ''], ['2026-10-24', 100000, '', 'pending', ''],
    ['2026-10-25', 100000.5, '', 'pending', ''], ['2026-10-25', 100000, '', 'success', ''],
    ['2026-10-25', 100000, 'BANK', 'success', '']]) {
    assert.equal(await api.recordMayarWithdrawal(...args), false);
  }
  assert.equal(await api.updateMayarWithdrawalStatus('one', 'success', ''), false);
  assert.equal(await api.updateMayarWithdrawalStatus('one', 'success', 'BANK'), false);
  readError = { message: 'Permission denied' };
  await api.fetchOperationalData();
  api.renderMayarMonthlyWithdrawals();
  assert.equal(elements.get('op-mayar-total-success-net').textContent, '—');
  assert.match(elements.get('op-mayar-total-count-note').textContent, /belum dapat diverifikasi/);
  assert.equal(await api.recordMayarWithdrawal('2026-10-25', 100000, '', 'pending', ''), false);
  assert.equal(writes.length, 0);
  readError = null;
  await api.fetchOperationalData();
  api.renderMayarMonthlyWithdrawals();
  assert.equal(elements.get('op-mayar-total-success-net').textContent, '0');

  const html = fs.readFileSync('index.html', 'utf8');
  const panel = html.split('id="op-bookkeeping-panel"')[1].split('</article>')[0];
  for (const value of ['400.000', '500.000', '100.000', '192.000', '21.300', '255.600', '63.600', '277.700', '22.100']) assert.ok(panel.includes(value), value);
  assert.ok(panel.includes('id="op-bookkeeping-opening-balance"')); // opening value is loaded from the canonical summary
  assert.ok(!panel.includes('300.000'));
  assert.equal(12 * 16000, 192000);
  assert.equal(12 * 21300, 255600);
  assert.equal(255600 - 192000, 63600);
  assert.equal(277700 - 255600, 22100);
  assert.equal(html.split('id="op-mayar-withdrawal-panel"').length - 1, 1);
  console.log('PASS: funding baseline, reconciliation, confirmed-only Mayar totals, error/recovery, WIB schedule, validation, duplicate-date rejection and safe references; no database writes.');
})().catch(error => { console.error(error); process.exitCode = 1; });

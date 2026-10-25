const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fixture = require('./test-allocation-fixture.json');

const source = fs.readFileSync('js/operational-fund.js', 'utf8').replace('  // Export to window', `
  window.testFinance = {
    getMonthlyCashFlowEntries,
    renderMonthlyCashFlowSummary,
    fetchOperationalData,
    renderAll
  };
  // Export to window`);

const elements = new Map();
for (const id of [
  'cashflow-period-badge', 'cashflow-total-inflow', 'cashflow-inflow-sales', 'cashflow-inflow-capital',
  'cashflow-inflow-other', 'cashflow-total-outflow', 'cashflow-outflow-op', 'cashflow-outflow-mayar',
  'cashflow-outflow-cogs', 'cashflow-balance-book', 'cashflow-balance-reported', 'cashflow-balance-actual',
  'cashflow-reconcile-badge', 'cashflow-table-count', 'cashflow-history-tbody',
  'op-bookkeeping-opening-balance', 'op-allocation-status', 'op-val-balance', 'op-val-remaining', 'op-foot-balance'
]) {
  elements.set(id, { style: {}, textContent: '', innerHTML: '', querySelectorAll: () => [] });
}

const context = vm.createContext({
  window: {},
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById: id => elements.get(id)
  },
  Date,
  Intl,
  console,
  alert() {},
  confirm: () => false,
  formatRupiah: n => 'Rp' + Number(n).toLocaleString('id-ID'),
  formatShortDate: d => d,
  escapeHtml: s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  getSupabase: async () => ({
    from: table => ({
      select() { return this; },
      order() { return this; },
      single() { return this; },
      then(resolve) {
        if (table === 'mayar_monthly_withdrawals') {
          return Promise.resolve({
            data: [{
              id: 'abdf38e7-478e-4999-a03b-756780aa65ef',
              scheduled_date: '2026-10-25',
              gross_amount: 252990,
              fee_amount: 2775,
              net_amount: 250215,
              status: 'success',
              transaction_reference: 'ed953d'
            }],
            error: null
          }).then(resolve);
        }
        return Promise.resolve({ data: fixture[table] ?? [], error: null }).then(resolve);
      }
    })
  })
});

vm.runInContext(source, context);
const api = context.window.testFinance;

(async () => {
  await api.fetchOperationalData();
  api.renderMonthlyCashFlowSummary();

  const entries = api.getMonthlyCashFlowEntries();

  // 1. Audit Sumber Saldo & Klasifikasi Transaksi
  const capital = entries.find(e => e.category === 'capital');
  assert.ok(capital, 'Suntikan modal bisnis wajib ada');
  assert.equal(capital.type, 'inflow');
  assert.equal(capital.amount, 400000);
  assert.equal(capital.grossAmount, 500000);
  assert.equal(capital.feeAmount, 100000);

  const sales = entries.find(e => e.category === 'sales');
  assert.ok(sales, 'Penerimaan omzet penjualan wajib ada');
  assert.equal(sales.type, 'inflow');
  assert.equal(sales.amount, 255600);
  assert.equal(sales.grossAmount, 264000);
  assert.equal(sales.feeAmount, 8400);

  const internalReserve = entries.filter(e => e.type === 'internal_allocation');
  assert.ok(internalReserve.length > 0, 'Alokasi internal pos kas wajib ada');
  // Pastikan alokasi internal BUKAN type 'inflow' agar tidak double-counting!
  assert.ok(internalReserve.every(e => e.type === 'internal_allocation'));

  const cogs = entries.find(e => e.category === 'personal_cogs');
  assert.ok(cogs, 'Pengembalian modal talangan wajib ada');
  assert.equal(cogs.type, 'liability');
  assert.equal(cogs.amount, 192000);

  const transfer = entries.find(e => e.type === 'transfer');
  assert.ok(transfer, 'Transfer antar akun Mayar ke bank wajib ada');
  assert.equal(transfer.category, 'account_transfer');
  assert.equal(transfer.grossAmount, 252990);
  assert.equal(transfer.feeAmount, 2775);
  assert.equal(transfer.netAmount, 250215);

  const mayarFee = entries.find(e => e.category === 'mayar_fee');
  assert.ok(mayarFee, 'Biaya payment gateway penarikan wajib ada');
  assert.equal(mayarFee.type, 'outflow');
  assert.equal(mayarFee.amount, 2775);

  const variance = entries.find(e => e.type === 'unreconciled');
  assert.ok(variance, 'Selisih rekonsiliasi wajib ada');
  assert.equal(variance.amount, 22100);

  const personal = entries.find(e => e.type === 'non_business');
  assert.ok(personal, 'Alokasi pribadi non-bisnis wajib ada');
  assert.equal(personal.amount, 100000);

  // 2. Verifikasi Angka di UI Dashboard
  // Pemasukan = 400.000 + 255.600 = 655.600 (TIDAK BOLEH 666.600 yang double count Rp11.000)
  assert.equal(elements.get('cashflow-total-inflow').textContent, '655.600');
  assert.equal(elements.get('cashflow-inflow-sales').textContent, 'Rp255.600');
  assert.equal(elements.get('cashflow-inflow-capital').textContent, 'Rp400.000');
  assert.equal(elements.get('cashflow-inflow-other').textContent, 'Rp11.000');

  // Pengeluaran Beban Riil = Rp2.775
  assert.equal(elements.get('cashflow-total-outflow').textContent, '2.775');
  assert.equal(elements.get('cashflow-outflow-mayar').textContent, 'Rp2.775');
  assert.equal(elements.get('cashflow-outflow-op').textContent, 'Rp0');
  assert.equal(elements.get('cashflow-outflow-cogs').textContent, 'Rp192.000');

  // Saldo Buku Besar = 655.600 - 2.775 - 192.000 = 460.825
  assert.equal(elements.get('cashflow-balance-book').textContent, 'Rp460.825');
  assert.equal(elements.get('cashflow-balance-reported').textContent, 'Rp277.700');
  assert.equal(elements.get('cashflow-balance-actual').textContent, 'Belum diverifikasi');
  assert.equal(elements.get('cashflow-reconcile-badge').textContent, 'Belum Direkonsiliasi');

  // 3. Verifikasi Aturan Larangan Em Dash dan En Dash
  for (const [id, el] of elements.entries()) {
    assert.ok(!el.textContent.includes('\u2014'), `Dilarang em dash di ${id} textContent`);
    assert.ok(!el.textContent.includes('\u2013'), `Dilarang en dash di ${id} textContent`);
    assert.ok(!el.innerHTML.includes('\u2014'), `Dilarang em dash di ${id} innerHTML`);
    assert.ok(!el.innerHTML.includes('\u2013'), `Dilarang en dash di ${id} innerHTML`);
  }

  console.log('PASS: Financial audit, multi-account reconciliation, zero double counting, transaction classifications, and formatting rules verified.');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

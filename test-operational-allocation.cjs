const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const original = require('./test-allocation-fixture.json');
let fixture = structuredClone(original);
let failedTable = '';
let writes = 0;
const nodes = new Map(['op-val-balance','op-val-allocated','op-val-spent','op-val-remaining',
  'op-bookkeeping-opening-balance','op-foot-balance',
  'op-allocation-status','op-promo-budget-badge','op-promo-spent','op-promo-remaining',
  'op-bonus-budget-badge','op-bonus-spent','op-bonus-remaining','op-reseller-budget-badge',
  'op-reseller-cash-remaining','op-bookkeeping-business-capital','op-bookkeeping-profit',
  'op-bookkeeping-sales','btn-add-expense','btn-add-team-bonus'].map(id => [id, {textContent:'',style:{}}]));
const ctx = vm.createContext({ Date,Intl,console,alert() {},
  window:{},document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)},
  formatRupiah:n=>'Rp'+Number(n).toLocaleString('id-ID'),
  getSupabase:async()=>({from:table=>({
    select(){return this;},order(){return this;},single(){return this;},
    then(resolve){return Promise.resolve({data:fixture[table]??[],error:table===failedTable?{message:'unavailable'}:null}).then(resolve);}
  }),rpc(){writes++;throw Error('Unexpected write');}})
});
const source=fs.readFileSync('js/operational-fund.js','utf8').replace('  // Export to window',
  '  window.testAllocation={fetchOperationalData,renderAll,addExpense,recordResellerPurchase};\n  // Export to window');
vm.runInContext(source,ctx);
const api=ctx.window.testAllocation;
async function refresh(){await api.fetchOperationalData();api.renderAll();return ctx.window.OperationalFund.getData();}
(async()=>{
  let data=await refresh();
  assert.match(data.allocationError,/rekonsiliasi/);
  assert.equal(data.summary.current_balance,11000);
  assert.equal(nodes.get('op-bookkeeping-opening-balance').textContent,'Rp0');
  assert.equal(nodes.get('op-val-balance').textContent,'-');
  assert.match(nodes.get('op-foot-balance').textContent,/Saldo buku Rp11.000/);
  assert.equal(nodes.get('op-val-remaining').textContent,'-');
  assert.equal(nodes.get('op-bookkeeping-business-capital').textContent,'400.000');
  assert.equal(nodes.get('op-bookkeeping-sales').textContent,'277.700');
  assert.equal(nodes.get('op-bookkeeping-profit').textContent,'63.600');
  assert.ok(data.budgets.filter(b=>b.id!=='domain').every(b=>b.remaining_amount===0));
  assert.equal(await api.addExpense('promo',100,'test','',''),false);
  assert.equal(await api.recordResellerPurchase('test','test',1,100,''),false);
  assert.equal(writes,0);
  const summary=fixture.operational_fund_summary;
  Object.assign(summary,{initial_fund:5000,total_inflow:42003,allocation_ready:true,allocation_basis:25003,current_balance:47003,total_fund:47003,total_allocated:25003});
  fixture.operational_budgets_status.filter(b=>b.id!=='domain').forEach((b,i)=>Object.assign(b,{allocated_amount:i<3?5001:5000,remaining_amount:i<3?5001:5000}));
  data=await refresh();
  assert.equal(data.allocationError,'');
  assert.equal(nodes.get('op-val-remaining').textContent,'25.003');
  assert.equal(nodes.get('op-val-balance').textContent,'47.003');
  assert.equal(nodes.get('op-bookkeeping-opening-balance').textContent,'Rp5.000');
  assert.match(nodes.get('op-foot-balance').textContent,/Saldo awal Rp5.000 sudah termasuk/);
  assert.notEqual(nodes.get('op-val-balance').textContent,'52.003'); // opening must not be added twice
  assert.equal(data.budgets.filter(b=>b.id!=='domain').reduce((sum,b)=>sum+b.remaining_amount,0),25003);
  const varBudgets = data.budgets.filter(b => !b.is_fixed_obligation);
  assert.equal(varBudgets.length, 5, 'Tepat 5 kategori alokasi variabel');
  assert.ok(varBudgets.every(b => b.percentage === 20), 'Setiap kategori tepat 20%');
  assert.equal(varBudgets.reduce((sum, b) => sum + b.percentage, 0), 100, 'Total persentase alokasi tepat 100%');
  assert.deepEqual([...ctx.window.OperationalFund.calculateAllocation(25003, 5)], [5001, 5001, 5001, 5000, 5000], 'Distribusi pembulatan rupiah deterministik');
  assert.equal(ctx.window.OperationalFund.calculateAllocation(25003, 5).reduce((a, b) => a + b, 0), 25003, 'Total pembulatan sama persis dengan basis');

  // Uji konsistensi persentase 20% dan pembaruan nominal saat saldo berubah
  const updatedBasis = 35002;
  const newNominals = [...ctx.window.OperationalFund.calculateAllocation(updatedBasis, 5)];
  assert.deepEqual(newNominals, [7001, 7001, 7000, 7000, 7000], 'Distribusi deterministik untuk basis baru 35.002');
  assert.equal(newNominals.reduce((a, b) => a + b, 0), updatedBasis);
  Object.assign(summary, { allocation_basis: updatedBasis, current_balance: 57002, total_fund: 57002, total_allocated: updatedBasis });
  fixture.operational_budgets_status.filter(b => b.id !== 'domain').forEach((b, i) => Object.assign(b, { allocated_amount: newNominals[i], remaining_amount: newNominals[i] }));
  data = await refresh();
  assert.equal(data.allocationError, '');
  assert.equal(nodes.get('op-val-remaining').textContent, '35.002');
  assert.equal(nodes.get('op-val-balance').textContent, '57.002');
  const refreshedVars = data.budgets.filter(b => !b.is_fixed_obligation);
  assert.ok(refreshedVars.every(b => b.percentage === 20), 'Kelima kategori tetap 20% setelah refresh');
  assert.equal(refreshedVars.reduce((sum, b) => sum + b.remaining_amount, 0), updatedBasis, 'Total sisa nominal sama persis dengan saldo terbaru');

  // Kembalikan ke baseline 25003 untuk pengujian berikutnya
  Object.assign(summary, { allocation_basis: 25003, current_balance: 47003, total_fund: 47003, total_allocated: 25003 });
  fixture.operational_budgets_status.filter(b => b.id !== 'domain').forEach((b, i) => Object.assign(b, { allocated_amount: i < 3 ? 5001 : 5000, remaining_amount: i < 3 ? 5001 : 5000 }));
  data = await refresh();

  assert.equal(nodes.get('op-promo-remaining').textContent,'Rp5.000');
  assert.equal(nodes.get('op-reseller-cash-remaining').textContent,'5.000');
  assert.equal(nodes.get('btn-add-expense').disabled,false);
  fixture.operational_budgets_status[1].remaining_amount++;
  data=await refresh();
  assert.match(data.allocationError,/Data berubah/);
  assert.equal(nodes.get('btn-add-expense').disabled,true);
  fixture=structuredClone(original);
  failedTable='operational_fund_summary';
  data=await refresh();
  assert.match(data.allocationError,/belum dapat diverifikasi/);
  assert.equal(nodes.get('op-bookkeeping-opening-balance').textContent,'-');
  assert.equal(nodes.get('op-val-balance').textContent,'-');
  assert.match(nodes.get('op-foot-balance').textContent,/gagal dimuat/);
  assert.equal(nodes.get('op-promo-remaining').textContent,'-');
  assert.equal(nodes.get('op-reseller-cash-remaining').textContent,'-');
  assert.ok(data.budgets.filter(b=>b.id!=='domain').every(b=>b.remaining_amount===0));
  assert.equal(writes,0);
  const html=fs.readFileSync('index.html','utf8');
  assert.ok(html.includes('Saldo Awal Pembukuan'));
  assert.ok(!html.includes('Saldo Awal Kas JOKI.IN'));
  assert.ok(html.includes('Ringkasan Arus Kas Bulanan'));
  console.log('PASS: canonical DB summary, distinct opening/current/allocatable balances, nonzero opening counted once, pending/error states, funding references, category refresh and no writes.');
})().catch(error=>{console.error(error);process.exitCode=1;});

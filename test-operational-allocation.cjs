const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const original = require('./test-allocation-fixture.json');
let fixture = structuredClone(original);
let failedTable = '';
let writes = 0;
const nodes = new Map(['op-bookkeeping-opening-balance',
  'op-allocation-status','op-promo-budget-badge','op-promo-spent','op-promo-remaining',
  'op-bonus-budget-badge','op-bonus-spent','op-bonus-remaining','op-reseller-budget-badge',
  'op-reseller-cash-remaining','op-bookkeeping-business-capital','op-bookkeeping-profit',
  'op-bookkeeping-sales','btn-add-expense','btn-add-team-bonus'].map(id => [id, {textContent:'',style:{}}]));
const ctx = vm.createContext({ Date,Intl,console,alert() {},
  window:{},document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)},
  formatRupiah:n=>'Rp'+Number(n).toLocaleString('id-ID'),
  getSupabase:async()=>({from:table=>({
    select(){return this;},order(){return this;},single(){return this;},range(){return this;},
    then(resolve){return Promise.resolve({data:fixture[table]??[],error:table===failedTable?{message:'unavailable'}:null}).then(resolve);}
  }),rpc(){writes++;throw Error('Unexpected write');}})
});
const source=fs.readFileSync('js/operational-fund.js','utf8').replace('  // Export to window',
  '  window.testAllocation={fetchOperationalData,renderAll,addExpense,recordResellerPurchase};\n  // Export to window');
vm.runInContext(fs.readFileSync('js/monthly-cashflow.js','utf8'),ctx);
vm.runInContext(source,ctx);
const api=ctx.window.testAllocation;
async function refresh(){await api.fetchOperationalData();api.renderAll();return ctx.window.OperationalFund.getData();}
(async()=>{
  let data=await refresh();
  assert.match(data.allocationError,/rekonsiliasi/);
  assert.equal(data.summary.current_balance,11000);
  assert.equal(nodes.get('op-bookkeeping-opening-balance').textContent,'Rp0');
  assert.equal(data.summary.allocation_basis,0);
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
  assert.equal(data.summary.allocation_basis,25003);
  assert.equal(data.summary.current_balance,47003);
  assert.equal(nodes.get('op-bookkeeping-opening-balance').textContent,'Rp5.000');
  assert.notEqual(data.summary.current_balance,52003); // opening must not be added twice
  assert.equal(data.budgets.filter(b=>b.id!=='domain').reduce((sum,b)=>sum+b.remaining_amount,0),25003);
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
  assert.equal(nodes.get('op-bookkeeping-opening-balance').textContent,'—');
  assert.equal(nodes.get('op-promo-remaining').textContent,'—');
  assert.equal(nodes.get('op-reseller-cash-remaining').textContent,'—');
  assert.ok(data.budgets.filter(b=>b.id!=='domain').every(b=>b.remaining_amount===0));
  assert.equal(writes,0);
  const html=fs.readFileSync('index.html','utf8');
  assert.ok(html.includes('Saldo Awal Pembukuan'));
  assert.ok(!html.includes('Saldo Awal Kas JOKI.IN'));
  assert.equal((html.match(/id="monthly-cashflow"/g)||[]).length,1);
  assert.ok(!html.includes('id="op-val-balance"'));
  console.log('PASS: canonical allocation summary, nonzero opening counted once, pending/error states, funding references, category refresh, old cards absent and no writes.');
})().catch(error=>{console.error(error);process.exitCode=1;});

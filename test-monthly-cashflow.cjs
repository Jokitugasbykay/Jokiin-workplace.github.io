const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ctx=vm.createContext({window:{},Date,Intl});
vm.runInContext(fs.readFileSync('js/monthly-cashflow.js','utf8'),ctx);
const {build,monthKey,readRows}=ctx.window.MonthlyCashflow;
const date='2026-10-25T10:00:00Z';
const checkout={id:'c1',order_code:'A',total_price:22000,payment_status:'PAID',paid_at:date,created_at:date};
const data={
 checkouts:[checkout,{...checkout,id:'mirror'}],
 orders:[{id:1,order_code:'A',payment_status:'PAID',total_price:22000,created_at:date},{id:2,order_code:'B',payment_status:'PAID',total_price:10000,created_at:date}],
 payments:[{id:1,order_id:1,amount:22000,status:'paid',created_at:date},{id:2,order_id:2,amount:10000,status:'paid',created_at:date}],
 books:[{id:'fund',category:'capital_injection',gross_amount:500000,net_amount:400000,status:'verified',created_at:date},
 ...['personal_allocation','order_cogs_liability','order_profit_allocation','reported_sales_reconciliation','reconciliation_variance'].map((category,i)=>({id:category,category,net_amount:[100000,192000,63600,277700,22100][i],status:'verified',created_at:date}))],
 expenses:[{id:'expense',category_id:'ai_tools',amount:5000,created_at:date},{id:'repay',category_id:'admin_capital_repayment',amount:16000,created_at:date}],
 mayar:[{id:'withdraw',gross_amount:252990,fee_amount:2775,net_amount:250215,status:'success',confirmed_by:'admin',confirmed_at:date,transaction_reference:'TEST-WD'}],reseller:[]
};
(async()=>{
 let result=build(data,'2026-10');
 assert.equal(result.incoming,432000);
 assert.equal(result.outgoing,23775);
 assert.equal(result.totals.funding,400000);
 assert.equal(result.totals.sales,32000);
 assert.equal(result.totals.repayment,16000);
 assert.equal(result.rows.filter(row=>row.kind==='transfer')[0].amount,250215);
 assert.equal(result.rows.filter(row=>row.category==='mayar_fee').length,1);
 assert.equal(monthKey('2026-09-30T17:01:00Z'),'2026-10');
 assert.equal(monthKey('2026-10-31T17:01:00Z'),'2026-11');
 assert.equal(build(data,'2026-11').incoming,0);
 const unknown=structuredClone(data);
 unknown.orders.push({id:3,order_code:'C',payment_status:'PAID',total_price:22000,created_at:date});
 result=build(unknown,'2026-10');
 assert.equal(result.incoming,null);
 assert.equal(result.datedIncome,432000);
 assert.ok(result.rows.some(row=>row.issue));
 const invalid=structuredClone(data);invalid.expenses[0].amount=null;
 assert.equal(build(invalid,'2026-10').outgoing,null);
 const overlap=structuredClone(data);overlap.expenses.push({id:'fee',category_id:'mayar_fee',amount:2775,created_at:date});
 assert.equal(build(overlap,'2026-10').outgoing,null);
 assert.equal(build(overlap,'2026-10').feeOverlap,true);
 const invalidMayar=structuredClone(data);invalidMayar.mayar[0].net_amount=null;
 assert.equal(build(invalidMayar,'2026-10').outgoing,null);
 const duplicateMayar=structuredClone(data);duplicateMayar.mayar.push({...duplicateMayar.mayar[0],id:'duplicate'});
 assert.equal(build(duplicateMayar,'2026-10').outgoing,null);
 assert.equal(build(duplicateMayar,'2026-10').datedExpense,23775);
 const pages=[];
 const db={from:()=>({select(){return this;},order(){return this;},range(start,end){pages.push([start,end]);return Promise.resolve({data:Array.from({length:start===1000?1:500},(_,i)=>({id:start+i})),error:null});}})};
 assert.equal((await readRows(db,'payments')).data.length,1001);
 assert.equal(pages.length,3);
 const failed={from:()=>({select(){return this;},order(){return this;},range(){return Promise.resolve({data:null,error:{message:'Denied'}});}})};
 assert.equal((await readRows(failed,'payments')).data,null);
 const html=fs.readFileSync('index.html','utf8');
 assert.equal((html.match(/id="monthly-cashflow"/g)||[]).length,1);
 for(const id of ['op-val-balance','op-val-allocated','op-val-spent','op-val-remaining'])assert.ok(!html.includes(`id="${id}"`));
 console.log('PASS: monthly income/expense separation, funding net only, no sale mirrors/profit/reference double counts, Mayar transfer and fee once, repayment, WIB boundary, unknown dates/amounts, overlap detection, pagination and old cards removed.');
})().catch(e=>{console.error(e);process.exitCode=1;});

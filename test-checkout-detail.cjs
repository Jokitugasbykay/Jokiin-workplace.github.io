const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const element = () => ({ style: {}, textContent: '', innerHTML: '', children: [], appendChild(child) { this.children.push(child); } });
const context = vm.createContext({ Date, Intl, URL, window: { addEventListener() {} }, document: { readyState: 'loading', addEventListener() {}, createElement: element, getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); } } });
vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context);
vm.runInContext("openModal = id => { globalThis.opened = id; }; showNotice = message => { globalThis.notice = message; };", context);
context.checkout = { id: 'test', order_code: 'UNPAID', payment_status: 'PENDING', status: 'pending', customer: { name: 'Customer' }, items: [{ name: 'Tugas', unit_price: 19000, quantity: 1 }], total_price: 19000, task: { title: 'Judul tugas', notes: 'Catatan lengkap', deadline: '2 hari', googleDriveUrl: 'https://drive.google.com/drive/folders/test' } };
(async () => {
  for (const id of ['73a14e88-9421-4936-ba99-745768343a13', '92e7a1cb-2136-496a-913b-00cd402c04f5']) {
    context.adminId = id;
    vm.runInContext("state.admin={id:adminId,role:'admin'}; supabaseClient={rpc:async(name,args)=>{ if(name!=='workplace_checkout_detail'||args.p_id!=='test')throw Error('Wrong RPC');return {data:checkout,error:null}; }}", context);
    assert.match(vm.runInContext('checkoutDetailButton(checkout)', context), /Lihat detail tugas/);
    await vm.runInContext("openCheckoutDetail('test')", context);
    assert.equal(context.opened, 'modal-order-detail');
    assert.equal(elements.get('detail-task-notes').textContent, 'Catatan lengkap');
    assert.equal(elements.get('detail-task-title').textContent, 'Judul tugas');
    assert.equal(elements.get('detail-task-deadline').textContent, '2 hari');
    assert.ok(elements.get('detail-task-drive-links').children.some(link => link.href === context.checkout.task.googleDriveUrl));
    assert.match(elements.get('detail-order-items').children[0].innerHTML, /19\.000/);
    assert.equal(elements.get('btn-open-estimate-edit').style.display, 'none');
    assert.equal(elements.get('btn-order-create-invoice').style.display, 'none');
  }
  vm.runInContext("state.admin={id:'other',role:'admin',workplace_role:'founder'}; opened=null;", context);
  assert.equal(vm.runInContext('checkoutDetailButton(checkout)', context), '');
  await vm.runInContext("openCheckoutDetail('test')", context);
  assert.equal(context.opened, null);
  vm.runInContext("state.admin={id:'73a14e88-9421-4936-ba99-745768343a13',role:'admin'}; supabaseClient={rpc:async()=>({error:{message:'Access denied'}})}", context);
  context.button = { disabled: false };
  await vm.runInContext("openCheckoutDetail('test',button)", context);
  assert.equal(context.button.disabled, false);
  assert.equal(context.notice, 'Access denied');
  console.log('PASS: exclusive unpaid detail, full task/Drive/items, read-only controls and error recovery.');
})().catch(error => { console.error(error); process.exitCode = 1; });

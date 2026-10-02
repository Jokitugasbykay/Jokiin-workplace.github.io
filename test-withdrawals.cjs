const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({
  Date, window: { addEventListener() {} },
  document: { readyState: 'loading', addEventListener() {} }
});
vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context);
vm.runInContext("state.admin={id:'test',role:'admin',admin_balance:49999};state.sanctions={};", context);
assert.match(vm.runInContext('withdrawalReason()', context), /50.000/);
vm.runInContext('state.admin.admin_balance=50000', context);
assert.equal(vm.runInContext('withdrawalReason()', context), '');
vm.runInContext('state.admin.admin_balance=70000', context);
assert.equal(vm.runInContext('withdrawalReason()', context), '');
vm.runInContext("state.sanctions.withdrawals_until=new Date(Date.now()+86400000).toISOString()", context);
assert.match(vm.runInContext('withdrawalReason()', context), /diblokir/);
vm.runInContext("state.sanctions.withdrawals_until=new Date(Date.now()-1).toISOString()", context);
assert.equal(vm.runInContext('withdrawalReason()', context), '');
vm.runInContext("state.withdrawals=[{requested_by:'test',status:'pending'}]", context);
assert.match(vm.runInContext('withdrawalReason()', context), /diproses/);
vm.runInContext("switchTab('withdrawals')", context);
assert.equal(vm.runInContext('state.activeTab', context), 'home');
console.log('PASS: Rp50.000 threshold, sanctions, expiry, pending request and manager-only navigation.');

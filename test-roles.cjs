const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({
  window: { addEventListener() {} },
  document: { readyState: 'loading', addEventListener() {} }
});
vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context);
for (const role of ['founder', 'supervisor', 'admin', 'user']) {
  context.profile = { role: role === 'user' ? 'user' : 'admin', workplace_role: role };
  assert.equal(vm.runInContext('workplaceRole(profile)', context), role);
  assert.equal(vm.runInContext('isFounder(profile)', context), role === 'founder');
  assert.equal(Boolean(vm.runInContext('isOrderSupervisor(profile)', context)), ['founder', 'supervisor'].includes(role));
}
vm.runInContext("state.admin = { role: 'admin', workplace_role: 'supervisor' }; switchTab('violations');", context);
assert.equal(vm.runInContext('state.activeTab', context), 'home');
console.log('PASS: role hierarchy and Founder-only navigation.');

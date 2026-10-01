const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function main() {
  const elements = new Map();
  const calls = [];
  let clientOptions, role = 'customer', auditCalls = 0;
  const storage = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, {
      style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
      addEventListener(event, handler) { this[event] = handler; }
    });
    return elements.get(id);
  };
  const client = { auth: {
    async signInWithOAuth(options) { calls.push(options); return { error: null }; },
    async signOut(options) { assert.equal(options.scope, 'local'); },
    async getSession() { return { data: { session: { user: { id: 'customer' } } } }; },
    async signInWithPassword() { return { data: { user: { id: 'customer' } }, error: null }; }
  }, async rpc(name) { assert.equal(name, 'workplace_record_login'); auditCalls++; return { error: null }; }, from() { return { select() { return this; }, eq() { return this; },
    async single() { return { data: { id: 'customer', role } }; }
  }; } };
  const context = vm.createContext({ navigator: { userAgent: 'Test browser' }, console, setTimeout() {}, clearInterval() {},
    localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    document: { readyState: 'loading', addEventListener() {}, getElementById: getElement,
      querySelectorAll: () => [], querySelector: () => null },
    window: { location: {}, addEventListener() {}, supabase: { createClient: (url, key, options) => { clientOptions = options; return client; } } }
  });
  const source = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8');
  vm.runInContext(source, context);
  vm.runInContext('setupEventListeners()', context);
  for (const url of [
    'https://jokitugasbykay.github.io/Jokiin-workplace.github.io/',
    'https://jokitugasbykay.github.io/Jokiin-workplace.github.io/index.html?next=https://jokiin.my.id/#test',
    'http://localhost:3000/', 'https://jokiin.my.id/'
  ]) {
    context.window.location = new URL(url);
    await getElement('btn-login-google').click();
    const request = calls.at(-1);
    assert.equal(request.provider, 'google');
    assert.equal(request.options.queryParams.prompt, 'select_account');
    assert.equal(request.options.redirectTo, 'https://jokitugasbykay.github.io/Jokiin-workplace.github.io/');
  }
  assert.equal(calls.length, 4);
  context.window.location = new URL('file:///index.html');
  await getElement('btn-login-google').click();
  assert.equal(calls.length, 4);
  let signouts = 0;
  client.auth.signOut = async options => { assert.equal(options.scope, 'local'); signouts++; return { error: null }; };
  await vm.runInContext('handleLogout()', context);
  await vm.runInContext('checkInitialSession()', context);
  assert.equal(vm.runInContext('state.admin', context), null);
  await vm.runInContext("handleLogin('customer@example.test', 'test', false)", context);
  assert.equal(signouts, 3);
  assert.equal(vm.runInContext('state.admin', context), null);
  assert.equal(clientOptions.auth.storageKey, 'jokiin-workplace-auth');
  assert.equal(clientOptions.auth.persistSession, true);
  assert.equal(clientOptions.auth.autoRefreshToken, true);
  role = 'admin';
  storage.set('password_login_at', String(Date.now() - 7 * 86400000));
  vm.runInContext('showAppShell = () => {}; loadData = async () => {}; startLiveUpdates = () => {};', context);
  await vm.runInContext('checkInitialSession()', context);
  assert.equal(vm.runInContext('state.admin.role', context), 'admin');
  assert.equal(vm.runInContext('isSessionValid()', context), true);
  assert.equal(signouts, 3);
  assert.equal(auditCalls, 1);
  vm.runInContext('state.admin = null', context);
  client.auth.signInWithPassword = async () => ({ data: { user: { id: 'customer', user_metadata: { avatar_url: 'https://example.test/google-photo.png' } } }, error: null });
  await vm.runInContext("handleLogin('admin@example.test', 'test', true)", context);
  assert.equal(vm.runInContext('state.admin.role', context), 'admin');
  assert.equal(vm.runInContext('state.admin.avatar_url', context), 'https://example.test/google-photo.png');
  assert.equal(getElement('login-error-box').style.display, 'none');
  assert.equal(auditCalls, 2);
  console.log('PASS: canonical Google redirect, file guard, non-admin rejection, and all three local signouts.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

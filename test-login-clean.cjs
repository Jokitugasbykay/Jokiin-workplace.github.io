const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function main() {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8');

  // 1. Verify HTML attributes
  assert.ok(indexHtml.includes('id="login-form" autocomplete="off"'), 'login-form must have autocomplete="off"');
  assert.ok(indexHtml.includes('id="login-email" class="form-input" placeholder="admin@jokiin.com" required autocomplete="off"'), 'login-email must have autocomplete="off"');
  assert.ok(indexHtml.includes('id="login-password" class="form-input" placeholder="••••••••" required autocomplete="new-password"'), 'login-password must have autocomplete="new-password"');
  assert.ok(!indexHtml.includes('id="remember-me" checked'), 'remember-me checkbox must not be checked by default in HTML');
  assert.ok(!indexHtml.includes('Ingat email di perangkat ini'), 'remember-me text must be removed from HTML');

  // 2. Verify runtime behavior
  const elements = new Map();
  const storage = new Map();
  storage.set('workplace_remembered_email', 'gamingyoga14@gmail.com');

  const getElement = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: 'pre-existing-value',
        style: {},
        classList: { add() {}, remove() {}, contains() { return false; } },
        addEventListener() {}
      });
    }
    return elements.get(id);
  };

  const client = {
    auth: {
      async getSession() { return { data: { session: null } }; },
      async signOut() { return { error: null }; },
      async signInWithPassword() { return { data: { user: { id: 'admin1', user_metadata: {} } }, error: null }; }
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async single() { return { data: { id: 'admin1', role: 'admin' } }; }
      };
    },
    async rpc() { return { error: null }; }
  };

  const context = vm.createContext({
    navigator: { userAgent: 'Test browser' },
    console,
    setTimeout() {},
    clearInterval() {},
    localStorage: {
      getItem: k => storage.get(k),
      setItem: (k, v) => storage.set(k, v),
      removeItem: k => storage.delete(k)
    },
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById: getElement,
      querySelectorAll: () => [],
      querySelector: () => null
    },
    window: {
      location: new URL('http://localhost:3000/'),
      addEventListener() {},
      supabase: { createClient: () => client }
    }
  });

  vm.runInContext(appJs, context);

  // Before checkInitialSession, workplace_remembered_email was in localStorage
  assert.equal(storage.get('workplace_remembered_email'), 'gamingyoga14@gmail.com');

  // Run checkInitialSession
  await vm.runInContext('checkInitialSession()', context);

  // After checkInitialSession, workplace_remembered_email MUST be deleted
  assert.equal(storage.get('workplace_remembered_email'), undefined);
  // And login-email.value MUST be empty string
  assert.equal(getElement('login-email').value, '');
  assert.equal(getElement('login-password').value, '');

  // Simulate logging in with rememberMe = true
  getElement('login-email').value = 'admin@example.com';
  getElement('login-password').value = 'secret';
  await vm.runInContext("handleLogin('admin@example.com', 'secret', true)", context);

  // Ensure workplace_remembered_email was NOT saved
  assert.equal(storage.get('workplace_remembered_email'), undefined);

  // Call showLoginView directly
  getElement('login-email').value = 'some-leftover@test.com';
  getElement('login-password').value = 'leftover-pass';
  vm.runInContext('showLoginView()', context);
  assert.equal(getElement('login-email').value, '');
  assert.equal(getElement('login-password').value, '');

  console.log('PASS: login autofill removal verified successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

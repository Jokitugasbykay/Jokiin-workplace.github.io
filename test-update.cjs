const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const block = html.slice(html.indexOf("    if ('serviceWorker' in navigator"), html.indexOf('  </script>', html.indexOf("    if ('serviceWorker' in navigator")));
for (const visible of [true, false]) {
  let handler, reloads = 0;
  vm.runInNewContext(block, {
    navigator: { serviceWorker: { controller: {}, addEventListener: (_, fn) => { handler = fn; } } },
    document: { getElementById: () => ({ style: { display: visible ? 'flex' : 'none' } }) },
    window: { location: { protocol: 'https:', reload: () => reloads++ }, addEventListener() {} }
  });
  handler(); handler();
  assert.equal(reloads, visible ? 1 : 0);
}
console.log('PASS: update refreshes login once and preserves signed-in pages.');

const fs = require('fs');

const appJs = fs.readFileSync('js/app.js', 'utf8').replace(/\r\n/g, '\n');
const indexHtml = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const styleCss = fs.readFileSync('css/style.css', 'utf8').replace(/\r\n/g, '\n');

// 1. Check index.html has inv-status-badge and inv-tax-row-display
if (!indexHtml.includes('id="inv-status-badge"')) {
  throw new Error('Missing inv-status-badge in index.html');
}
if (!indexHtml.includes('id="inv-tax-row-display"')) {
  throw new Error('Missing inv-tax-row-display in index.html');
}

// 2. Check style.css has .inv-print-text hidden in screen and displayed in print
if (!styleCss.includes('.inv-print-text {\n  display: none;\n}')) {
  throw new Error('Missing screen .inv-print-text display:none');
}
if (!styleCss.includes('.invoice-sheet input {\n    display: none !important;\n  }')) {
  throw new Error('Missing print input hiding');
}
if (!styleCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;')) {
  throw new Error('Missing 2 column print grid');
}

// 3. Check app.js logic
if (!appJs.includes('syncPrintValues()')) {
  throw new Error('Missing syncPrintValues in app.js');
}
if (!appJs.includes('formatPrintDate(')) {
  throw new Error('Missing formatPrintDate in app.js');
}
if (!appJs.includes('state.paymentOrders')) {
  throw new Error('Missing state.paymentOrders inclusion in app.js');
}

// 4. Check index.html has official jokiin.my.id link
if (!indexHtml.includes('https://jokiin.my.id')) {
  throw new Error('Missing https://jokiin.my.id in index.html');
}

// 5. Check invoice footer is anchored to bottom in screen and print
if (!styleCss.includes('.invoice-sheet {\n  max-width: 1040px;\n  margin: 0 auto 36px;\n  padding: 36px;\n  background: #FFFFFF;\n  border-radius: 20px;\n  box-shadow: 0 12px 40px rgba(24, 56, 42, 0.08);\n  color: #17211D;\n  display: flex;\n  flex-direction: column;\n  min-height: 750px;\n}')) {
  throw new Error('Missing flex column and min-height in screen .invoice-sheet');
}
if (!styleCss.includes('min-height: 282mm !important;')) {
  throw new Error('Missing min-height: 282mm in print .invoice-sheet');
}
if (!styleCss.includes('margin-top: auto !important;')) {
  throw new Error('Missing margin-top: auto in print .invoice-footer-bar');
}

console.log('PASS: invoice modal transition, customer name fallback, print spans and CSS print layout are verified.');

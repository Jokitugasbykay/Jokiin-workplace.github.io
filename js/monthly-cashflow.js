(function () {
  'use strict';
  const labels = { sales: 'Omzet penjualan', funding: 'Suntikan modal bisnis', other: 'Sumber dana lain', operational: 'Operasional', mayar_fee: 'Biaya withdraw Mayar', repayment: 'Pengembalian modal pribadi', transfer: 'Transfer Mayar', review: 'Perlu pemeriksaan' };
  const paid = value => ['paid', 'success', 'completed'].includes(String(value || '').toLowerCase());
  const money = value => value !== null && value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  function monthKey(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).slice(0, 7) : '';
  }
  async function readRows(db, table, columns = '*') {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from(table).select(columns).order('id', { ascending: true }).range(offset, offset + 499);
      if (error || !Array.isArray(data)) return { data: null, error: error || { message: `Gagal memuat ${table}` } };
      rows.push(...data);
      if (data.length < 500) return { data: rows, error: null };
    }
  }
  function build(data, month) {
    const rows = [];
    const seen = new Set();
    const code = value => String(value || '').trim();
    const add = row => {
      if (seen.has(row.id)) return;
      seen.add(row.id);
      rows.push({ ...row, amount: money(row.amount), date: monthKey(row.date) ? row.date : null });
    };
    const checkouts = new Map();
    for (const row of data.checkouts || []) {
      if (!paid(row.payment_status)) continue;
      const key = code(row.order_code) || `checkout:${row.id}`;
      if (checkouts.has(key)) continue;
      checkouts.set(key, row);
      add({ id: `sale:${key}`, date: row.paid_at, kind: 'in', category: 'sales', amount: row.total_price, confirmed: true, issue: !monthKey(row.paid_at), recordedAt: row.created_at, description: `${key} · pembayaran checkout (bruto sebelum biaya gateway)` });
    }
    const orders = new Map((data.orders || []).map(row => [String(row.id), row]));
    const receiptOrders = new Set();
    for (const row of data.payments || []) {
      if (!paid(row.status)) continue;
      const order = orders.get(String(row.order_id));
      if (checkouts.has(code(order?.order_code))) continue; // same receipt mirrored by checkout
      receiptOrders.add(String(row.order_id));
      add({ id: `payment:${row.id}`, date: row.created_at, kind: 'in', category: 'sales', amount: row.amount, confirmed: true, description: `Pembayaran ${order?.order_code || row.order_id} · catatan pembayaran` });
    }
    for (const row of data.orders || []) {
      if (!paid(row.payment_status) || checkouts.has(code(row.order_code)) || receiptOrders.has(String(row.id))) continue;
      add({ id: `undated:${row.id}`, date: null, recordedAt: row.created_at, kind: 'in', category: 'sales', amount: row.total_price, confirmed: false, issue: true, description: `${row.order_code || row.id} · PAID, tetapi waktu penerimaan belum tercatat; tidak dimasukkan ke total bertanggal` });
    }
    for (const row of data.books || []) {
      if (!['capital_injection', 'other_cash_income'].includes(row.category)) continue;
      add({ id: `book:${row.id}`, date: row.created_at, kind: 'in', category: row.category === 'capital_injection' ? 'funding' : 'other', amount: row.net_amount, confirmed: row.status === 'verified', description: `${row.title || 'Pendanaan'} · tanggal pencatatan pembukuan, bukan verifikasi mutasi bank` });
    }
    const feeCategories = new Set(['mayar_fee', 'mayar_withdrawal_fee']);
    const repaymentCategories = new Set(['capital_repayment', 'admin_capital_repayment', 'order_cogs_repayment']);
    for (const row of data.expenses || []) {
      add({ id: `expense:${row.id}`, date: row.created_at, kind: 'out', category: feeCategories.has(row.category_id) ? 'mayar_fee' : repaymentCategories.has(row.category_id) ? 'repayment' : 'operational', amount: row.amount, confirmed: true, description: `${row.expense_code || row.category_id} · ${row.description || 'Pengeluaran tercatat'}` });
    }
    for (const row of data.reseller || []) {
      if (row.type !== 'sale') continue; // stock purchases already have operational expense rows
      add({ id: `reseller:${row.id}`, date: row.created_at, kind: 'in', category: 'sales', amount: row.total_revenue, confirmed: true, description: `${row.tx_code || 'Reseller'} · omzet reseller, bukan tambahan laba` });
      if (money(row.payment_fee) > 0) add({ id: `reseller-fee:${row.id}`, date: row.created_at, kind: 'out', category: 'operational', amount: row.payment_fee, confirmed: true, description: `${row.tx_code || 'Reseller'} · biaya pembayaran reseller` });
    }
    const confirmedMayar = [];
    const seenMayar = new Set();
    for (const row of data.mayar || []) {
      if (seen.has(`mayar:${row.id}`)) continue;
      const gross = money(row.gross_amount), fee = money(row.fee_amount), net = money(row.net_amount);
      const identity = row.transaction_reference ? `${row.transaction_reference}:${gross}:${fee}:${net}` : row.id;
      const duplicateReference = seenMayar.has(identity);
      seenMayar.add(identity);
      const confirmed = !duplicateReference && row.status === 'success' && Boolean(row.confirmed_by) && monthKey(row.confirmed_at) && gross !== null && fee === 2775 && net !== null && gross - fee === net;
      const rupiah = value => value === null ? '—' : `Rp${value.toLocaleString('id-ID')}`;
      add({ id: `mayar:${row.id}`, date: row.confirmed_at || row.created_at, kind: 'transfer', category: 'transfer', amount: net, confirmed: Boolean(confirmed), issue: row.status === 'success' && !confirmed, description: `Mayar · bruto ${rupiah(gross)}, biaya ${rupiah(fee)}, bersih ${rupiah(net)} · referensi ${row.transaction_reference || 'belum tersedia'}; transfer internal, bukan omzet${duplicateReference ? '; referensi/nominal berulang, perlu diperiksa' : ''}` });
      if (confirmed) {
        confirmedMayar.push(row);
        add({ id: `mayar-fee:${row.id}`, date: row.confirmed_at, kind: 'out', category: 'mayar_fee', amount: fee, confirmed: true, description: `Biaya withdraw Mayar · ${row.transaction_reference || row.id}` });
      } else if (row.status === 'success') {
        add({ id: `mayar-fee-review:${row.id}`, date: row.confirmed_at || row.created_at, kind: 'out', category: 'mayar_fee', amount: fee, confirmed: false, issue: true, description: 'Biaya pencairan berstatus berhasil belum dapat diverifikasi; periksa nominal dan konfirmasinya.' });
      }
    }
    const periodRows = rows.filter(row => monthKey(row.date || row.recordedAt) === month || (!row.date && !row.recordedAt));
    const feeOverlap = periodRows.some(row => row.id.startsWith('expense:') && row.category === 'mayar_fee') && confirmedMayar.some(row => monthKey(row.confirmed_at) === month);
    const totals = Object.fromEntries(Object.keys(labels).map(key => [key, 0]));
    let incoming = 0, outgoing = 0, incomeUnknown = false, expenseUnknown = feeOverlap;
    for (const row of periodRows) {
      if (row.issue || (row.confirmed && (!row.date || row.amount === null))) {
        if (row.kind === 'in') incomeUnknown = true;
        if (row.kind === 'out') expenseUnknown = true;
      }
      if (!row.confirmed || row.issue || !row.date || row.amount === null || row.kind === 'transfer') continue;
      totals[row.category] += row.amount;
      if (row.kind === 'in') incoming += row.amount;
      if (row.kind === 'out') outgoing += row.amount;
    }
    return { rows: periodRows.sort((a, b) => String(b.date || b.recordedAt || '').localeCompare(String(a.date || a.recordedAt || ''))), totals, incoming: incomeUnknown ? null : incoming, outgoing: expenseUnknown ? null : outgoing, datedIncome: incoming, datedExpense: outgoing, feeOverlap };
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  function render(data, month, category, error, summary) {
    const root = document.getElementById('monthly-cashflow');
    if (!root) return;
    const result = build(data, month);
    const fmt = value => value === null || error ? '—' : formatRupiah(value);
    document.getElementById('cf-income').textContent = fmt(result.incoming);
    document.getElementById('cf-expense').textContent = fmt(result.outgoing);
    document.getElementById('cf-income-breakdown').textContent = error || `Omzet bertanggal ${fmt(result.totals.sales)} · modal bisnis tercatat ${fmt(result.totals.funding)} · sumber lain ${fmt(result.totals.other)}. ${result.incoming === null ? `Total belum lengkap; jumlah bertanggal ${formatRupiah(result.datedIncome)}.` : 'Bruto penjualan sebelum biaya gateway yang belum direkonsiliasi.'}`;
    document.getElementById('cf-expense-breakdown').textContent = error || `Operasional ${fmt(result.totals.operational)} · biaya Mayar ${fmt(result.feeOverlap ? null : result.totals.mayar_fee)} · pengembalian talangan ${fmt(result.totals.repayment)}.${result.feeOverlap ? ' Ada kemungkinan biaya Mayar tercatat pada dua sumber; total menunggu pemeriksaan.' : ''}`;
    document.getElementById('cf-book-balance').textContent = summary ? formatRupiah(summary.current_balance) : '—';
    document.getElementById('cf-bank-balance').textContent = summary?.actual_cash_verified === true ? formatRupiah(summary.actual_cash_balance) : '—';
    document.getElementById('cf-reconciliation').textContent = 'Belum Direkonsiliasi';
    document.getElementById('cf-reconciliation-note').textContent = 'Saldo pembukuan di atas adalah saldo buku operasional dari ringkasan yang sudah ada; bukan total mutasi bulanan seluruh bisnis. Saldo rekening aktual harus berasal dari sumber terverifikasi, bukan disamakan dengan saldo buku. Transfer Mayar tidak menambah omzet. Referensi laba, talangan, dan saldo penjualan tidak ditambahkan lagi.';
    const filtered = result.rows.filter(row => category === 'all' || row.category === category);
    document.getElementById('cf-status').textContent = error || `${filtered.length} catatan ditampilkan. Filter kategori hanya memfilter riwayat; total bulanan tetap seluruh kategori. Tanggal menggunakan WIB.`;
    document.getElementById('cf-history').innerHTML = error ? '<tr><td colspan="6">Data arus kas gagal dimuat. Segarkan Keuangan untuk mencoba lagi.</td></tr>' : !filtered.length ? '<tr><td colspan="6">Tidak ada transaksi tercatat untuk filter ini.</td></tr>' : filtered.map(row => `<tr>
      <td>${row.date ? escape(new Date(row.date).toLocaleString('id-ID', { timeZone:'Asia/Jakarta', dateStyle:'medium', timeStyle:'short' })) : 'Belum diketahui'}</td>
      <td>${{in:'Pemasukan',out:'Pengeluaran',transfer:'Transfer internal'}[row.kind]}</td><td>${labels[row.category]}</td>
      <td class="cf-money">${row.amount === null ? '—' : escape(formatRupiah(row.amount))}</td>
      <td>${row.issue || row.amount === null ? 'Perlu pemeriksaan' : row.confirmed ? 'Tercatat' : 'Menunggu konfirmasi'}</td><td>${escape(row.description)}</td></tr>`).join('');
    return result;
  }
  window.MonthlyCashflow = { monthKey, readRows, build, render };
})();

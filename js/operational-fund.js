// ========================================================
// JOKI.IN Workplace - Dana Pengembangan & Operasional Module
// ========================================================

(function () {
  'use strict';

  let opData = {
    budgets: [],
    expenses: [],
    bonuses: [],
    promos: [],
    summary: {
      initial_fund: 35196,
      total_allocated: 35196,
      total_spent: 0,
      current_balance: 35196
    },
    filterCategory: 'all',
    searchQuery: '',
    loading: false
  };

  const DEFAULT_BUDGETS = [
    { id: 'domain', name: 'Perpanjangan domain', allocated_amount: 21000, color: '#3158A8', icon: 'globe' },
    { id: 'promo', name: 'Promo dan diskon pelanggan', allocated_amount: 5000, color: '#10B981', icon: 'tag' },
    { id: 'ai_tools', name: 'AI dan tools produktivitas', allocated_amount: 4000, color: '#8B5CF6', icon: 'cpu' },
    { id: 'bonus', name: 'Bonus tim paling aktif', allocated_amount: 3000, color: '#F59E0B', icon: 'award' },
    { id: 'emergency', name: 'Dana darurat', allocated_amount: 2196, color: '#EC4899', icon: 'shield-alert' }
  ];

  async function fetchOperationalData() {
    opData.loading = true;
    try {
      const supabase = await getSupabase();
      
      const [
        { data: budgetsData, error: errBudgets },
        { data: expensesData, error: errExpenses },
        { data: bonusesData, error: errBonuses },
        { data: promosData, error: errPromos },
        { data: settingsData }
      ] = await Promise.all([
        supabase.from('operational_budgets_status').select('*'),
        supabase.from('operational_expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_team_bonuses').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_promo_subsidies').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_settings').select('*')
      ]);

      if (errBudgets || !budgetsData || budgetsData.length === 0) {
        opData.budgets = DEFAULT_BUDGETS.map(b => ({
          ...b,
          spent_amount: 0,
          remaining_amount: b.allocated_amount,
          percent_spent: 0
        }));
      } else {
        opData.budgets = budgetsData.map(b => ({
          ...b,
          allocated_amount: parseFloat(b.allocated_amount) || 0,
          spent_amount: parseFloat(b.spent_amount) || 0,
          remaining_amount: parseFloat(b.remaining_amount) || 0,
          percent_spent: parseFloat(b.percent_spent) || 0
        }));
      }

      opData.expenses = expensesData || [];
      opData.bonuses = bonusesData || [];
      opData.promos = promosData || [];

      // Calculate Summary
      let initialFund = 35196;
      if (settingsData && settingsData.length > 0) {
        const found = settingsData.find(s => s.key === 'initial_fund');
        if (found) initialFund = parseFloat(found.value) || 35196;
      }

      const totalSpent = opData.expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const totalAllocated = opData.budgets.reduce((sum, b) => sum + b.allocated_amount, 0);
      const currentBalance = Math.max(0, initialFund - totalSpent);

      opData.summary = {
        initial_fund: initialFund,
        total_allocated: totalAllocated,
        total_spent: totalSpent,
        current_balance: currentBalance
      };

    } catch (err) {
      console.warn('Gagal memuat data dana operasional:', err);
      // Fallback to initial values
      opData.budgets = DEFAULT_BUDGETS.map(b => ({
        ...b,
        spent_amount: 0,
        remaining_amount: b.allocated_amount,
        percent_spent: 0
      }));
      opData.summary = {
        initial_fund: 35196,
        total_allocated: 35196,
        total_spent: 0,
        current_balance: 35196
      };
    } finally {
      opData.loading = false;
    }
  }

  function renderKPI() {
    const s = opData.summary;
    const valBalance = document.getElementById('op-val-balance');
    const valAllocated = document.getElementById('op-val-allocated');
    const valSpent = document.getElementById('op-val-spent');
    const valRemaining = document.getElementById('op-val-remaining');
    const pillRemaining = document.getElementById('op-pill-remaining');
    const pillSpent = document.getElementById('op-pill-spent');

    if (valBalance) valBalance.textContent = s.current_balance.toLocaleString('id-ID');
    if (valAllocated) valAllocated.textContent = s.total_allocated.toLocaleString('id-ID');
    if (valSpent) valSpent.textContent = s.total_spent.toLocaleString('id-ID');
    if (valRemaining) valRemaining.textContent = s.current_balance.toLocaleString('id-ID');

    if (pillSpent) {
      pillSpent.textContent = s.total_spent > 0 ? `${formatRupiah(s.total_spent)}` : 'Realisasi: Rp0';
      pillSpent.className = `ac-12__pill ${s.total_spent > 0 ? 'ac-12__pill--down' : 'ac-12__pill--flat'}`;
    }

    if (pillRemaining) {
      const pct = s.initial_fund > 0 ? Math.round((s.current_balance / s.initial_fund) * 100) : 100;
      pillRemaining.textContent = `${pct}% Sisa`;
      pillRemaining.className = `ac-12__pill ${pct < 20 ? 'ac-12__pill--down' : 'ac-12__pill--up'}`;
    }
  }

  function renderDonutChart() {
    const wrap = document.getElementById('op-donut-svg-wrap');
    const legendEl = document.getElementById('op-donut-legend');
    if (!wrap || !legendEl) return;

    wrap.innerHTML = '';
    legendEl.innerHTML = '';

    const total = opData.budgets.reduce((sum, b) => sum + b.allocated_amount, 0) || 1;
    const size = 260;
    const cx = size / 2;
    const cy = size / 2;
    const rOuter = 105;
    const rInner = 68;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('class', 'op-donut-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Grafik Donut Alokasi Anggaran. Total ${formatRupiah(total)}`);

    let currentAngle = -90; // Start at 12 o'clock

    opData.budgets.forEach((cat, idx) => {
      const sliceAngle = (cat.allocated_amount / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const pct = ((cat.allocated_amount / total) * 100).toFixed(1);

      // Convert angles to radians
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1Outer = cx + rOuter * Math.cos(startRad);
      const y1Outer = cy + rOuter * Math.sin(startRad);
      const x2Outer = cx + rOuter * Math.cos(endRad);
      const y2Outer = cy + rOuter * Math.sin(endRad);

      const x1Inner = cx + rInner * Math.cos(endRad);
      const y1Inner = cy + rInner * Math.sin(endRad);
      const x2Inner = cx + rInner * Math.cos(startRad);
      const y2Inner = cy + rInner * Math.sin(startRad);

      const largeArc = sliceAngle > 180 ? 1 : 0;

      const pathData = [
        `M ${x1Outer} ${y1Outer}`,
        `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
        `L ${x1Inner} ${y1Inner}`,
        `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}`,
        'Z'
      ].join(' ');

      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', cat.color);
      path.setAttribute('class', 'op-donut-slice');
      path.setAttribute('data-id', cat.id);
      path.setAttribute('tabindex', '0');

      const title = document.createElementNS(svgNS, 'title');
      title.textContent = `${cat.name}: ${formatRupiah(cat.allocated_amount)} (${pct}%)`;
      path.appendChild(title);

      path.addEventListener('mouseenter', () => {
        path.setAttribute('opacity', '0.85');
        path.style.transform = 'scale(1.02)';
        path.style.transformOrigin = `${cx}px ${cy}px`;
        updateDonutCenterText(cat.name, formatRupiah(cat.allocated_amount), `${pct}%`);
      });

      path.addEventListener('mouseleave', () => {
        path.setAttribute('opacity', '1');
        path.style.transform = 'none';
        updateDonutCenterText('Total Alokasi', formatRupiah(total), '100%');
      });

      svg.appendChild(path);

      // Legend Item
      const item = document.createElement('div');
      item.className = 'op-donut-legend-item';
      item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: 12px;';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: ${cat.color}; flex-shrink: 0;"></span>
          <span style="font-weight: 600; color: var(--ink);">${cat.name}</span>
        </div>
        <div style="font-weight: 700; color: var(--ink); text-align: right;">
          ${formatRupiah(cat.allocated_amount)} <span style="font-size: 11px; color: var(--ink-secondary); font-weight: 500;">(${pct}%)</span>
        </div>
      `;
      legendEl.appendChild(item);
    });

    // Donut Center Text Group
    const centerGroup = document.createElementNS(svgNS, 'g');
    centerGroup.setAttribute('id', 'op-donut-center-group');

    const centerLabel = document.createElementNS(svgNS, 'text');
    centerLabel.setAttribute('x', cx);
    centerLabel.setAttribute('y', cy - 10);
    centerLabel.setAttribute('text-anchor', 'middle');
    centerLabel.setAttribute('id', 'op-donut-center-title');
    centerLabel.setAttribute('fill', '#64748B');
    centerLabel.setAttribute('font-size', '11');
    centerLabel.setAttribute('font-weight', '600');
    centerLabel.textContent = 'Total Alokasi';

    const centerVal = document.createElementNS(svgNS, 'text');
    centerVal.setAttribute('x', cx);
    centerVal.setAttribute('y', cy + 12);
    centerVal.setAttribute('text-anchor', 'middle');
    centerVal.setAttribute('id', 'op-donut-center-val');
    centerVal.setAttribute('fill', '#1B2430');
    centerVal.setAttribute('font-size', '15');
    centerVal.setAttribute('font-weight', '800');
    centerVal.textContent = formatRupiah(total);

    const centerSub = document.createElementNS(svgNS, 'text');
    centerSub.setAttribute('x', cx);
    centerSub.setAttribute('y', cy + 28);
    centerSub.setAttribute('text-anchor', 'middle');
    centerSub.setAttribute('id', 'op-donut-center-sub');
    centerSub.setAttribute('fill', '#10B981');
    centerSub.setAttribute('font-size', '11');
    centerSub.setAttribute('font-weight', '700');
    centerSub.textContent = '100% Utuh';

    centerGroup.appendChild(centerLabel);
    centerGroup.appendChild(centerVal);
    centerGroup.appendChild(centerSub);
    svg.appendChild(centerGroup);

    wrap.appendChild(svg);
  }

  function updateDonutCenterText(title, val, sub) {
    const t = document.getElementById('op-donut-center-title');
    const v = document.getElementById('op-donut-center-val');
    const s = document.getElementById('op-donut-center-sub');
    if (t) t.textContent = title.length > 20 ? title.slice(0, 19) + '...' : title;
    if (v) v.textContent = val;
    if (s) s.textContent = sub;
  }

  function renderComparisonBars() {
    const container = document.getElementById('op-bars-container');
    const summaryLabel = document.getElementById('op-realization-summary');
    if (!container) return;

    container.innerHTML = '';

    const totalAllocated = opData.summary.total_allocated || 35196;
    const totalSpent = opData.summary.total_spent || 0;
    const overallPct = totalAllocated > 0 ? ((totalSpent / totalAllocated) * 100).toFixed(1) : 0;

    if (summaryLabel) {
      summaryLabel.textContent = `Pengeluaran: ${formatRupiah(totalSpent)} (${overallPct}%)`;
    }

    opData.budgets.forEach(cat => {
      const spent = cat.spent_amount || 0;
      const allocated = cat.allocated_amount || 1;
      const remaining = Math.max(0, allocated - spent);
      const pctSpent = Math.min(100, (spent / allocated) * 100);

      const row = document.createElement('div');
      row.className = 'op-bar-row';
      row.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 13px;">
          <span style="font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${cat.color};"></span>
            ${cat.name}
          </span>
          <span style="font-size: 12px; color: var(--ink-secondary);">
            Anggaran: <strong style="color: var(--ink);">${formatRupiah(allocated)}</strong>
          </span>
        </div>
        <div style="width: 100%; height: 10px; background: #E5E9EF; border-radius: 999px; overflow: hidden; position: relative;">
          <div style="width: ${pctSpent}%; height: 100%; background: ${pctSpent > 80 ? 'var(--balance-red)' : cat.color}; border-radius: 999px; transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);"></div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--ink-secondary);">
          <span>Terpakai: <strong style="color: ${spent > 0 ? 'var(--balance-red)' : 'var(--ink)'};">${formatRupiah(spent)}</strong> (${pctSpent.toFixed(1)}%)</span>
          <span>Sisa: <strong style="color: #10B981;">${formatRupiah(remaining)}</strong></span>
        </div>
      `;

      container.appendChild(row);
    });
  }

  function renderPromoSubsystem() {
    const promoCat = opData.budgets.find(b => b.id === 'promo') || { allocated_amount: 5000, spent_amount: 0 };
    const spent = promoCat.spent_amount || 0;
    const remaining = Math.max(0, promoCat.allocated_amount - spent);

    const elSpent = document.getElementById('op-promo-spent');
    const elRem = document.getElementById('op-promo-remaining');
    const historyContainer = document.getElementById('op-promo-history');

    if (elSpent) elSpent.textContent = formatRupiah(spent);
    if (elRem) elRem.textContent = formatRupiah(remaining);

    if (historyContainer) {
      if (opData.promos.length === 0) {
        historyContainer.innerHTML = '<p class="chart-caption" style="text-align: center; padding: 16px 0;">Belum ada subsidi promo yang dicatat. Anggaran Rp5.000 masih utuh.</p>';
      } else {
        historyContainer.innerHTML = opData.promos.map(p => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--border-light); font-size: 12px;">
            <div>
              <strong style="color: var(--ink);">${escapeHtml(p.promo_name)}</strong>
              <span style="color: var(--ink-secondary); display: block; font-size: 11px;">${escapeHtml(p.description || '-')}</span>
            </div>
            <div style="text-align: right;">
              <span style="font-weight: 700; color: var(--balance-red);">${formatRupiah(p.subsidy_amount)}</span>
              <span style="color: var(--ink-secondary); display: block; font-size: 10px;">${p.created_at ? new Date(p.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-'}</span>
            </div>
          </div>
        `).join('');
      }
    }
  }

  function renderBonusSubsystem() {
    const bonusCat = opData.budgets.find(b => b.id === 'bonus') || { allocated_amount: 3000, spent_amount: 0 };
    const spent = bonusCat.spent_amount || 0;
    const remaining = Math.max(0, bonusCat.allocated_amount - spent);

    const elSpent = document.getElementById('op-bonus-spent');
    const elRem = document.getElementById('op-bonus-remaining');
    const historyContainer = document.getElementById('op-bonus-history');

    if (elSpent) elSpent.textContent = formatRupiah(spent);
    if (elRem) elRem.textContent = formatRupiah(remaining);

    if (historyContainer) {
      if (opData.bonuses.length === 0) {
        // Show active admin performance leaderboard from real profiles/orders
        let adminInfo = '';
        if (state && state.profiles) {
          const admins = state.profiles.filter(p => p.role === 'admin');
          adminInfo = admins.map(a => {
            const nickname = profileNickname(a);
            const completed = state.orders ? state.orders.filter(o => o.assigned_to === a.id && o.status === 'completed').length : 0;
            return `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--border-light); font-size: 12px;">
                <span>Admin ${nickname}</span>
                <span class="status-badge ${completed > 0 ? 'active' : ''}">${completed} pesanan selesai</span>
              </div>
            `;
          }).join('');
        }

        historyContainer.innerHTML = `
          <div style="padding: 4px 0;">
            <p style="font-size: 11px; color: var(--ink-secondary); margin-bottom: 6px; font-weight: 600;">Aktivitas Tim Terkini:</p>
            ${adminInfo || '<p class="chart-caption" style="text-align: center; padding: 12px 0;">Belum ada data aktivitas tim.</p>'}
            <p class="chart-caption" style="text-align: center; margin-top: 10px; font-size: 11px;">Belum ada bonus yang diajukan. Gunakan tombol "Bonus Tim" di atas.</p>
          </div>
        `;
      } else {
        historyContainer.innerHTML = opData.bonuses.map(b => {
          const isPaid = b.status === 'paid';
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--border-light); font-size: 12px;">
              <div>
                <strong style="color: var(--ink);">${escapeHtml(b.admin_name)}</strong>
                <span style="color: var(--ink-secondary); display: block; font-size: 11px;">${escapeHtml(b.reason)} (${escapeHtml(b.period)})</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="text-align: right;">
                  <span style="font-weight: 700; color: ${isPaid ? 'var(--revenue-green)' : '#D97706'};">${formatRupiah(b.amount)}</span>
                  <span style="display: block; font-size: 10px; color: var(--ink-secondary);">${isPaid ? 'Sudah Dibayar' : 'Menunggu Konfirmasi'}</span>
                </div>
                ${!isPaid ? `
                  <button class="btn-primary btn-confirm-pay-bonus" data-id="${b.id}" style="height: 28px; padding: 0 8px; font-size: 11px; font-weight: 700;">
                    Bayar
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('');

        // Attach event listeners for payment button
        historyContainer.querySelectorAll('.btn-confirm-pay-bonus').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const bonusId = e.currentTarget.getAttribute('data-id');
            const targetBonus = opData.bonuses.find(b => b.id === bonusId);
            if (!targetBonus) return;

            showConfirm(
              'Konfirmasi Pembayaran Bonus',
              `Cairkan bonus ${formatRupiah(targetBonus.amount)} untuk ${targetBonus.admin_name}? Saldo dana operasional akan terpotong secara nyata.`,
              async () => {
                await payTeamBonus(targetBonus);
              }
            );
          });
        });
      }
    }
  }

  function renderExpensesTable() {
    const tbody = document.getElementById('op-expenses-tbody');
    if (!tbody) return;

    let filtered = [...opData.expenses];

    if (opData.filterCategory !== 'all') {
      filtered = filtered.filter(e => e.category_id === opData.filterCategory);
    }

    if (opData.searchQuery.trim()) {
      const q = opData.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(e => 
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.recipient && e.recipient.toLowerCase().includes(q)) ||
        (e.expense_code && e.expense_code.toLowerCase().includes(q)) ||
        (e.admin_name && e.admin_name.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 24px; color: var(--ink-secondary);">
            ${opData.expenses.length === 0 
              ? 'Belum ada transaksi pengeluaran. Anggaran awal Rp35.196 masih utuh.' 
              : 'Tidak ditemukan transaksi yang cocok dengan filter pencarian.'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(e => {
      const cat = opData.budgets.find(b => b.id === e.category_id) || { name: e.category_id, color: '#3158A8' };
      const dateStr = e.created_at ? new Date(e.created_at).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '-';

      return `
        <tr style="border-bottom: 1px solid var(--border-light);">
          <td style="padding: 10px 8px; font-weight: 700; font-family: monospace; color: var(--accent-blue);">${escapeHtml(e.expense_code || '-')}</td>
          <td style="padding: 10px 8px; white-space: nowrap; color: var(--ink-secondary); font-size: 12px;">${dateStr}</td>
          <td style="padding: 10px 8px;">
            <span class="status-badge" style="background: ${cat.color}15; color: ${cat.color}; font-weight: 700; font-size: 11px;">
              ${escapeHtml(cat.name)}
            </span>
          </td>
          <td style="padding: 10px 8px;">
            <div style="font-weight: 600; color: var(--ink);">${escapeHtml(e.description)}</div>
            ${e.recipient ? `<span style="font-size: 11px; color: var(--ink-secondary);">Penerima: ${escapeHtml(e.recipient)}</span>` : ''}
          </td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 800; color: var(--balance-red); font-variant-numeric: tabular-nums;">
            ${formatRupiah(e.amount)}
          </td>
          <td style="padding: 10px 8px; color: var(--ink-secondary); font-size: 12px;">
            ${escapeHtml(e.admin_name || 'Admin')}
          </td>
        </tr>
      `;
    }).join('');
  }

  async function addExpense(categoryId, amount, description, recipient, notes) {
    if (amount <= 0) {
      alert('Nominal pengeluaran harus lebih besar dari Rp0.');
      return false;
    }

    if (amount > opData.summary.current_balance) {
      alert(`Saldo tidak mencukupi. Saldo tersedia saat ini: ${formatRupiah(opData.summary.current_balance)}.`);
      return false;
    }

    try {
      const supabase = await getSupabase();
      const currentAdmin = state.admin || {};
      const adminName = currentAdmin.name || currentAdmin.email?.split('@')[0] || 'Kayla';
      const adminId = currentAdmin.id || null;

      const { data, error } = await supabase.rpc('record_operational_expense', {
        p_category_id: categoryId,
        p_amount: amount,
        p_description: description,
        p_recipient: recipient || null,
        p_notes: notes || null,
        p_admin_id: adminId,
        p_admin_name: adminName
      });

      if (error) {
        alert('Gagal mencatat pengeluaran: ' + error.message);
        return false;
      }

      await fetchOperationalData();
      renderAll();
      closeModal('modal-add-expense');
      alert(`Pengeluaran sebesar ${formatRupiah(amount)} berhasil dicatat.`);
      return true;
    } catch (err) {
      alert('Terjadi kesalahan: ' + err.message);
      return false;
    }
  }

  async function addPromoSubsidy(promoName, amount, description) {
    if (amount <= 0) {
      alert('Nominal subsidi harus lebih besar dari Rp0.');
      return false;
    }

    if (amount > opData.summary.current_balance) {
      alert(`Saldo tidak mencukupi. Saldo tersedia saat ini: ${formatRupiah(opData.summary.current_balance)}.`);
      return false;
    }

    try {
      const supabase = await getSupabase();
      const currentAdmin = state.admin || {};
      const adminName = currentAdmin.name || currentAdmin.email?.split('@')[0] || 'Kayla';

      const { data, error } = await supabase.rpc('record_promo_subsidy', {
        p_promo_name: promoName,
        p_subsidy_amount: amount,
        p_description: description,
        p_admin_name: adminName
      });

      if (error) {
        alert('Gagal mencatat subsidi promo: ' + error.message);
        return false;
      }

      await fetchOperationalData();
      renderAll();
      closeModal('modal-add-promo-subsidy');
      alert(`Subsidi promo sebesar ${formatRupiah(amount)} berhasil dicatat.`);
      return true;
    } catch (err) {
      alert('Terjadi kesalahan: ' + err.message);
      return false;
    }
  }

  async function createTeamBonus(adminId, amount, reason, period) {
    if (amount <= 0) {
      alert('Nominal bonus harus lebih besar dari Rp0.');
      return false;
    }

    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.rpc('create_team_bonus', {
        p_admin_id: adminId,
        p_amount: amount,
        p_reason: reason,
        p_period: period
      });

      if (error) {
        alert('Gagal mengajukan bonus tim: ' + error.message);
        return false;
      }

      await fetchOperationalData();
      renderAll();
      closeModal('modal-add-team-bonus');
      alert(`Pengajuan bonus tim sebesar ${formatRupiah(amount)} berhasil dibuat dan menunggu konfirmasi.`);
      return true;
    } catch (err) {
      alert('Terjadi kesalahan: ' + err.message);
      return false;
    }
  }

  async function payTeamBonus(bonus) {
    try {
      const supabase = await getSupabase();
      const currentAdmin = state.admin || {};
      const adminName = currentAdmin.name || currentAdmin.email?.split('@')[0] || 'Kayla';

      const { data, error } = await supabase.rpc('confirm_and_pay_team_bonus', {
        p_bonus_id: bonus.id,
        p_confirmed_by: adminName
      });

      if (error) {
        alert('Gagal membayar bonus: ' + error.message);
        return false;
      }

      await fetchOperationalData();
      renderAll();
      alert(`Bonus sebesar ${formatRupiah(bonus.amount)} untuk ${bonus.admin_name} berhasil dicairkan.`);
      return true;
    } catch (err) {
      alert('Terjadi kesalahan: ' + err.message);
      return false;
    }
  }

  function setupEventListeners() {
    // Buttons to open modals
    const btnAddExp = document.getElementById('btn-add-expense');
    if (btnAddExp) {
      btnAddExp.addEventListener('click', () => {
        const catSelect = document.getElementById('expense-category-input');
        if (catSelect) {
          catSelect.innerHTML = opData.budgets.map(b => `
            <option value="${b.id}">${b.name} (Sisa: ${formatRupiah(b.remaining_amount)})</option>
          `).join('');
        }
        const availInfo = document.getElementById('expense-available-info');
        if (availInfo) {
          availInfo.textContent = `Saldo kas operasional tersedia: ${formatRupiah(opData.summary.current_balance)}`;
        }
        openModal('modal-add-expense');
      });
    }

    const btnAddPromo = document.getElementById('btn-add-promo-subsidy');
    if (btnAddPromo) {
      btnAddPromo.addEventListener('click', () => {
        const promoCat = opData.budgets.find(b => b.id === 'promo') || { remaining_amount: 5000 };
        const promoInfo = document.getElementById('promo-subsidy-available-info');
        if (promoInfo) {
          promoInfo.textContent = `Sisa anggaran promo: ${formatRupiah(promoCat.remaining_amount)} · Saldo kas: ${formatRupiah(opData.summary.current_balance)}`;
        }
        openModal('modal-add-promo-subsidy');
      });
    }

    const btnAddBonus = document.getElementById('btn-add-team-bonus');
    if (btnAddBonus) {
      btnAddBonus.addEventListener('click', () => {
        const adminSelect = document.getElementById('bonus-admin-input');
        if (adminSelect && state && state.profiles) {
          const admins = state.profiles.filter(p => p.role === 'admin');
          adminSelect.innerHTML = admins.map(a => {
            const nickname = profileNickname(a);
            const count = state.orders ? state.orders.filter(o => o.assigned_to === a.id && o.status === 'completed').length : 0;
            return `<option value="${a.id}">Admin ${nickname} (${count} pesanan selesai)</option>`;
          }).join('');
        }
        const bonusCat = opData.budgets.find(b => b.id === 'bonus') || { remaining_amount: 3000 };
        const bonusInfo = document.getElementById('bonus-available-info');
        if (bonusInfo) {
          bonusInfo.textContent = `Sisa anggaran bonus: ${formatRupiah(bonusCat.remaining_amount)} · Saldo kas: ${formatRupiah(opData.summary.current_balance)}`;
        }
        openModal('modal-add-team-bonus');
      });
    }

    // Modal Form Submissions
    const formExpense = document.getElementById('form-add-expense');
    if (formExpense) {
      formExpense.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cat = document.getElementById('expense-category-input').value;
        const amt = parseFloat(document.getElementById('expense-amount-input').value) || 0;
        const desc = document.getElementById('expense-desc-input').value.trim();
        const rec = document.getElementById('expense-recipient-input').value.trim();
        const notes = document.getElementById('expense-notes-input').value.trim();

        if (!desc) {
          alert('Keterangan pengeluaran wajib diisi.');
          return;
        }

        await addExpense(cat, amt, desc, rec, notes);
      });
    }

    const formPromo = document.getElementById('form-add-promo-subsidy');
    if (formPromo) {
      formPromo.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('promo-name-input').value.trim();
        const amt = parseFloat(document.getElementById('promo-amount-input').value) || 0;
        const desc = document.getElementById('promo-desc-input').value.trim();

        if (!name || !desc) {
          alert('Nama promo dan keterangan wajib diisi.');
          return;
        }

        await addPromoSubsidy(name, amt, desc);
      });
    }

    const formBonus = document.getElementById('form-add-team-bonus');
    if (formBonus) {
      formBonus.addEventListener('submit', async (e) => {
        e.preventDefault();
        const adminId = document.getElementById('bonus-admin-input').value;
        const amt = parseFloat(document.getElementById('bonus-amount-input').value) || 0;
        const reason = document.getElementById('bonus-reason-input').value.trim();
        const period = document.getElementById('bonus-period-input').value.trim();

        if (!adminId || !reason || !period) {
          alert('Admin penerima, alasan, dan periode wajib diisi.');
          return;
        }

        await createTeamBonus(adminId, amt, reason, period);
      });
    }

    // Table Filters
    const filterCat = document.getElementById('op-filter-category');
    if (filterCat) {
      filterCat.addEventListener('change', (e) => {
        opData.filterCategory = e.target.value;
        renderExpensesTable();
      });
    }

    const filterSearch = document.getElementById('op-filter-search');
    if (filterSearch) {
      filterSearch.addEventListener('input', (e) => {
        opData.searchQuery = e.target.value;
        renderExpensesTable();
      });
    }
  }

  function renderAll() {
    renderKPI();
    renderDonutChart();
    renderComparisonBars();
    renderPromoSubsystem();
    renderBonusSubsystem();
    renderExpensesTable();
  }

  // Export to window
  window.OperationalFund = {
    init: async function () {
      setupEventListeners();
      await fetchOperationalData();
      renderAll();
    },
    render: async function () {
      await fetchOperationalData();
      renderAll();
    },
    getData: function () {
      return opData;
    }
  };

  // Helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.OperationalFund.init());
  } else {
    setTimeout(() => window.OperationalFund.init(), 100);
  }

})();

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
    inflows: [],
    summary: {
      initial_fund: 35196,
      total_inflow: 0,
      total_fund: 35196,
      total_allocated: 35196,
      total_spent: 0,
      current_balance: 35196,
      domain_obligation: 22000,
      domain_status: 'unpaid',
      domain_due_date: '2027-09-12'
    },
    activeHistoryTab: 'expenses',
    filterCategory: 'all',
    searchQuery: '',
    loading: false
  };

  const DEFAULT_BUDGETS = [
    { id: 'domain', name: 'Perpanjangan domain', allocated_amount: 22000, percentage: null, is_fixed_obligation: true, due_date: '2027-09-12', payment_status: 'unpaid', color: '#3158A8', icon: 'globe' },
    { id: 'promo', name: 'Promo dan diskon pelanggan', allocated_amount: 4648, percentage: 35.22, is_fixed_obligation: false, color: '#10B981', icon: 'tag' },
    { id: 'bonus', name: 'Bonus tim paling aktif', allocated_amount: 2789, percentage: 21.13, is_fixed_obligation: false, color: '#F59E0B', icon: 'award' },
    { id: 'ai_tools', name: 'AI dan tools produktivitas', allocated_amount: 3718, percentage: 28.18, is_fixed_obligation: false, color: '#8B5CF6', icon: 'cpu' },
    { id: 'emergency', name: 'Dana darurat', allocated_amount: 2041, percentage: 15.47, is_fixed_obligation: false, color: '#EC4899', icon: 'shield-alert' }
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
        { data: inflowsData, error: errInflows },
        { data: settingsData },
        { data: summaryData }
      ] = await Promise.all([
        supabase.from('operational_budgets_status').select('*'),
        supabase.from('operational_expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_team_bonuses').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_promo_subsidies').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_inflows').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_settings').select('*'),
        supabase.from('operational_fund_summary').select('*').single()
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
          percent_spent: parseFloat(b.percent_spent) || 0,
          percentage: b.percentage ? parseFloat(b.percentage) : null,
          is_fixed_obligation: Boolean(b.is_fixed_obligation),
          due_date: b.due_date || '2027-09-12',
          payment_status: b.payment_status || 'unpaid'
        }));
      }

      opData.expenses = expensesData || [];
      opData.bonuses = bonusesData || [];
      opData.promos = promosData || [];
      opData.inflows = inflowsData || [];

      // Calculate Summary
      let initialFund = 35196;
      if (settingsData && settingsData.length > 0) {
        const found = settingsData.find(s => s.key === 'initial_fund');
        if (found) initialFund = parseFloat(found.value) || 35196;
      }

      const activeInflow = opData.inflows
        .filter(inf => inf.status === 'completed' && !inf.is_refunded)
        .reduce((sum, inf) => sum + (parseFloat(inf.allocation_amount) || 0), 0);

      const totalFund = initialFund + activeInflow;
      const totalSpent = opData.expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const currentBalance = Math.max(0, totalFund - totalSpent);

      const domainBudget = opData.budgets.find(b => b.id === 'domain') || {
        allocated_amount: 22000,
        payment_status: 'unpaid',
        due_date: '2027-09-12'
      };

      let domainStatus = domainBudget.payment_status || 'unpaid';
      const dueDate = new Date(domainBudget.due_date || '2027-09-12');
      if (domainStatus !== 'paid' && new Date() > dueDate) {
        domainStatus = 'overdue';
      }

      opData.summary = {
        initial_fund: initialFund,
        total_inflow: activeInflow,
        total_fund: totalFund,
        total_allocated: opData.budgets.reduce((sum, b) => sum + b.allocated_amount, 0),
        total_spent: totalSpent,
        current_balance: currentBalance,
        domain_obligation: domainBudget.allocated_amount || 22000,
        domain_status: domainStatus,
        domain_due_date: domainBudget.due_date || '2027-09-12'
      };

    } catch (err) {
      console.warn('Gagal memuat data dana operasional:', err);
      opData.budgets = DEFAULT_BUDGETS.map(b => ({
        ...b,
        spent_amount: 0,
        remaining_amount: b.allocated_amount,
        percent_spent: 0
      }));
      opData.summary = {
        initial_fund: 35196,
        total_inflow: 0,
        total_fund: 35196,
        total_allocated: 35196,
        total_spent: 0,
        current_balance: 35196,
        domain_obligation: 22000,
        domain_status: 'unpaid',
        domain_due_date: '2027-09-12'
      };
    } finally {
      opData.loading = false;
    }
  }

  function renderDomainCard() {
    const s = opData.summary;
    const badge = document.getElementById('op-domain-status-badge');
    const dueDateEl = document.getElementById('op-domain-due-date');
    const noteEl = document.getElementById('op-domain-payment-note');
    const btnPay = document.getElementById('btn-pay-domain');

    if (dueDateEl) dueDateEl.textContent = '12 September 2027';

    if (badge) {
      if (s.domain_status === 'paid') {
        badge.textContent = 'Sudah dibayar';
        badge.style.background = '#E6F8F0';
        badge.style.color = '#10B981';
      } else if (s.domain_status === 'overdue') {
        badge.textContent = 'Jatuh tempo';
        badge.style.background = '#FEE2E2';
        badge.style.color = '#EF4444';
      } else {
        badge.textContent = 'Belum dibayar';
        badge.style.background = '#FFF2DC';
        badge.style.color = '#895000';
      }
    }

    if (noteEl) {
      if (s.domain_status === 'paid') {
        noteEl.textContent = 'Terbayar Rp22.000 (Saldo terpotong)';
        noteEl.style.color = '#10B981';
      } else {
        noteEl.textContent = 'Saldo belum terpotong (Kewajiban Rp22.000)';
        noteEl.style.color = 'var(--ink-secondary)';
      }
    }

    if (btnPay) {
      if (s.domain_status === 'paid') {
        btnPay.textContent = 'Lunas';
        btnPay.disabled = true;
        btnPay.style.opacity = '0.6';
        btnPay.style.cursor = 'not-allowed';
      } else {
        btnPay.textContent = 'Bayar Domain (Rp22.000)';
        btnPay.disabled = false;
        btnPay.style.opacity = '1';
        btnPay.style.cursor = 'pointer';
      }
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
    const pillFund = document.getElementById('op-pill-fund');
    const footFund = document.getElementById('op-foot-fund');

    if (valBalance) valBalance.textContent = s.current_balance.toLocaleString('id-ID');
    if (valAllocated) valAllocated.textContent = s.total_fund.toLocaleString('id-ID');
    if (valSpent) valSpent.textContent = s.total_spent.toLocaleString('id-ID');
    if (valRemaining) valRemaining.textContent = s.current_balance.toLocaleString('id-ID');

    if (pillFund) {
      pillFund.textContent = s.total_inflow > 0 ? `+${formatRupiah(s.total_inflow)} Realtime` : 'Awal Rp35.196';
      pillFund.className = `ac-12__pill ${s.total_inflow > 0 ? 'ac-12__pill--up' : 'ac-12__pill--flat'}`;
    }

    if (footFund) {
      footFund.textContent = s.total_inflow > 0 
        ? `Rp35.196 awal + ${formatRupiah(s.total_inflow)} dari 10% pesanan` 
        : 'Total alokasi dana operasional JOKI.IN';
    }

    if (pillSpent) {
      pillSpent.textContent = s.total_spent > 0 ? `${formatRupiah(s.total_spent)}` : 'Realisasi: Rp0';
      pillSpent.className = `ac-12__pill ${s.total_spent > 0 ? 'ac-12__pill--down' : 'ac-12__pill--flat'}`;
    }

    if (pillRemaining) {
      const pct = s.total_fund > 0 ? Math.round((s.current_balance / s.total_fund) * 100) : 100;
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

    // STRICT REQUIREMENT: Domain is NOT included in percentage donut chart.
    // Donut chart only visualizes the 4 remaining categories: Promo, Bonus, AI, Emergency.
    const variableBudgets = opData.budgets.filter(b => !b.is_fixed_obligation && b.id !== 'domain');
    const totalVar = variableBudgets.reduce((sum, b) => sum + b.allocated_amount, 0) || 1;

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
    svg.setAttribute('aria-label', `Grafik Donut Alokasi Sisa Dana. Total ${formatRupiah(totalVar)}`);

    let currentAngle = -90; // Start at 12 o'clock

    variableBudgets.forEach((cat) => {
      const sliceAngle = (cat.allocated_amount / totalVar) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const pct = cat.percentage ? cat.percentage.toFixed(2) : ((cat.allocated_amount / totalVar) * 100).toFixed(2);

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
        updateDonutCenterText(cat.name, formatRupiah(cat.allocated_amount), `${pct}%`);
      });

      path.addEventListener('mouseleave', () => {
        path.setAttribute('opacity', '1');
        updateDonutCenterText('Sisa Dana', formatRupiah(totalVar), '100% (4 Pos)');
      });

      svg.appendChild(path);
    });

    // Donut Center Text
    const textGroup = document.createElementNS(svgNS, 'g');
    textGroup.setAttribute('id', 'op-donut-center-group');

    const centerLabel = document.createElementNS(svgNS, 'text');
    centerLabel.setAttribute('x', cx);
    centerLabel.setAttribute('y', cy - 14);
    centerLabel.setAttribute('text-anchor', 'middle');
    centerLabel.setAttribute('font-size', '11');
    centerLabel.setAttribute('font-weight', '600');
    centerLabel.setAttribute('fill', 'var(--ink-secondary)');
    centerLabel.setAttribute('id', 'op-donut-center-label');
    centerLabel.textContent = 'Sisa Dana';

    const centerVal = document.createElementNS(svgNS, 'text');
    centerVal.setAttribute('x', cx);
    centerVal.setAttribute('y', cy + 8);
    centerVal.setAttribute('text-anchor', 'middle');
    centerVal.setAttribute('font-size', '15');
    centerVal.setAttribute('font-weight', '800');
    centerVal.setAttribute('fill', 'var(--ink)');
    centerVal.setAttribute('id', 'op-donut-center-val');
    centerVal.textContent = formatRupiah(totalVar);

    const centerSub = document.createElementNS(svgNS, 'text');
    centerSub.setAttribute('x', cx);
    centerSub.setAttribute('y', cy + 24);
    centerSub.setAttribute('text-anchor', 'middle');
    centerSub.setAttribute('font-size', '11');
    centerSub.setAttribute('font-weight', '600');
    centerSub.setAttribute('fill', '#10B981');
    centerSub.setAttribute('id', 'op-donut-center-sub');
    centerSub.textContent = '100% (4 Pos)';

    textGroup.appendChild(centerLabel);
    textGroup.appendChild(centerVal);
    textGroup.appendChild(centerSub);
    svg.appendChild(textGroup);

    wrap.appendChild(svg);

    // Legend for the 4 variable categories
    variableBudgets.forEach(cat => {
      const pct = cat.percentage ? cat.percentage.toFixed(2) : ((cat.allocated_amount / totalVar) * 100).toFixed(2);
      const item = document.createElement('div');
      item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 3px 0;';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: ${cat.color}; flex-shrink: 0;"></span>
          <span style="color: var(--ink); font-weight: 600;">${cat.name}</span>
        </div>
        <div style="text-align: right; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums;">
          ${formatRupiah(cat.allocated_amount)} <span style="font-size: 11px; color: var(--ink-secondary); font-weight: 500;">(${pct}%)</span>
        </div>
      `;
      legendEl.appendChild(item);
    });
  }

  function updateDonutCenterText(label, value, sub) {
    const elLabel = document.getElementById('op-donut-center-label');
    const elVal = document.getElementById('op-donut-center-val');
    const elSub = document.getElementById('op-donut-center-sub');
    if (elLabel) elLabel.textContent = label;
    if (elVal) elVal.textContent = value;
    if (elSub) elSub.textContent = sub;
  }

  function renderComparisonBars() {
    const container = document.getElementById('op-bars-container');
    const summaryLabel = document.getElementById('op-realization-summary');
    if (!container) return;

    container.innerHTML = '';

    const totalSpent = opData.summary.total_spent;
    const totalAllocated = opData.summary.total_allocated || 1;
    const overallPct = ((totalSpent / totalAllocated) * 100).toFixed(1);

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
            ${cat.name} ${cat.is_fixed_obligation ? '<span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #EBF1FF; color: var(--accent-blue); font-weight: 700;">Nominal Tetap</span>' : ''}
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
    const promoCat = opData.budgets.find(b => b.id === 'promo') || { allocated_amount: 4648, spent_amount: 0 };
    const spent = promoCat.spent_amount || 0;
    const remaining = Math.max(0, promoCat.allocated_amount - spent);

    const elBudgetBadge = document.getElementById('op-promo-budget-badge');
    const elSpent = document.getElementById('op-promo-spent');
    const elRem = document.getElementById('op-promo-remaining');
    const historyContainer = document.getElementById('op-promo-history');

    if (elBudgetBadge) elBudgetBadge.textContent = `Anggaran: ${formatRupiah(promoCat.allocated_amount)}`;
    if (elSpent) elSpent.textContent = formatRupiah(spent);
    if (elRem) elRem.textContent = formatRupiah(remaining);

    if (historyContainer) {
      if (opData.promos.length === 0) {
        historyContainer.innerHTML = `<p class="chart-caption" style="text-align: center; padding: 16px 0;">Belum ada subsidi promo yang dicatat. Anggaran ${formatRupiah(promoCat.allocated_amount)} masih utuh.</p>`;
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
    const bonusCat = opData.budgets.find(b => b.id === 'bonus') || { allocated_amount: 2789, spent_amount: 0 };
    const spent = bonusCat.spent_amount || 0;
    const remaining = Math.max(0, bonusCat.allocated_amount - spent);

    const elBudgetBadge = document.getElementById('op-bonus-budget-badge');
    const elSpent = document.getElementById('op-bonus-spent');
    const elRem = document.getElementById('op-bonus-remaining');
    const historyContainer = document.getElementById('op-bonus-history');

    if (elBudgetBadge) elBudgetBadge.textContent = `Anggaran: ${formatRupiah(bonusCat.allocated_amount)}`;
    if (elSpent) elSpent.textContent = formatRupiah(spent);
    if (elRem) elRem.textContent = formatRupiah(remaining);

    if (historyContainer) {
      if (opData.bonuses.length === 0) {
        let adminInfo = '';
        if (typeof state !== 'undefined' && state && state.profiles) {
          const admins = state.profiles.filter(p => p.role === 'admin');
          adminInfo = admins.map(a => {
            const nickname = typeof profileNickname === 'function' ? profileNickname(a) : (a.name || a.email);
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

  function renderHistoryTables() {
    const isExpenses = opData.activeHistoryTab === 'expenses';
    const wrapExpenses = document.getElementById('op-table-expenses-wrap');
    const wrapInflows = document.getElementById('op-table-inflows-wrap');
    const filterControls = document.getElementById('op-expenses-filter-controls');
    const captionEl = document.getElementById('op-history-caption');
    const btnExp = document.getElementById('op-tab-btn-expenses');
    const btnInf = document.getElementById('op-tab-btn-inflows');

    if (btnExp) btnExp.className = `btn-outline ${isExpenses ? 'active' : ''}`;
    if (btnInf) btnInf.className = `btn-outline ${!isExpenses ? 'active' : ''}`;

    if (wrapExpenses) wrapExpenses.style.display = isExpenses ? 'block' : 'none';
    if (wrapInflows) wrapInflows.style.display = !isExpenses ? 'block' : 'none';
    if (filterControls) filterControls.style.display = isExpenses ? 'flex' : 'none';

    if (captionEl) {
      captionEl.textContent = isExpenses 
        ? 'Catatan audit seluruh pengeluaran kas operasional JOKI.IN.' 
        : 'Catatan audit pemasukan 10% dari transaksi pesanan yang berhasil dibayar secara realtime.';
    }

    if (isExpenses) {
      renderExpensesTable();
    } else {
      renderInflowsTable();
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
              ? 'Belum ada transaksi pengeluaran. Saldo dana operasional masih utuh.' 
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

  function renderInflowsTable() {
    const tbody = document.getElementById('op-inflows-tbody');
    if (!tbody) return;

    if (opData.inflows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 24px; color: var(--ink-secondary);">
            Belum ada pemasukan 10% dari pesanan baru. Alokasi awal Rp35.196 aktif.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = opData.inflows.map(inf => {
      const isRef = inf.is_refunded || inf.status === 'refunded';
      const dateStr = (inf.order_created_at || inf.created_at) ? new Date(inf.order_created_at || inf.created_at).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '-';

      return `
        <tr style="border-bottom: 1px solid var(--border-light); ${isRef ? 'opacity: 0.65; background: #FFF8F8;' : ''}">
          <td style="padding: 10px 8px; font-weight: 700; font-family: monospace; color: var(--accent-blue);">
            ${escapeHtml(inf.order_code || ('ORD-' + inf.order_id))}
          </td>
          <td style="padding: 10px 8px; white-space: nowrap; color: var(--ink-secondary); font-size: 12px;">
            ${dateStr}
          </td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums;">
            ${formatRupiah(inf.gross_amount)}
          </td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 800; color: ${isRef ? 'var(--ink-secondary)' : '#10B981'}; font-variant-numeric: tabular-nums;">
            ${isRef ? `<s>+${formatRupiah(inf.allocation_amount)}</s>` : `+${formatRupiah(inf.allocation_amount)}`}
          </td>
          <td style="padding: 10px 8px; text-align: center;">
            <span class="status-badge" style="background: ${isRef ? '#FEE2E2' : '#E6F8F0'}; color: ${isRef ? '#EF4444' : '#10B981'}; font-weight: 700; font-size: 11px;">
              ${isRef ? 'Refund / Dikoreksi' : 'Lunas / Masuk'}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function payDomainObligation() {
    if (opData.summary.current_balance < 22000) {
      alert(`Saldo kas operasional tidak mencukupi untuk membayar kewajiban domain Rp22.000. Saldo saat ini: ${formatRupiah(opData.summary.current_balance)}.`);
      return false;
    }

    try {
      const supabase = await getSupabase();
      const currentAdmin = (typeof state !== 'undefined' && state.admin) ? state.admin : {};
      const adminName = currentAdmin.name || currentAdmin.email?.split('@')[0] || 'Kayla';

      const { data, error } = await supabase.rpc('pay_domain_obligation', {
        p_admin_name: adminName,
        p_notes: 'Pembayaran perpanjangan domain jokiin.my.id (Jatuh tempo 12 September 2027)'
      });

      if (error) {
        alert('Gagal membayar kewajiban domain: ' + error.message);
        return false;
      }

      await fetchOperationalData();
      renderAll();
      alert('Kewajiban perpanjangan domain Rp22.000 berhasil dibayar dan dicatat ke pengeluaran.');
      return true;
    } catch (err) {
      alert('Terjadi kesalahan: ' + err.message);
      return false;
    }
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
      const currentAdmin = (typeof state !== 'undefined' && state.admin) ? state.admin : {};
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
      const currentAdmin = (typeof state !== 'undefined' && state.admin) ? state.admin : {};
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

    if (amount > opData.summary.current_balance) {
      alert(`Saldo tidak mencukupi. Saldo tersedia saat ini: ${formatRupiah(opData.summary.current_balance)}.`);
      return false;
    }

    try {
      const supabase = await getSupabase();
      const currentAdmin = (typeof state !== 'undefined' && state.admin) ? state.admin : {};
      const adminName = currentAdmin.name || currentAdmin.email?.split('@')[0] || 'Kayla';

      const { data, error } = await supabase.rpc('create_team_bonus', {
        p_admin_id: adminId,
        p_amount: amount,
        p_reason: reason,
        p_period: period,
        p_created_by_name: adminName
      });

      if (error) {
        alert('Gagal mengajukan bonus tim: ' + error.message);
        return false;
      }

      await fetchOperationalData();
      renderAll();
      closeModal('modal-add-team-bonus');
      alert(`Pengajuan bonus ${formatRupiah(amount)} berhasil dibuat. Menunggu konfirmasi pembayaran.`);
      return true;
    } catch (err) {
      alert('Terjadi kesalahan: ' + err.message);
      return false;
    }
  }

  async function payTeamBonus(targetBonus) {
    if (!targetBonus) return;

    if (targetBonus.amount > opData.summary.current_balance) {
      alert(`Saldo kas operasional tidak mencukupi. Saldo saat ini: ${formatRupiah(opData.summary.current_balance)}.`);
      return;
    }

    try {
      const supabase = await getSupabase();
      const currentAdmin = (typeof state !== 'undefined' && state.admin) ? state.admin : {};
      const adminName = currentAdmin.name || currentAdmin.email?.split('@')[0] || 'Kayla';

      const { data, error } = await supabase.rpc('confirm_and_pay_team_bonus', {
        p_bonus_id: targetBonus.id,
        p_confirmed_by_name: adminName
      });

      if (error) {
        alert('Gagal memproses pembayaran bonus: ' + error.message);
        return;
      }

      await fetchOperationalData();
      renderAll();
      alert(`Bonus sebesar ${formatRupiah(targetBonus.amount)} untuk ${targetBonus.admin_name} berhasil dicairkan.`);
    } catch (err) {
      alert('Terjadi kesalahan: ' + err.message);
    }
  }

  function setupEventListeners() {
    // Action Buttons
    const btnExpense = document.getElementById('btn-add-expense');
    if (btnExpense) {
      btnExpense.addEventListener('click', () => openModal('modal-add-expense'));
    }

    const btnPromo = document.getElementById('btn-add-promo-subsidy');
    if (btnPromo) {
      btnPromo.addEventListener('click', () => openModal('modal-add-promo-subsidy'));
    }

    const btnBonus = document.getElementById('btn-add-team-bonus');
    if (btnBonus) {
      btnBonus.addEventListener('click', () => {
        populateBonusAdminSelect();
        openModal('modal-add-team-bonus');
      });
    }

    // Pay Domain Button
    const btnDomain = document.getElementById('btn-pay-domain');
    if (btnDomain) {
      btnDomain.addEventListener('click', () => {
        if (opData.summary.domain_status === 'paid') return;
        showConfirm(
          'Konfirmasi Pembayaran Domain',
          'Apakah Anda yakin ingin mencatat pembayaran perpanjangan domain sebesar Rp22.000? Saldo kas operasional akan terpotong secara nyata.',
          async () => {
            await payDomainObligation();
          }
        );
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

    // History Tabs
    const btnTabExpenses = document.getElementById('op-tab-btn-expenses');
    if (btnTabExpenses) {
      btnTabExpenses.addEventListener('click', () => {
        opData.activeHistoryTab = 'expenses';
        renderHistoryTables();
      });
    }

    const btnTabInflows = document.getElementById('op-tab-btn-inflows');
    if (btnTabInflows) {
      btnTabInflows.addEventListener('click', () => {
        opData.activeHistoryTab = 'inflows';
        renderHistoryTables();
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

  function populateBonusAdminSelect() {
    const select = document.getElementById('bonus-admin-input');
    if (!select) return;

    if (typeof state !== 'undefined' && state && state.profiles) {
      const admins = state.profiles.filter(p => p.role === 'admin');
      select.innerHTML = '<option value="">Pilih Admin Penerima</option>' + admins.map(a => {
        const nickname = typeof profileNickname === 'function' ? profileNickname(a) : (a.name || a.email);
        return `<option value="${a.id}">Admin ${nickname}</option>`;
      }).join('');
    }
  }

  let realtimeChannel = null;
  let realtimeDebounceTimer = null;

  function updateRealtimeBadge(status) {
    const badge = document.getElementById('op-realtime-badge');
    const dot = document.getElementById('op-realtime-dot');
    const text = document.getElementById('op-realtime-text');
    if (!badge || !text) return;

    if (status === 'SUBSCRIBED') {
      badge.style.background = 'rgba(16, 185, 129, 0.12)';
      badge.style.color = '#10B981';
      if (dot) {
        dot.style.background = '#10B981';
        dot.className = 'op-pulse-dot';
      }
      text.textContent = 'Realtime Aktif';
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      badge.style.background = 'rgba(239, 68, 68, 0.12)';
      badge.style.color = '#EF4444';
      if (dot) {
        dot.style.background = '#EF4444';
        dot.className = '';
      }
      text.textContent = 'Menghubungkan Ulang...';
    } else {
      badge.style.background = 'rgba(245, 158, 11, 0.12)';
      badge.style.color = '#D97706';
      if (dot) {
        dot.style.background = '#F59E0B';
        dot.className = 'op-pulse-dot';
      }
      text.textContent = 'Menyambungkan...';
    }
  }

  function flashRealtimeBadge() {
    const badge = document.getElementById('op-realtime-badge');
    if (!badge) return;
    badge.classList.remove('op-realtime-flash');
    void badge.offsetWidth;
    badge.classList.add('op-realtime-flash');
  }

  async function setupRealtimeSubscription() {
    if (realtimeChannel) return;

    try {
      const supabase = await getSupabase();
      if (!supabase || typeof supabase.channel !== 'function') {
        console.warn('[OperationalFund Realtime] Supabase channel tidak tersedia.');
        return;
      }

      updateRealtimeBadge('CONNECTING');

      realtimeChannel = supabase.channel('operational-fund-live-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'operational_expenses' }, handleRealtimeChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'operational_team_bonuses' }, handleRealtimeChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'operational_promo_subsidies' }, handleRealtimeChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'operational_budgets' }, handleRealtimeChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'operational_settings' }, handleRealtimeChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'operational_inflows' }, handleRealtimeChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handleRealtimeChange)
        .subscribe((status, err) => {
          updateRealtimeBadge(status);
          if (status === 'SUBSCRIBED') {
            console.log('[OperationalFund Realtime] Siaran data realtime Supabase terhubung.');
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('[OperationalFund Realtime] Kesalahan channel Realtime:', err);
          }
        });
    } catch (err) {
      console.warn('[OperationalFund Realtime] Inisialisasi subscription gagal:', err);
    }
  }

  function handleRealtimeChange(payload) {
    console.log('[OperationalFund Realtime] Perubahan diterima dari tabel:', payload?.table, payload?.eventType);
    flashRealtimeBadge();

    if (realtimeDebounceTimer) clearTimeout(realtimeDebounceTimer);
    realtimeDebounceTimer = setTimeout(async () => {
      if (payload?.table === 'orders' || payload?.table === 'operational_inflows') {
        const loadFn = window.loadData || (typeof loadData === 'function' ? loadData : null);
        if (loadFn) {
          try {
            await loadFn();
          } catch (e) {
            console.warn('[OperationalFund] Gagal memperbarui loadData:', e);
          }
        }
      }
      await fetchOperationalData();
      renderAll();
    }, 150);
  }

  function renderAll() {
    renderKPI();
    renderDomainCard();
    renderDonutChart();
    renderComparisonBars();
    renderPromoSubsystem();
    renderBonusSubsystem();
    renderHistoryTables();
  }

  // Export to window
  window.OperationalFund = {
    init: async function () {
      setupEventListeners();
      await fetchOperationalData();
      renderAll();
      setupRealtimeSubscription();
    },
    render: async function () {
      await fetchOperationalData();
      renderAll();
      if (!realtimeChannel) {
        setupRealtimeSubscription();
      }
    },
    getData: function () {
      return opData;
    }
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.OperationalFund.init());
  } else {
    setTimeout(() => window.OperationalFund.init(), 100);
  }

})();

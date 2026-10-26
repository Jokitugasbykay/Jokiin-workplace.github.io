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
    resellerInventory: [],
    resellerTransactions: [],
    resellerSummary: {
      budget_allocated: 0,
      capital_spent: 0,
      capital_remaining: 0,
      stock_valuation: 0,
      total_units: 0,
      total_revenue: 0,
      total_cogs: 0,
      net_profit: 0,
      profit_margin: 0
    },
    activeResellerTab: 'inventory',
    mayarWithdrawals: [],
    mayarWithdrawalsError: 'Menunggu data pencairan.',
    bookkeepingRecords: [],
    allocationError: 'Diperlukan rekonsiliasi dasar dana operasional.',
    summaryLoaded: false,
    summary: {
      initial_fund: 0,
      total_inflow: 0,
      total_fund: 0,
      total_allocated: 0,
      total_spent: 0,
      current_balance: 0,
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
    { id: 'promo', name: 'Promo dan diskon pelanggan', allocated_amount: 0, percentage: 20.00, is_fixed_obligation: false, color: '#10B981', icon: 'tag' },
    { id: 'bonus', name: 'Bonus tim paling aktif', allocated_amount: 0, percentage: 20.00, is_fixed_obligation: false, color: '#F59E0B', icon: 'award' },
    { id: 'ai_tools', name: 'AI dan tools produktivitas', allocated_amount: 0, percentage: 20.00, is_fixed_obligation: false, color: '#8B5CF6', icon: 'cpu' },
    { id: 'emergency', name: 'Dana darurat', allocated_amount: 0, percentage: 20.00, is_fixed_obligation: false, color: '#EC4899', icon: 'shield-alert' },
    { id: 'reseller', name: 'Modal reseller produk digital', allocated_amount: 0, percentage: 20.00, is_fixed_obligation: false, color: '#0EA5E9', icon: 'shopping-bag' }
  ];

  // Pembagian rata ke 5 kategori masing-masing tepat 20%, total 100%.
  // Sisa pembulatan rupiah didistribusikan secara deterministik dari kategori pertama.
  function calculateDeterministicAllocation(totalAmount, count = 5) {
    const total = Math.max(0, Math.floor(Number(totalAmount) || 0));
    if (count <= 0 || total === 0) return Array(count).fill(0);
    const base = Math.floor(total / count);
    const remainder = total % count;
    return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
  }

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
        { data: resellerInvData, error: errResellerInv },
        { data: resellerTxData, error: errResellerTx },
        { data: settingsData },
        { data: summaryData, error: errSummary },
        { data: mayarWdData, error: errMayarWd },
        { data: bkData, error: errBookkeeping }
      ] = await Promise.all([
        supabase.from('operational_budgets_status').select('*'),
        supabase.from('operational_expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_team_bonuses').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_promo_subsidies').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_inflows').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_reseller_inventory').select('*').order('product_name', { ascending: true }),
        supabase.from('operational_reseller_transactions').select('*').order('created_at', { ascending: false }),
        supabase.from('operational_settings').select('*'),
        supabase.from('operational_fund_summary').select('*').single(),
        supabase.from('mayar_monthly_withdrawals').select('*').order('scheduled_date', { ascending: false }),
        supabase.from('business_bookkeeping_records').select('*').order('created_at', { ascending: true })
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
          percentage: b.is_fixed_obligation ? null : 20.00,
          is_fixed_obligation: Boolean(b.is_fixed_obligation),
          due_date: b.due_date || '2027-09-12',
          payment_status: b.payment_status || 'unpaid'
        }));
      }

      opData.expenses = expensesData || [];
      opData.bonuses = bonusesData || [];
      opData.promos = promosData || [];
      opData.inflows = inflowsData || [];
      opData.mayarWithdrawalsError = errMayarWd || !Array.isArray(mayarWdData)
        ? 'Data pencairan Mayar belum dapat diverifikasi. Segarkan data atau periksa akses database.' : '';
      opData.mayarWithdrawals = opData.mayarWithdrawalsError ? [] : mayarWdData;
      opData.bookkeepingRecords = bkData || [];
      opData.summaryLoaded = !errSummary && summaryData && !Array.isArray(summaryData)
        && ['initial_fund', 'current_balance', 'total_fund'].every(key => summaryData[key] != null && Number.isFinite(Number(summaryData[key])));
      opData.allocationError = !opData.summaryLoaded || errBudgets || errExpenses || errInflows || errBookkeeping
        ? 'Diperlukan rekonsiliasi: sumber data keuangan belum dapat diverifikasi.'
        : summaryData.allocation_ready !== true
          ? 'Diperlukan rekonsiliasi: saldo buku belum dikonfirmasi sebagai dana operasional tersedia.' : '';
      const projectedRemaining = opData.budgets.filter(b => !b.is_fixed_obligation).reduce((sum, b) => sum + b.remaining_amount, 0);
      if (!opData.allocationError && projectedRemaining !== Number(summaryData.allocation_basis)) {
        opData.allocationError = 'Data berubah saat dimuat. Segarkan Keuangan untuk mencocokkan seluruh alokasi.';
      }
      if (opData.allocationError) {
        opData.budgets.forEach(b => {
          if (!b.is_fixed_obligation) { b.allocated_amount = b.spent_amount; b.remaining_amount = 0; }
        });
      }

      // Process Reseller Subsystem Data
      opData.resellerInventory = (resellerInvData || []).map(item => ({
        ...item,
        stock_qty: parseInt(item.stock_qty, 10) || 0,
        unit_cost: parseFloat(item.unit_cost) || 0,
        default_selling_price: parseFloat(item.default_selling_price) || 0
      }));

      opData.resellerTransactions = (resellerTxData || []).map(tx => ({
        ...tx,
        qty: parseInt(tx.qty, 10) || 0,
        unit_cost: parseFloat(tx.unit_cost) || 0,
        selling_price: parseFloat(tx.selling_price) || 0,
        total_cost: parseFloat(tx.total_cost) || 0,
        total_revenue: parseFloat(tx.total_revenue) || 0,
        net_profit: parseFloat(tx.net_profit) || 0,
        payment_fee: parseFloat(tx.payment_fee) || 0
      }));

      const resellerBudget = opData.budgets.find(b => b.id === 'reseller') || {
        allocated_amount: 0,
        spent_amount: 0,
        remaining_amount: 0
      };

      const stockValuation = opData.resellerInventory.reduce((sum, item) => sum + (item.stock_qty * item.unit_cost), 0);
      const totalUnits = opData.resellerInventory.reduce((sum, item) => sum + item.stock_qty, 0);
      const salesTx = opData.resellerTransactions.filter(t => t.type === 'sale');
      const totalRevenue = salesTx.reduce((sum, t) => sum + t.total_revenue, 0);
      const totalCogs = salesTx.reduce((sum, t) => sum + t.total_cost, 0);
      const totalNetProfit = salesTx.reduce((sum, t) => sum + t.net_profit, 0);
      const profitMargin = totalRevenue > 0 ? ((totalNetProfit / totalRevenue) * 100).toFixed(1) : '0';

      opData.resellerSummary = {
        budget_allocated: resellerBudget.allocated_amount,
        capital_spent: resellerBudget.spent_amount,
        capital_remaining: resellerBudget.remaining_amount,
        stock_valuation: stockValuation,
        total_units: totalUnits,
        total_revenue: totalRevenue,
        total_cogs: totalCogs,
        net_profit: totalNetProfit,
        profit_margin: profitMargin
      };

      // All money projections come from the database summary used by category allocations.
      opData.summary = {
        initial_fund: Number(summaryData?.initial_fund) || 0,
        total_inflow: Number(summaryData?.total_inflow) || 0,
        total_fund: Number(summaryData?.total_fund) || 0,
        total_allocated: Number(summaryData?.total_allocated) || 0,
        total_spent: Number(summaryData?.total_spent) || 0,
        current_balance: Number(summaryData?.current_balance) || 0,
        allocation_basis: opData.allocationError ? 0 : Number(summaryData?.allocation_basis) || 0,
        allocation_ready: !opData.allocationError,
        domain_reserved: Number(summaryData?.domain_reserved) || 0,
        domain_obligation: Number(summaryData?.domain_obligation) || 22000,
        domain_status: summaryData?.domain_status || 'unpaid',
        domain_due_date: summaryData?.domain_due_date || '2027-09-12'
      };
    } catch (err) {
      console.warn('Gagal memuat data dana operasional:', err);
      opData.summaryLoaded = false;
      opData.allocationError = 'Diperlukan rekonsiliasi: data keuangan gagal dimuat.';
      opData.mayarWithdrawalsError = 'Data pencairan Mayar belum dapat diverifikasi. Segarkan data atau periksa akses database.';
      opData.budgets = DEFAULT_BUDGETS.map(b => ({
        ...b,
        spent_amount: 0,
        remaining_amount: b.allocated_amount,
        percent_spent: 0
      }));
      opData.summary = {
        initial_fund: 0,
        total_inflow: 0,
        total_fund: 0,
        total_allocated: 0,
        total_spent: 0,
        current_balance: 0,
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

  // Cash Flow Filters State
  let cashFlowFilterMonth = '2026-10';
  let cashFlowFilterCategory = 'all';

  function getMonthlyCashFlowEntries() {
    const entries = [];

    // 1. Suntikan Modal Bisnis dari Pemilik/Pihak Lain (Kakak)
    const capitalRecord = opData.bookkeepingRecords.find(r => r.category === 'capital_injection');
    const capitalNet = capitalRecord ? Number(capitalRecord.net_amount) : 400000;
    const capitalGross = capitalRecord ? Number(capitalRecord.gross_amount) : 500000;
    entries.push({
      id: 'entry-capital-injection',
      date: '2026-10-25',
      month: '2026-10',
      type: 'inflow',
      category: 'capital',
      categoryLabel: 'Suntikan Modal Bisnis',
      accountLabel: 'Kas Bisnis / Rekening Bank',
      description: 'Suntikan modal usaha dari kakak (total pemberian Rp500.000, alokasi pribadi Kayla Rp100.000 dipisahkan)',
      reference: 'INJ-KAKAK-400K',
      grossAmount: capitalGross,
      feeAmount: capitalGross - capitalNet,
      netAmount: capitalNet,
      amount: capitalNet,
      status: capitalRecord ? (capitalRecord.status || 'verified') : 'verified',
      statusLabel: 'Terverifikasi'
    });

    // 2. Omzet Penjualan Bersih (12 Pesanan Selesai)
    const profitRecord = opData.bookkeepingRecords.find(r => r.category === 'order_profit_allocation');
    const salesNet = profitRecord ? Number(profitRecord.gross_amount) : 255600;
    entries.push({
      id: 'entry-sales-12-orders',
      date: '2026-10-25',
      month: '2026-10',
      type: 'inflow',
      category: 'sales',
      categoryLabel: 'Omzet Penjualan Bersih',
      accountLabel: 'Payment Gateway (Mayar)',
      description: 'Penerimaan bersih 12 pesanan selesai (12 x Rp21.300 setelah potongan gateway, omzet bruto Rp264.000)',
      reference: 'ORD-12-PAID',
      grossAmount: 264000,
      feeAmount: 8400,
      netAmount: salesNet,
      amount: salesNet,
      status: 'completed',
      statusLabel: 'Selesai'
    });

    // 3. Alokasi 10% Pesanan Masuk (Pencadangan Kas Internal Sistem)
    if (Array.isArray(opData.inflows) && opData.inflows.length > 0) {
      opData.inflows.forEach(inf => {
        if (!inf.is_refunded) {
          const rawDate = inf.created_at || inf.order_created_at || '2026-10-21';
          const dt = String(rawDate).slice(0, 10);
          const mo = dt.slice(0, 7);
          const allocAmt = Number(inf.allocation_amount) || 2200;
          entries.push({
            id: 'inflow-' + inf.id,
            date: dt,
            month: mo,
            type: 'internal_allocation',
            category: 'internal_reserve',
            categoryLabel: 'Alokasi Pos Kas 10%',
            accountLabel: 'Pencadangan Kas Internal',
            description: 'Pencadangan pos 10% pesanan ' + (inf.order_code || ('#' + inf.order_id)) + ' (Dasar: ' + formatRupiah(inf.gross_amount) + ', dicadangkan dari omzet)',
            reference: inf.order_code || ('ORD-' + inf.order_id),
            grossAmount: Number(inf.gross_amount),
            feeAmount: 0,
            netAmount: allocAmt,
            amount: allocAmt,
            status: 'completed',
            statusLabel: 'Dialokasikan'
          });
        }
      });
    } else {
      const summaryInflow = opData.summary?.total_inflow || 11000;
      if (summaryInflow > 0) {
        entries.push({
          id: 'inflow-baseline-10pct',
          date: '2026-10-25',
          month: '2026-10',
          type: 'internal_allocation',
          category: 'internal_reserve',
          categoryLabel: 'Alokasi Pos Kas 10%',
          accountLabel: 'Pencadangan Kas Internal',
          description: 'Pencadangan pos 10% kas operasional dari pesanan selesai (dicadangkan dari omzet pesanan)',
          reference: 'RESERVE-OP-10PCT',
          grossAmount: summaryInflow * 10,
          feeAmount: 0,
          netAmount: summaryInflow,
          amount: summaryInflow,
          status: 'completed',
          statusLabel: 'Dialokasikan'
        });
      }
    }

    // 4. Pengembalian Talangan Modal Pribadi Admin (12 Pesanan)
    const cogsRecord = opData.bookkeepingRecords.find(r => r.category === 'order_cogs_liability');
    const cogsNet
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
    const cogsNet = cogsRecord ? Number(cogsRecord.net_amount) : 192000;
    entries.push({
      id: 'entry-cogs-admin-12',
      date: '2026-10-25',
      month: '2026-10',
      type: 'liability',
      category: 'personal_cogs',
      categoryLabel: 'Pengembalian Modal Pribadi',
      accountLabel: 'Kewajiban Admin / Modal Pribadi',
      description: 'Pengembalian talangan modal pribadi admin untuk 12 pesanan (@Rp16.000). Pelunasan kewajiban, bukan beban operasional',
      reference: 'COGS-12-ADMIN',
      grossAmount: cogsNet,
      feeAmount: 0,
      netAmount: cogsNet,
      amount: cogsNet,
      status: 'verified',
      statusLabel: 'Terverifikasi'
    });

    // 5. Transfer Antar Akun & Biaya Penarikan Mayar
    if (Array.isArray(opData.mayarWithdrawals) && opData.mayarWithdrawals.length > 0) {
      opData.mayarWithdrawals.forEach(w => {
        const rawDate = w.scheduled_date || '2026-10-25';
        const dt = String(rawDate).slice(0, 10);
        const mo = dt.slice(0, 7);
        const wFee = Number(w.fee_amount) || 2775;
        const wGross = Number(w.gross_amount) || 252990;
        const wNet = Number(w.net_amount) || 250215;
        const isSuccess = w.status === 'success';

        // Biaya Flat Payment Gateway (Beban Riil Bisnis)
        entries.push({
          id: 'mayar-fee-' + w.id,
          date: dt,
          month: mo,
          type: 'outflow',
          category: 'mayar_fee',
          categoryLabel: 'Biaya Payment Gateway',
          accountLabel: 'Payment Gateway (Mayar)',
          description: 'Biaya flat transfer penarikan payment gateway Mayar (Bruto ' + formatRupiah(wGross) + ', Bersih ' + formatRupiah(wNet) + ')',
          reference: w.transaction_reference || 'WD-MAYAR-20261025',
          grossAmount: wFee,
          feeAmount: 0,
          netAmount: wFee,
          amount: wFee,
          status: isSuccess ? 'verified' : (w.status || 'pending'),
          statusLabel: isSuccess ? 'Terkonfirmasi' : (w.status === 'processing' ? 'Diproses' : 'Pending')
        });

        // Transfer Antar Akun (Gateway Mayar -> Rekening Bank blu)
        entries.push({
          id: 'mayar-transfer-' + w.id,
          date: dt,
          month: mo,
          type: 'transfer',
          category: 'account_transfer',
          categoryLabel: 'Transfer Antar Akun',
          accountLabel: 'Gateway Mayar -> Rekening Bank blu',
          description: 'Transfer penarikan dana dari payment gateway Mayar ke rekening bank blu. Pemindahan likuiditas antar akun, bukan pendapatan baru',
          reference: w.transaction_reference || 'WD-MAYAR-20261025',
          grossAmount: wGross,
          feeAmount: wFee,
          netAmount: wNet,
          amount: wNet,
          status: isSuccess ? 'verified' : (w.status || 'pending'),
          statusLabel: isSuccess ? 'Terkonfirmasi' : (w.status === 'processing' ? 'Diproses' : 'Pending')
        });
      });
    } else {
      // Baseline jika belum ada mutasi penarikan tercatat
      entries.push({
        id: 'mayar-fee-baseline',
        date: '2026-10-25',
        month: '2026-10',
        type: 'outflow',
        category: 'mayar_fee',
        categoryLabel: 'Biaya Payment Gateway',
        accountLabel: 'Payment Gateway (Mayar)',
        description: 'Biaya flat transfer penarikan payment gateway Mayar (Bruto Rp252.990, Bersih Rp250.215)',
        reference: 'WD-MAYAR-25OKT',
        grossAmount: 2775,
        feeAmount: 0,
        netAmount: 2775,
        amount: 2775,
        status: 'verified',
        statusLabel: 'Terkonfirmasi'
      });
      entries.push({
        id: 'mayar-transfer-baseline',
        date: '2026-10-25',
        month: '2026-10',
        type: 'transfer',
        category: 'account_transfer',
        categoryLabel: 'Transfer Antar Akun',
        accountLabel: 'Gateway Mayar -> Rekening Bank blu',
        description: 'Transfer penarikan dana dari payment gateway Mayar ke rekening bank blu (Bruto Rp252.990, Biaya Rp2.775, Bersih Rp250.215)',
        reference: 'WD-MAYAR-25OKT',
        grossAmount: 252990,
        feeAmount: 2775,
        netAmount: 250215,
        amount: 250215,
        status: 'verified',
        statusLabel: 'Terkonfirmasi'
      });
    }

    // 6. Pengeluaran Kas Operasional Aktual
    if (Array.isArray(opData.expenses) && opData.expenses.length > 0) {
      opData.expenses.forEach(exp => {
        const rawDate = exp.expense_date || (exp.created_at ? exp.created_at.slice(0, 10) : '2026-10-25');
        const dt = String(rawDate).slice(0, 10);
        const mo = dt.slice(0, 7);
        const expAmt = Number(exp.amount) || 0;
        entries.push({
          id: 'expense-' + exp.id,
          date: dt,
          month: mo,
          type: 'outflow',
          category: 'operational',
          categoryLabel: 'Pengeluaran Operasional',
          accountLabel: 'Kas Operasional',
          description: (exp.description || 'Pengeluaran kas operasional') + (exp.recipient ? (' (Penerima: ' + exp.recipient + ')') : ''),
          reference: exp.expense_code || ('EXP-' + exp.id),
          grossAmount: expAmt,
          feeAmount: 0,
          netAmount: expAmt,
          amount: expAmt,
          status: 'completed',
          statusLabel: 'Terealisasi'
        });
      });
    }

    // 7. Selisih Rekonsiliasi Saldo Penjualan (Perlu Rekonsiliasi Manual)
    const varianceRecord = opData.bookkeepingRecords.find(r => r.category === 'reconciliation_variance');
    const varianceAmt = varianceRecord ? Number(varianceRecord.net_amount) : 22100;
    entries.push({
      id: 'entry-reconciliation-variance',
      date: '2026-10-25',
      month: '2026-10',
      type: 'unreconciled',
      category: 'reconciliation_variance',
      categoryLabel: 'Selisih Rekonsiliasi',
      accountLabel: 'Payment Gateway (Mayar)',
      description: 'Selisih antara saldo penjualan dilaporkan di dashboard Mayar (Rp277.700) dan penerimaan 12 pesanan (Rp255.600)',
      reference: 'VAR-SALES-22100',
      grossAmount: varianceAmt,
      feeAmount: 0,
      netAmount: varianceAmt,
      amount: varianceAmt,
      status: 'unreconciled',
      statusLabel: 'Perlu Rekonsiliasi Manual'
    });

    // 8. Alokasi Keperluan Pribadi Kayla (Non-Bisnis)
    const personalRecord = opData.bookkeepingRecords.find(r => r.category === 'personal_allocation');
    const personalAmt = personalRecord ? Number(personalRecord.net_amount) : 100000;
    entries.push({
      id: 'entry-personal-allocation',
      date: '2026-10-25',
      month: '2026-10',
      type: 'non_business',
      category: 'personal_allocation',
      categoryLabel: 'Dana Pribadi (Non-Bisnis)',
      accountLabel: 'Rekening Pribadi Kayla',
      description: 'Alokasi keperluan pribadi Kayla dari dana pemberian kakak (Rp100.000 dari total Rp500.000, dipisahkan dari kas bisnis JOKI.IN)',
      reference: 'NON-BIZ-KAYLA-100K',
      grossAmount: personalAmt,
      feeAmount: 0,
      netAmount: personalAmt,
      amount: personalAmt,
      status: 'excluded',
      statusLabel: 'Dipisahkan (Non-Bisnis)'
    });

    return entries;
  }

  function renderMonthlyCashFlowSummary() {
    const allEntries = getMonthlyCashFlowEntries();

    // Period entries
    const periodEntries = cashFlowFilterMonth === 'all'
      ? allEntries
      : allEntries.filter(e => e.month === cashFlowFilterMonth);

    // Sum calculations for the active period
    let sumSales = 0;
    let sumCapital = 0;
    let sumInternalReserve = 0;
    let sumOpExpense = 0;
    let sumMayarFee = 0;
    let sumPersonalCogs = 0;
    let sumTransfers = 0;
    let sumVariance = 0;

    periodEntries.forEach(e => {
      if (e.type === 'inflow') {
        if (e.category === 'sales') sumSales += e.amount;
        else if (e.category === 'capital') sumCapital += e.amount;
      } else if (e.type === 'outflow') {
        if (e.category === 'operational') sumOpExpense += e.amount;
        else if (e.category === 'mayar_fee') sumMayarFee += e.amount;
      } else if (e.type === 'liability') {
        if (e.category === 'personal_cogs') sumPersonalCogs += e.amount;
      } else if (e.type === 'transfer') {
        sumTransfers += e.amount;
      } else if (e.type === 'internal_allocation') {
        sumInternalReserve += e.amount;
      } else if (e.type === 'unreconciled') {
        sumVariance += e.amount;
      }
    });

    // Pemasukan Eksternal Bersih: Rp255.600 + Rp400.000 = Rp655.600
    // Alokasi kas 10% (Rp11.000) adalah pemisahan internal, bukan kas masuk baru.
    const totalInflow = sumSales + sumCapital;
    // Beban Usaha Riil: Rp0 + Rp2.775 = Rp2.775
    const totalOutflow = sumOpExpense + sumMayarFee;
    // Pelunasan Kewajiban: Rp192.000
    const totalLiability = sumPersonalCogs;
    // Saldo Buku Besar Bisnis: Rp655.600 - Rp2.775 - Rp192.000 = Rp460.825
    const bookBalance = totalInflow - totalOutflow - totalLiability;

    // Update DOM Metrics
    const periodBadge = document.getElementById('cashflow-period-badge');
    if (periodBadge) {
      periodBadge.textContent = cashFlowFilterMonth === 'all'
        ? 'Periode: Semua Riwayat Transaksi'
        : 'Periode: Oktober 2026';
    }

    const elTotalInflow = document.getElementById('cashflow-total-inflow');
    const elInflowSales = document.getElementById('cashflow-inflow-sales');
    const elInflowCapital = document.getElementById('cashflow-inflow-capital');
    const elInflowOther = document.getElementById('cashflow-inflow-other');

    if (elTotalInflow) elTotalInflow.textContent = totalInflow.toLocaleString('id-ID');
    if (elInflowSales) elInflowSales.textContent = formatRupiah(sumSales);
    if (elInflowCapital) elInflowCapital.textContent = formatRupiah(sumCapital);
    if (elInflowOther) elInflowOther.textContent = formatRupiah(sumInternalReserve);

    const elTotalOutflow = document.getElementById('cashflow-total-outflow');
    const elOutflowOp = document.getElementById('cashflow-outflow-op');
    const elOutflowMayar = document.getElementById('cashflow-outflow-mayar');
    const elOutflowCogs = document.getElementById('cashflow-outflow-cogs');

    if (elTotalOutflow) elTotalOutflow.textContent = totalOutflow.toLocaleString('id-ID');
    if (elOutflowOp) elOutflowOp.textContent = formatRupiah(sumOpExpense);
    if (elOutflowMayar) elOutflowMayar.textContent = formatRupiah(sumMayarFee);
    if (elOutflowCogs) elOutflowCogs.textContent = formatRupiah(sumPersonalCogs);

    const elBalanceBook = document.getElementById('cashflow-balance-book');
    const elBalanceReported = document.getElementById('cashflow-balance-reported');
    const elBalanceActual = document.getElementById('cashflow-balance-actual');
    const elReconcileBadge = document.getElementById('cashflow-reconcile-badge');

    if (elBalanceBook) elBalanceBook.textContent = formatRupiah(bookBalance);
    if (elBalanceReported) elBalanceReported.textContent = 'Rp277.700';
    if (elBalanceActual) elBalanceActual.textContent = 'Belum diverifikasi';
    if (elReconcileBadge) elReconcileBadge.textContent = 'Belum Direkonsiliasi';

    // Filter table entries
    let tableEntries = periodEntries;
    if (cashFlowFilterCategory === 'inflow') {
      tableEntries = tableEntries.filter(e => e.type === 'inflow');
    } else if (cashFlowFilterCategory === 'outflow') {
      tableEntries = tableEntries.filter(e => e.type === 'outflow');
    } else if (cashFlowFilterCategory === 'liability') {
      tableEntries = tableEntries.filter(e => e.type === 'liability');
    } else if (cashFlowFilterCategory === 'transfer') {
      tableEntries = tableEntries.filter(e => e.type === 'transfer');
    } else if (cashFlowFilterCategory === 'internal') {
      tableEntries = tableEntries.filter(e => e.type === 'internal_allocation');
    } else if (cashFlowFilterCategory === 'unreconciled') {
      tableEntries = tableEntries.filter(e => e.type === 'unreconciled');
    } else if (cashFlowFilterCategory === 'non_business') {
      tableEntries = tableEntries.filter(e => e.type === 'non_business');
    } else if (cashFlowFilterCategory === 'sales') {
      tableEntries = tableEntries.filter(e => e.category === 'sales');
    } else if (cashFlowFilterCategory === 'capital') {
      tableEntries = tableEntries.filter(e => e.category === 'capital');
    } else if (cashFlowFilterCategory === 'personal_cogs') {
      tableEntries = tableEntries.filter(e => e.category === 'personal_cogs');
    } else if (cashFlowFilterCategory === 'mayar_fee') {
      tableEntries = tableEntries.filter(e => e.category === 'mayar_fee');
    } else if (cashFlowFilterCategory === 'operational') {
      tableEntries = tableEntries.filter(e => e.category === 'operational');
    }

    // Sort descending by date
    tableEntries.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

    const countLabel = document.getElementById('cashflow-table-count');
    if (countLabel) countLabel.textContent = tableEntries.length + ' transaksi tercatat';

    const tbody = document.getElementById('cashflow-history-tbody');
    if (tbody) {
      if (tableEntries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 28px; color: var(--ink-secondary);">Tidak ada transaksi arus kas untuk filter yang dipilih.</td></tr>';
      } else {
        tbody.innerHTML = tableEntries.map(e => {
          let typeBadge = '';
          let sign = '';
          let amountColor = 'var(--ink)';

          if (e.type === 'inflow') {
            typeBadge = '<span class="status-badge" style="background: #E6F8F0; color: #10B981; font-weight: 700; font-size: 10.5px;">Pemasukan</span>';
            sign = '+';
            amountColor = '#10B981';
          } else if (e.type === 'outflow') {
            typeBadge = '<span class="status-badge" style="background: #FEE2E2; color: #EF4444; font-weight: 700; font-size: 10.5px;">Beban Usaha</span>';
            sign = '-';
            amountColor = '#EF4444';
          } else if (e.type === 'liability') {
            typeBadge = '<span class="status-badge" style="background: #FEF3C7; color: #B45309; font-weight: 700; font-size: 10.5px;">Pelunasan Modal</span>';
            sign = '-';
            amountColor = '#B45309';
          } else if (e.type === 'transfer') {
            typeBadge = '<span class="status-badge" style="background: #EDE9FE; color: #6D28D9; font-weight: 700; font-size: 10.5px;">Transfer Akun</span>';
            sign = '';
            amountColor = '#6D28D9';
          } else if (e.type === 'internal_allocation') {
            typeBadge = '<span class="status-badge" style="background: #E0F2FE; color: #0284C7; font-weight: 700; font-size: 10.5px;">Alokasi Pos</span>';
            sign = '';
            amountColor = '#0284C7';
          } else if (e.type === 'unreconciled') {
            typeBadge = '<span class="status-badge" style="background: #FFFBEB; color: #D97706; font-weight: 700; font-size: 10.5px;">Perlu Rekonsiliasi</span>';
            sign = '';
            amountColor = '#D97706';
          } else if (e.type === 'non_business') {
            typeBadge = '<span class="status-badge" style="background: #F3F4F6; color: #6B7280; font-weight: 700; font-size: 10.5px;">Non-Bisnis</span>';
            sign = '';
            amountColor = '#6B7280';
          }

          let statusBadge = '';
          if (e.status === 'verified') {
            statusBadge = '<span class="status-badge" style="background: #E8EDF8; color: #3158A8; font-weight: 700; font-size: 10.5px;">Terverifikasi</span>';
          } else if (e.status === 'completed') {
            statusBadge = '<span class="status-badge" style="background: #E6F8F0; color: #10B981; font-weight: 700; font-size: 10.5px;">Selesai</span>';
          } else if (e.status === 'unreconciled') {
            statusBadge = '<span class="status-badge" style="background: #FEF3C7; color: #B45309; font-weight: 700; font-size: 10.5px;">Belum Cocok</span>';
          } else if (e.status === 'excluded') {
            statusBadge = '<span class="status-badge" style="background: #F3F4F6; color: #6B7280; font-weight: 700; font-size: 10.5px;">Dipisahkan</span>';
          } else {
            statusBadge = '<span class="status-badge" style="background: #FEF3C7; color: #B45309; font-weight: 700; font-size: 10.5px;">' + escapeHtml(e.statusLabel) + '</span>';
          }

          const amountFormatted = sign + formatRupiah(e.amount);

          return '<tr>' +
            '<td style="white-space: nowrap; font-weight: 600; font-size: 12.5px;">' + escapeHtml(formatShortDate(e.date)) + '</td>' +
            '<td style="text-align: center;">' + typeBadge + '</td>' +
            '<td style="font-weight: 600; color: var(--ink); font-size: 12.5px;">' +
              '<div>' + escapeHtml(e.categoryLabel) + '</div>' +
              (e.accountLabel ? ('<div style="font-size: 10.5px; color: var(--ink-secondary); font-weight: 500; margin-top: 2px;">' + escapeHtml(e.accountLabel) + '</div>') : '') +
            '</td>' +
            '<td style="font-size: 12px; color: var(--ink); line-height: 1.4;">' +
              '<div>' + escapeHtml(e.description) + '</div>' +
              '<div style="font-size: 11px; color: var(--ink-secondary); margin-top: 2px;">Ref: <code>' + escapeHtml(e.reference) + '</code></div>' +
            '</td>' +
            '<td style="text-align: right; font-weight: 800; font-size: 13.5px; color: ' + amountColor + '; font-variant-numeric: tabular-nums; white-space: nowrap;">' + amountFormatted + '</td>' +
            '<td style="text-align: center;">' + statusBadge + '</td>' +
          '</tr>';
        }).join('');
      }
    }

    // Keep updating op-bookkeeping-opening-balance and op-allocation-status if present
    const openingBalance = document.getElementById('op-bookkeeping-opening-balance');
    if (openingBalance) openingBalance.textContent = opData.summaryLoaded ? formatRupiah(opData.summary.initial_fund) : '-';
    const status = document.getElementById('op-allocation-status');
    if (status) status.textContent = opData.allocationError || ('Basis alokasi ' + formatRupiah(opData.summary.allocation_basis) + '; kewajiban domain dipisahkan.');

    // Backward-compatible node updates if present
    const elValBalance = document.getElementById('op-val-balance');
    if (elValBalance) {
      elValBalance.textContent = opData.allocationError
        ? '-'
        : Number(opData.summary.current_balance).toLocaleString('id-ID');
    }
    const elValRemaining = document.getElementById('op-val-remaining');
    if (elValRemaining) {
      elValRemaining.textContent = opData.allocationError
        ? '-'
        : Number(opData.summary.allocation_basis).toLocaleString('id-ID');
    }
    const elFootBalance = document.getElementById('op-foot-balance');
    if (elFootBalance) {
      elFootBalance.textContent = !opData.summaryLoaded || (opData.allocationError && opData.allocationError.includes('gagal dimuat'))
        ? 'Data ringkasan saldo kas gagal dimuat dari database.'
        : (opData.summary.initial_fund > 0
          ? ('Saldo awal ' + formatRupiah(opData.summary.initial_fund) + ' sudah termasuk dalam saldo berjalan.')
          : ('Saldo buku ' + formatRupiah(opData.summary.current_balance) + ' belum diverifikasi mutasi bank.'));
    }
  }

  function setupCashFlowFilterListeners() {
    const monthSelect = document.getElementById('cashflow-month-filter');
    if (monthSelect && !monthSelect.dataset.listenerAttached) {
      monthSelect.dataset.listenerAttached = 'true';
      monthSelect.addEventListener('change', (e) => {
        cashFlowFilterMonth = e.target.value;
        renderMonthlyCashFlowSummary();
      });
    }

    const catSelect = document.getElementById('cashflow-category-filter');
    if (catSelect && !catSelect.dataset.listenerAttached) {
      catSelect.dataset.listenerAttached = 'true';
      catSelect.addEventListener('change', (e) => {
        cashFlowFilterCategory = e.target.value;
        renderMonthlyCashFlowSummary();
      });
    }
  }
  function renderDonutChart() {
    const wrap = document.getElementById('op-donut-svg-wrap');
    const legendEl = document.getElementById('op-donut-legend');
    if (!wrap || !legendEl) return;

    wrap.innerHTML = '';
    legendEl.innerHTML = '';

    // STRICT REQUIREMENT: Domain is NOT included in percentage donut chart.
    // Donut chart visualizes the 5 remaining categories: Promo, Bonus, AI, Emergency, Reseller (each 20%).
    const variableBudgets = opData.budgets.filter(b => !b.is_fixed_obligation && b.id !== 'domain');
    const totalVar = variableBudgets.reduce((sum, b) => sum + b.remaining_amount, 0);
    const caption = document.getElementById('op-allocation-caption');
    if (caption) caption.textContent = opData.allocationError
      ? 'Target 20% per kategori; kewajiban domain terpisah. Nominal ditetapkan setelah dasar dana dikonfirmasi.'
      : `Target 20% dari sisa dana sah ${formatRupiah(totalVar)} per kategori. Sisa pembulatan rupiah dibagikan menurut urutan kategori. Kewajiban domain terpisah.`;
    if (opData.allocationError) {
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 260 260');
      svg.setAttribute('class', 'op-donut-svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Target alokasi: lima kategori masing-masing 20%. Nominal menunggu verifikasi.');
      const targets = variableBudgets.length === 5 ? variableBudgets : [
        { name: 'Promo', color: '#10B981' },
        { name: 'Bonus Tim', color: '#3B82F6' },
        { name: 'AI', color: '#8B5CF6' },
        { name: 'Dana Darurat', color: '#F59E0B' },
        { name: 'Reseller', color: '#EC4899' }
      ];
      targets.forEach((cat, index) => {
        const start = (index * 72 - 90) * Math.PI / 180;
        const end = (index * 72 - 18) * Math.PI / 180;
        const point = (radius, angle) => `${130 + radius * Math.cos(angle)} ${130 + radius * Math.sin(angle)}`;
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', `M ${point(105, start)} A 105 105 0 0 1 ${point(105, end)} L ${point(68, end)} A 68 68 0 0 0 ${point(68, start)} Z`);
        path.setAttribute('fill', cat.color || '#64748B');
        const title = document.createElementNS(svgNS, 'title');
        title.textContent = `${cat.name}: target 20%, nominal menunggu verifikasi`;
        path.appendChild(title);
        svg.appendChild(path);
        const item = document.createElement('div');
        item.textContent = `${cat.name}: target 20% · nominal belum ditetapkan`;
        item.className = 'chart-caption';
        legendEl.appendChild(item);
      });
      ['Target Alokasi', '20% per kategori', 'Menunggu verifikasi'].forEach((label, index) => {
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', '130');
        text.setAttribute('y', String(112 + index * 20));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', 'var(--ink)');
        text.setAttribute('font-size', index === 1 ? '14' : '11');
        text.textContent = label;
        svg.appendChild(text);
      });
      wrap.appendChild(svg);
      return;
    }

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

    variableBudgets.filter(cat => cat.remaining_amount > 0).forEach((cat) => {
      const sliceAngle = (cat.remaining_amount / totalVar) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const pct = '20.00';

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
      title.textContent = `${cat.name}: ${formatRupiah(cat.remaining_amount)} (target ${pct}%)`;
      path.appendChild(title);

      path.addEventListener('mouseenter', () => {
        path.setAttribute('opacity', '0.85');
        updateDonutCenterText(cat.name, formatRupiah(cat.remaining_amount), `Target ${pct}%`);
      });

      path.addEventListener('mouseleave', () => {
        path.setAttribute('opacity', '1');
        updateDonutCenterText('Sisa Dana', formatRupiah(totalVar), '100% (5 Pos)');
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
    centerSub.textContent = totalVar > 0 ? '100% (5 Pos)' : 'Belum ada sisa dana';

    textGroup.appendChild(centerLabel);
    textGroup.appendChild(centerVal);
    textGroup.appendChild(centerSub);
    svg.appendChild(textGroup);

    wrap.appendChild(svg);

    // Legend for the 4 variable categories
    variableBudgets.forEach(cat => {
      const pct = '20.00';
      const item = document.createElement('div');
      item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 3px 0;';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: ${cat.color}; flex-shrink: 0;"></span>
          <span style="color: var(--ink); font-weight: 600;">${cat.name}</span>
        </div>
        <div style="text-align: right; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums;">
          ${formatRupiah(cat.remaining_amount)} <span style="font-size: 11px; color: var(--ink-secondary); font-weight: 500;">(target ${pct}%)</span>
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
      const allocated = cat.allocated_amount || 0;
      const remaining = Math.max(0, allocated - spent);
      const pctSpent = allocated > 0 ? Math.min(100, (spent / allocated) * 100) : 0;

      const row = document.createElement('div');
      row.className = 'op-bar-row';
      row.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

      row.innerHTML = `
        <div style="display: flex; flex-wrap: wrap; gap: 6px 12px; justify-content: space-between; align-items: baseline; font-size: 13px;">
          <span style="font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${cat.color};"></span>
            ${cat.name} ${cat.is_fixed_obligation ? '<span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #EBF1FF; color: var(--accent-blue); font-weight: 700;">Nominal Tetap</span>' : ''}
          </span>
          <span style="font-size: 12px; color: var(--ink-secondary);">
            Anggaran: <strong style="color: var(--ink);">${opData.allocationError && !cat.is_fixed_obligation ? 'Belum ditetapkan' : formatRupiah(allocated)}</strong>
          </span>
        </div>
        <div style="width: 100%; height: 10px; background: #E5E9EF; border-radius: 999px; overflow: hidden; position: relative;">
          <div style="width: ${pctSpent}%; height: 100%; background: ${pctSpent > 80 ? 'var(--balance-red)' : cat.color}; border-radius: 999px; transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);"></div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--ink-secondary);">
          <span>Terpakai: <strong style="color: ${spent > 0 ? 'var(--balance-red)' : 'var(--ink)'};">${formatRupiah(spent)}</strong> (${pctSpent.toFixed(1)}%)</span>
          <span>Sisa: <strong style="color: #10B981;">${opData.allocationError && !cat.is_fixed_obligation ? '-' : formatRupiah(remaining)}</strong></span>
        </div>
      `;

      container.appendChild(row);
    });
  }

  function renderPromoSubsystem() {
    const promoCat = opData.budgets.find(b => b.id === 'promo') || { allocated_amount: 0, spent_amount: 0 };
    const spent = promoCat.spent_amount || 0;
    const remaining = Math.max(0, promoCat.allocated_amount - spent);

    const elBudgetBadge = document.getElementById('op-promo-budget-badge');
    const elSpent = document.getElementById('op-promo-spent');
    const elRem = document.getElementById('op-promo-remaining');
    const historyContainer = document.getElementById('op-promo-history');

    if (elBudgetBadge) elBudgetBadge.textContent = opData.allocationError ? 'Anggaran menunggu rekonsiliasi' : `Anggaran: ${formatRupiah(promoCat.allocated_amount)}`;
    if (elSpent) elSpent.textContent = formatRupiah(spent);
    if (elRem) elRem.textContent = opData.allocationError ? '-' : formatRupiah(remaining);

    if (historyContainer) {
      if (opData.promos.length === 0) {
        historyContainer.innerHTML = `<p class="chart-caption" style="text-align: center; padding: 16px 0;">Belum ada subsidi promo yang dicatat. ${opData.allocationError ? 'Anggaran menunggu rekonsiliasi.' : `Sisa anggaran ${formatRupiah(remaining)}.`}</p>`;
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
    const bonusCat = opData.budgets.find(b => b.id === 'bonus') || { allocated_amount: 0, spent_amount: 0 };
    const spent = bonusCat.spent_amount || 0;
    const remaining = Math.max(0, bonusCat.allocated_amount - spent);

    const elBudgetBadge = document.getElementById('op-bonus-budget-badge');
    const elSpent = document.getElementById('op-bonus-spent');
    const elRem = document.getElementById('op-bonus-remaining');
    const historyContainer = document.getElementById('op-bonus-history');

    if (elBudgetBadge) elBudgetBadge.textContent = opData.allocationError ? 'Anggaran menunggu rekonsiliasi' : `Anggaran: ${formatRupiah(bonusCat.allocated_amount)}`;
    if (elSpent) elSpent.textContent = formatRupiah(spent);
    if (elRem) elRem.textContent = opData.allocationError ? '-' : formatRupiah(remaining);

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

  function renderResellerSubsystem() {
    const s = opData.resellerSummary;
    const badge = document.getElementById('op-reseller-budget-badge');
    const elCash = document.getElementById('op-reseller-cash-remaining');
    const elSpentNote = document.getElementById('op-reseller-spent-note');
    const elValuation = document.getElementById('op-reseller-stock-valuation');
    const elStockNote = document.getElementById('op-reseller-stock-count-note');
    const elRevenue = document.getElementById('op-reseller-total-revenue');
    const elNetProfit = document.getElementById('op-reseller-net-profit');
    const elMarginBadge = document.getElementById('op-reseller-margin-badge');
    const wrapInv = document.getElementById('op-reseller-inventory-wrap');
    const wrapTx = document.getElementById('op-reseller-transactions-wrap');
    const btnTabInv = document.getElementById('op-reseller-tab-inventory');
    const btnTabTx = document.getElementById('op-reseller-tab-history');
    const captionEl = document.getElementById('op-reseller-table-caption');

    if (badge) badge.textContent = opData.allocationError ? 'Anggaran menunggu rekonsiliasi' : `Anggaran: ${formatRupiah(s.budget_allocated)} (target 20%)`;
    if (elCash) elCash.textContent = opData.allocationError ? '-' : Math.round(s.capital_remaining).toLocaleString('id-ID');
    if (elSpentNote) elSpentNote.textContent = `Belanja stok: ${formatRupiah(s.capital_spent)}`;
    if (elValuation) elValuation.textContent = Math.round(s.stock_valuation).toLocaleString('id-ID');
    if (elStockNote) elStockNote.textContent = `${s.total_units} unit produk tersedia`;
    if (elRevenue) elRevenue.textContent = Math.round(s.total_revenue).toLocaleString('id-ID');
    if (elNetProfit) elNetProfit.textContent = Math.round(s.net_profit).toLocaleString('id-ID');
    if (elMarginBadge) {
      elMarginBadge.textContent = `Margin ${s.profit_margin}%`;
      elMarginBadge.style.background = s.net_profit >= 0 ? '#E6F8F0' : '#FEE2E2';
      elMarginBadge.style.color = s.net_profit >= 0 ? '#10B981' : '#EF4444';
    }

    const isInventory = opData.activeResellerTab === 'inventory';
    if (btnTabInv) btnTabInv.className = `btn-outline ${isInventory ? 'active' : ''}`;
    if (btnTabTx) btnTabTx.className = `btn-outline ${!isInventory ? 'active' : ''}`;
    if (wrapInv) wrapInv.style.display = isInventory ? 'block' : 'none';
    if (wrapTx) wrapTx.style.display = !isInventory ? 'block' : 'none';

    if (captionEl) {
      captionEl.textContent = isInventory 
        ? 'Katalog stok produk digital yang dimiliki sistem dan siap dijual' 
        : 'Catatan perputaran modal barang, omzet kotor, dan laba bersih reseller';
    }

    if (isInventory) {
      renderResellerInventoryTable();
    } else {
      renderResellerTransactionsTable();
    }
  }

  function renderResellerInventoryTable() {
    const tbody = document.getElementById('op-reseller-inventory-tbody');
    if (!tbody) return;

    if (opData.resellerInventory.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 24px; color: var(--ink-secondary);">
            Belum ada stok produk digital. Klik tombol "Catat Beli Stok (Modal)" di atas untuk memulai pengadaan stok menggunakan modal reseller.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = opData.resellerInventory.map(item => {
      const isOut = item.stock_qty <= 0;
      const totalVal = item.stock_qty * item.unit_cost;
      return `
        <tr style="border-bottom: 1px solid var(--border-light); ${isOut ? 'opacity: 0.65;' : ''}">
          <td style="padding: 10px 8px;">
            <div style="font-weight: 700; color: var(--ink);">${escapeHtml(item.product_name)}</div>
            ${item.notes ? `<span style="font-size: 11px; color: var(--ink-secondary);">${escapeHtml(item.notes)}</span>` : ''}
          </td>
          <td style="padding: 10px 8px; color: var(--ink-secondary); font-size: 12px;">
            ${escapeHtml(item.category || 'Akun & Layanan Digital')}
          </td>
          <td style="padding: 10px 8px; text-align: center;">
            <span class="status-badge" style="background: ${isOut ? '#FEE2E2' : '#E6F8F0'}; color: ${isOut ? '#EF4444' : '#10B981'}; font-weight: 700; font-size: 11px;">
              ${item.stock_qty} unit
            </span>
          </td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums;">
            ${formatRupiah(item.unit_cost)}
          </td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: var(--ink-secondary); font-variant-numeric: tabular-nums;">
            ${formatRupiah(item.default_selling_price || item.unit_cost * 1.25)}
          </td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 800; color: var(--accent-blue); font-variant-numeric: tabular-nums;">
            ${formatRupiah(totalVal)}
          </td>
          <td style="padding: 10px 8px; text-align: center;">
            <button class="btn-primary btn-quick-reseller-sell" data-id="${item.id}" ${isOut ? 'disabled' : ''} style="height: 30px; padding: 0 10px; font-size: 11px; font-weight: 700; background: #10B981; border-color: #10B981; ${isOut ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
              Jual
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-quick-reseller-sell').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const prodId = e.currentTarget.getAttribute('data-id');
        openResellerSaleModal(prodId);
      });
    });
  }

  function renderResellerTransactionsTable() {
    const tbody = document.getElementById('op-reseller-transactions-tbody');
    if (!tbody) return;

    if (opData.resellerTransactions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 24px; color: var(--ink-secondary);">
            Belum ada riwayat transaksi reseller yang dicatat.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = opData.resellerTransactions.map(tx => {
      const isBuy = tx.type === 'purchase_stock';
      const dateStr = tx.created_at ? new Date(tx.created_at).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '-';

      return `
        <tr style="border-bottom: 1px solid var(--border-light);">
          <td style="padding: 10px 8px; font-weight: 700; font-family: monospace; color: var(--accent-blue); font-size: 12px;">
            ${escapeHtml(tx.tx_code || '-')}
          </td>
          <td style="padding: 10px 8px; white-space: nowrap; color: var(--ink-secondary); font-size: 12px;">
            ${dateStr}
          </td>
          <td style="padding: 10px 8px;">
            <span class="status-badge" style="background: ${isBuy ? 'rgba(14, 165, 233, 0.12)' : '#E6F8F0'}; color: ${isBuy ? '#0EA5E9' : '#10B981'}; font-weight: 700; font-size: 11px;">
              ${isBuy ? 'Beli Stok (Modal)' : 'Penjualan'}
            </span>
          </td>
          <td style="padding: 10px 8px;">
            <div style="font-weight: 600; color: var(--ink);">${escapeHtml(tx.product_name)}</div>
            ${tx.buyer_name ? `<span style="font-size: 11px; color: var(--ink-secondary);">${escapeHtml(tx.buyer_name)}</span>` : ''}
          </td>
          <td style="padding: 10px 8px; text-align: center; font-weight: 700;">
            ${tx.qty}
          </td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: var(--balance-red); font-variant-numeric: tabular-nums;">
            ${formatRupiah(tx.total_cost)}
          </td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 700; color: ${isBuy ? 'var(--ink-secondary)' : 'var(--ink)'}; font-variant-numeric: tabular-nums;">
            ${isBuy ? '-' : formatRupiah(tx.total_revenue)}
          </td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 800; color: ${isBuy ? 'var(--ink-secondary)' : '#10B981'}; font-variant-numeric: tabular-nums;">
            ${isBuy ? '-' : `+${formatRupiah(tx.net_profit)}`}
          </td>
        </tr>
      `;
    }).join('');
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
            Belum ada pemasukan 10% dari pesanan baru. Alokasi awal Rp0 aktif.
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
    if (!allocationConfirmed()) return false;
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
    if (!allocationConfirmed()) return false;
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
    if (!allocationConfirmed()) return false;
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
    if (!allocationConfirmed()) return false;
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
    if (!allocationConfirmed()) return false;
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

  async function recordResellerPurchase(productName, category, qty, unitCost, notes) {
    if (!allocationConfirmed()) return false;
    const totalNeeded = Math.round(qty * unitCost);
    if (totalNeeded <= 0) {
      alert('Total modal pengadaan harus lebih besar dari Rp0.');
      return false;
    }

    if (totalNeeded > opData.resellerSummary.capital_remaining) {
      alert(`Sisa modal kas reseller tidak mencukupi (Tersedia: ${formatRupiah(opData.resellerSummary.capital_remaining)}, Diperlukan: ${formatRupiah(totalNeeded)}).`);
      return false;
    }

    try {
      const supabase = await getSupabase();
      const currentAdmin = (typeof state !== 'undefined' && state.admin) ? state.admin : {};
      const adminName = currentAdmin.name || currentAdmin.email?.split('@')[0] || 'Kayla';

      const { data, error } = await supabase.rpc('record_reseller_purchase', {
        p_product_name: productName,
        p_qty: qty,
        p_unit_cost: unitCost,
        p_category: category,
        p_notes: notes || null,
        p_admin_name: adminName
      });

      if (error) {
        alert('Gagal mencatat pengadaan stok reseller: ' + error.message);
        return false;
      }

      await fetchOperationalData();
      renderAll();
      closeModal('modal-add-reseller-purchase');
      alert(`Pengadaan stok ${escapeHtml(productName)} (${qty} unit) berhasil dicatat menggunakan modal reseller ${formatRupiah(totalNeeded)}.`);
      return true;
    } catch (err) {
      alert('Terjadi kesalahan: ' + err.message);
      return false;
    }
  }

  async function recordResellerSale(inventoryId, qty, sellingPrice, fee, buyerName, notes) {
    if (qty <= 0) {
      alert('Jumlah unit terjual harus lebih besar dari 0.');
      return false;
    }
    if (sellingPrice <= 0) {
      alert('Harga jual satuan harus lebih besar dari Rp0.');
      return false;
    }

    const targetItem = opData.resellerInventory.find(i => i.id === inventoryId);
    if (!targetItem) {
      alert('Produk yang dipilih tidak valid.');
      return false;
    }

    if (targetItem.stock_qty < qty) {
      alert(`Stok tidak mencukupi (Tersedia: ${targetItem.stock_qty} unit, Diminta: ${qty} unit).`);
      return false;
    }

    try {
      const supabase = await getSupabase();
      const currentAdmin = (typeof state !== 'undefined' && state.admin) ? state.admin : {};
      const adminName = currentAdmin.name || currentAdmin.email?.split('@')[0] || 'Kayla';

      const { data, error } = await supabase.rpc('record_reseller_sale', {
        p_inventory_id: inventoryId,
        p_qty: qty,
        p_selling_price: sellingPrice,
        p_payment_fee: fee || 0,
        p_buyer_name: buyerName || null,
        p_notes: notes || null,
        p_admin_name: adminName
      });

      if (error) {
        alert('Gagal mencatat penjualan reseller: ' + error.message);
        return false;
      }

      await fetchOperationalData();
      renderAll();
      closeModal('modal-add-reseller-sale');
      alert(`Penjualan ${qty} unit ${targetItem.product_name} berhasil dicatat.`);
      return true;
    } catch (err) {
      alert('Terjadi kesalahan: ' + err.message);
      return false;
    }
  }

  function openResellerSaleModal(preselectedId) {
    const select = document.getElementById('reseller-sale-product-select');
    if (!select) return;

    const availableProds = opData.resellerInventory.filter(p => p.stock_qty > 0);
    if (availableProds.length === 0) {
      alert('Belum ada persediaan produk digital yang tersedia untuk dijual. Silakan catat pembelian stok modal terlebih dahulu.');
      return;
    }

    select.innerHTML = '<option value="">Pilih Produk Digital</option>' + availableProds.map(p => `
      <option value="${p.id}" data-cost="${p.unit_cost}" data-stock="${p.stock_qty}" data-default-price="${p.default_selling_price || p.unit_cost * 1.25}" ${preselectedId === p.id ? 'selected' : ''}>
        ${escapeHtml(p.product_name)} (Stok: ${p.stock_qty} | Modal: ${formatRupiah(p.unit_cost)})
      </option>
    `).join('');

    const targetItem = preselectedId ? opData.resellerInventory.find(p => p.id === preselectedId) : availableProds[0];
    if (targetItem) {
      if (!preselectedId) select.value = targetItem.id;
      const priceInput = document.getElementById('reseller-sale-price-input');
      if (priceInput) priceInput.value = targetItem.default_selling_price || Math.round(targetItem.unit_cost * 1.25);
    }

    recalcResellerSalePreview();
    openModal('modal-add-reseller-sale');
  }

  function recalcResellerSalePreview() {
    const select = document.getElementById('reseller-sale-product-select');
    const qtyInput = document.getElementById('reseller-sale-qty-input');
    const priceInput = document.getElementById('reseller-sale-price-input');
    const feeInput = document.getElementById('reseller-sale-fee-input');

    const revEl = document.getElementById('reseller-sale-calc-rev');
    const cogsEl = document.getElementById('reseller-sale-calc-cogs');
    const feeEl = document.getElementById('reseller-sale-calc-fee');
    const marginBadge = document.getElementById('reseller-sale-calc-margin');
    const profitEl = document.getElementById('reseller-sale-calc-profit');

    const selectedOpt = select ? select.selectedOptions[0] : null;
    const unitCost = selectedOpt ? parseFloat(selectedOpt.getAttribute('data-cost')) || 0 : 0;
    const qty = qtyInput ? parseInt(qtyInput.value, 10) || 0 : 0;
    const price = priceInput ? parseFloat(priceInput.value) || 0 : 0;
    const fee = feeInput ? parseFloat(feeInput.value) || 0 : 0;

    const totalRev = qty * price;
    const totalCogs = qty * unitCost;
    const netProfit = totalRev - totalCogs - fee;
    const marginPct = totalRev > 0 ? ((netProfit / totalRev) * 100).toFixed(1) : 0;

    if (revEl) revEl.textContent = formatRupiah(totalRev);
    if (cogsEl) cogsEl.textContent = formatRupiah(totalCogs);
    if (feeEl) feeEl.textContent = formatRupiah(fee);
    if (profitEl) profitEl.textContent = formatRupiah(netProfit);
    if (marginBadge) {
      marginBadge.textContent = `Margin ${marginPct}%`;
      marginBadge.style.background = netProfit >= 0 ? '#E6F8F0' : '#FEE2E2';
      marginBadge.style.color = netProfit >= 0 ? '#10B981' : '#EF4444';
    }
  }

  function populateExpenseCategorySelect() {
    const select = document.getElementById('expense-category-input');
    if (!select) return;
    select.innerHTML = opData.budgets.map(b => `
      <option value="${b.id}">${escapeHtml(b.name)} (Sisa: ${formatRupiah(b.remaining_amount || 0)})</option>
    `).join('');
  }


  // ========================================================
  // Mayar Monthly Withdrawal Subsystem
  // ========================================================
  function mayarScheduleDate(now = new Date()) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return date.slice(0, 7) + '-25';
  }

  function confirmedMayarWithdrawal(w) {
    const gross = Number(w.gross_amount);
    const fee = Number(w.fee_amount);
    const net = Number(w.net_amount);
    return w.status === 'success' && Boolean(w.confirmed_by)
      && Number.isFinite(Date.parse(w.confirmed_at)) && Number.isSafeInteger(gross) && gross > 2775
      && fee === 2775 && Number.isSafeInteger(net) && net === gross - fee;
  }

  function renderMayarMonthlyWithdrawals() {
    const tbody = document.getElementById('op-mayar-withdrawals-tbody');
    const scheduleBadge = document.getElementById('op-mayar-schedule-badge');
    const dateTextEl = document.getElementById('op-mayar-current-date-text');
    const statusSubtextEl = document.getElementById('op-mayar-date-status-subtext');
    const totalNetEl = document.getElementById('op-mayar-total-success-net');
    const countNoteEl = document.getElementById('op-mayar-total-count-note');

    const today = new Date();
    const currentDay = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', day: 'numeric' }).format(today));

    // Scheduled date string for this month (YYYY-MM-25)
    const thisMonthStr = mayarScheduleDate(today);
    const recordedThisMonth = (opData.mayarWithdrawals || []).find(
      w => w.scheduled_date === thisMonthStr && !['cancelled', 'failed'].includes(w.status)
    );

    if (dateTextEl) {
      dateTextEl.textContent = formatIndoDate(thisMonthStr);
    }

    if (currentDay === 25) {
      if (statusSubtextEl) {
        if (recordedThisMonth) {
          statusSubtextEl.textContent = recordedThisMonth.status === 'success' && !confirmedMayarWithdrawal(recordedThisMonth)
            ? 'Tercatat berhasil, tetapi bukti/nominal masih perlu diverifikasi.'
            : `Tercatat untuk hari ini (${recordedThisMonth.status.toUpperCase()})`;
          statusSubtextEl.style.color = recordedThisMonth.status === 'success' ? '#10B981' : '#D97706';
        } else {
          statusSubtextEl.textContent = 'Hari Jadwal Pencairan (Tanggal 25) - Siap Dicatat';
          statusSubtextEl.style.color = '#10B981';
        }
      }
      if (scheduleBadge) {
        scheduleBadge.textContent = 'Jadwal Hari Ini: Tanggal 25';
        scheduleBadge.style.background = '#E6F8F0';
        scheduleBadge.style.color = '#10B981';
      }
    } else if (currentDay > 25) {
      if (recordedThisMonth) {
        if (statusSubtextEl) {
          statusSubtextEl.textContent = recordedThisMonth.status === 'success' && !confirmedMayarWithdrawal(recordedThisMonth)
            ? 'Tercatat berhasil, tetapi bukti/nominal masih perlu diverifikasi.'
            : `Pencairan tanggal 25 tercatat (${recordedThisMonth.status.toUpperCase()})`;
          statusSubtextEl.style.color = recordedThisMonth.status === 'success' ? '#10B981' : '#D97706';
        }
        if (scheduleBadge) {
          scheduleBadge.textContent = 'Pencairan Bulan Ini Tercatat';
          scheduleBadge.style.background = '#E6F8F0';
          scheduleBadge.style.color = '#10B981';
        }
      } else {
        if (statusSubtextEl) {
          statusSubtextEl.textContent = 'Status: Terlambat / Menunggu Konfirmasi';
          statusSubtextEl.style.color = '#EF4444';
        }
        if (scheduleBadge) {
          scheduleBadge.textContent = 'Pencairan Terlambat';
          scheduleBadge.style.background = '#FEE2E2';
          scheduleBadge.style.color = '#EF4444';
        }
      }
    } else {
      if (statusSubtextEl) {
        statusSubtextEl.textContent = `Menunggu tanggal 25 (${25 - currentDay} hari lagi)`;
        statusSubtextEl.style.color = '#3158A8';
      }
      if (scheduleBadge) {
        scheduleBadge.textContent = 'Jadwal: Tanggal 25';
        scheduleBadge.style.background = '#E8EDF8';
        scheduleBadge.style.color = '#3158A8';
      }
    }

    const successList = opData.mayarWithdrawals.filter(confirmedMayarWithdrawal);
    const unverifiedCount = opData.mayarWithdrawals.filter(w => w.status === 'success' && !confirmedMayarWithdrawal(w)).length;
    const totalNetSuccess = successList.reduce((sum, w) => sum + Number(w.net_amount), 0);
    if (totalNetEl) {
      totalNetEl.textContent = opData.mayarWithdrawalsError ? '-' : totalNetSuccess.toLocaleString('id-ID');
    }
    if (countNoteEl) {
      const allCount = (opData.mayarWithdrawals || []).length;
      countNoteEl.textContent = opData.mayarWithdrawalsError || `${allCount} pencatatan (${successList.length} terkonfirmasi)${unverifiedCount ? `; ${unverifiedCount} perlu verifikasi bukti/nominal` : ''}`;
    }

    // Render table
    if (!tbody) return;
    if (opData.mayarWithdrawalsError) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;">${escapeHtml(opData.mayarWithdrawalsError)}</td></tr>`;
      if (statusSubtextEl) statusSubtextEl.textContent = 'Status pencairan belum terverifikasi.';
      return;
    }
    if (!opData.mayarWithdrawals || opData.mayarWithdrawals.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 24px; color: var(--ink-secondary);">
            Belum ada catatan pencairan Mayar. Jika sudah melakukan penarikan tanggal 25 di Dashboard Mayar, klik tombol "Catat Pencairan Mayar".
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = opData.mayarWithdrawals.map(w => {
      const gross = parseFloat(w.gross_amount) || 0;
      const fee = w.fee_amount == null ? 2775 : Number(w.fee_amount);
      const net = w.net_amount == null ? gross - fee : Number(w.net_amount);
      const statusBadge = getMayarStatusBadge(w.status) + (w.status === 'success' && !confirmedMayarWithdrawal(w) ? '<div>Belum terverifikasi</div>' : '');
      const ref = w.transaction_reference ? escapeHtml(w.transaction_reference) : '-';
      const notes = w.notes ? escapeHtml(w.notes) : '';

      return `
        <tr>
          <td style="font-weight: 700; color: var(--ink);">
            ${formatIndoDate(w.scheduled_date)}
            ${notes ? `<div style="font-size: 11px; font-weight: normal; color: var(--ink-secondary);">${notes}</div>` : ''}
          </td>
          <td style="text-align: right; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums;">
            ${formatRupiah(gross)}
          </td>
          <td style="text-align: right; color: var(--balance-red); font-variant-numeric: tabular-nums;">
            -${formatRupiah(fee)}
          </td>
          <td style="text-align: right; font-weight: 800; color: #10B981; font-variant-numeric: tabular-nums;">
            ${formatRupiah(net)}
          </td>
          <td style="text-align: center;">
            ${statusBadge}
          </td>
          <td style="font-family: monospace; font-size: 12px; color: var(--ink);">
            ${ref}
          </td>
          <td style="text-align: center;">
            <button class="btn-outline btn-update-mayar-status" data-id="${escapeHtml(w.id)}" data-date="${escapeHtml(w.scheduled_date)}" data-net="${net}" data-status="${escapeHtml(w.status)}" data-ref="${escapeHtml(w.transaction_reference || '')}" style="height: 30px; padding: 0 10px; font-size: 11px; font-weight: 700; border-radius: 8px;">
              Ubah Status
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach listeners to Ubah Status buttons
    tbody.querySelectorAll('.btn-update-mayar-status').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const date = btn.getAttribute('data-date');
        const net = parseFloat(btn.getAttribute('data-net')) || 0;
        const currentStatus = btn.getAttribute('data-status');
        const currentRef = btn.getAttribute('data-ref') || '';

        const idInput = document.getElementById('update-mayar-id');
        const dateLabel = document.getElementById('update-mayar-date-label');
        const netLabel = document.getElementById('update-mayar-net-label');
        const statusSelect = document.getElementById('update-mayar-status-select');
        const refInput = document.getElementById('update-mayar-ref');

        if (idInput) idInput.value = id;
        if (dateLabel) dateLabel.textContent = formatIndoDate(date);
        if (netLabel) netLabel.textContent = formatRupiah(net);
        if (statusSelect) statusSelect.value = currentStatus;
        if (refInput) refInput.value = currentRef;

        openModal('modal-update-mayar-status');
      });
    });
  }

  function getMayarStatusBadge(status) {
    switch (status) {
      case 'success':
        return '<span class="status-badge" style="background: #E6F8F0; color: #10B981; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 6px;">Success</span>';
      case 'processing':
        return '<span class="status-badge" style="background: #E8EDF8; color: #3158A8; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 6px;">Processing</span>';
      case 'failed':
        return '<span class="status-badge" style="background: #FEE2E2; color: #EF4444; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 6px;">Failed</span>';
      case 'cancelled':
        return '<span class="status-badge" style="background: #F3F4F6; color: #6B7280; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 6px;">Cancelled</span>';
      case 'pending':
      default:
        return '<span class="status-badge" style="background: #FEF3C7; color: #B45309; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 6px;">Pending</span>';
    }
  }

  function formatIndoDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        return `${d} ${months[m]} ${y}`;
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  }

  async function recordMayarWithdrawal(scheduledDate, grossAmount, refNumber, initialStatus, notes) {
    const fee = 2775;
    if (!Number.isSafeInteger(grossAmount) || grossAmount <= fee) {
      alert('Nominal bruto penarikan wajib lebih besar daripada biaya penarikan Rp2.775.');
      return false;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])-25$/.test(scheduledDate) || !Number.isFinite(Date.parse(scheduledDate))
      || !['pending', 'processing', 'success', 'failed', 'cancelled'].includes(initialStatus)) {
      alert('Pilih jadwal tanggal 25 dan status transaksi yang valid.');
      return false;
    }
    if (opData.mayarWithdrawalsError) {
      alert('Muat ulang data pencairan sebelum mencatat transaksi agar tidak terjadi duplikasi.');
      return false;
    }
    if (initialStatus === 'success' && !confirm('Sudah memeriksa transaksi Mayar dan memastikan dana bersih benar-benar masuk ke rekening? Sertakan referensi transaksi jika tersedia.')) {
      alert('Status berhasil memerlukan konfirmasi penerimaan dana.');
      return false;
    }

    const existing = (opData.mayarWithdrawals || []).find(
      w => w.scheduled_date === scheduledDate && !['cancelled', 'failed'].includes(w.status)
    );
    if (existing) {
      alert(`Sudah ada pencatatan pencairan aktif untuk tanggal ${scheduledDate} dengan status [${existing.status}]. Gunakan tombol 'Ubah Status' jika ingin memperbarui transaksinya.`);
      return false;
    }

    try {
      const supabase = await getSupabase();
      const currentAdmin = (typeof state !== 'undefined' && state.admin) ? state.admin : {};

      if (!currentAdmin.id) throw new Error('Sesi admin belum tersedia. Muat ulang lalu coba lagi.');
      const { data, error } = await supabase
        .from('mayar_monthly_withdrawals')
        .insert([{
          scheduled_date: scheduledDate,
          gross_amount: grossAmount,
          fee_amount: fee,
          status: initialStatus || 'pending',
          transaction_reference: refNumber || null,
          notes: notes || null,
          recorded_by: currentAdmin.id || null,
          ...(initialStatus === 'success' ? { confirmed_by: currentAdmin.id, confirmed_at: new Date().toISOString() } : {})
        }])
        .select()
        .single();

      if (error) throw error;

      alert(`Pencatatan penarikan Mayar tanggal ${scheduledDate} disimpan dengan status [${initialStatus}]. Nominal bersih transaksi: ${formatRupiah(grossAmount - fee)}.`);
      closeModal('modal-record-mayar-withdraw');
      await fetchOperationalData();
      renderAll();
      return true;
    } catch (err) {
      alert('Gagal mencatat penarikan Mayar: ' + err.message);
      return false;
    }
  }

  async function updateMayarWithdrawalStatus(withdrawalId, newStatus, refNumber) {
    if (!withdrawalId) return false;
    if (!['pending', 'processing', 'success', 'failed', 'cancelled'].includes(newStatus)) return false;
    if (newStatus === 'success' && !confirm('Sudah memeriksa transaksi Mayar dan memastikan dana bersih benar-benar masuk ke rekening? Sertakan referensi transaksi jika tersedia.')) {
      alert('Status berhasil memerlukan konfirmasi penerimaan dana.');
      return false;
    }
    try {
      const supabase = await getSupabase();
      const currentAdmin = (typeof state !== 'undefined' && state.admin) ? state.admin : {};

      if (!currentAdmin.id) throw new Error('Sesi admin belum tersedia. Muat ulang lalu coba lagi.');
      const updatePayload = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };
      if (refNumber) updatePayload.transaction_reference = refNumber;
      if (newStatus === 'success') {
        updatePayload.confirmed_by = currentAdmin.id || null;
        updatePayload.confirmed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('mayar_monthly_withdrawals')
        .update(updatePayload)
        .eq('id', withdrawalId)
        .select('id')
        .single();

      if (error) throw error;

      alert(`Status pencairan Mayar berhasil diperbarui menjadi [${newStatus}].`);
      closeModal('modal-update-mayar-status');
      await fetchOperationalData();
      renderAll();
      return true;
    } catch (err) {
      alert('Gagal memperbarui status pencairan Mayar: ' + err.message);
      return false;
    }
  }

  function setupEventListeners() {

    // Mayar Monthly Withdrawal Actions & Form Listeners
    const btnRecordMayar = document.getElementById('btn-record-mayar-withdraw');
    if (btnRecordMayar) {
      btnRecordMayar.addEventListener('click', () => {
        const dateInput = document.getElementById('mayar-withdraw-date');
        if (dateInput) dateInput.value = mayarScheduleDate();
        updateMayarCalc();
        openModal('modal-record-mayar-withdraw');
      });
    }

    const mayarGrossInput = document.getElementById('mayar-withdraw-gross');
    const mayarCalcGrossEl = document.getElementById('mayar-calc-gross');
    const mayarCalcNetEl = document.getElementById('mayar-calc-net');

    function updateMayarCalc() {
      const gross = parseFloat(mayarGrossInput?.value) || 0;
      const fee = 2775;
      const net = Math.max(0, gross - fee);

      if (mayarCalcGrossEl) mayarCalcGrossEl.textContent = formatRupiah(gross);
      if (mayarCalcNetEl) {
        mayarCalcNetEl.textContent = gross > fee ? formatRupiah(net) : 'Rp0 (Bruto < Biaya)';
        mayarCalcNetEl.style.color = gross > fee ? '#10B981' : '#EF4444';
      }
    }

    if (mayarGrossInput) {
      mayarGrossInput.addEventListener('input', updateMayarCalc);
    }

    const formRecordMayar = document.getElementById('form-record-mayar-withdraw');
    if (formRecordMayar) {
      formRecordMayar.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('mayar-withdraw-date').value;
        const gross = parseFloat(document.getElementById('mayar-withdraw-gross').value) || 0;
        const ref = document.getElementById('mayar-withdraw-ref').value.trim();
        const status = document.getElementById('mayar-withdraw-status-select').value;
        const notes = document.getElementById('mayar-withdraw-notes').value.trim();

        if (!date) {
          alert('Tanggal jadwal penarikan wajib diisi.');
          return;
        }

        if (gross <= 2775) {
          alert('Nominal bruto penarikan wajib lebih besar dari biaya penarikan Rp2.775.');
          return;
        }

        const button = document.getElementById('btn-submit-mayar-withdraw');
        if (button.disabled) return;
        button.disabled = true;
        try { await recordMayarWithdrawal(date, gross, ref, status, notes); }
        finally { button.disabled = false; }
      });
    }

    const formUpdateMayar = document.getElementById('form-update-mayar-status');
    if (formUpdateMayar) {
      formUpdateMayar.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('update-mayar-id').value;
        const status = document.getElementById('update-mayar-status-select').value;
        const ref = document.getElementById('update-mayar-ref').value.trim();

        const button = document.getElementById('btn-submit-update-mayar-status');
        if (button.disabled) return;
        button.disabled = true;
        try { await updateMayarWithdrawalStatus(id, status, ref); }
        finally { button.disabled = false; }
      });
    }

    // Action Buttons
    const btnExpense = document.getElementById('btn-add-expense');
    if (btnExpense) {
      btnExpense.addEventListener('click', () => {
        populateExpenseCategorySelect();
        openModal('modal-add-expense');
      });
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

    const btnResellerQuick = document.getElementById('btn-add-reseller-quick');
    if (btnResellerQuick) {
      btnResellerQuick.addEventListener('click', () => {
        const panel = document.getElementById('op-reseller-panel');
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    const btnResellerAddStock = document.getElementById('btn-reseller-add-stock');
    if (btnResellerAddStock) {
      btnResellerAddStock.addEventListener('click', () => {
        const info = document.getElementById('reseller-purchase-available-info');
        if (info) {
          info.textContent = `Sisa modal kas reseller tersedia: ${formatRupiah(opData.resellerSummary.capital_remaining)}`;
        }
        const calcEl = document.getElementById('reseller-buy-total-calc');
        const qtyIn = document.getElementById('reseller-buy-qty-input');
        const costIn = document.getElementById('reseller-buy-cost-input');
        if (calcEl && qtyIn && costIn) {
          const q = parseInt(qtyIn.value, 10) || 1;
          const c = parseFloat(costIn.value) || 0;
          calcEl.textContent = formatRupiah(q * c);
        }
        openModal('modal-add-reseller-purchase');
      });
    }

    const btnResellerAddSale = document.getElementById('btn-reseller-add-sale');
    if (btnResellerAddSale) {
      btnResellerAddSale.addEventListener('click', () => {
        openResellerSaleModal();
      });
    }

    // Reseller Subsystem Tabs
    const btnResellerTabInv = document.getElementById('op-reseller-tab-inventory');
    if (btnResellerTabInv) {
      btnResellerTabInv.addEventListener('click', () => {
        opData.activeResellerTab = 'inventory';
        renderResellerSubsystem();
      });
    }

    const btnResellerTabHist = document.getElementById('op-reseller-tab-history');
    if (btnResellerTabHist) {
      btnResellerTabHist.addEventListener('click', () => {
        opData.activeResellerTab = 'history';
        renderResellerSubsystem();
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

    // Reseller Purchase Form & Input Watchers
    const formResellerBuy = document.getElementById('form-add-reseller-purchase');
    const buyQtyInput = document.getElementById('reseller-buy-qty-input');
    const buyCostInput = document.getElementById('reseller-buy-cost-input');
    const buyCalcEl = document.getElementById('reseller-buy-total-calc');

    function updateBuyCalc() {
      if (!buyCalcEl) return;
      const q = parseInt(buyQtyInput?.value, 10) || 0;
      const c = parseFloat(buyCostInput?.value) || 0;
      buyCalcEl.textContent = formatRupiah(q * c);
    }

    if (buyQtyInput) buyQtyInput.addEventListener('input', updateBuyCalc);
    if (buyCostInput) buyCostInput.addEventListener('input', updateBuyCalc);

    if (formResellerBuy) {
      formResellerBuy.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reseller-buy-name-input').value.trim();
        const cat = document.getElementById('reseller-buy-category-input').value.trim();
        const qty = parseInt(buyQtyInput.value, 10) || 0;
        const cost = parseFloat(buyCostInput.value) || 0;
        const notes = document.getElementById('reseller-buy-notes-input').value.trim();

        if (!name) {
          alert('Nama produk digital wajib diisi.');
          return;
        }
        await recordResellerPurchase(name, cat, qty, cost, notes);
      });
    }

    // Reseller Sale Form & Input Watchers
    const formResellerSale = document.getElementById('form-add-reseller-sale');
    const saleSelect = document.getElementById('reseller-sale-product-select');
    const saleQtyInput = document.getElementById('reseller-sale-qty-input');
    const salePriceInput = document.getElementById('reseller-sale-price-input');
    const saleFeeInput = document.getElementById('reseller-sale-fee-input');

    if (saleSelect) {
      saleSelect.addEventListener('change', () => {
        const opt = saleSelect.selectedOptions[0];
        if (opt && salePriceInput) {
          const defaultPrice = opt.getAttribute('data-default-price');
          if (defaultPrice) salePriceInput.value = Math.round(parseFloat(defaultPrice));
        }
        recalcResellerSalePreview();
      });
    }
    if (saleQtyInput) saleQtyInput.addEventListener('input', recalcResellerSalePreview);
    if (salePriceInput) salePriceInput.addEventListener('input', recalcResellerSalePreview);
    if (saleFeeInput) saleFeeInput.addEventListener('input', recalcResellerSalePreview);

    if (formResellerSale) {
      formResellerSale.addEventListener('submit', async (e) => {
        e.preventDefault();
        const invId = saleSelect.value;
        const qty = parseInt(saleQtyInput.value, 10) || 0;
        const price = parseFloat(salePriceInput.value) || 0;
        const fee = parseFloat(saleFeeInput.value) || 0;
        const buyer = document.getElementById('reseller-sale-buyer-input').value.trim();
        const notes = document.getElementById('reseller-sale-notes-input').value.trim();

        if (!invId) {
          alert('Pilih produk digital dari persediaan.');
          return;
        }
        await recordResellerSale(invId, qty, price, fee, buyer, notes);
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'operational_reseller_inventory' }, handleRealtimeChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'operational_reseller_transactions' }, handleRealtimeChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handleRealtimeChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mayar_monthly_withdrawals' }, handleRealtimeChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'business_bookkeeping_records' }, handleRealtimeChange)
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

  function allocationConfirmed() {
    if (!opData.allocationError) return true;
    alert(opData.allocationError);
    return false;
  }

  function renderBookkeepingReferences() {
    for (const [id, category] of [
      ['op-bookkeeping-business-capital', 'capital_injection'],
      ['op-bookkeeping-personal-capital', 'order_cogs_liability'],
      ['op-bookkeeping-profit', 'order_profit_allocation'],
      ['op-bookkeeping-sales', 'reported_sales_reconciliation']
    ]) {
      const element = document.getElementById(id);
      const records = opData.bookkeepingRecords.filter(row => row.category === category);
      if (element) element.textContent = records.length === 1 && Number.isFinite(Number(records[0].net_amount))
        ? Number(records[0].net_amount).toLocaleString('id-ID') : '-';
    }
  }

  function renderAll() {
    renderBookkeepingReferences();
    renderMayarMonthlyWithdrawals();
    renderMonthlyCashFlowSummary();
    setupCashFlowFilterListeners();
    renderDomainCard();
    renderDonutChart();
    renderComparisonBars();
    renderPromoSubsystem();
    renderBonusSubsystem();
    renderResellerSubsystem();
    renderHistoryTables();
    for (const id of ['btn-add-expense', 'btn-add-promo-subsidy', 'btn-add-team-bonus', 'btn-add-reseller-quick', 'btn-reseller-add-stock']) {
      const button = document.getElementById(id);
      if (button) { button.disabled = Boolean(opData.allocationError); button.title = opData.allocationError; }
    }
    const domainButton = document.getElementById('btn-pay-domain');
    if (domainButton && opData.allocationError) { domainButton.disabled = true; domainButton.title = opData.allocationError; }
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
    },
    calculateAllocation: function (totalAmount, count = 5) {
      return calculateDeterministicAllocation(totalAmount, count);
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

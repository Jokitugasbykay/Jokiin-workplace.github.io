BEGIN;
DO $test$
DECLARE amount integer; inflow numeric; s record; distributed numeric; smallest numeric; biggest numeric; i integer;
BEGIN
 SELECT total_inflow INTO inflow FROM public.operational_fund_summary;
 INSERT INTO public.operational_settings(key,value) VALUES('allocation_reconciliation_status','verified')
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 FOREACH amount IN ARRAY ARRAY[0,1,2,4,5,24196,63600,100003] LOOP
  UPDATE public.operational_settings SET value=(amount+22000-inflow)::text WHERE key='initial_fund';
  SELECT * INTO s FROM public.operational_fund_summary;
  SELECT sum(remaining_amount),min(remaining_amount),max(remaining_amount),count(*)
  INTO distributed,smallest,biggest,i FROM public.operational_budgets_status WHERE NOT is_fixed_obligation;
  ASSERT s.allocation_basis=amount, 'Pool must exclude domain reserve';
  ASSERT distributed=amount AND i=5, 'Five shares must sum exactly to pool';
  ASSERT biggest-smallest<=1, 'Rupiah rounding must differ by at most one';
  ASSERT s.total_spent=0, 'Unpaid domain cannot become an expense';
 END LOOP;
 UPDATE public.operational_settings SET value=(100003-inflow)::text WHERE key='initial_fund';
 INSERT INTO public.operational_expenses(expense_code,category_id,amount,description,admin_name)
 VALUES('TEST-ALLOCATION-ROLLBACK-DOMAIN','domain',22000,'Rollback-only domain payment test','TEST ROLLBACK');
 SELECT * INTO s FROM public.operational_fund_summary;
 ASSERT s.current_balance=78003 AND s.allocation_basis=78003 AND s.domain_reserved=0 AND s.domain_status='paid', 'Domain payment must be deducted exactly once';
 INSERT INTO public.operational_expenses(expense_code,category_id,amount,description,admin_name)
 VALUES('TEST-ALLOCATION-ROLLBACK-PROMO','promo',10003,'Rollback-only expense test','TEST ROLLBACK');
 SELECT * INTO s FROM public.operational_fund_summary;
 ASSERT s.current_balance=68000 AND s.allocation_basis=68000 AND s.total_spent=32003, 'Expenses reduce pool once';
 SELECT sum(remaining_amount) INTO distributed FROM public.operational_budgets_status WHERE NOT is_fixed_obligation;
 ASSERT distributed=68000, 'Live category shares follow changed balance';
 UPDATE public.operational_settings SET value='pending' WHERE key='allocation_reconciliation_status';
 SELECT * INTO s FROM public.operational_fund_summary;
 ASSERT NOT s.allocation_ready AND s.allocation_basis=0, 'Unconfirmed pool must not be allocated';
 SELECT sum(remaining_amount) INTO distributed FROM public.operational_budgets_status WHERE NOT is_fixed_obligation;
 ASSERT distributed=0, 'Pending categories have no spendable allocation';
END $test$;
ROLLBACK;
SELECT 'PASS: five-way 20% allocation, rupiah remainder, changing balance, pending reconciliation, domain not spent until payment and deducted once; all fixture writes rolled back' AS result;

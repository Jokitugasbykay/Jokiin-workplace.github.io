-- User instruction: allocate cash less the active domain reserve across five 20% categories.
-- Budget approval does not mark bank reconciliation verified or authorize a payment.
-- User-confirmed rule (26 October 2026): business cash = business funding + net profit.
-- This changes a projection only: no new receipt, withdrawal, expense or balance adjustment.
CREATE OR REPLACE VIEW public.operational_fund_summary WITH (security_invoker=true) AS
WITH refs AS (
 SELECT CASE WHEN count(*) FILTER(WHERE category='capital_injection')=1
  AND count(*) FILTER(WHERE category='capital_injection' AND status='verified')=1
  THEN max(net_amount) FILTER(WHERE category='capital_injection') END::numeric AS business_capital,
 CASE WHEN count(*) FILTER(WHERE category='order_profit_allocation')=1
  AND count(*) FILTER(WHERE category='order_profit_allocation' AND status='verified')=1
  THEN max(net_amount) FILTER(WHERE category='order_profit_allocation') END::numeric AS business_net_profit
 FROM public.business_bookkeeping_records
), ledger AS (
 SELECT refs.*,
 coalesce((select nullif(value,'')::numeric from public.operational_settings where key='initial_fund'),0) AS initial_fund,
 coalesce((select sum(allocation_amount) from public.operational_inflows where status='completed' AND NOT is_refunded),0) AS internal_development_allocation,
 coalesce((select sum(amount) from public.operational_expenses),0) AS total_spent,
 coalesce((select sum(amount) from public.operational_expenses where category_id='domain'),0) AS domain_spent
 FROM refs
), cash AS (
 SELECT *,business_capital+business_net_profit AS total_fund,
 business_capital+business_net_profit-total_spent AS current_balance,
 CASE WHEN private.domain_payment_confirmed() THEN 0 ELSE 22000 END::numeric AS domain_reserved
 FROM ledger
), ready AS (
 SELECT *,(current_balance IS NOT NULL AND current_balance::text NOT IN ('NaN','Infinity','-Infinity') AND current_balance=trunc(current_balance) AND abs(current_balance)<=9007199254740991 AND coalesce((SELECT array_agg(id ORDER BY id) FROM public.operational_budgets)=ARRAY['ai_tools','bonus','domain','emergency','promo','reseller']::text[],false)) AS user_allocation_ready FROM cash
)
SELECT initial_fund,total_fund AS total_inflow,total_spent,current_balance,total_fund,
 (CASE WHEN user_allocation_ready THEN floor(greatest(0,current_balance-domain_reserved)) ELSE 0 END+total_spent-domain_spent)::numeric AS total_allocated,
 22000::numeric AS domain_obligation,
 CASE WHEN private.domain_payment_confirmed() THEN 'paid' ELSE 'unpaid' END::text AS domain_status,
 '2027-09-12'::date AS domain_due_date,
 user_allocation_ready AS allocation_ready,
 CASE WHEN user_allocation_ready THEN floor(greatest(0,current_balance-domain_reserved)) ELSE 0 END::numeric AS allocation_basis,domain_reserved,
 'pending'::text AS reconciliation_status,3::integer AS allocation_guard_version,
 domain_reserved::numeric AS total_active_reserves,
 (current_balance-domain_reserved)::numeric AS book_free_cash_balance,
 current_balance::numeric AS actual_cash_balance,false AS actual_cash_verified,
 (current_balance-domain_reserved)::numeric AS free_cash_balance,
 private.domain_payment_confirmed() AS domain_payment_confirmed,true AS domain_confirmation_available,
 business_capital,business_net_profit,internal_development_allocation,
 'user_confirmed_formula'::text AS actual_cash_status,
 'user_confirmed_formula'::text AS allocation_approval_source,false AS spending_ready
FROM ready;

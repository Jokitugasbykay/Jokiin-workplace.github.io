-- Read-only projections; existing transactions, budget rows, triggers and policies stay intact.
CREATE OR REPLACE VIEW public.operational_fund_summary AS
WITH ledger AS (
 SELECT coalesce((select nullif(value,'')::numeric from public.operational_settings where key='initial_fund'),0) AS initial_fund,
 coalesce((select sum(allocation_amount) from public.operational_inflows where status='completed' AND NOT is_refunded),0) AS total_inflow,
 coalesce((select sum(amount) from public.operational_expenses),0) AS total_spent,
 coalesce((select sum(amount) from public.operational_expenses where category_id='domain'),0) AS domain_spent,
 -- Fail closed: legacy settings are publicly writable. Enable only through a reviewed, protected evidence mechanism.
 false AS allocation_ready
), cash AS (
 SELECT *, initial_fund+total_inflow AS total_fund,
 initial_fund+total_inflow-total_spent AS current_balance,
 greatest(0,22000-domain_spent) AS domain_reserved FROM ledger
), pool AS (
 SELECT *, CASE WHEN allocation_ready THEN floor(greatest(0,current_balance-domain_reserved)) ELSE 0 END AS allocation_basis FROM cash
)
SELECT initial_fund,total_inflow,total_spent,current_balance,total_fund,
 (allocation_basis+total_spent-domain_spent)::numeric AS total_allocated,
 22000::numeric AS domain_obligation,
 CASE WHEN domain_spent>=22000 THEN 'paid' ELSE 'unpaid' END::text AS domain_status,
 '2027-09-12'::date AS domain_due_date,
 allocation_ready, allocation_basis, domain_reserved,
 CASE WHEN allocation_ready THEN 'verified' ELSE 'pending' END::text AS reconciliation_status,
 1::integer AS allocation_guard_version
FROM pool;

-- Use the same live pool for every category, never the unsupported seed budget amounts.
CREATE OR REPLACE VIEW public.operational_budgets_status AS
WITH spent AS (
 SELECT category_id,coalesce(sum(amount),0) AS amount FROM public.operational_expenses GROUP BY category_id
), shares AS (
 SELECT id,row_number() over(order by id) AS position FROM public.operational_budgets
 WHERE id IN ('reseller','emergency','bonus','promo','ai_tools')
), calculated AS (
 SELECT b.*,coalesce(e.amount,0) AS actual_spent,
 CASE WHEN b.id='domain' THEN greatest(0,22000-coalesce(e.amount,0))
 WHEN r.id IS NOT NULL AND (select count(*) from shares)=5
 AND (select count(*) from public.operational_budgets)=6
 AND NOT EXISTS(select 1 from public.operational_budgets where id NOT IN ('domain','reseller','emergency','bonus','promo','ai_tools')) THEN
 floor(s.allocation_basis/5)+CASE WHEN r.position<=mod(s.allocation_basis,5) THEN 1 ELSE 0 END
 ELSE 0 END AS available
 FROM public.operational_budgets b LEFT JOIN spent e ON e.category_id=b.id
 LEFT JOIN shares r ON r.id=b.id CROSS JOIN public.operational_fund_summary s
)
SELECT id,name,
 CASE WHEN id='domain' THEN 22000 ELSE actual_spent+available END::numeric(14,2) AS allocated_amount,
 color,icon,actual_spent AS spent_amount,available AS remaining_amount,
 CASE WHEN actual_spent+available>0 THEN round(actual_spent/(actual_spent+available)*100,1) ELSE 0 END::numeric AS percent_spent,
 CASE WHEN id='domain' THEN null ELSE 20 END::numeric(5,2) AS percentage,
 (id='domain') AS is_fixed_obligation,due_date,
 CASE WHEN id='domain' THEN CASE WHEN actual_spent>=22000 THEN 'paid' ELSE 'unpaid' END ELSE payment_status END AS payment_status,
 paid_at,paid_amount
FROM calculated ORDER BY is_fixed_obligation DESC,id;

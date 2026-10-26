-- Approved by user and applied as migration 20261026075521 on 26 October 2026.
-- No existing balances, settings or transactions are updated.
BEGIN;
-- Only authorized confirmation RPCs can create these immutable payment attestations.
CREATE TABLE private.operational_domain_payments(
 due_date date PRIMARY KEY,
 amount numeric NOT NULL CHECK(amount=22000),
 payment_reference text NOT NULL UNIQUE CHECK(length(trim(payment_reference)) BETWEEN 3 AND 200),
 payment_source text NOT NULL CHECK(length(trim(payment_source)) BETWEEN 3 AND 200),
 paid_at timestamptz NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 verified_by uuid NOT NULL REFERENCES public.profiles(id),
 expense_id uuid NOT NULL UNIQUE REFERENCES public.operational_expenses(id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE private.operational_domain_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.operational_domain_payments FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.domain_payment_confirmed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM private.operational_domain_payments p JOIN public.operational_expenses e ON e.id=p.expense_id
 WHERE p.due_date='2027-09-12' AND e.category_id='domain' AND e.amount=p.amount);
$$;
REVOKE ALL ON FUNCTION private.domain_payment_confirmed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.domain_payment_confirmed() TO authenticated;
-- View projections; row data is preserved. Guards and permissions are tightened below.
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
 CASE WHEN private.domain_payment_confirmed() THEN 0 ELSE 22000 END::numeric AS domain_reserved FROM ledger
), pool AS (
 SELECT *, CASE WHEN allocation_ready THEN floor(greatest(0,current_balance-domain_reserved)) ELSE 0 END AS allocation_basis FROM cash
)
SELECT initial_fund,total_inflow,total_spent,current_balance,total_fund,
 (allocation_basis+total_spent-domain_spent)::numeric AS total_allocated,
 22000::numeric AS domain_obligation,
 CASE WHEN private.domain_payment_confirmed() THEN 'paid' ELSE 'unpaid' END::text AS domain_status,
 '2027-09-12'::date AS domain_due_date,
 allocation_ready, allocation_basis, domain_reserved,
 CASE WHEN allocation_ready THEN 'verified' ELSE 'pending' END::text AS reconciliation_status,
 2::integer AS allocation_guard_version,
 domain_reserved::numeric AS total_active_reserves,
 (current_balance-domain_reserved)::numeric AS book_free_cash_balance,
 null::numeric AS actual_cash_balance, false AS actual_cash_verified, null::numeric AS free_cash_balance,
 private.domain_payment_confirmed() AS domain_payment_confirmed, true AS domain_confirmation_available
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
 CASE WHEN b.id='domain' THEN s.domain_reserved
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
 CASE WHEN id='domain' THEN CASE WHEN private.domain_payment_confirmed() THEN 'paid' ELSE 'unpaid' END ELSE payment_status END AS payment_status,
 paid_at,paid_amount
FROM calculated ORDER BY is_fixed_obligation DESC,id;

-- Central guards cover the inspected legacy RPCs, including reseller's direct INSERT.
CREATE OR REPLACE FUNCTION private.operational_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND workplace_role IN ('founder','supervisor'));
$$;
REVOKE ALL ON FUNCTION private.operational_staff() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.operational_staff() TO authenticated;

CREATE OR REPLACE FUNCTION private.lock_operational_ledger() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 -- ponytail: one business ledger; a single transaction lock serializes its writers.
 PERFORM pg_catalog.pg_advisory_xact_lock(726014,1);
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'Operational ledger requires read committed isolation';
 END IF;
 RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION private.lock_operational_ledger() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.guard_operational_expense() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s record; category record; pool numeric; expected numeric; i integer;
BEGIN
 IF NOT private.operational_staff() THEN RAISE EXCEPTION 'Finance staff authorization required' USING ERRCODE='42501'; END IF;
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Expense history is immutable; use a reviewed adjustment'; END IF;
 IF NEW.amount IS NULL OR NEW.amount::text IN ('NaN','Infinity','-Infinity') OR NEW.amount<=0
    OR NEW.amount<>trunc(NEW.amount) OR NEW.amount>9007199254740991 THEN
  RAISE EXCEPTION 'Expense amount must be positive integer rupiah';
 END IF;
 IF NEW.category_id='domain' THEN
  IF NOT EXISTS(SELECT 1 FROM private.operational_domain_payments p WHERE p.due_date='2027-09-12'
    AND p.expense_id=NEW.id AND p.amount=NEW.amount AND p.verified_by=auth.uid()) THEN
   RAISE EXCEPTION 'Domain payment requires protected payment evidence; click-only recording is disabled';
  END IF;
  NEW.admin_id:=auth.uid();
  SELECT name INTO NEW.admin_name FROM public.profiles WHERE id=auth.uid();
  RETURN NEW;
 END IF;
 IF NEW.category_id NOT IN ('domain','ai_tools','bonus','emergency','promo','reseller') THEN RAISE EXCEPTION 'Invalid expense category'; END IF;
 SELECT * INTO s FROM public.operational_fund_summary;
 IF s.allocation_ready IS DISTINCT FROM true OR s.reconciliation_status<>'verified' THEN
  RAISE EXCEPTION 'Allocation blocked pending protected reconciliation evidence';
 END IF;
 IF NEW.amount>s.current_balance THEN RAISE EXCEPTION 'Insufficient book balance'; END IF;
 IF (SELECT array_agg(id ORDER BY id) FROM public.operational_budgets_status)
    IS DISTINCT FROM ARRAY['ai_tools','bonus','domain','emergency','promo','reseller']::text[] THEN
  RAISE EXCEPTION 'Exactly five configured allocation categories and domain are required';
 END IF;
 pool:=floor(greatest(0,s.current_balance-s.total_active_reserves));
 IF s.allocation_basis IS DISTINCT FROM pool THEN RAISE EXCEPTION 'Allocation pool mismatch'; END IF;
 i:=0;
 FOR category IN SELECT * FROM public.operational_budgets_status WHERE id<>'domain' ORDER BY id LOOP
  i:=i+1;
  expected:=floor(pool/5)+CASE WHEN i<=mod(pool,5) THEN 1 ELSE 0 END;
  IF category.is_fixed_obligation OR category.percentage IS DISTINCT FROM 20::numeric
     OR category.remaining_amount IS DISTINCT FROM expected
     OR category.allocated_amount IS DISTINCT FROM category.spent_amount+expected THEN
   RAISE EXCEPTION 'Invalid category allocation';
  END IF;
 END LOOP;
 SELECT * INTO category FROM public.operational_budgets_status WHERE id=NEW.category_id;
 IF NEW.amount>category.remaining_amount OR (NEW.category_id<>'domain' AND NEW.amount>pool) THEN
  RAISE EXCEPTION 'Insufficient category budget';
 END IF;
 IF NEW.category_id='bonus' AND NEW.notes LIKE 'Kode Bonus:%'
    AND EXISTS(SELECT 1 FROM public.operational_expenses WHERE category_id='bonus' AND notes=NEW.notes) THEN
  RAISE EXCEPTION 'Bonus payment already recorded';
 END IF;
 NEW.admin_id:=auth.uid();
 SELECT name INTO NEW.admin_name FROM public.profiles WHERE id=auth.uid();
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.guard_operational_expense() FROM PUBLIC,anon,authenticated;

DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['operational_expenses','operational_inflows','operational_settings','operational_budgets'] LOOP
  EXECUTE format('CREATE TRIGGER operational_ledger_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION private.lock_operational_ledger()',name);
 END LOOP;
END; $$;
CREATE TRIGGER operational_expense_guard BEFORE INSERT OR UPDATE OR DELETE ON public.operational_expenses
FOR EACH ROW EXECUTE FUNCTION private.guard_operational_expense();

CREATE OR REPLACE FUNCTION private.guard_operational_staff_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.operational_staff() THEN RAISE EXCEPTION 'Finance staff authorization required' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.guard_operational_staff_write() FROM PUBLIC,anon,authenticated;
DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['operational_team_bonuses','operational_promo_subsidies','operational_reseller_inventory','operational_reseller_transactions'] LOOP
  EXECUTE format('CREATE TRIGGER operational_staff_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.guard_operational_staff_write()',name);
 END LOOP;
END; $$;

-- Existing permissive policies are retained; restrictive policies prevent their true predicates granting public access.
DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['operational_expenses','operational_inflows','operational_settings','operational_budgets','operational_team_bonuses','operational_promo_subsidies','operational_reseller_inventory','operational_reseller_transactions'] LOOP
  EXECUTE format('CREATE POLICY operational_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (private.operational_staff()) WITH CHECK (private.operational_staff())',name);
 END LOOP;
END; $$;
ALTER VIEW public.operational_fund_summary SET (security_invoker=true);
ALTER VIEW public.operational_budgets_status SET (security_invoker=true);
REVOKE ALL ON public.operational_fund_summary,public.operational_budgets_status FROM PUBLIC,anon;
GRANT SELECT ON public.operational_fund_summary,public.operational_budgets_status TO authenticated;

-- Keep old RPC signatures for compatibility, but remove anonymous execution from all inspected spending entry points.
REVOKE EXECUTE ON FUNCTION public.record_operational_expense(text,numeric,text,text,text,uuid,text),
 public.record_reseller_purchase(text,integer,numeric,text,text,text), public.pay_domain_obligation(text,text),
 public.record_promo_subsidy(text,numeric,text,text), public.create_team_bonus(uuid,numeric,text,text),
 public.confirm_and_pay_team_bonus(uuid,text) FROM PUBLIC,anon;

CREATE OR REPLACE FUNCTION public.workplace_record_operational_expense(
 p_category_id text,p_amount numeric,p_description text,p_recipient text,p_notes text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.operational_expenses; result public.operational_expenses;
BEGIN
 IF NOT private.operational_staff() THEN RAISE EXCEPTION 'Finance staff authorization required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request ID required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(726014,1);
 SELECT * INTO existing FROM public.operational_expenses WHERE expense_code='EXP-REQ-'||p_request_id::text;
 IF FOUND THEN
  IF existing.admin_id IS DISTINCT FROM auth.uid() OR existing.category_id IS DISTINCT FROM p_category_id
     OR existing.amount IS DISTINCT FROM p_amount OR existing.description IS DISTINCT FROM p_description
     OR existing.recipient IS DISTINCT FROM p_recipient OR existing.notes IS DISTINCT FROM p_notes THEN
   RAISE EXCEPTION 'Request ID reused with a different payload';
  END IF;
  RETURN to_jsonb(existing);
 END IF;
 INSERT INTO public.operational_expenses(expense_code,category_id,amount,description,recipient,notes,admin_id,admin_name)
 VALUES('EXP-REQ-'||p_request_id::text,p_category_id,p_amount,p_description,p_recipient,p_notes,auth.uid(),'') RETURNING * INTO result;
 RETURN to_jsonb(result);
END; $$;
REVOKE ALL ON FUNCTION public.workplace_record_operational_expense(text,numeric,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workplace_record_operational_expense(text,numeric,text,text,text,uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.pay_domain_obligation(text,text) FROM authenticated;

-- Records an ALREADY PAID transaction attested by authorized staff; this RPC does not transfer funds.
CREATE FUNCTION public.workplace_confirm_domain_payment(p_reference text,p_source text,p_paid_at timestamptz,p_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recorded private.operational_domain_payments; new_expense uuid:=gen_random_uuid();
BEGIN
 IF NOT private.operational_staff() THEN RAISE EXCEPTION 'Finance staff authorization required' USING ERRCODE='42501'; END IF;
 IF p_confirmed IS DISTINCT FROM true OR p_reference IS NULL OR length(trim(p_reference)) NOT BETWEEN 3 AND 200
  OR p_source IS NULL OR length(trim(p_source)) NOT BETWEEN 3 AND 200 OR p_paid_at IS NULL OR NOT isfinite(p_paid_at) OR p_paid_at>now() THEN
  RAISE EXCEPTION 'Successful payment evidence, source, date and explicit verification are required';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(726014,1);
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Operational ledger requires read committed isolation'; END IF;
 SELECT * INTO recorded FROM private.operational_domain_payments WHERE due_date='2027-09-12';
 IF FOUND THEN
  IF recorded.payment_reference IS DISTINCT FROM trim(p_reference) OR recorded.payment_source IS DISTINCT FROM trim(p_source)
   OR recorded.paid_at IS DISTINCT FROM p_paid_at THEN RAISE EXCEPTION 'Domain payment already confirmed for this due date'; END IF;
  RETURN to_jsonb(recorded);
 END IF;
 IF EXISTS(SELECT 1 FROM public.operational_expenses WHERE category_id='domain') THEN
  RAISE EXCEPTION 'Reconcile the existing domain expense before confirming; no duplicate expense created';
 END IF;
 INSERT INTO private.operational_domain_payments(due_date,amount,payment_reference,payment_source,paid_at,verified_by,expense_id)
 VALUES('2027-09-12',22000,trim(p_reference),trim(p_source),p_paid_at,auth.uid(),new_expense) RETURNING * INTO recorded;
 INSERT INTO public.operational_expenses(id,expense_code,category_id,amount,description,notes,admin_id,admin_name)
 VALUES(new_expense,'EXP-DOMAIN-20270912','domain',22000,'Pembayaran domain terkonfirmasi, jatuh tempo 12 September 2027',
 'Bukti pembayaran: '||trim(p_reference),auth.uid(),'');
 RETURN to_jsonb(recorded);
END; $$;
REVOKE ALL ON FUNCTION public.workplace_confirm_domain_payment(text,text,timestamptz,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workplace_confirm_domain_payment(text,text,timestamptz,boolean) TO authenticated;

-- No reconciliation record/flag is created here. Legacy publicly writable settings cannot authorize expenditure.
-- A separate reviewed evidence writer, protected storage and transaction revision mechanism are prerequisites to opening allocation.
COMMIT;

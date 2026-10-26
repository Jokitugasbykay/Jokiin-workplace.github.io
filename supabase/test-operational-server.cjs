// Disposable PostgreSQL/WASM only. Never connects to Supabase.
// Install outside app: npm install --prefix ../work/sql-audit --ignore-scripts @electric-sql/pglite@0.3.14
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||path.resolve(__dirname,'../../work/sql-audit/node_modules/@electric-sql/pglite'));
(async()=>{const db=new PGlite();try{
 const tables=['operational_team_bonuses','operational_promo_subsidies','operational_reseller_inventory','operational_reseller_transactions'];
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,name text,role text,workplace_role text);
 CREATE TABLE public.operational_settings(key text PRIMARY KEY,value text NOT NULL,updated_at timestamptz DEFAULT now());
 CREATE TABLE public.operational_inflows(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id bigint UNIQUE,allocation_amount numeric,status text,is_refunded boolean DEFAULT false);
 CREATE TABLE public.operational_budgets(id text PRIMARY KEY,name text,allocated_amount numeric DEFAULT 0,color text,icon text,percentage numeric,is_fixed_obligation boolean DEFAULT false,due_date date,payment_status text,paid_at timestamptz,paid_amount numeric);
 CREATE TABLE public.operational_expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),expense_code text UNIQUE NOT NULL,category_id text REFERENCES public.operational_budgets(id),amount numeric NOT NULL CHECK(amount>0),description text NOT NULL,recipient text,notes text,admin_id uuid REFERENCES public.profiles(id),admin_name text,created_at timestamptz DEFAULT now());
 INSERT INTO public.profiles VALUES ('00000000-0000-4000-8000-000000000001','Verifier','admin','founder'),('00000000-0000-4000-8000-000000000002','Other','admin','admin');
 INSERT INTO public.operational_settings(key,value) VALUES('initial_fund','100003'),('allocation_reconciliation_status','verified');
 SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
 `);
 for(const name of tables)await db.exec(`CREATE TABLE public.${name}(id uuid PRIMARY KEY DEFAULT gen_random_uuid());`);
 for(const name of [...tables,'operational_settings','operational_inflows','operational_budgets','operational_expenses'])await db.exec(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY; CREATE POLICY original_permissive ON public.${name} FOR ALL USING(true) WITH CHECK(true); GRANT ALL ON public.${name} TO anon,authenticated;`);
 const fixture=require('../test-allocation-fixture.json');
 for(const row of fixture.operational_budgets_status)await db.query('INSERT INTO public.operational_budgets(id,name,color,icon,percentage,is_fixed_obligation,due_date,payment_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[row.id,row.name,row.color,row.icon,row.percentage,row.is_fixed_obligation,row.due_date,row.payment_status]);
 // Signature placeholders only let REVOKE be tested; legacy insert behavior is tested directly below.
 for(const [name,args] of [['record_operational_expense','text,numeric,text,text,text,uuid,text'],['record_reseller_purchase','text,integer,numeric,text,text,text'],['pay_domain_obligation','text,text'],['record_promo_subsidy','text,numeric,text,text'],['create_team_bonus','uuid,numeric,text,text'],['confirm_and_pay_team_bonus','uuid,text']])await db.exec(`CREATE FUNCTION public.${name}(${args}) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;`);
 const patch=fs.readFileSync(path.join(__dirname,'migrations/20261026075521_workplace_domain_reserve_and_operational_guards_v2.sql'),'utf8');await db.exec(patch);
 const summary=async()=> (await db.query('SELECT * FROM public.operational_fund_summary')).rows[0];
 assert.equal((await summary()).allocation_ready,false,'Bare verified setting cannot open allocation');
 for(const [initial,expected] of [['100003',100003],['0',0],['-1000',-1000]]){await db.query("UPDATE public.operational_settings SET value=$1 WHERE key='initial_fund'",[initial]);const s=await summary();assert.equal(Number(s.current_balance),expected);assert.equal(Number(s.allocation_basis),0);}
 const request='00000000-0000-4000-8000-000000000010';
 const expense=(amount,key=request,category='promo',desc='isolated expense')=>db.query('SELECT public.workplace_record_operational_expense($1,$2,$3,null,null,$4)',[category,amount,desc,key]);
 await assert.rejects(expense(1),/pending protected reconciliation/);
 await assert.rejects(expense(22000,request,'domain'),/protected payment evidence/);
 // Simulate a FUTURE trusted verification source in this disposable database only.
 // Production proposal intentionally remains false until that source is reviewed and implemented.
 const view=patch.slice(patch.indexOf('CREATE OR REPLACE VIEW'),patch.indexOf('-- Central guards'));
 await db.exec(view.replace('false AS allocation_ready','true AS allocation_ready'));
 for (const pool of [0,1,2,4,5,24196,63600,100003]) {
  await db.query("UPDATE public.operational_settings SET value=$1 WHERE key='initial_fund'",[String(pool+22000)]);
  const projection=(await db.query("SELECT remaining_amount FROM public.operational_budgets_status WHERE NOT is_fixed_obligation ORDER BY id")).rows.map(row=>Number(row.remaining_amount));
  assert.equal(projection.length,5);assert.equal(projection.reduce((a,b)=>a+b,0),pool);assert.ok(Math.max(...projection)-Math.min(...projection)<=1);
 }
 await db.exec("UPDATE public.operational_settings SET value='100003' WHERE key='initial_fund'");
 for(const bad of ['NaN','Infinity','-Infinity','0','-1','1.5',null])await assert.rejects(expense(bad),/positive integer rupiah|not-null/);
 await assert.rejects(expense(1,request,'unknown'),/Invalid expense category/);
 await assert.rejects(expense(15602),/Insufficient category/);
 await assert.rejects(expense(100004),/Insufficient book balance/);
 await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false)");await assert.rejects(expense(1),/authorization/);
 await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");await assert.rejects(expense(1),/authorization/);
 await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false)");
 await db.exec("INSERT INTO public.operational_budgets(id,name) VALUES('extra','extra')");await assert.rejects(expense(1),/five configured/);await db.exec("DELETE FROM public.operational_budgets WHERE id='extra'");
 await db.exec("DELETE FROM public.operational_budgets WHERE id='bonus'");await assert.rejects(expense(1),/five configured/);await db.exec("INSERT INTO public.operational_budgets(id,name,percentage) VALUES('bonus','bonus',20)");
 const a=(await expense(15600)).rows[0],b=(await expense(15600)).rows[0];assert.deepEqual(a,b,'Same request returns original row after budget changed');assert.equal((await db.query('SELECT count(*)::int AS n FROM public.operational_expenses')).rows[0].n,1);
 await assert.rejects(expense(15600,request,'promo','changed'),/different payload/);
 await assert.rejects(db.exec("INSERT INTO public.operational_expenses(expense_code,category_id,amount,description,admin_name) VALUES('legacy-over-budget','promo',15600,'isolated','spoof')"),/Insufficient category/);
 await db.exec('BEGIN');
 // Domain payment is inserted solely as an already-recorded isolated fixture, never through a live payment action.
 await db.exec("ALTER TABLE public.operational_expenses DISABLE TRIGGER operational_expense_guard;INSERT INTO public.operational_expenses(expense_code,category_id,amount,description,admin_name) VALUES('isolated-confirmed-domain','domain',22000,'isolated historical fixture','test');ALTER TABLE public.operational_expenses ENABLE TRIGGER operational_expense_guard;");
 let s=await summary();assert.equal(Number(s.current_balance),62403);assert.equal(Number(s.domain_reserved),22000);assert.equal(Number(s.allocation_basis),40403);assert.equal(s.domain_status,'unpaid');await assert.rejects(expense(22000,'00000000-0000-4000-8000-000000000011','domain'),/protected payment evidence/);
 await db.exec('ROLLBACK');
 // Exact reserve/free-cash business cases; the ledger includes one previous isolated promo expense.
 for (const [cash,free] of [[100000,78000],[22000,0],[15000,-7000]]) {
  await db.query("UPDATE public.operational_settings SET value=$1 WHERE key='initial_fund'",[String(cash+15600)]);
  const current=await summary();assert.equal(Number(current.current_balance),cash);assert.equal(Number(current.total_active_reserves),22000);
  assert.equal(Number(current.book_free_cash_balance),free);assert.equal(current.actual_cash_balance,null);assert.equal(current.free_cash_balance,null);
 }
 await db.exec("UPDATE public.operational_settings SET value='115600' WHERE key='initial_fund'");
 const confirm=(confirmed=true,ref='DOMAIN-TEST-2027')=>db.query("SELECT public.workplace_confirm_domain_payment($1,'isolated bank receipt','2026-10-25T10:00:00Z', $2)",[ref,confirmed]);
 const prior=await summary();await assert.rejects(confirm(false),/Successful payment evidence/);assert.equal(Number((await summary()).current_balance),Number(prior.current_balance));
 await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false)");await assert.rejects(confirm(),/authorization/);await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false)");
 // A failure AFTER inserting the protected attestation must roll back both records.
 await db.exec("BEGIN;INSERT INTO public.operational_expenses(expense_code,category_id,amount,description,admin_name) VALUES('EXP-DOMAIN-20270912','promo',1,'isolated collision','test');SAVEPOINT before_confirmation;");
 await assert.rejects(confirm(),/duplicate key/);await db.exec('ROLLBACK TO SAVEPOINT before_confirmation');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM private.operational_domain_payments')).rows[0].n,0);assert.equal(Number((await summary()).domain_reserved),22000);await db.exec('ROLLBACK');
 const first=(await confirm()).rows[0],retry=(await confirm()).rows[0];assert.deepEqual(first,retry);
 s=await summary();assert.equal(Number(s.current_balance),78000);assert.equal(Number(s.domain_reserved),0);assert.equal(Number(s.book_free_cash_balance),78000);assert.equal(s.domain_payment_confirmed,true);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM public.operational_expenses WHERE category_id='domain'")).rows[0].n,1);
 await assert.rejects(confirm(true,'ANOTHER-REFERENCE'),/already confirmed/);
 await assert.rejects(confirm(false),/Successful payment evidence/);assert.equal(Number((await summary()).current_balance),78000);
 await db.exec('BEGIN');await db.exec('UPDATE public.operational_settings SET updated_at=now()');assert.ok((await db.query("SELECT * FROM pg_locks WHERE locktype='advisory' AND granted")).rows.length);await db.exec('ROLLBACK');
 const acl=await db.query("SELECT has_function_privilege('anon','public.workplace_record_operational_expense(text,numeric,text,text,text,uuid)','EXECUTE') AS anon,has_function_privilege('authenticated','public.pay_domain_obligation(text,text)','EXECUTE') AS click_payment");assert.equal(acl.rows[0].anon,false);assert.equal(acl.rows[0].click_payment,false);
 await db.exec('SET ROLE authenticated');await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false)");assert.equal((await db.query('SELECT * FROM public.operational_expenses')).rows.length,0);await assert.rejects(db.exec("INSERT INTO public.operational_team_bonuses DEFAULT VALUES"),/authorization/);await db.exec('RESET ROLE');
 // Leave and verify the tested proposal's actual fail-closed state.
 await db.exec(view);assert.equal((await summary()).allocation_ready,false);
 console.log('PASS PostgreSQL/WASM: patch compiles; signed balances, closed legacy flag, integer/category/balance/auth guards, replay key, direct legacy insert guard, 100000/22000/15000 reserve cases, failed confirmation/no change, confirmed payment/retry once, legacy expense retains reserve, lock acquired, RLS and anon grants. No production access. Multi-session concurrency NOT tested.');
 }finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});

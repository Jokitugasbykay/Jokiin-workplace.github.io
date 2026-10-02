create or replace function public.refresh_global_admin_balance() returns void language plpgsql security definer set search_path='' as $$
begin
 with adjustment_totals as (
  select a.admin_id,sum(a.delta)::numeric(14,2) as total from private.admin_balance_adjustments a group by a.admin_id
 ), wallets as (
  select f.admin_id,
   greatest(f.net_revenue-f.withdrawn_total+coalesce(a.total,0),0)::numeric(14,2) as balance,
   f.withdrawn_total::numeric(14,2) as withdrawn
  from public.admin_finance_by_admin f left join adjustment_totals a on a.admin_id=f.admin_id
 )
 update public.profiles p set admin_balance=w.balance,withdraw_total=w.withdrawn from wallets w
 where p.id=w.admin_id and p.role='admin' and (p.admin_balance is distinct from w.balance or p.withdraw_total is distinct from w.withdrawn);
end; $$;
do $$ declare body text; corrected text;
begin
 select pg_get_functiondef('public.adjust_admin_balance(uuid,numeric)'::regprocedure) into body;
 corrected := replace(body,'(coalesce(f.available_balance, 0) + coalesce(a.total, 0))::numeric(14,2)','greatest(coalesce(f.net_revenue, 0) - coalesce(f.withdrawn_total, 0) + coalesce(a.total, 0), 0)::numeric(14,2)');
 if corrected=body then raise exception 'Expected balance calculation not found'; end if;
 execute corrected;
end $$;

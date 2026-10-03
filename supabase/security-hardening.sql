-- Browser clients may change workflow fields only. Payment verification stays server-side.
revoke insert, update, delete, truncate on public.orders, public.payments, public.payment_orders from anon, authenticated;
do $$
declare t text; cols text;
begin
 foreach t in array array['orders','payments','payment_orders'] loop
  select string_agg(quote_ident(column_name), ',') into cols
  from information_schema.columns where table_schema='public' and table_name=t;
  execute format('revoke insert (%s), update (%s) on public.%I from anon, authenticated', cols, cols, t);
 end loop;
end $$;
grant update (status, estimated_completion, assigned_to, assigned_at) on public.orders to authenticated;
alter policy "Admins manage claimed orders" on public.orders
using ((select private.is_admin()) and (
 (select private.is_order_supervisor()) or assigned_to=(select auth.uid()) or
 (assigned_to is null and status='pending' and upper(payment_status)='PAID')
))
with check ((select private.is_admin()) and (
 (select private.is_order_supervisor()) or assigned_to=(select auth.uid())
));

create or replace function private.guard_paid_order_workflow()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status in ('processing','revision','completed')
    and upper(new.payment_status) is distinct from 'PAID' then
  raise exception 'Pembayaran harus terverifikasi sebelum pesanan diproses.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.guard_paid_order_workflow() from public, anon, authenticated;
drop trigger if exists guard_paid_order_workflow on public.orders;
create trigger guard_paid_order_workflow before update on public.orders
for each row execute function private.guard_paid_order_workflow();

-- This is an internal trigger, not a browser RPC. Aggregate review counts are intentionally public.
revoke execute on function public.fill_review_profile_photo() from public, anon, authenticated;
notify pgrst, 'reload schema';

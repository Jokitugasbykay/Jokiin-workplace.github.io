-- Other admins retain checkout summaries; tasks are fetched through an authorized RPC.
revoke select on public.payment_orders from public, anon, authenticated;
grant select (id,order_code,customer,total_price,payment_status,status,created_at,paid_at,auto_cancelled_at)
on public.payment_orders to authenticated;

create function public.workplace_checkout_detail(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(private.is_order_supervisor(),false) then
  raise exception 'Detail checkout hanya tersedia untuk Riski dan Kayla.' using errcode='42501';
 end if;
 return (select to_jsonb(p) from public.payment_orders p where p.id=p_id);
end;
$$;
revoke all on function public.workplace_checkout_detail(uuid) from public, anon;
grant execute on function public.workplace_checkout_detail(uuid) to authenticated;

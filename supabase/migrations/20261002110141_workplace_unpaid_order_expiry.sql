alter table public.orders add column auto_cancelled_at timestamptz;
alter table public.payment_orders add column auto_cancelled_at timestamptz;

-- A delayed verified payment must restore only automatically cancelled orders.
create function private.workplace_restore_paid_order() returns trigger
language plpgsql set search_path = '' as $$
begin
 if old.auto_cancelled_at is not null and upper(new.payment_status) = 'PAID' then
  if lower(old.status) in ('cancelled', 'canceled') then new.status := 'pending'; end if;
  new.auto_cancelled_at := null;
 end if;
 return new;
end;
$$;
revoke all on function private.workplace_restore_paid_order() from public, anon, authenticated;
create trigger a_workplace_restore_paid_order before update on public.orders
for each row execute function private.workplace_restore_paid_order();
create trigger a_workplace_restore_paid_checkout before update on public.payment_orders
for each row execute function private.workplace_restore_paid_order();

create or replace function private.enforce_claimed_order_status_flow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if (select private.is_order_supervisor()) then return new; end if;

 -- Internal expiry/payment reconciliation; browser updates still require RLS.
 if (select auth.uid()) is null and old.assigned_to is null and new.assigned_to is null then
  if old.status = 'pending' and upper(old.payment_status) = 'PENDING'
     and old.created_at <= now() - interval '24 hours'
     and new.status = 'cancelled' and new.payment_status = 'CANCELED'
     and new.auto_cancelled_at is not null then return new; end if;
  if old.auto_cancelled_at is not null and upper(new.payment_status) = 'PAID'
     and new.status = 'pending' and new.auto_cancelled_at is null then return new; end if;
 end if;

 if old.status = 'pending' and old.assigned_to is null
    and new.status = 'processing' and new.assigned_to = (select auth.uid())
    and new.assigned_at is not null then return new; end if;
 if old.assigned_to is distinct from (select auth.uid()) then
  raise exception 'Hanya pengambil order yang dapat mengubah pesanan ini.';
 end if;
 if new.assigned_to is distinct from old.assigned_to or new.assigned_at is distinct from old.assigned_at then
  raise exception 'Pengambil order tidak dapat dipindahkan.';
 end if;
 if new.status is not distinct from old.status then return new; end if;
 if (old.status = 'processing' and new.status in ('revision', 'completed'))
    or (old.status = 'revision' and new.status = 'completed') then return new; end if;
 raise exception 'Urutan status tidak valid. Worker hanya dapat memproses pekerjaan sampai selesai.';
end;
$$;

create function private.workplace_cancel_unpaid_orders() returns jsonb
language plpgsql set search_path = '' as $$
declare checkout_count integer; order_count integer;
begin
 -- Lock/update checkout first, matching the existing Mayar -> orders sync order.
 update public.payment_orders p
 set status = 'cancelled', payment_status = 'CANCELED', auto_cancelled_at = now(), updated_at = now()
 where lower(p.status) = 'pending' and p.payment_status = 'PENDING'
   and p.paid_at is null and p.created_at <= now() - interval '24 hours'
   and not exists (
    select 1 from public.orders o where o.order_code = p.order_code
    and (upper(o.payment_status) = 'PAID' or exists (
     select 1 from public.payments pay where pay.order_id = o.id and lower(pay.status) = 'paid'
    ))
   );
 get diagnostics checkout_count = row_count;

 update public.orders o
 set status = 'cancelled', payment_status = 'CANCELED', auto_cancelled_at = now()
 where o.status = 'pending' and upper(o.payment_status) = 'PENDING'
   and o.assigned_to is null and o.created_at <= now() - interval '24 hours'
   and not exists (select 1 from public.payments pay where pay.order_id = o.id and lower(pay.status) = 'paid')
   and not exists (select 1 from public.payment_orders p where p.order_code = o.order_code
                   and (p.payment_status = 'PAID' or p.paid_at is not null));
 get diagnostics order_count = row_count;
 return jsonb_build_object('checkouts_cancelled', checkout_count, 'orders_cancelled', order_count);
end;
$$;
revoke all on function private.workplace_cancel_unpaid_orders() from public, anon, authenticated;
select cron.schedule('workplace-cancel-unpaid-orders', '* * * * *', 'select private.workplace_cancel_unpaid_orders()');
